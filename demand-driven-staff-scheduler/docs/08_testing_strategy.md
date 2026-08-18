# Testing Strategy

Full conventions: `../directives/testing_standard.md`. This doc is the WHAT/WHY; that directive is
the HOW.

## Three layers, each proving what the others structurally cannot (plan §8)

| Layer | Tool | Proves | Cannot prove |
|---|---|---|---|
| 1 ⭐ Property-based | fast-check over `scheduling-core` | For **arbitrary** staff/demand/shifts: H1–H3 always hold, the function is total, same input → same roster | The app is wired up; the roster is *good* |
| 2 Golden file | Vitest snapshot on the real CSV | The exact roster/summary/diagnostics for the committed dataset, incl. the brief's own illustrative arithmetic | Anything about other inputs |
| 3 Integration | Jest + a real Postgres (`apps/scheduler-api`) | Controllers/handlers, the importer against the whole malformed corpus, `validateRoster` rejecting an illegal manual edit | Generality, algorithm quality |

Layer 1 is the flagship — the direct analogue of scenario 01's concurrency test, and the reason
`scheduling-core` is zero-dependency and runs in milliseconds (plan §2.2): a suite too slow to run
stops being run.

**Extended for the stretch goals** (`stretch-goals-availability-and-roles.plan.md`, 2026-08-18):
`index.prop-spec.ts` gained two new degenerate `staffListArb` cases — a staff member unavailable
the entire week (H4), and a role nobody holds / a `minCount` above team size (roles) — plus two new
assertions run against the same combined `inputArb` every other assertion already runs against:
**1b** (no generated assignment ever overlaps its own staff member's unavailability window) and
**1c** (a reported `roleShortfall` always matches a recount from the roster, and never claims
`assigned >= required`). Both are proven the same way assertion 1 proves H1–H3: over arbitrary
generated inputs, not hand-picked examples. `golden.spec.ts` gained new snapshot **keys** for a
with-unavailability and a with-roles run — the four pre-existing keys stayed byte-identical, per
the repo's own rule against silently redefining what a passing snapshot suite already proved.

## On quality, honestly

None of this proves the roster is *optimal* — no optimum is defined. What's measured instead, with
real numbers from the sample dataset: coverage rate, the max−min utilisation gap before/after the
rebalance pass, and the fraction of staff reaching `U_min`. Measured, not claimed.

## A deliberate fourth non-layer: no `apps/web` component tests (Phase 3)

`apps/web` uses Vitest (`directives/testing_standard.md` §1) but has no `jsdom`/
`@testing-library/react` and no plan to add them at this scope. Phase 3's UI screens push every
piece of non-trivial logic — grid-building (`buildDemandGrid`/`buildRosterGrid`/`buildCoverageGrid`),
CSV export, `HH:mm` ↔ minutes conversion, `ApiError` → manager-readable copy — into plain
`src/lib/*.ts` functions, unit-tested under the existing `environment: 'node'` config (27 specs).
The six interactive components themselves (`*-manager.tsx`/`*-view.tsx`) are verified by running
the real app in a browser against a real `apps/scheduler-api` + Postgres, not by a component-test
suite — a scope decision, not an oversight (`docs/05_ui_guidelines.md` states the same rule).

## Status

Layers 1 and 2 are built and green — **97/97 specs** in `packages/scheduling-core` (unit +
property + golden-file, up from 80 with the stretch goals' H4/roles additions). Layer 3's importer
and roster-edit cases are covered by `apps/scheduler-api`'s own suite (27 specs) plus live
verification against a real Postgres (every claim in `../.ai/PROJECT_STATUS.md`'s phase log is
backed by a real `curl`/`psql` check, not an assumption). `apps/web`'s `src/lib/*.spec.ts`
(41 specs) cover the UI's non-trivial logic, per the note above. `../.ai/PROJECT_STATUS.md` tracks
current phase.
