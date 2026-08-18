import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ShiftNotFoundError, InvalidShiftTimeRangeError } from '@/common/errors/scheduling.error'
import type { Shift } from '../../../domain/entities/shift.entity'
import { UpdateShiftCommand } from './update-shift.command'
import { UpdateShiftHandler } from './update-shift.handler'

/**
 * `directives/zod_validation.md` rule 4 says a handler does not re-validate request shape — this
 * handler is the documented exception, and these tests are why the exception exists. Zod's
 * `.refine` only ever sees the request BODY, so a PATCH carrying just `endMinute` cannot be
 * checked against the `startMinute` already stored on the row. The merge has to happen first, and
 * only the handler holds both halves.
 */
describe('UpdateShiftHandler', () => {
  const existing: Shift = {
    id: 'shift-1',
    scheduleId: 'sched-1',
    label: 'Morning',
    startMinute: 7 * 60, // 07:00
    endMinute: 15 * 60, // 15:00
  }

  let handler: UpdateShiftHandler

  function buildTx(found: Shift | null = existing): jest.Mocked<SchedulerApiRepos> {
    return {
      shifts: {
        findById: jest.fn().mockResolvedValue(found),
        update: jest
          .fn()
          .mockImplementation((id: string, data: Partial<Shift>) =>
            Promise.resolve({ ...existing, id, ...data }),
          ),
      },
    } as unknown as jest.Mocked<SchedulerApiRepos>
  }

  beforeEach(() => {
    handler = new UpdateShiftHandler()
  })

  it('throws ShiftNotFoundError when the shift does not exist', async () => {
    const tx = buildTx(null)

    await expect(
      handler.execute(new UpdateShiftCommand('missing', 'X', undefined, undefined), tx),
    ).rejects.toBeInstanceOf(ShiftNotFoundError)

    expect(tx.shifts.update).not.toHaveBeenCalled()
  })

  it('rejects a partial PATCH whose new endMinute lands before the STORED startMinute', async () => {
    // The body alone (endMinute 06:00) is a perfectly valid number — it is only invalid once merged
    // with the row's stored 07:00 start. This is the case Zod structurally cannot see.
    const tx = buildTx()

    await expect(
      handler.execute(new UpdateShiftCommand(existing.id, undefined, undefined, 6 * 60), tx),
    ).rejects.toBeInstanceOf(InvalidShiftTimeRangeError)

    expect(tx.shifts.update).not.toHaveBeenCalled()
  })

  it('rejects a partial PATCH whose new startMinute lands after the STORED endMinute', async () => {
    // The mirror case: only startMinute is supplied, and it overtakes the stored 15:00 end.
    const tx = buildTx()

    await expect(
      handler.execute(new UpdateShiftCommand(existing.id, undefined, 20 * 60, undefined), tx),
    ).rejects.toBeInstanceOf(InvalidShiftTimeRangeError)

    expect(tx.shifts.update).not.toHaveBeenCalled()
  })

  it('rejects a zero-length shift (end equal to start), not just an inverted one', async () => {
    const tx = buildTx()

    await expect(
      handler.execute(new UpdateShiftCommand(existing.id, undefined, 9 * 60, 9 * 60), tx),
    ).rejects.toBeInstanceOf(InvalidShiftTimeRangeError)

    expect(tx.shifts.update).not.toHaveBeenCalled()
  })

  it('accepts a partial PATCH that stays valid against the stored half', async () => {
    const tx = buildTx()

    await handler.execute(new UpdateShiftCommand(existing.id, undefined, undefined, 18 * 60), tx)

    // Only the supplied field is forwarded — an omitted field must not be written back as undefined.
    expect(tx.shifts.update).toHaveBeenCalledWith(existing.id, { endMinute: 18 * 60 })
  })

  it('forwards only the fields actually supplied when several are set at once', async () => {
    const tx = buildTx()

    await handler.execute(new UpdateShiftCommand(existing.id, 'Late', 12 * 60, 20 * 60), tx)

    expect(tx.shifts.update).toHaveBeenCalledWith(existing.id, {
      label: 'Late',
      startMinute: 12 * 60,
      endMinute: 20 * 60,
    })
  })

  it('allows a label-only PATCH without re-litigating the stored time range', async () => {
    const tx = buildTx()

    await handler.execute(new UpdateShiftCommand(existing.id, 'Renamed', undefined, undefined), tx)

    expect(tx.shifts.update).toHaveBeenCalledWith(existing.id, { label: 'Renamed' })
  })
})
