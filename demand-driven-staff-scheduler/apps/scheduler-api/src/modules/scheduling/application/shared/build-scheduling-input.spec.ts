import type { DayOfWeek } from '@scheduler/scheduling-core'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { StaffMember } from '../../domain/entities/staff-member.entity'
import type { Shift } from '../../domain/entities/shift.entity'
import type { DemandCell } from '../../domain/entities/demand-cell.entity'
import type { StaffUnavailability } from '../../domain/entities/staff-unavailability.entity'
import type { StaffRole, ShiftRoleRequirement } from '../../domain/entities/role.entity'
import { buildSchedulingInput } from './build-scheduling-input'

/**
 * The seam between Prisma rows and `@scheduler/scheduling-core`. Four handlers depend on it
 * (auto-schedule, manual add, coverage, suggest-N), and its own docstring names the risk being
 * guarded here: the gate is one implementation with two callers, and the same drift risk exists
 * one layer up in how rows get shaped. A silent mistake here — a dropped unavailability window, a
 * mis-keyed demand grid — would not throw; it would just quietly produce a different roster.
 */
describe('buildSchedulingInput', () => {
  const SCHEDULE_ID = 'sched-1'
  const MONDAY = 1
  const TUESDAY = 2

  const schedule: Schedule = {
    id: SCHEDULE_ID,
    name: 'Test week',
    transactionsPerStaffHour: 18,
    minStaffWhenOpen: 1,
    maxStaffPerHour: null,
    minUtilisationTarget: 0.6,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  }

  const ana: StaffMember = { id: 'ana', scheduleId: SCHEDULE_ID, name: 'Ana', maxWeeklyHours: 40 }
  const ben: StaffMember = { id: 'ben', scheduleId: SCHEDULE_ID, name: 'Ben', maxWeeklyHours: 20 }

  const morning: Shift = {
    id: 'am',
    scheduleId: SCHEDULE_ID,
    label: 'Morning',
    startMinute: 7 * 60,
    endMinute: 15 * 60,
  }

  function cell(day: number, hour: number, transactions: number): DemandCell {
    return {
      id: `${String(day)}:${String(hour)}`,
      scheduleId: SCHEDULE_ID,
      dayOfWeek: day,
      hour,
      transactions,
    }
  }

  it('keys the demand grid by day then hour, preserving every cell', () => {
    const input = buildSchedulingInput({
      schedule,
      staff: [ana],
      shifts: [morning],
      demandCells: [cell(MONDAY, 7, 12), cell(MONDAY, 8, 32), cell(TUESDAY, 7, 22)],
    })

    expect(input.demand.get(MONDAY as DayOfWeek)?.get(7)).toBe(12)
    expect(input.demand.get(MONDAY as DayOfWeek)?.get(8)).toBe(32)
    expect(input.demand.get(TUESDAY as DayOfWeek)?.get(7)).toBe(22)
    // Two days seen, not one merged bucket.
    expect(input.demand.size).toBe(2)
  })

  it('carries the schedule parameters through unchanged', () => {
    const input = buildSchedulingInput({
      schedule,
      staff: [ana],
      shifts: [morning],
      demandCells: [],
    })

    expect(input.parameters).toEqual({
      transactionsPerStaffHour: 18,
      minStaffWhenOpen: 1,
      minUtilisationTarget: 0.6,
    })
  })

  it('omits maxStaffPerHour entirely when the column is null, rather than passing null through', () => {
    const input = buildSchedulingInput({
      schedule,
      staff: [ana],
      shifts: [morning],
      demandCells: [],
    })

    // The core treats an absent key as "no cap"; a literal null would be a different thing.
    expect('maxStaffPerHour' in input.parameters).toBe(false)
  })

  it('includes maxStaffPerHour when the column holds a number', () => {
    const input = buildSchedulingInput({
      schedule: { ...schedule, maxStaffPerHour: 4 },
      staff: [ana],
      shifts: [morning],
      demandCells: [],
    })

    expect(input.parameters.maxStaffPerHour).toBe(4)
  })

  it('groups multiple unavailability windows under the staff member who owns them', () => {
    const windows: StaffUnavailability[] = [
      { id: 'u1', staffId: ana.id, dayOfWeek: TUESDAY, startMinute: 0, endMinute: 1440 },
      { id: 'u2', staffId: ana.id, dayOfWeek: MONDAY, startMinute: 540, endMinute: 720 },
    ]

    const input = buildSchedulingInput({
      schedule,
      staff: [ana, ben],
      shifts: [morning],
      demandCells: [],
      unavailability: windows,
    })

    const anaOut = input.staff.find((s) => s.id === ana.id)
    expect(anaOut?.unavailability).toHaveLength(2)
    expect(anaOut?.unavailability).toContainEqual({ day: TUESDAY, startMinute: 0, endMinute: 1440 })
    // Ben has none, so the key is absent rather than an empty array.
    expect(input.staff.find((s) => s.id === ben.id)?.unavailability).toBeUndefined()
  })

  it('leaves availability and roles off entirely when those options are omitted', () => {
    // Call sites that predate H4/roles omit them; they must not become empty-array noise.
    const input = buildSchedulingInput({
      schedule,
      staff: [ana],
      shifts: [morning],
      demandCells: [],
    })

    expect(input.staff[0]?.unavailability).toBeUndefined()
    expect(input.staff[0]?.roles).toBeUndefined()
    expect(input.shifts[0]?.roleRequirements).toBeUndefined()
  })

  it('collects the many-to-many role links per staff member', () => {
    const staffRoles: StaffRole[] = [
      { id: 'sr1', staffId: ana.id, roleId: 'supervisor' },
      { id: 'sr2', staffId: ana.id, roleId: 'barista' },
      { id: 'sr3', staffId: ben.id, roleId: 'barista' },
    ]

    const input = buildSchedulingInput({
      schedule,
      staff: [ana, ben],
      shifts: [morning],
      demandCells: [],
      staffRoles,
    })

    // "Roles/skills" means a person can hold more than one — assumption 19.
    expect(input.staff.find((s) => s.id === ana.id)?.roles).toEqual(['supervisor', 'barista'])
    expect(input.staff.find((s) => s.id === ben.id)?.roles).toEqual(['barista'])
  })

  it('attaches seat requirements to the shift that declares them', () => {
    const requirements: ShiftRoleRequirement[] = [
      { id: 'rr1', shiftId: morning.id, roleId: 'supervisor', minCount: 1 },
    ]

    const input = buildSchedulingInput({
      schedule,
      staff: [ana],
      shifts: [morning],
      demandCells: [],
      shiftRoleRequirements: requirements,
    })

    expect(input.shifts[0]?.roleRequirements).toEqual([{ roleId: 'supervisor', minCount: 1 }])
  })

  it('maps staff and shift identity fields straight through', () => {
    const input = buildSchedulingInput({
      schedule,
      staff: [ana, ben],
      shifts: [morning],
      demandCells: [],
    })

    expect(input.staff).toEqual([
      { id: 'ana', name: 'Ana', maxWeeklyHours: 40 },
      { id: 'ben', name: 'Ben', maxWeeklyHours: 20 },
    ])
    expect(input.shifts).toEqual([{ id: 'am', label: 'Morning', startMinute: 420, endMinute: 900 }])
  })
})
