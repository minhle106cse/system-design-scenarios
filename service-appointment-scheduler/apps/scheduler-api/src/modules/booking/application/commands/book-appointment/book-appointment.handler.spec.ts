import {
  AppointmentSlotConflictError,
  CustomerNotFoundError,
  DealershipNotFoundError,
  ServiceTypeNotFoundError,
  VehicleNotFoundError,
  VehicleNotOwnedByCustomerError,
} from '@/common/errors/booking.error'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository'
import type { IServiceBayRepository } from '../../../domain/repositories/service-bay.repository'
import type { ITechnicianRepository } from '../../../domain/repositories/technician.repository'
import type { IServiceTypeRepository } from '../../../domain/repositories/service-type.repository'
import type { ICustomerRepository } from '../../../domain/repositories/customer.repository'
import type { IVehicleRepository } from '../../../domain/repositories/vehicle.repository'
import type { IDealershipRepository } from '../../../domain/repositories/dealership.repository'
import type { BusinessHoursConfig } from '../../business-hours.config'
import { BookAppointmentCommand } from './book-appointment.command'
import { BookAppointmentHandler } from './book-appointment.handler'

jest.mock('uuid', () => ({ v7: jest.fn(() => 'mock-uuid-v7') }))

// prom-client metrics are module-level singletons; observing them here would
// couple this spec to global state shared with every other test file. The
// metric CALL itself matters (it's the observability contract), not the
// counter's value — so the metrics module is mocked wholesale.
jest.mock('@/infrastructure/observability/booking.metrics', () => ({
  recordBookingAttempt: jest.fn(),
}))

const { recordBookingAttempt } = jest.requireMock('@/infrastructure/observability/booking.metrics')

// 2026-08-17 is a MONDAY — BUSINESS_DAYS defaults to Mon–Fri, so a weekend
// fixture would make every test fail for the wrong reason.
const MONDAY_10AM = new Date('2026-08-17T10:00:00.000Z')

