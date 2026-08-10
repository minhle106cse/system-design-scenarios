# 🧭 ADR — Architecture Decision Records

**An ADR records ONE architectural decision: the context at the time, the alternatives
considered, the alternatives rejected, and WHY.** This is a fourth kind of document alongside the
three in `docs/README.md`.

## Why, when `docs/` and `directives/` already exist

| | Answers |
|---|---|
| `directives/` | *"How do I write code correctly?"* — the current rules |
| `docs/NN_*.md` | *"What is the system, how does it run?"* — the current spec |
| `docs/adr/` | *"Why was it built this way, and what was rejected?"* — **historical reasoning** |

A directive states *what the rule is*; an ADR states *why that rule won over the alternatives*.
Six months later nobody remembers why the more common approach wasn't chosen — without an ADR, the
next person (or AI agent) "fixes" the code back to the popular pattern that was deliberately
rejected.

## Convention

- Filename: `NNNN-kebab-title.md`, numbers increase, **never reused**.
- Status: `Proposed` → `Accepted` → (`Superseded by ADR-XXXX` | `Deprecated`). **Never delete an
  old ADR** — a superseded ADR is still a historical record; mark it `Superseded`, don't edit the
  original content.
- Every ADR MUST have an **Alternatives considered** section with rejection reasons — an ADR
  without one is useless.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-transaction-retry-boundary.md) | Transaction & Retry Boundary — Unit of Work + inferred from signature + fail-fast at boot | Accepted — ported from Cortex, see `.ai/plans/init-source.plan.md` §5 for the numbering rationale |
| [0002](0002-booking-concurrency-control.md) | Booking Concurrency Control — database-level exclusion constraint | Accepted — the flagship decision of this submission |
