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

## On quality, honestly

None of this proves the roster is *optimal* — no optimum is defined. What's measured instead, with
real numbers from the sample dataset: coverage rate, the max−min utilisation gap before/after the
rebalance pass, and the fraction of staff reaching `U_min`. Measured, not claimed.

## Status

Layers 1 and 2 are built and green — **80/80 specs** in `packages/scheduling-core` (unit +
property + golden-file). Layer 3's importer and roster-edit cases are covered by
`apps/scheduler-api`'s own suite plus live verification against a real Postgres (every claim in
`../.ai/PROJECT_STATUS.md`'s phase log is backed by a real `curl`/`psql` check, not an assumption).
`../.ai/PROJECT_STATUS.md` tracks current phase.
