# UI Guidelines

Screens, and the rules that govern how they're built. Component-level conventions:
`../directives/frontend_standard.md`.

## Screens (plan §3.1) — all built (Phase 3; Roles later split into its own tab, § below)

| Route | Brief § | Notes |
|---|---|---|
| `/` | 2.1 | Schedules list (`GET /schedules`, Phase 3's new route) + create |
| `/s/[id]` → **Roles** | stretch 4 | Per-schedule role CRUD (D2) + a "held by" count. Placed FIRST because a role has to exist before it can be ticked on anyone — see the note below |
| → **Staff** | 2.2 | Table + total contracted hours. One modal covers a person entirely — name, max weekly hours, unavailable times (stretch 3, H4) and role chips (stretch 4) — and it is the same modal with the same fields for create and edit |
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
`coverage-view.tsx`, `roles-manager.tsx`, `roster-freshness.tsx`), each following the
pending/success/error mutation pattern
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

## Two later corrections, from using the screens

**Roles moved out of Staff and ahead of it.** They were originally a section at the bottom of the
Staff tab, on the argument that they belong where they are assigned. Using it showed the opposite:
a role must EXIST before it can be ticked on anybody, so defining one meant scrolling past the whole
staff table and back. The nav order now matches the order of the work.

**One modal per person, identical for create and edit.** Availability used to hide behind a per-row
"Manage" button and roles were chips toggled inline in the table, so *creating* someone offered two
of the four fields and the rest only became reachable afterwards. They are now one form. The cost is
that create is no longer a single request — the availability and role endpoints are keyed by
`staffId`, which does not exist until the staff member does — so create writes the person, then
their windows, then their roles. If a later step fails the person still exists, and the banner says
exactly that rather than implying nothing was saved.
