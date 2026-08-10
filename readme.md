# Keyloop Service Scheduler

**Scenario A — The Unified Service Scheduler.** A resource-constrained appointment booking API for
vehicle service: given a customer, vehicle, service type, dealership, and desired time, it checks
real-time availability of both a service bay and a qualified technician for the full service
duration, and creates a persistent, non-overlapping appointment record.

Backend implementation (Part 2 of the challenge): a RESTful API + Postgres, OpenAPI-documented,
client layer stubbed via `/docs` and the cURL examples in [docs/06_api_contracts.md](docs/06_api_contracts.md).

> **Status:** repository initialised per [`.ai/plans/init-source.plan.md`](.ai/plans/init-source.plan.md)
> (monorepo tooling, AI workflow, shared-kernel, and app skeleton in place). The scheduler domain
> itself — the booking logic this README describes above — is implemented on top of this base; see
> [docs/09_devops_infrastructure.md](docs/09_devops_infrastructure.md) for current status.

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
[docs/09_devops_infrastructure.md](docs/09_devops_infrastructure.md), and two ADRs:

- [`docs/adr/0001-transaction-retry-boundary.md`](docs/adr/0001-transaction-retry-boundary.md) — the
  Unit-of-Work / retry boundary the whole kernel is built on
- [`docs/adr/0002-booking-concurrency-control.md`](docs/adr/0002-booking-concurrency-control.md) —
  the double-booking guarantee, the flagship decision of this submission

Start at [docs/00_overview.md](docs/00_overview.md) for a ten-minute orientation.

## Testing

```bash
npm test
```

Covers the ported shared-kernel (CQRS bus, transient-error classification, response envelope) and
the scheduler domain's own suite, including the concurrent-booking test described in
[docs/08_testing_and_qa_strategy.md](docs/08_testing_and_qa_strategy.md).

## AI Collaboration Narrative

Full account: [docs/12_ai_collaboration.md](docs/12_ai_collaboration.md). Summary:

**Strategy for guiding the AI.** Before any code was written, a ~750-line init plan
(`.ai/plans/init-source.plan.md`) specified exactly what to port from the reference project
(Cortex), what to strip, what to defer and why — and went through two independent review passes
before execution, catching a wrong directory structure, a missing infra decision, and an ADR
numbering collision that would have orphaned ~20 code comments. During implementation, every
non-trivial task cites the `directives/*.md`/`docs/*.md` files it read (`AGENTS.md`'s Citation
Protocol), and lint-enforced architecture boundaries + a full test suite mean the flagship
guarantee (double-booking prevention, see [ADR-0002](docs/adr/0002-booking-concurrency-control.md))
doesn't depend on the AI having reasoned correctly — it depends on a Postgres constraint that
fails loudly if a write violates it, verified live before being written up.

**Verifying and refining its output.** Every build/typecheck/lint/test gate's actual output was
read, not assumed green from an exit code. The app was booted and curled, not just typechecked —
which is how a runtime-only crash (a missing dependency that only worked in the reference project
by accident of monorepo hoisting) was caught. The anti-double-booking constraint was tested with
real SQL against a live database (overlap rejected, back-to-back accepted, cancellation frees the
slot) before being accepted as correct.

**Ensuring final quality.** `.ai/memory/gotchas.jsonl` and `.ai/memory/architecture.jsonl` log real
mistakes as they happened during this build (a Prisma 7 schema break, two missing dependencies, a
`fastify` package-version duplication, an `eslint-disable` comment that disabled the wrong line) —
not reconstructed afterward. What stayed human, not delegated: the scenario/layer choice, the
scope-tier boundary, the decision to solve booking concurrency at the database layer specifically,
and every deferral trigger in
[docs/03_system_architecture_diagrams.md § Deferred scope](docs/03_system_architecture_diagrams.md).

## Assumptions

Ambiguities in the challenge brief and the reasonable assumption made for each are logged in
[docs/01_business_requirements.md § Assumptions](docs/01_business_requirements.md).
