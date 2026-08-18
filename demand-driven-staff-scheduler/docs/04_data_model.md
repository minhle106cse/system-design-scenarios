# Data Model

**PostgreSQL** via Prisma (`apps/scheduler-api/prisma/schema.prisma`), running in Docker — a real
schema and real migrations, owned entirely by `apps/scheduler-api`. Assumption 15 originally chose
SQLite with no server; that was reversed with the rest of the stack
(`../.ai/plans/backend-architecture-reversal.plan.md` §5) — the original six models were unchanged
by that swap, only the provider and migration engine were. Four more were added for the stretch
goals (`stretch-goals-availability-and-roles.plan.md`, 2026-08-18): `StaffUnavailability` (§1b, H4)
and `Role`/`StaffRole`/`ShiftRoleRequirement` (§2b, roles/skills).

| Model | Fields | Notes |
|---|---|---|
| `Schedule` | `id · name · transactionsPerStaffHour · minStaffWhenOpen · maxStaffPerHour? · minUtilisationTarget · timestamps` | The tunables (plan §7.6) live here, editable in the UI |
| `StaffMember` | `id · scheduleId · name · maxWeeklyHours` | |
| `StaffUnavailability` | `id · staffId · dayOfWeek(1-7) · startMinute · endMinute` | Brief §8 stretch (H4) — a time window, not a day flag; "day off" is `{0, 1440}` from the UI's preset. **No `deletedAt`**: a config row added/removed wholesale, same class as `DemandCell`/`Assignment` below — not one of the three "add/edit/remove" CRUD entities that get soft-deleted. `PrismaService`'s `SOFT_DELETE_MODELS` array is left alone. |
| `DemandCell` | `id · scheduleId · dayOfWeek(1-7) · hour(0-23) · transactions` | **unique `(scheduleId, dayOfWeek, hour)`** — a re-import upserts (assumption 10) |
| `Shift` | `id · scheduleId · label · startMinute · endMinute` | Minutes-from-midnight, not `TIME` — see below |
| `Assignment` | `id · scheduleId · staffId · shiftId · dayOfWeek · source(AUTO\|MANUAL)` | **unique `(staffId, shiftId, dayOfWeek)`**, mirroring `FeasibilityGate` H3 |
| `ScheduleRun` | `id · scheduleId · generatedAt · parameters(json) · diagnostics(json)` | Draft provenance — which parameters produced this roster and what it couldn't cover |
| `Role` | `id · scheduleId · name` | Brief §8 stretch (D2) — **unique `(scheduleId, name)`**. No `deletedAt`, same reasoning as `StaffUnavailability`: hard delete cascades to `StaffRole`/`ShiftRoleRequirement`. |
| `StaffRole` | `id · staffId · roleId` | Join table — many-to-many, **unique `(staffId, roleId)`**. A person can hold more than one role (D2). |
| `ShiftRoleRequirement` | `id · shiftId · roleId · minCount` | The seat requirement itself — **unique `(shiftId, roleId)`**. Applies to every day the shift runs (assumption 20), not per-day. |

`ScheduleRun` earns its row as the draft's **provenance** — which parameters produced a given
auto-schedule run and what it couldn't cover at the time.

> **Correction (backend-architecture-reversal.plan.md Phase D, manual roster editing):** this
> section originally said the coverage view (stretch) reads `ScheduleRun.diagnostics` — a stored
> answer — instead of recomputing. That was written before manual roster editing existed. Once an
> assignment can be added or removed after the last auto-schedule run, a stored snapshot goes
> stale the moment the manager makes that edit. `GetCoverageHandler` recomputes
> `Diagnostics` live from the currently persisted roster on every call — the same call
> `GetSummaryHandler` already made for the summary report, for the identical reason. `ScheduleRun`
> is kept for provenance (`GET /schedules/:id` still returns `latestRun`), it is just not what the
> coverage view reads.

## Why minutes-from-midnight, not `TIME`

Every consumer immediately converts a time to a number to intersect it with an hour cell — storing
the number the arithmetic uses removes a conversion at every boundary, and lets
`packages/scheduling-core` stay date-library-free (plan §2.1). It also forces the overnight
question to be answered explicitly rather than accidentally — assumption 3: overnight shifts
(`endMinute <= startMinute`) are rejected by the Zod schema on every write path.

## The real CSV — see plan §4 for the full parser trap table

The demand importer
(`apps/scheduler-api/src/modules/scheduling/application/commands/import-demand/demand-csv.parser.ts`)
handles: a title row before the header, a UTF-8 BOM, an empty first header cell, and day labels
containing a comma inside quotes (`"Fri, 07 Aug"`) — a naive `split(',')` shreds the header. The
malformed corpus is asserted in `demand-csv.parser.spec.ts` rather than as files under
`sample-data/malformed/` (that directory was planned but never created — the cases live as inline
fixtures in the spec instead).
