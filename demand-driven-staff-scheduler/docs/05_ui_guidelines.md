# UI Guidelines

Screens, and the rules that govern how they're built. Component-level conventions:
`../directives/frontend_standard.md`.

## Screens (plan §3.1) — all built (Phase 3; Roles later split out of Staff, Roster later split
## into Schedule + Roster, both § below)

| Route | Brief § | Notes |
|---|---|---|
| `/` | 2.1 | Schedules list (`GET /schedules`, Phase 3's new route) + create |
| `/s/[id]` → **Roles** | stretch 4 | Per-schedule role CRUD (D2) + a "held by" count. Placed FIRST because a role has to exist before it can be ticked on anyone — see the note below |
| → **Staff** | 2.2 | Table + total contracted hours. One modal covers a person entirely — name, max weekly hours, unavailable times (stretch 3, H4) and role chips (stretch 4) — and it is the same modal with the same fields for create and edit |
| → **Demand** | 2.3 | CSV drop zone → import result (accepted / warnings / errors, row/column-precise) → day×hour heatmap |
| → **Shifts** | 2.4 | CRUD via `<input type="time">`, seeded with 07:00–15:00 and 15:00–23:00, a Requires column + editor for per-role `minCount` (stretch 4) |
| → **Schedule** | 2.5 | Parameter panel (`PATCH /schedules/:id`) + a suggested-N line (`GET .../suggested-n`, fetched once per load, no separate button) + auto-schedule button + diagnostics banners (including role shortfalls, stretch 4) + the roster-freshness banner |
| → **Roster** | 2.5 | The persisted day×shift grid, manual add/remove/drag-drop, CSV export, and the same roster-freshness banner — a pure view+edit of whatever `Schedule`'s Auto-schedule button (or a prior manual edit) last produced |
| → **Summary** | 2.6 | The aggregated table + the four week totals, each ratio captioned per rule 2 + CSV export |
| → **Coverage** | stretch 2 | Required vs scheduled per hour (live, not a stored snapshot) + per-staff "hours booked vs contracted" + a role-shortfalls banner (stretch 4), live-recomputed the same way |

`/s/[id]/layout.tsx` renders the shared tab nav and 404s via `notFound()` on an unknown schedule id.
Every screen's page.tsx is an async Server Component (`getSchedule`/`getSummary`/`getCoverage`
called directly, deduped by Next's per-request fetch memoization against the layout's own call);
the interactive parts are separate Client Components under `src/components/` (`staff-manager.tsx`,
`demand-manager.tsx`, `shift-manager.tsx`, `schedule-manager.tsx`, `roster-manager.tsx`,
`summary-view.tsx`, `coverage-view.tsx`, `roles-manager.tsx`, `roster-freshness.tsx`), each
following the pending/success/error mutation pattern
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

## Three later corrections, from using the screens

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

**Roster split into Schedule + Roster.** The original single Roster tab conflated three jobs: edit
the tunables, trigger generation, and hand-tune the resulting grid. User-directed split — Schedule
now owns the parameter panel, the suggested-N line, Auto-schedule, and the diagnostics that come out
of running it; Roster owns only the day×shift grid, manual add/remove/drag-drop, and CSV export.
Auto-schedule stays on Schedule rather than moving to Roster because it is one motion with the
parameters above it ("adjust N, click run"), not two tabs. Both screens carry the same
`RosterFreshness` banner (`rosterStatus`, `apps/web/src/lib/staleness.ts`) so a manager who lands on
either one still sees when the displayed roster predates a later edit. A real pre-existing bug
surfaced while doing the split: the page had always called `GET .../suggested-n` unconditionally at
load, which 422s (`INSUFFICIENT_CALIBRATION_DATA`) on a schedule with no demand imported yet and
crashed the WHOLE page rather than just the suggested-N line — fixed by catching that one error code
at the Schedule page and rendering a plain "no demand data yet" hint instead of a suggested number,
everything else still fails loudly.

**"Suggest from data" button removed — user feedback, twice.** First round: the user reported the
button "did nothing" after typing a different N and clicking it. Verified live (network tab +
`MutationObserver`) that it DID fire and 200 every click — the suggestion is a pure function of
staff/shifts/demand, deliberately independent of whatever is typed into the N field or even the
persisted current N, so an unchanged dataset always returns the identical number by design
(ADR-0003's whole point: current and suggested are allowed to diverge). The button just gave no
visible confirmation that a click that returns the same number had actually done anything. Second
round, after adding that confirmation: the user pointed out the button was pointless overhead if the
number is already fetched at page load and never depends on anything the button re-sends — asked to
drop the button and the GET, showing the once-per-load value directly. Also cut a long, pale
(`text-xs text-slate-500`) explanatory caption down to one short `text-sm` line ("Suggested N: 45 ·
using 18") on the same feedback — explicit preference for short-and-legible over
long-and-unread. `suggested-n` is now fetched exactly once, server-side, in `schedule/page.tsx`
(`getSuggestedNSafe`), with no client-side re-fetch path at all.
