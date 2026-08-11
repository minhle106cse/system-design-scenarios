import { UnreachableError } from '@scheduler/shared-kernel'
import {
  AppointmentNotCancellableError,
  AppointmentNotFoundError,
} from '@/common/errors/booking.error'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { Appointment, AppointmentStatus } from '../../../domain/entities/appointment.entity'
import type { IAppointmentRepository } from '../../../domain/repositories/appointment.repository'
import type { IServiceBayRepository } from '../../../domain/repositories/service-bay.repository'
import type { ITechnicianRepository } from '../../../domain/repositories/technician.repository'
import type { IServiceTypeRepository } from '../../../domain/repositories/service-type.repository'
import { CancelAppointmentCommand } from './cancel-appointment.command'
import { CancelAppointmentHandler } from './cancel-appointment.handler'

function scheduledAppointment(status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED' = 'SCHEDULED') {
  return Appointment.rehydrate({
    id: 'appointment-1',
    customerId: 'customer-1',
    vehicleId: 'vehicle-1',
    dealershipId: 'dealership-1',
    serviceTypeId: 'service-type-1',
    serviceBayId: 'bay-1',
    technicianId: 'tech-1',
    startAt: new Date('2026-08-15T10:00:00.000Z'),
    endAt: new Date('2026-08-15T10:30:00.000Z'),
    status: AppointmentStatus[status],
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  })
}

describe('CancelAppointmentHandler', () => {
  let mockAppointmentRepo: jest.Mocked<IAppointmentRepository>
  let mockServiceBayRepo: jest.Mocked<IServiceBayRepository>
  let mockTechnicianRepo: jest.Mocked<ITechnicianRepository>
  let mockServiceTypeRepo: jest.Mocked<IServiceTypeRepository>
  let repos: SchedulerApiRepos
  let handler: CancelAppointmentHandler
  const command = new CancelAppointmentCommand('appointment-1')

  beforeEach(() => {
    mockAppointmentRepo = {
      findById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      save: jest.fn(),
      findBusyResourceIds: jest.fn(),
    } as unknown as jest.Mocked<IAppointmentRepository>

    mockServiceBayRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'bay-1', label: 'Bay 1' }),
      findByDealership: jest.fn(),
    } as unknown as jest.Mocked<IServiceBayRepository>

    mockTechnicianRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'tech-1', name: 'Jordan' }),
      findQualifiedByDealership: jest.fn(),
    } as unknown as jest.Mocked<ITechnicianRepository>

    mockServiceTypeRepo = { findById: jest.fn() } as unknown as jest.Mocked<IServiceTypeRepository>

    // Cancel never reads these three, but SchedulerApiRepos is one shape for the
    // whole service — the handler receives all of it either way.
    repos = {
      appointments: mockAppointmentRepo,
      serviceBays: mockServiceBayRepo,
      technicians: mockTechnicianRepo,
      serviceTypes: mockServiceTypeRepo,
      customers: { findById: jest.fn() },
      vehicles: { findById: jest.fn() },
      dealerships: { findById: jest.fn() },
    }

    handler = new CancelAppointmentHandler()
  })

  it('declares itself transactional', () => {
    expect(handler.kind).toBe('transactional')
  })

  it('cancels a SCHEDULED appointment and persists the transition', async () => {
    mockAppointmentRepo.findById.mockResolvedValue(scheduledAppointment())

    const result = await handler.execute(command, repos)

    expect(result.status).toBe('CANCELLED')
    expect(mockAppointmentRepo.update).toHaveBeenCalledTimes(1)
  })

  it('resolves the bay label and technician name for the response', async () => {
    mockAppointmentRepo.findById.mockResolvedValue(scheduledAppointment())

    const result = await handler.execute(command, repos)

    expect(result.serviceBay).toEqual({ id: 'bay-1', label: 'Bay 1' })
    expect(result.technician).toEqual({ id: 'tech-1', name: 'Jordan' })
  })

  it('is idempotent on an already-CANCELLED appointment — no write, still 200-shaped', async () => {
    mockAppointmentRepo.findById.mockResolvedValue(scheduledAppointment('CANCELLED'))

    const result = await handler.execute(command, repos)

    expect(result.status).toBe('CANCELLED')
    expect(mockAppointmentRepo.update).not.toHaveBeenCalled()
  })

  it('refuses to cancel a COMPLETED appointment', async () => {
    mockAppointmentRepo.findById.mockResolvedValue(scheduledAppointment('COMPLETED'))

    await expect(handler.execute(command, repos)).rejects.toThrow(AppointmentNotCancellableError)
    expect(mockAppointmentRepo.update).not.toHaveBeenCalled()
  })

  it('throws AppointmentNotFoundError for an unknown id', async () => {
    mockAppointmentRepo.findById.mockResolvedValue(null)

    await expect(handler.execute(command, repos)).rejects.toThrow(AppointmentNotFoundError)
  })

  it('raises UnreachableError rather than a 404 if the referenced bay is missing (data-integrity guard)', async () => {
    mockAppointmentRepo.findById.mockResolvedValue(scheduledAppointment())
    mockServiceBayRepo.findById.mockResolvedValue(null)

    await expect(handler.execute(command, repos)).rejects.toThrow(UnreachableError)
  })
})
