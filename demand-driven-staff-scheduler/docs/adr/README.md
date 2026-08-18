# 🧭 ADR — Architecture Decision Records

**An ADR records ONE architectural decision: the context at the time, the alternatives
considered, the alternatives rejected, and WHY.** This is a fourth kind of document alongside the
three in `../README.md`.

## Why, when `docs/` and `directives/` already exist

| | Answers |
|---|---|
| `directives/` | *"How do I write code correctly?"* — the current rules |
| `docs/NN_*.md` | *"What is the system, how does it run?"* — the current spec |
| `docs/adr/` | *"Why was it built this way, and what was rejected?"* — **historical reasoning** |

A directive states *what the rule is*; an ADR states *why that rule won over the alternatives*.

## Convention

- Filename: `NNNN-kebab-title.md`, numbers increase, **never reused**.
- Status: `Proposed` → `Accepted` → (`Superseded by ADR-XXXX` | `Deprecated`). **Never delete an
  old ADR.**
- Every ADR MUST have an **Alternatives considered** section with rejection reasons — an ADR
  without one is a description, not a decision record (`../../.ai/plans/init-source.plan.md` §6).

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-constraint-enforcement-strategy.md) | Constraint Enforcement Strategy — hard constraints by construction, proven by property test | Accepted — **flagship** of this scenario |
| [0002](0002-auto-schedule-algorithm.md) | Auto-Schedule Algorithm — greedy fairness-first assignment + bounded local-search rebalance | Accepted |
| [0003](0003-demand-to-headcount-model.md) | Demand-to-Headcount Model — choosing and calibrating `N` | Accepted |
| [0004](0004-scheduling-core-as-a-pure-package.md) | `scheduling-core` as a zero-dependency package | Accepted |
| [0005](0005-transaction-retry-boundary.md) | Transaction & Retry Boundary — Unit of Work + inferred-from-signature + fail-fast at boot | Accepted — **ported**, see below |
| [0006](0006-role-requirements-as-seat-requirements.md) | Role Requirements Are a Seat Requirement, Not a Gate Constraint | Accepted |

0001–0004 were written for this scenario from scratch — numbering started at 0001 because nothing
was ported verbatim at the time (`.ai/plans/init-source.plan.md` §6). That changed with the
backend-architecture reversal: **0005 is ported** from
`../../../service-appointment-scheduler/docs/adr/0001-transaction-retry-boundary.md`
(`.ai/plans/backend-architecture-reversal.plan.md` §4) — its own header explains why it's numbered
0005 here rather than reusing the source's 0001 (this scenario's 0001–0004 already existed).
