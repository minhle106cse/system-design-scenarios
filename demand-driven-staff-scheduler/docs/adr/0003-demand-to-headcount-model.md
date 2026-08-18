# ADR-0003 — Demand-to-Headcount Model

**Status:** Accepted.

## Context

The brief (§4.1): *"Estimate demand per hour: convert transaction counts into a required number of
staff... one staff member per N transactions per hour, with a sensible minimum (such as one) ...
You choose N and justify it."* It also asks (§4.2) how many people each shift needs so its busiest
hours are covered.

## Decision — the required-staff formula

```
required[d][h] = clamp(ceil(transactions[d][h] / N), minStaffWhenOpen, maxStaffPerHour)
                 when open at (d,h); 0 otherwise
```

**Open** ⟺ a demand cell exists for that hour (assumption 2 — no separate opening-hours model).
`minStaffWhenOpen` defaults to 1 (the brief's own suggestion); `maxStaffPerHour` is optional, off
by default.

## Decision — choosing and calibrating `N`

`N` ships as an **editable per-schedule parameter**, not a hard-coded constant, with a
**"Suggest from data"** action (`suggestTransactionsPerStaff`) that sweeps `N` for the value at
which `floor` staff-hours is closest to **80%** of total contracted capacity (a bounded linear
sweep, not a true binary search — `floorStaffHours(N)` is not guaranteed strictly monotonic once
`ceil` and `mean` compose, so a sweep is correct regardless of shape; the search space is small
enough that this costs nothing measurable). Two corrections the measured real data forced onto an
earlier draft of this decision:

1. **Calibrate against `floor` staff-hours, not raw required staff-hours.** You cannot hire someone
   for the 1pm hour alone — a shift is the smallest unit staff can be assigned. The gap between
   "hours the data genuinely demands" and "hours the roster must actually commit in whole shifts"
   is **~20%** at every value of `N` measured (plan §7.2's table). Calibrating against the smaller
   number under-provisions by exactly that gap.
2. **Calibrate to 80% of capacity, not 100%.** A contracted maximum is a cap, not a quota —
   calibrating to 100% would schedule every person to their legal limit every week, which is an
   answer no manager wants and contradicts the fairness requirement's own spirit.

### ⚠️ The suggestion says 15; the shipped default is 18 — deliberately, not a bug

The init plan's prose claimed the calibration rule above "yields `N` ≈ 18." **It does not** —
re-deriving the rule from the committed CSV against the seed team's 368 contracted hours shows
`N = 15` is the true nearest match to the 80%-of-capacity target (294.4h): `N=15` gives 296 floor
staff-hours, distance 1.6; `N=18` gives 272, distance 22.4, and is the 5th-best candidate under any
reading of "nearest". `suggestTransactionsPerStaff` implements the rule *honestly* and returns
**15** for the seed team — confirmed by `index.spec.ts` and re-derived independently by
`golden.spec.ts` against the real CSV. `phase-1-algorithm.plan.md` §1 D1 has the full sweep table.

The **shipped default stays 18** (`apps/web/prisma/schema.prisma`'s `@default(18)`,[^schema-moved]
and the whole of plan §7.8's seed demo is computed at it) — a deliberate choice among three
options, decided against their costs:

[^schema-moved]: Path as written when this ADR was accepted. The schema moved to
`apps/scheduler-api/prisma/schema.prisma` in the backend-architecture reversal (§5 of that plan);
the `@default(18)` and this decision are unchanged. Annotated rather than edited — this repo does
not rewrite an accepted ADR's body to match later refactors.

| Option | `suggest` returns | Shipped default | Why not |
|---|---|---|---|
| **A ✅ chosen** | 15 | 18 | — |
| B — move the default to 15 | 15 | 15 | Needs a new migration and a re-run of §7.8's table; the demo's slack drops from 8 seats (`32<34<38<46`) to 2 (`32<37<44<46`) — a knife-edge outcome that could flip on an implementation detail |
| C — retune the 80% target until the rule outputs 18 (≈0.74) | 18 | 18 | A constant reverse-engineered from its own answer — the weakest kind of "justification" |

**Why A.** It costs no schema/migration/seed change, keeps the demo's fairness-vs-capacity ordering
comfortable rather than knife-edge, and an honestly-reported divergence between a data-driven
suggestion and a shipped default is *better* evidence of judgement than a formula quietly tuned to
agree with its own default — `docs/12_ai_collaboration.md` is where that argument is made in full.
The concrete reason 15 is not simply adopted as the default: at `N=15`, 296 of the team's 368
contracted hours are already committed to `floor` alone, leaving almost nothing for the peak
top-up or the rebalance pass to actually do — `N=18` leaves the demo with a real, visible allocation
choice (plan §7.8's whole point), not a nearly-saturated roster.

Seeded default: **`N` = 18**, chosen for the reasons above, not because it is what the calibration
formula returns.

## Decision — mapping demand onto shifts (two targets, not one)

```
floor[d][s]  = ceil( mean( required[d][h] for h in s ) )   // never leave the shift thin
target[d][s] = max ( required[d][h] for h in s )           // cover the peak
```

Fill `floor` for every `(day, shift)` first, then top up toward `target` in order of largest
uncovered peak — **capacity, not the target, decides where it stops**, and the diagnostics report
exactly where (plan §7.6).

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| A fixed headcount per shift, independent of measured demand | Ignores the brief's own instruction to estimate from transaction counts; would not adapt if the imported CSV changed |
| Peak-everywhere (`required = target` for every hour in a shift) | Overstaffs every trough within a shift and burns hours a busier shift needed more — measured at ~12% extra staff-hours at N=18 (plan §7.2) |
| Mean-everywhere (`required = floor` only, no top-up) | Leaves every shift's peak hour understaffed by definition — directly violates the brief's "busiest hours ... adequately covered" |
| A queueing model (Erlang C) | Solves a different problem (staffing to a target wait-time/service-level under stochastic arrivals) that the brief does not ask for and the CSV does not supply the parameters for (no service-time distribution, no SLA target) |
| Regression on historical staffing | There is no historical *staffing* in the input — only historical *demand* (transactions). Nothing to regress against |

## Consequences

- `N`, `minStaffWhenOpen`, `maxStaffPerHour`, `minUtilisationTarget` are all `Schedule` fields
  (`docs/04_data_model.md`), editable in the UI — none is baked into `.env` or a constant.
- The floor/target split means stage 2's output is two numbers per `(day, shift)`, which
  `packages/scheduling-core/src/requirements/shift-requirements.ts` must expose as such — collapsing
  them into one number loses the information stage 3 needs to decide where to stop.
