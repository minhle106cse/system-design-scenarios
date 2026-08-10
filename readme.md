# Service Appointment Scheduler

**Scenario 01 — Resource-Constrained Appointment Scheduling.** A resource-constrained appointment
booking API for vehicle service: given a customer, vehicle, service type, dealership, and desired
time, it checks real-time availability of both a service bay and a qualified technician for the
full service duration, and creates a persistent, non-overlapping appointment record.

Backend implementation: a RESTful API + Postgres, OpenAPI-documented, client layer stubbed via
`/docs` and the cURL examples in [docs/06_api_contracts.md](docs/06_api_contracts.md).

> **Status:** the scheduler domain described above is implemented — booking, availability, and
> cancellation are real endpoints backed by real command/query handlers, not a skeleton. See
> [`.ai/PROJECT_STATUS.md`](.ai/PROJECT_STATUS.md) for the current, curated state.

## Quick start

```bash
npm install
npm run infra:up
npm run db:migrate && npm run db:seed
npm run dev
```

Full instructions, troubleshooting, and test commands: [RUN.md](RUN.md).
How this repo was assembled from a reusable base: [SETUP.md](SETUP.md).

## System design

The full System Design Document is [docs/03_system_architecture_diagrams.md](docs/03_system_architecture_diagrams.md),
supported by [docs/04_database_schema.md](docs/04_database_schema.md),
[docs/06_api_contracts.md](docs/06_api_contracts.md), the observability strategy in
[docs/09_devops_infrastructure.md](docs/09_devops_infrastructure.md), and three ADRs:

- [`docs/adr/0001-transaction-retry-boundary.md`](docs/adr/0001-transaction-retry-boundary.md) — the
  Unit-of-Work / retry boundary the whole kernel is built on
- [`docs/adr/0002-booking-concurrency-control.md`](docs/adr/0002-booking-concurrency-control.md) —
  the double-booking guarantee, the flagship decision of this scenario
- [`docs/adr/0003-availability-and-selection-policy.md`](docs/adr/0003-availability-and-selection-policy.md) —
  how availability is computed, who picks the bay and technician, and why a slot conflict is never
  auto-retried (settling the question ADR-0002 left open)

Start at [docs/00_overview.md](docs/00_overview.md) for a ten-minute orientation.

## Testing

```bash
npm test                                                # unit — 166 tests, no infra needed
npm run test:integration --workspace=@scheduler/api     # the concurrency proof — needs Postgres up + migrated
```

`npm test` covers the ported shared-kernel (CQRS bus, transient-error classification, response
envelope) and the scheduler domain's own unit suite (entity, business-hours, resource-selection,
all three handlers). `test:integration` is the one command that dispatches two real
`BookAppointmentCommand`s concurrently against real Postgres and asserts exactly one wins — see
[docs/08_testing_and_qa_strategy.md](docs/08_testing_and_qa_strategy.md).

## AI Collaboration Narrative

Full account: [docs/12_ai_collaboration.md](docs/12_ai_collaboration.md). Summary:

**Strategy for guiding the AI.** Every phase was planned before it was coded, and each plan is
committed as evidence rather than kept in a transcript — [`init-source.plan.md`](.ai/plans/init-source.plan.md)
(~750 lines: what to port from the reference project, what to strip, what to defer and why; it went
through two independent review passes that caught a wrong directory structure, a missing infra
decision, and an ADR numbering collision that would have orphaned ~20 code comments),
[`booking-domain.plan.md`](.ai/plans/booking-domain.plan.md), and
[`hardening.plan.md`](.ai/plans/hardening.plan.md). Each carries a *References & Compliance* section
naming the `directives/*.md`/`docs/*.md` files that constrained it (`AGENTS.md`'s Citation Protocol).
Plans are never retouched after execution: where one predicted something that turned out wrong, the
wrong prediction stays in and is annotated, because that contradiction is the evidence.

The design questions were settled in ADRs *before* the corresponding code existed —
[ADR-0003](docs/adr/0003-availability-and-selection-policy.md) fixed the availability algorithm, the
selection policy, and the conflict-retry rule ahead of any handler. And the flagship guarantee
(double-booking prevention, [ADR-0002](docs/adr/0002-booking-concurrency-control.md)) deliberately
does not depend on the AI having reasoned correctly: it depends on a Postgres constraint that fails
loudly if a write violates it, plus lint-enforced architecture boundaries and 166 tests.

**Verifying and refining its output.** Every build/typecheck/lint/test gate's actual output was
read, not assumed green from an exit code. The app was booted and curled through all three booking
endpoints end-to-end — not just typechecked — which is how a runtime-only crash (a missing
dependency that only worked in the reference project by accident of monorepo hoisting) was caught
during init, and how the exact shape of Prisma's exclusion-constraint error (`P2039` wrapping a raw
`23P01`, not the `P2010`-family code assumed before checking) was discovered by provoking the real
error against live Postgres rather than guessed from documentation
([ADR-0003](docs/adr/0003-availability-and-selection-policy.md) §2.5). The anti-double-booking
constraint itself was tested at both layers: raw SQL against a live database, and an
application-level test (`npm run test:integration`) dispatching two concurrent commands through the
real `CommandBus` and asserting exactly one wins.

**Ensuring final quality.** `.ai/memory/*.jsonl` logs real mistakes as they happened — a Prisma 7
schema break, two dependencies that only worked in the reference project by accident of monorepo
hoisting, a `fastify` version duplication, an `eslint-disable` that disabled the wrong line, a JSDoc
comment that terminated itself, a directive that contradicted the repo's own lint config, and a
"ported as-is" script that still described the reference project's product in the file the agent
reads first every session.

The most useful quality mechanism, though, was scheduling a pass whose explicit job was to attack
finished work. The domain phase passed every gate — 92 tests, three working endpoints — and that
audit still found a `500` on a mistyped id, a `409` whose documented meaning was wrong, and no clock
reference anywhere in the module (so a booking for 2020 was accepted). Each fix was verified by
reproducing the defect first, then re-running the same request. Green gates prove the code does what
its tests say; they do not prove the tests asked the right questions.

What stayed human, not delegated: the scenario/layer choice, the scope-tier boundary, solving
booking concurrency at the database layer specifically, the selection and retry policy
([ADR-0003](docs/adr/0003-availability-and-selection-policy.md)), which audit findings to fix versus
document as assumptions, and every deferral trigger in
[docs/03_system_architecture_diagrams.md § Deferred scope](docs/03_system_architecture_diagrams.md).

## Assumptions

Ambiguities in the problem brief and the reasonable assumption made for each are logged in
[docs/01_business_requirements.md § Assumptions](docs/01_business_requirements.md).