describe('BookAppointmentHandler', () => {
  let mockAppointmentRepo: jest.Mocked<IAppointmentRepository>
  let mockServiceBayRepo: jest.Mocked<IServiceBayRepository>
  let mockTechnicianRepo: jest.Mocked<ITechnicianRepository>
  let mockServiceTypeRepo: jest.Mocked<IServiceTypeRepository>
  let mockCustomerRepo: jest.Mocked<ICustomerRepository>
  let mockVehicleRepo: jest.Mocked<IVehicleRepository>
  let mockDealershipRepo: jest.Mocked<IDealershipRepository>
  let repos: SchedulerApiRepos
  let businessHours: jest.Mocked<BusinessHoursConfig>
  let handler: BookAppointmentHandler

  const command = new BookAppointmentCommand(
    'customer-1',
    'vehicle-1',
    'dealership-1',
    'service-type-1',
    MONDAY_10AM,
  )

  const serviceType = { id: 'service-type-1', name: 'Oil Change', durationMinutes: 30 }
  const bays = [
    { id: 'bay-b', label: 'Bay 2' },
    { id: 'bay-a', label: 'Bay 1' },
  ]
  const technicians = [{ id: 'tech-a', name: 'Jordan' }]
  const noBusy = { serviceBayIds: new Set<string>(), technicianIds: new Set<string>() }

  beforeEach(() => {
    jest.clearAllMocks()

    mockAppointmentRepo = {
      findBusyResourceIds: jest.fn().mockResolvedValue(noBusy),
      findById: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn(),
    } as unknown as jest.Mocked<IAppointmentRepository>

    mockServiceBayRepo = {
      findByDealership: jest.fn().mockResolvedValue(bays),
      findById: jest.fn(),
    } as unknown as jest.Mocked<IServiceBayRepository>

    mockTechnicianRepo = {
      findQualifiedByDealership: jest.fn().mockResolvedValue(technicians),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ITechnicianRepository>

    mockServiceTypeRepo = {
      findById: jest.fn().mockResolvedValue(serviceType),
    } as unknown as jest.Mocked<IServiceTypeRepository>

    mockCustomerRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'customer-1' }),
    } as unknown as jest.Mocked<ICustomerRepository>

    mockVehicleRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'vehicle-1', customerId: 'customer-1' }),
    } as unknown as jest.Mocked<IVehicleRepository>

    mockDealershipRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'dealership-1' }),
    } as unknown as jest.Mocked<IDealershipRepository>

    repos = {
      appointments: mockAppointmentRepo,
      serviceBays: mockServiceBayRepo,
      technicians: mockTechnicianRepo,
      serviceTypes: mockServiceTypeRepo,
      customers: mockCustomerRepo,
      vehicles: mockVehicleRepo,
      dealerships: mockDealershipRepo,
    }

    businessHours = {
      get: jest.fn().mockReturnValue({
        start: '08:00',
        end: '18:00',
        timeZone: 'UTC',
        slotGranularityMinutes: 30,
        days: [1, 2, 3, 4, 5],
        closedDates: [],
      }),
    } as unknown as jest.Mocked<BusinessHoursConfig>

    handler = new BookAppointmentHandler(businessHours)
  })

  it('declares itself transactional', () => {
    expect(handler.kind).toBe('transactional')
  })

  it('books the lowest-ordered free bay and technician', async () => {
    const result = await handler.execute(command, repos)

    expect(result.serviceBay.id).toBe('bay-a')
    expect(result.technician.id).toBe('tech-a')
    expect(result.status).toBe('SCHEDULED')
    expect(result.startAt).toBe('2026-08-17T10:00:00.000Z')
    expect(result.endAt).toBe('2026-08-17T10:30:00.000Z')
  })

  it('derives the window from the service type duration, not a fixed length', async () => {
    mockServiceTypeRepo.findById.mockResolvedValue({ ...serviceType, durationMinutes: 90 })

    const result = await handler.execute(command, repos)

    expect(result.endAt).toBe('2026-08-17T11:30:00.000Z')
  })

  it('passes the derived window to the availability check, not just the start time', async () => {
    await handler.execute(command, repos)

    expect(mockAppointmentRepo.findBusyResourceIds).toHaveBeenCalledWith('dealership-1', {
      startAt: MONDAY_10AM,
      endAt: new Date('2026-08-17T10:30:00.000Z'),
    })
  })

  it('saves through the write repository', async () => {
    await handler.execute(command, repos)

    expect(mockAppointmentRepo.save).toHaveBeenCalledTimes(1)
  })

  it('does NOT count a booking until the transaction has committed', async () => {
    await handler.execute(command, repos)

    // execute() must not record success — a COMMIT failure (or a P2034 retry)
    // would otherwise count an appointment that never existed.
    expect(recordBookingAttempt).not.toHaveBeenCalledWith('booked')

    handler.afterCommit()

    expect(recordBookingAttempt).toHaveBeenCalledWith('booked')
  })

  describe('reference validation', () => {
    it('throws CustomerNotFoundError for an unknown customer, before any availability read', async () => {
      mockCustomerRepo.findById.mockResolvedValue(null)

      await expect(handler.execute(command, repos)).rejects.toThrow(CustomerNotFoundError)
      expect(mockAppointmentRepo.findBusyResourceIds).not.toHaveBeenCalled()
      expect(mockAppointmentRepo.save).not.toHaveBeenCalled()
    })

    it('throws VehicleNotFoundError for an unknown vehicle', async () => {
      mockVehicleRepo.findById.mockResolvedValue(null)

      await expect(handler.execute(command, repos)).rejects.toThrow(VehicleNotFoundError)
    })

    it('throws DealershipNotFoundError for an unknown dealership — not a misleading slot conflict', async () => {
      mockDealershipRepo.findById.mockResolvedValue(null)

      const error = await handler.execute(command, repos).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(DealershipNotFoundError)
      // Previously this fell through to an empty bay list and reported
      // 409 "no_free_service_bay", which the API contract defines as "every bay
      // is busy" — and it polluted the booking-conflict metric.
      expect(recordBookingAttempt).not.toHaveBeenCalled()
    })

    it('throws ServiceTypeNotFoundError for an unknown service type', async () => {
      mockServiceTypeRepo.findById.mockResolvedValue(null)

      await expect(handler.execute(command, repos)).rejects.toThrow(ServiceTypeNotFoundError)
      expect(mockAppointmentRepo.findBusyResourceIds).not.toHaveBeenCalled()
    })

    it('rejects a vehicle that belongs to a different customer', async () => {
      mockVehicleRepo.findById.mockResolvedValue({ id: 'vehicle-1', customerId: 'someone-else' })

      await expect(handler.execute(command, repos)).rejects.toThrow(VehicleNotOwnedByCustomerError)
      expect(mockAppointmentRepo.save).not.toHaveBeenCalled()
    })

    it('fails loudly on a non-positive service duration instead of booking an empty window', async () => {
      // A zero-length tstzrange overlaps nothing, so BOTH exclusion constraints
      // would silently stop applying. The DB CHECK constraint prevents this
      // row existing; this is the defence-in-depth branch.
      mockServiceTypeRepo.findById.mockResolvedValue({ ...serviceType, durationMinutes: 0 })

      await expect(handler.execute(command, repos)).rejects.toThrow(/non-positive durationMinutes/)
      expect(mockAppointmentRepo.save).not.toHaveBeenCalled()
    })
  })

  describe('business hours', () => {
    it('refuses a window outside opening times without touching availability', async () => {
      const outsideHours = new BookAppointmentCommand(
        'customer-1',
        'vehicle-1',
        'dealership-1',
        'service-type-1',
        new Date('2026-08-17T03:00:00.000Z'),
      )

      await expect(handler.execute(outsideHours, repos)).rejects.toMatchObject({
        code: 'APPOINTMENT_OUTSIDE_BUSINESS_HOURS',
        reason: 'outside_hours',
      })
      expect(mockAppointmentRepo.findBusyResourceIds).not.toHaveBeenCalled()
    })

    it('refuses a booking on a closed day, with a reason the client can act on', async () => {
      const saturday = new BookAppointmentCommand(
        'customer-1',
        'vehicle-1',
        'dealership-1',
        'service-type-1',
        new Date('2026-08-15T10:00:00.000Z'),
      )

      await expect(handler.execute(saturday, repos)).rejects.toMatchObject({
        code: 'APPOINTMENT_OUTSIDE_BUSINESS_HOURS',
        // "try another date", not "try another time on this date".
        reason: 'closed_day',
      })
    })
  })

  describe('slot conflicts', () => {
    it('distinguishes "no bay exists here" from "every bay is busy"', async () => {
      mockServiceBayRepo.findByDealership.mockResolvedValue([])

      const error = await handler.execute(command, repos).catch((e: unknown) => e)

      expect((error as AppointmentSlotConflictError).reason).toBe('no_service_bay_at_dealership')
    })

    it('distinguishes "nobody here is qualified" from "every qualified technician is busy"', async () => {
      mockTechnicianRepo.findQualifiedByDealership.mockResolvedValue([])

      const error = await handler.execute(command, repos).catch((e: unknown) => e)

      expect((error as AppointmentSlotConflictError).reason).toBe(
        'no_qualified_technician_at_dealership',
      )
    })

    it('rejects with no_free_service_bay when every bay is busy, without inserting', async () => {
      mockAppointmentRepo.findBusyResourceIds.mockResolvedValue({
        serviceBayIds: new Set(['bay-a', 'bay-b']),
        technicianIds: new Set<string>(),
      })

      const error = await handler.execute(command, repos).catch((e: unknown) => e)

      expect(error).toBeInstanceOf(AppointmentSlotConflictError)
      expect((error as AppointmentSlotConflictError).reason).toBe('no_free_service_bay')
      expect(mockAppointmentRepo.save).not.toHaveBeenCalled()
      expect(recordBookingAttempt).toHaveBeenCalledWith('no_free_service_bay')
    })

    it('rejects with no_free_qualified_technician when bays are free but no technician is', async () => {
      mockAppointmentRepo.findBusyResourceIds.mockResolvedValue({
        serviceBayIds: new Set<string>(),
        technicianIds: new Set(['tech-a']),
      })

      const error = await handler.execute(command, repos).catch((e: unknown) => e)

      expect((error as AppointmentSlotConflictError).reason).toBe('no_free_qualified_technician')
      expect(mockAppointmentRepo.save).not.toHaveBeenCalled()
    })

    it('gives each reason its own message rather than one catch-all sentence', async () => {
      mockAppointmentRepo.findBusyResourceIds.mockResolvedValue({
        serviceBayIds: new Set<string>(),
        technicianIds: new Set(['tech-a']),
      })

      const error = await handler.execute(command, repos).catch((e: unknown) => e)

      // A bay WAS free here — the old shared message claimed neither was.
      expect((error as Error).message).toMatch(/qualified technician/i)
      expect((error as Error).message).not.toMatch(/service bay are both/i)
    })

    it('propagates and records the reason when save() reports a concurrent conflict (ADR-0002 firing)', async () => {
      mockAppointmentRepo.save.mockRejectedValue(
        new AppointmentSlotConflictError('service_bay_taken_concurrently'),
      )

      await expect(handler.execute(command, repos)).rejects.toBeInstanceOf(
        AppointmentSlotConflictError,
      )
      expect(recordBookingAttempt).toHaveBeenCalledWith('service_bay_taken_concurrently')
    })
  })
})
