import type { Prisma } from '@prisma/client'

/** The four input categories the web side's `rosterStatus` reports by name — one nullable
 *  `{category}UpdatedAt` column on `Schedule` per entry (`schema.prisma`). */
export type ScheduleInputCategory = 'staff' | 'shifts' | 'demand' | 'roles'

const COLUMN: Record<ScheduleInputCategory, string> = {
  staff: 'staffUpdatedAt',
  shifts: 'shiftsUpdatedAt',
  demand: 'demandUpdatedAt',
  roles: 'rolesUpdatedAt',
}

/**
 * Stamp `now()` onto the schedule's `{category}UpdatedAt` column, inside the SAME transaction as
 * the write that triggered it.
 *
 * This is the write-side half of roster-freshness (`apps/web/src/lib/staleness.ts` is the read
 * side). `Schedule.updatedAt` already tracks edits to the schedule's own four parameters for
 * free (Prisma's `@updatedAt`), but staff/shift/demand/role CRUD never touches the `Schedule` row
 * itself — without this call a manager could add staff, re-import demand, or edit a shift and the
 * persisted roster would still read as current. Called from every repository whose table backs
 * one of the four categories, never from a command handler (`directives/cqrs_pattern.md` — a
 * handler doesn't reach for `prisma.*` directly, only through a repository).
 */
export async function touchSchedule(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  category: ScheduleInputCategory,
): Promise<void> {
  await tx.schedule.update({
    where: { id: scheduleId },
    data: { [COLUMN[category]]: new Date() },
  })
}
