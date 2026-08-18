# UI Guidelines

Screens, and the rules that govern how they're built. Component-level conventions:
`../directives/frontend_standard.md`.

## Screens (plan §3.1) — all seven built (Phase 3)

| Route | Brief § | Notes |
|---|---|---|
| `/` | 2.1 | Schedules list (`GET /schedules`, Phase 3's new route) + create |
| `/s/[id]` → **Staff** | 2.2 | Table CRUD: name + max weekly hours, total contracted hours shown, an Availability column + editor (stretch 3, H4), a Roles column of toggleable chips + a per-schedule Roles CRUD section (stretch 4, D2) |
| → **Demand** | 2.3 | CSV drop zone → import result (accepted / warnings / errors, row/column-precise) → day×hour heatmap |
| → **Shifts** | 2.4 | CRUD via `<input type="time">`, seeded with 07:00–15:00 and 15:00–23:00, a Requires column + editor for per-role `minCount` (stretch 4) |
| → **Roster** | 2.5 | Parameter panel (`PATCH /schedules/:id` + "Suggest from data") + auto-schedule button + day×shift grid with manual add/remove/drag-drop + diagnostics banners (including role shortfalls, stretch 4) + CSV export |
| → **Summary** | 2.6 | The aggregated table + the four week totals, each ratio captioned per rule 2 + CSV export |
| → **Coverage** | stretch 2 | Required vs scheduled per hour (live, not a stored snapshot) + per-staff "hours booked vs contracted" + a role-shortfalls banner (stretch 4), live-recomputed the same way |

`/s/[id]/layout.tsx` renders the shared tab nav and 404s via `notFound()` on an unknown schedule id.
Every screen's page.tsx is an async Server Component (`getSchedule`/`getSummary`/`getCoverage`
called directly, deduped by Next's per-request fetch memoization against the layout's own call);
the interactive parts are separate Client Components under `src/components/` (`staff-manager.tsx`,
`demand-manager.tsx`, `shift-manager.tsx`, `roster-manager.tsx`, `summary-view.tsx`,
`coverage-view.tsx`), each following the pending/success/error mutation pattern
`create-schedule-form.tsx` established. The ~6 primitives `frontend_standard.md` §2 named are built
under `src/components/ui/` (`button`, `field`, `data-table`, `badge`, `banner`, `modal`).
Copy-generation helpers for the stretch-goal banners follow the same pattern as `error-copy.ts`:
`availability.ts` (window/day-off formatting) and `role-copy.ts` (`describeRoleShortfall`) —
non-trivial logic in `src/lib/`, unit-tested there, per `docs/08_testing_strategy.md`'s no-jsdom rule.

## The three rules that come directly from the grading criteria

See `../directives/frontend_standard.md` §1 for the enforced version of these:

1. Language a non-technical manager understands — never surface an internal metric name unexplained.
2. The two week-level transactions-per-staff-hour figures are **explained**, not just shown.
3. Never fail silently — import errors, uncovered hours and unused capacity are UI states.

## Status build order

These screens landed in plan §12 Phase 3, after the algorithm (Phase 1) and the importer
(Phase 2) were built and proven — building UI against an unproven core would have meant re-doing
both the UI and the algorithm together instead of once each. `../.ai/PROJECT_STATUS.md` tracks
current phase.

## No component test layer (deliberate, see `docs/08_testing_strategy.md`)

`apps/web` has no `jsdom`/`@testing-library/react` — Phase 3 kept Vitest's existing `environment:
'node'` and pushed every non-trivial piece of logic (grid-building, CSV export, time parsing,
error-message copy) into `src/lib/*.ts`, unit-tested there. Components themselves (the six
`*-manager.tsx`/`*-view.tsx` files) are verified by actually running the app in a browser, not by
a rendering-library test suite — a deliberate scope decision (user-directed), not an oversight.
