# Overview

**What**: The Service Appointment Scheduler is a resource-constrained appointment booking API for
vehicle service. Given a customer, vehicle, service type, dealership, and desired time, it checks
real-time availability of both a service bay and a qualified technician for the full service
duration, and creates a persistent, non-overlapping appointment record.

**Why**: Scenario 01 of a personal system-design-scenarios collection — a resource-constrained
scheduling problem, modeled on replacing a manual booking process. The one requirement that
actually makes this hard, not just CRUD, is
requirement 2: the availability check must be correct under concurrent requests, not just correct
for one request at a time. That's the system's real design problem, and it's the subject of
[ADR-0002](adr/0002-booking-concurrency-control.md).

**How it's built**: NestJS + Fastify, PostgreSQL via Prisma, CQRS command/query bus, a
Unit-of-Work transaction boundary ([ADR-0001](adr/0001-transaction-retry-boundary.md)), and a
Postgres exclusion constraint enforcing the no-double-booking guarantee at the database layer
(ADR-0002). The monorepo tooling and AI-agent workflow were ported from a larger reference
project (Cortex) and deliberately cut down to this single bounded problem — see
[`SETUP.md`](../SETUP.md) and `.ai/plans/init-source.plan.md` for the full reasoning behind every
inclusion and every deferral.

## Where to read next

| Question | Read |
|---|---|
| What are the actual requirements, and what did I assume where they were ambiguous? | [`01_business_requirements.md`](01_business_requirements.md) |
| What can a user actually do? | [`02_use_cases.md`](02_use_cases.md) |
| What's the architecture, the data flow, the tech choices, the observability strategy? | [`03_system_architecture_diagrams.md`](03_system_architecture_diagrams.md) — **the System Design Document** |
| What does the schema look like, and why does the booking constraint have that shape? | [`04_database_schema.md`](04_database_schema.md) |
| What are the API endpoints? | [`06_api_contracts.md`](06_api_contracts.md) |
| How is this tested? | [`08_testing_and_qa_strategy.md`](08_testing_and_qa_strategy.md) |
| How do I run it? | [`RUN.md`](../RUN.md) |
| Why is the double-booking guarantee a database constraint, not application code? | [`docs/adr/0002-booking-concurrency-control.md`](adr/0002-booking-concurrency-control.md) |
| How is availability actually computed, who picks the bay/technician, and is a conflict retried? | [`docs/adr/0003-availability-and-selection-policy.md`](adr/0003-availability-and-selection-policy.md) |
| How was GenAI used to build this, and how was its output verified? | [`12_ai_collaboration.md`](12_ai_collaboration.md), summarized in [`readme.md`](../readme.md) |

## Status

The scheduler domain is implemented: `POST /appointments` (book), `GET /availability` (check),
`POST /appointments/:id/cancel` (cancel) — all three backed by real command/query handlers, not a
skeleton. The anti-double-booking guarantee is verified at both layers: live SQL against Postgres
(`docs/08_testing_and_qa_strategy.md`) and an application-level concurrency test dispatching two
real commands through the real `CommandBus` (`npm run test:integration`). See
`.ai/PROJECT_STATUS.md` for the current, curated state of the repository.
