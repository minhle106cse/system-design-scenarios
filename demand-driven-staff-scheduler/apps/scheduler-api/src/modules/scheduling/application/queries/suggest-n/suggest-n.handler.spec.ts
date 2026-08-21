import {
  InsufficientCalibrationDataError,
  ScheduleNotFoundError,
} from '@/common/errors/scheduling.error'
import type { ISchedulingQueryRepository } from '../../repositories/scheduling.query-repository'
import { SuggestNQuery } from './suggest-n.query'
import { SuggestNHandler } from './suggest-n.handler'

/**
 * Assumption 1's "Suggest from data". The behaviour worth pinning is not the arithmetic — that is
 * `suggestTransactionsPerStaff`, tested in `scheduling-core` — but the contract around it: the
 * handler reports the suggestion ALONGSIDE the current value and never applies it, because
 * ADR-0003 records a deliberate divergence (the seed schedule ships N=18 while calibration for
 * that same dataset returns 15). A handler that quietly overwrote `current` would erase evidence
 * the ADR exists to preserve.
 */
describe('SuggestNHandler', () => {
  const SCHEDULE_ID = 'sched-1'

  const schedule = {
    id: SCHEDULE_ID,
    name: 'Test week',
    transactionsPerStaffHour: 18,
    minStaffWhenOpen: 1,
    maxStaffPerHour: null,
    minUtilisationTarget: 0.6,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    staffUpdatedAt: null,
    shiftsUpdatedAt: null,
    demandUpdatedAt: null,
    rolesUpdatedAt: null,
  }

  const staff = [
    { id: 'ana', scheduleId: SCHEDULE_ID, name: 'Ana', maxWeeklyHours: 40 },
    { id: 'ben', scheduleId: SCHEDULE_ID, name: 'Ben', maxWeeklyHours: 40 },
  ]
  const shifts = [
    {
      id: 'am',
      scheduleId: SCHEDULE_ID,
      label: 'Morning',
      startMinute: 7 * 60,
      endMinute: 15 * 60,
    },
  ]
  const demandCells = [7, 8, 9, 10, 11, 12, 13].map((hour) => ({
    id: `mon-${String(hour)}`,
    scheduleId: SCHEDULE_ID,
    dayOfWeek: 1,
    hour,
    transactions: 40,
  }))

  function buildRepo(detail: unknown): jest.Mocked<ISchedulingQueryRepository> {
    return {
      findScheduleDetail: jest.fn().mockResolvedValue(detail),
    } as unknown as jest.Mocked<ISchedulingQueryRepository>
  }

  const fullDetail = { schedule, staff, shifts, demandCells, unavailability: [] }

  it('throws ScheduleNotFoundError when the schedule does not exist', async () => {
    const handler = new SuggestNHandler(buildRepo(null))

    await expect(handler.execute(new SuggestNQuery(SCHEDULE_ID))).rejects.toBeInstanceOf(
      ScheduleNotFoundError,
    )
  })

  it('returns the suggestion next to the current value without applying it', async () => {
    const handler = new SuggestNHandler(buildRepo(fullDetail))

    const result = await handler.execute(new SuggestNQuery(SCHEDULE_ID))

    // `current` must still be the stored parameter — the UI shows both and the manager decides.
    expect(result.current).toBe(18)
    expect(typeof result.suggested).toBe('number')
    expect(Number.isFinite(result.suggested)).toBe(true)
  })

  it('refuses to calibrate with no staff, naming staff as the missing input', async () => {
    const handler = new SuggestNHandler(buildRepo({ ...fullDetail, staff: [] }))

    // A located error, not a silent zero or a divide-by-zero NaN.
    await expect(handler.execute(new SuggestNQuery(SCHEDULE_ID))).rejects.toBeInstanceOf(
      InsufficientCalibrationDataError,
    )
  })

  it('refuses to calibrate with no shifts', async () => {
    const handler = new SuggestNHandler(buildRepo({ ...fullDetail, shifts: [] }))

    await expect(handler.execute(new SuggestNQuery(SCHEDULE_ID))).rejects.toBeInstanceOf(
      InsufficientCalibrationDataError,
    )
  })

  it('refuses to calibrate before any demand has been imported', async () => {
    const handler = new SuggestNHandler(buildRepo({ ...fullDetail, demandCells: [] }))

    // This is the common real case: the manager clicks "Suggest" on a fresh schedule.
    await expect(handler.execute(new SuggestNQuery(SCHEDULE_ID))).rejects.toBeInstanceOf(
      InsufficientCalibrationDataError,
    )
  })
})
