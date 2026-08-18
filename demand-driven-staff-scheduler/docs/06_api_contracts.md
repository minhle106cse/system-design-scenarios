# API Contracts

`apps/scheduler-api` — NestJS + Fastify, CQRS (`backend-architecture-reversal.plan.md`). Every route
is `Controller -> CommandBus/QueryBus -> handler`, never touches Prisma directly
(eslint-enforced layering, see `apps/scheduler-api/eslint.config.mjs`). Input is validated once,
at the controller boundary, via `ZodValidationPipe` — `directives/zod_validation.md`'s rule still
holds, just wired through a Nest pipe instead of a Next.js route handler now.

All routes below are prefixed `/api/v1` (confirmed against the running server's route table, not
copied from a plan). `/health` and `/metrics` are unprefixed, infra-only.

Every response is wrapped by `ResponseInterceptor`: `{ success, data, meta }` on 2xx,
`{ success: false, message, error: { code, details }, meta }` on error (`GlobalExceptionFilter`).
The tables below show the `data`/`error.details` shape, not the envelope.

## Schedules (`/api/v1/schedules`)

| Route | Method | Body | `data` |
|---|---|---|---|
| `/schedules` | `GET` | — | `Schedule[]` — newest first, brief §2.1's "list" half of `/` (Phase 3) |
| `/schedules` | `POST` | `{ name: string }` | `Schedule` — seeds the two default shifts (brief §2.4) |
| `/schedules/:id` | `GET` | — | `{ schedule, staff, shifts, demandCells, assignments, latestRun }` — the whole schedule |
| `/schedules/:id` | `PATCH` | `{ name?, transactionsPerStaffHour?, minStaffWhenOpen?, maxStaffPerHour?, minUtilisationTarget? }` | `Schedule` — the parameter panel (`docs/05`'s Roster screen, Phase 3) |
| `/schedules/:id/suggested-n` | `GET` | — | `{ suggested, current }` or `422 INSUFFICIENT_CALIBRATION_DATA` — "Suggest from data" (assumption 1's `suggestTransactionsPerStaff`, Phase 3) |
| `/schedules/:id/auto-schedule` | `POST` | — | `{ roster, diagnostics }` — full replace (assumption 11), brief §2.5 |
| `/schedules/:id/summary` | `GET` | — | `SummaryReport` (plan §7.7), brief §2.6 |
| `/schedules/:id/coverage` | `GET` | — | `Diagnostics` (`{ hours, staff, unfilledSeats, structural }`), brief §8 stretch |

`suggested-n` 422s (`InsufficientCalibrationDataError`) when the schedule has no staff, no shifts,
or no imported demand cells — `suggestTransactionsPerStaff` never throws on any of those inputs
(each is pinned to degrade cleanly to `0`/no-op inside `@scheduler/scheduling-core`), but it
silently collapses to `bestN = 1`, a number that looks like real calibration but isn't. The guard
exists to fail loudly instead of returning a misleadingly "legitimate" `suggested` value; it does
NOT apply to `auto-schedule`, which must keep generating (an empty/thin roster plus honest
`diagnostics`) rather than ever throwing on a feasible-but-bad input. `error.details` is
`{ staff, shifts, demand }`, `true` on whichever inputs are missing.

## Staff (`/api/v1/schedules/:scheduleId/staff`)

| Route | Method | Body | `data` |
|---|---|---|---|
| `/staff` | `POST` | `{ name, maxWeeklyHours }` | `201 StaffMember` |
| `/staff/:staffId` | `PATCH` | `{ name?, maxWeeklyHours? }` | `StaffMember` |
| `/staff/:staffId` | `DELETE` | — | `204` — soft delete |

No separate `GET` list — `GET /schedules/:id` already returns the full `staff` array.

## Shifts (`/api/v1/schedules/:scheduleId/shifts`)

Same CRUD shape as Staff (brief §2.4 — "a shift is defined by only a start time and an end time").

| Route | Method | Body | `data` |
|---|---|---|---|
| `/shifts` | `POST` | `{ label, startMinute, endMinute }` | `201 Shift` |
| `/shifts/:shiftId` | `PATCH` | `{ label?, startMinute?, endMinute? }` | `Shift` |
| `/shifts/:shiftId` | `DELETE` | — | `204` — soft delete |

`startMinute`/`endMinute` are minutes-from-midnight integers (`docs/04_data_model.md`), not `HH:mm`
strings — one less conversion at the boundary, matches the Prisma column directly.
`endMinute > startMinute` is enforced twice, for two different reasons: `createShiftSchema`'s Zod
`.refine` rejects it when both fields are present in the SAME request; `UpdateShiftHandler` rejects
it again after merging a partial `PATCH` with the existing row, because Zod alone cannot see a field
the request didn't send (`InvalidShiftTimeRangeError`, 422 — `.ai/memory/conventions.jsonl`).

## Demand (`/api/v1/schedules/:scheduleId/demand`)

| Route | Method | Body | `data` |
|---|---|---|---|
| `/demand/import` | `POST` | `multipart/form-data`, field `file` (CSV) | `{ cells, warnings, errors }` — **never a bare 500** (business-requirements.md #9) |

No separate `GET` — `GET /schedules/:id` already returns the full `demandCells` grid. A re-import
**replaces**, upsert on `(scheduleId, dayOfWeek, hour)` (assumption 10): only rows the parser
accepted are written; a malformed cell is reported in `errors` and simply left out, the rest of the
grid is untouched. Parsing itself (`application/commands/import-demand/demand-csv.parser.ts`) is a
real quoted-field CSV parser, not `line.split(',')` — the day labels contain a comma inside quotes
(`"Fri, 07 Aug"`), CLAUDE.md's hard rule. `warnings`/`errors` are row/column-located
(`{ row, column?, message }`), 1-based, matching how a manager reads the file in a spreadsheet.

## Roster (`/api/v1/schedules/:scheduleId/roster`)

Manual roster editing — the brief's stretch goal. `POST` (above, under Schedules,
`/schedules/:id/auto-schedule`) replaces the WHOLE roster; these two routes edit ONE assignment.

| Route | Method | Body | `data` |
|---|---|---|---|
| `/roster/assignments` | `POST` | `{ staffId, shiftId, dayOfWeek }` (1=Mon..7=Sun) | `201 Assignment` or `422 ROSTER_VIOLATION` |
| `/roster/assignments/:assignmentId` | `DELETE` | — | `204` — hard delete, `Assignment` has no `deletedAt` |

`AddAssignmentHandler` replays the existing roster **plus the candidate** through
`validateRoster` — the SAME `FeasibilityGate` `generateRoster` uses (assumption 12,
`.ai/memory/conventions.jsonl`), so a manual add can never reach a state auto-schedule itself
would refuse. On `422`, `error.details.violations` is `scheduling-core`'s own `Violation[]`
verbatim (`{ staffId, shiftId, day, reason }`), `reason` one of `docs/adr/0001-*.md`'s codes —
`WOULD_EXCEED_MAX_HOURS`, `OVERLAPS_EXISTING_SHIFT`, `ALREADY_ASSIGNED`, or `UNAVAILABLE` (an
unknown `staffId`/`shiftId`). `DELETE` needs no gate replay — removing an assignment can only
relax the roster, never violate it.

`GET /schedules/:id/coverage` (above, under Schedules) recomputes `Diagnostics` live from the
currently persisted roster on every call — it does not read `ScheduleRun.diagnostics`, so it stays
correct after a manual add/remove through this section's two routes (`docs/04_data_model.md`'s
correction note). Phase D is now fully built.
