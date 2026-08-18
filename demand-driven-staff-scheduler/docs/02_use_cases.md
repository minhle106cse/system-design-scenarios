# Use Cases

Six flows, one per requirement in the brief's §2. Each maps to a screen (`05_ui_guidelines.md`), a
command or query handler
(`apps/scheduler-api/src/modules/scheduling/application/`, `directives/naming_conventions.md` §5),
and a test at the appropriate layer (`08_testing_strategy.md`).

## UC1 — Create a schedule (brief §2.1)

Manager names a new schedule. It becomes the container for staff, demand, shifts and the roster —
one typical week, Monday–Sunday. `createSchedule(name)`.

## UC2 — Manage staff (brief §2.2)

Add / edit / remove a staff member: name + `maxWeeklyHours`. No lower bound beyond "not
negative"; no upper bound beyond a sanity cap (168h/week). `createStaff` / `updateStaff` /
`deleteStaff`.

## UC3 — Import demand (brief §2.3)

Upload the weekly transaction CSV. The importer never throws to the client — it returns
`{ cells, warnings, errors }`, row/column-precise. A re-import **replaces** (upsert on
`(schedule, day, hour)` — assumption 10). See `docs/04_data_model.md` and plan §4 for the four
parser traps in the real file. `importDemandCsv(scheduleId, file)`.

## UC4 — Define shifts (brief §2.4)

Add / edit / remove a shift: start + end time only. Seeded with 07:00–15:00 and 15:00–23:00.
`createShift` / `updateShift` / `deleteShift`.

## UC5 — Auto-schedule (brief §2.5)

One action: `autoSchedule(scheduleId, parameters)` calls `generateRoster` from
`@scheduler/scheduling-core`, persists the resulting assignments as a **full replace** (assumption
11 — idempotent by construction) and a `ScheduleRun` recording the parameters and diagnostics used.
The result is a draft; UC5a (stretch) lets the manager adjust it manually, replayed through
`validateRoster` so a manual edit cannot violate a hard constraint (assumption 12).

## UC6 — View the summary (brief §2.6)

Per (day, hour): transactions, staff hours, transactions/staff-hour (`–` when staff hours is 0).
Plus the four week-level aggregates, **both** transactions-per-staff-hour figures shown side by
side with the difference explained (`directives/frontend_standard.md` §1 rule 2). `summarise(...)`.

## Stretch use cases (brief §8, optional — plan §12 phase 4)

- UC7 — Coverage view: required vs scheduled per hour, gaps and overstaffing highlighted.
- UC8 — Manual roster edit, gated by `validateRoster`.
- UC9 — CSV export of the roster.
