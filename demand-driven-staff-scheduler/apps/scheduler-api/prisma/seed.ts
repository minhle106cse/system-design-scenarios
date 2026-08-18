// The seed team — init plan §7.8. Sized so the demo shows a real shortfall: U_min < floor <
// target < capacity. Demand cells are the real committed CSV
// (sample-data/report_Transaction_20260807_20260813.csv), transcribed by hand here the same way
// packages/scheduling-core/src/test-fixtures/real-demand-grid.ts is — kept this way even though
// the CSV importer exists now (Phase D, application/commands/import-demand/) because a seed
// script should not depend on an HTTP endpoint to populate its own database.
import { PrismaClient } from '@prisma/client'
import { DEFAULT_SHIFTS } from '../src/modules/scheduling/domain/entities/shift.entity'

const prisma = new PrismaClient()

const SEED_STAFF: Array<{ name: string; maxWeeklyHours: number }> = [
  { name: 'Alice Nguyen', maxWeeklyHours: 40 },
  { name: 'Ben Tran', maxWeeklyHours: 40 },
  { name: 'Carla Diaz', maxWeeklyHours: 40 },
  { name: 'Duy Pham', maxWeeklyHours: 32 },
  { name: 'Erin Walsh', maxWeeklyHours: 32 },
  { name: 'Farid Khan', maxWeeklyHours: 32 },
  { name: 'Grace Lee', maxWeeklyHours: 32 },
  { name: 'Hoa Le', maxWeeklyHours: 32 },
  { name: 'Ivy Chen', maxWeeklyHours: 24 },
  { name: 'Jack Osei', maxWeeklyHours: 24 },
  { name: 'Kim Vu', maxWeeklyHours: 24 },
  { name: 'Liam Brooks', maxWeeklyHours: 16 },
]

// CSV column order Fri..Thu (assumption 8); dayOfWeek 1=Mon..7=Sun.
const COLUMN_DAYS = [5, 6, 7, 1, 2, 3, 4]
const ROWS: Array<{ hour: number; values: number[] }> = [
  { hour: 7, values: [22, 13, 7, 12, 22, 13, 16] },
  { hour: 8, values: [25, 44, 32, 32, 35, 33, 45] },
  { hour: 9, values: [27, 57, 41, 39, 48, 32, 49] },
  { hour: 10, values: [38, 41, 42, 35, 41, 28, 41] },
  { hour: 11, values: [40, 42, 37, 32, 30, 33, 40] },
  { hour: 12, values: [25, 47, 30, 33, 52, 33, 40] },
  { hour: 13, values: [64, 44, 38, 45, 48, 45, 45] },
  { hour: 14, values: [42, 37, 18, 45, 33, 31, 34] },
  { hour: 15, values: [30, 37, 22, 25, 22, 25, 23] },
  { hour: 16, values: [19, 27, 28, 13, 14, 14, 14] },
  { hour: 17, values: [27, 21, 19, 18, 22, 34, 20] },
  { hour: 18, values: [18, 21, 16, 19, 24, 19, 20] },
  { hour: 19, values: [24, 31, 22, 18, 25, 22, 33] },
  { hour: 20, values: [34, 34, 24, 15, 26, 15, 32] },
  { hour: 21, values: [12, 7, 8, 4, 9, 10, 12] },
  { hour: 22, values: [5, 5, 6, 7, 2, 6, 6] },
]

async function main() {
  const schedule = await prisma.schedule.create({
    data: {
      name: 'Week of Aug 7–13, 2026',
      transactionsPerStaffHour: 18,
      minStaffWhenOpen: 1,
      minUtilisationTarget: 0.6,
      staff: { create: SEED_STAFF },
      shifts: {
        // Single source of truth — DEFAULT_SHIFTS (shift.entity.ts), same constant
        // CreateScheduleHandler now seeds for every schedule created through the API.
        create: DEFAULT_SHIFTS.map((s) => ({ ...s })),
      },
    },
  })

  const demandCells = ROWS.flatMap(({ hour, values }) =>
    values.map((transactions, i) => ({
      scheduleId: schedule.id,
      dayOfWeek: COLUMN_DAYS[i]!,
      hour,
      transactions,
    })),
  )
  await prisma.demandCell.createMany({ data: demandCells })

  // Stretch goal H4 (brief §8) — give two of the twelve staff a real availability block so the
  // demo shows it firing (stretch-goals plan §1b). Ivy Chen: a full Tuesday off (the "day off"
  // preset). Jack Osei: partial — unavailable Wednesday evening only, still eligible for
  // Wednesday's morning shift, to show H4 is a window, not a day-level flag.
  const staffRows = await prisma.staffMember.findMany({ where: { scheduleId: schedule.id } })
  const ivy = staffRows.find((s) => s.name === 'Ivy Chen')
  const jack = staffRows.find((s) => s.name === 'Jack Osei')
  await prisma.staffUnavailability.createMany({
    data: [
      ...(ivy ? [{ staffId: ivy.id, dayOfWeek: 2, startMinute: 0, endMinute: 24 * 60 }] : []),
      ...(jack ? [{ staffId: jack.id, dayOfWeek: 3, startMinute: 15 * 60, endMinute: 23 * 60 }] : []),
    ],
  })

  // Stretch goal — roles/skills (brief §8, D2, stretch-goals plan §2b). Supervisor's minCount: 1 on
  // both default shifts is held by the three 40h staff (Alice/Ben/Carla) — 120h of combined
  // capacity against 14 seats × 8h = 112h of supervisor-covered demand (golden.spec.ts's own
  // headroom calculation), so the seeded demo exercises the feature without a capacity shortfall.
  // Barista has no minCount anywhere — exists so the UI's role picker shows a person can hold more
  // than one role, without forcing every seat through a second requirement.
  const supervisor = await prisma.role.create({ data: { scheduleId: schedule.id, name: 'Supervisor' } })
  await prisma.role.create({ data: { scheduleId: schedule.id, name: 'Barista' } })
  const supervisorNames = new Set(['Alice Nguyen', 'Ben Tran', 'Carla Diaz'])
  const supervisorStaff = staffRows.filter((s) => supervisorNames.has(s.name))
  await prisma.staffRole.createMany({
    data: supervisorStaff.map((s) => ({ staffId: s.id, roleId: supervisor.id })),
  })
  const shiftRows = await prisma.shift.findMany({ where: { scheduleId: schedule.id } })
  await prisma.shiftRoleRequirement.createMany({
    data: shiftRows.map((s) => ({ shiftId: s.id, roleId: supervisor.id, minCount: 1 })),
  })

  console.log(
    `Seeded schedule ${schedule.id} — ${SEED_STAFF.length} staff, 2 shifts, ${demandCells.length} demand cells, 2 unavailability windows, 2 roles (${supervisorStaff.length} supervisors).`,
  )
}

main()
  .catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
