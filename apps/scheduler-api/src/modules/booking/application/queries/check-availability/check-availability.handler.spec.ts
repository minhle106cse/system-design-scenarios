import { ServiceTypeNotFoundError } from '@/common/errors/booking.error'
import type { IBookingQueryRepository } from '../booking.query-repository'
import type { BusinessHoursConfig } from '../../business-hours.config'
import { CheckAvailabilityHandler } from './check-availability.handler'
import { CheckAvailabilityQuery } from './check-availability.query'

jest.mock('@/infrastructure/observability/booking.metrics', () => ({
  startAvailabilityTimer: jest.fn(() => jest.fn()),
}))

// The handler filters out slots that have already started, using the real
// clock. A near-future fixture date would therefore turn these specs into a
// time bomb — green today, red the day after. 2099-06-01 is a MONDAY (weekday,
// so BUSINESS_DAYS Mon–Fri applies) and is safely beyond any review horizon.
const FUTURE_MONDAY = '2099-06-01'
const FUTURE_SATURDAY = '2099-06-06'
const PAST_MONDAY = '2020-06-01'

describe('CheckAvailabilityHandler', () => {
  let repo: jest.Mocked<IBookingQueryRepository>
  let businessHours: BusinessHoursConfig
  let handler: CheckAvailabilityHandler

  const query = new CheckAvailabilityQuery('dealership-1', 'service-type-1', FUTURE_MONDAY)
  const serviceType = { id: 'service-type-1', durationMinutes: 30 }
  const bays = [{ id: 'bay-a' }, { id: 'bay-b' }]
  const technicians = [{ id: 'tech-a' }]

  beforeEach(() => {
    repo = {
      findServiceType: jest.fn().mockResolvedValue(serviceType),
      findDealershipBays: jest.fn().mockResolvedValue(bays),
      findQualifiedTechnicians: jest.fn().mockResolvedValue(technicians),
      findOverlappingAppointments: jest.fn().mockResolvedValue([]),
    }

    businessHours = {
      get: jest.fn().mockReturnValue({
        start: '08:00',
        // A one-hour day keeps the expected grid to two slots, so the
        // assertions below can be exhaustive rather than sampling.
        end: '09:00',
        timeZone: 'UTC',
        slotGranularityMinutes: 30,
        days: [1, 2, 3, 4, 5],
        closedDates: [],
      }),
    } as unknown as BusinessHoursConfig

    handler = new CheckAvailabilityHandler(repo, businessHours)
  })

  it('enumerates the configured grid and reports full counts with nothing booked', async () => {
    const result = await handler.execute(query)

    expect(result.durationMinutes).toBe(30)
    expect(result.availableSlots).toEqual([
      {
        startAt: '2099-06-01T08:00:00.000Z',
        endAt: '2099-06-01T08:30:00.000Z',
        availableBays: 2,
        availableTechnicians: 1,
      },
      {
        startAt: '2099-06-01T08:30:00.000Z',
        endAt: '2099-06-01T09:00:00.000Z',
        availableBays: 2,
        availableTechnicians: 1,
      },
    ])
  })

  it('reduces the count for a slot a booked appointment overlaps', async () => {
    repo.findOverlappingAppointments.mockResolvedValue([
      {
        serviceBayId: 'bay-a',
        technicianId: 'tech-a',
        startAt: new Date('2099-06-01T08:00:00.000Z'),
        endAt: new Date('2099-06-01T08:30:00.000Z'),
      },
    ])

    const result = await handler.execute(query)

    // The 08:00 slot loses one bay and its only technician — drops out
    // entirely (a slot with 0 free technicians is not "available").
    expect(result.availableSlots).toHaveLength(1)
    expect(result.availableSlots[0].startAt).toBe('2099-06-01T08:30:00.000Z')
  })

  it('does not let a booking outside the queried slot affect that slot', async () => {
    // Overlaps only the 08:30 slot, not 08:00.
    repo.findOverlappingAppointments.mockResolvedValue([
      {
        serviceBayId: 'bay-a',
        technicianId: 'tech-a',
        startAt: new Date('2099-06-01T08:30:00.000Z'),
        endAt: new Date('2099-06-01T09:00:00.000Z'),
      },
    ])

    const result = await handler.execute(query)

    expect(
      result.availableSlots.find((slot) => slot.startAt === '2099-06-01T08:00:00.000Z'),
    ).toEqual({
      startAt: '2099-06-01T08:00:00.000Z',
      endAt: '2099-06-01T08:30:00.000Z',
      availableBays: 2,
      availableTechnicians: 1,
    })
  })

  it('returns an empty list, not an error, when the dealership has no bays', async () => {
    repo.findDealershipBays.mockResolvedValue([])

    const result = await handler.execute(query)

    expect(result.availableSlots).toEqual([])
  })

  it('returns an empty list for a day the dealership is closed', async () => {
    const saturday = new CheckAvailabilityQuery('dealership-1', 'service-type-1', FUTURE_SATURDAY)

    const result = await handler.execute(saturday)

    expect(result.availableSlots).toEqual([])
    // Closed means there is nothing to compute — don't query the database at all.
    expect(repo.findOverlappingAppointments).not.toHaveBeenCalled()
  })

  it('returns an empty list for a date entirely in the past', async () => {
    const past = new CheckAvailabilityQuery('dealership-1', 'service-type-1', PAST_MONDAY)

    const result = await handler.execute(past)

    // Offering slots POST would reject anyway is a promise the write path
    // cannot keep.
    expect(result.availableSlots).toEqual([])
    expect(repo.findOverlappingAppointments).not.toHaveBeenCalled()
  })

  it('throws ServiceTypeNotFoundError for an unknown service type', async () => {
    repo.findServiceType.mockResolvedValue(null)

    await expect(handler.execute(query)).rejects.toThrow(ServiceTypeNotFoundError)
  })

  it('fetches the whole day once rather than once per candidate slot', async () => {
    await handler.execute(query)

    expect(repo.findOverlappingAppointments).toHaveBeenCalledTimes(1)
  })
})
