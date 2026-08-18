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
`src/lib/*.ts` functions, unit-tested under the existing `environment: 'node'` config (27 specs
when Phase 3 landed; 41 today).
The six interactive components themselves (`*-manager.tsx`/`*-view.tsx`) are verified by running
the real app in a browser against a real `apps/scheduler-api` + Postgres, not by a component-test
suite — a scope decision, not an oversight (`docs/05_ui_guidelines.md` states the same rule).

## Layer 3, filled in: the CQRS handlers

Until 2026-08-19 `apps/scheduler-api`'s suite covered infrastructure (the Zod pipe, the exception
filter, the logging interceptor, transient-error classification) and the CSV parser — but **not one
of its 24 command/query handlers**. That was the real gap in this repo's testing, and it was
invisible from the totals: the algorithm was proven over generated inputs and the endpoints had been
exercised by hand against a live Postgres, so nothing *failed*; the layer that wires the two
together simply had no automated statement about it.

Handlers with genuine branching are now covered directly:

| Spec | What it pins that nothing else could |
|---|---|
| `add-assignment.handler.spec.ts` | The manual path replays the same gate as auto-schedule (assumption 12) — H1/H2/H3 each rejected, touching-but-not-overlapping shifts allowed, and the load-bearing case: a violation owned by a **pre-existing** assignment is not blamed on the candidate |
| `auto-schedule.handler.spec.ts` | Orchestration around `generateRoster` — full replace not append (assumption 11, what makes the endpoint idempotent), the run recorded with the parameters actually used, caps never exceeded, and an under-resourced week **reported rather than thrown** |
| `update-shift.handler.spec.ts` | The merged-state check `zod_validation.md` rule 4 documents as its one exception — a PATCH carrying only `endMinute` validated against the *stored* `startMinute`, which Zod structurally cannot see |
| `build-scheduling-input.spec.ts` | The Prisma-row → `SchedulingInput` seam four handlers share: demand keyed day-then-hour, `maxStaffPerHour: null` omitted rather than passed through, unavailability and multi-role links grouped per person |
| `suggest-n.handler.spec.ts` | "Suggest from data" reports the suggestion **alongside** `current` and never applies it — ADR-0003's deliberate 18-vs-15 divergence is evidence a silent overwrite would erase |
| `remove-assignment.handler.spec.ts` | The intentional asymmetry with add: no gate replay, because removal can only relax H1–H4 (ADR-0006 explains why a role shortfall still isn't a 422) |

The `add-assignment` attribution branch was additionally checked by **mutation**: replacing
`if (ownViolation)` with `if (violations.length > 0)` makes exactly the pre-existing-violation test
fail and nothing else, so that test is known to be load-bearing rather than merely passing.

Still deliberately untested: the remaining thin CRUD handlers (`add-staff`, `remove-role`, and
similar), which are a repository call and a not-found check with no branching of their own — a test
there would assert the mock, not the behaviour. The brief asks for *"tests where they add value"*,
and that is the line drawn.

## Status

All layers green — **255 specs** across the workspace: **97** in `packages/scheduling-core`
(unit + property + golden-file, up from 80 with the stretch goals' H4/roles additions), **53** in
`packages/shared-kernel`, **64** in `apps/scheduler-api` (up from 27, the handler specs above), and
**41** in `apps/web`'s `src/lib/*.spec.ts` per the component-test note. Live verification against a
real Postgres remains on top of this, not replaced by it — every claim in
`../.ai/PROJECT_STATUS.md`'s phase log is backed by a real `curl`/`psql`/browser check.
`../.ai/PROJECT_STATUS.md` tracks current phase.
