# Service Appointment Scheduler

**Scenario A — The Unified Service Scheduler.** A resource-constrained appointment booking API for
vehicle service: given a customer, vehicle, service type, dealership, and desired time, it checks
real-time availability of both a service bay and a qualified technician for the full service
duration, and creates a persistent, non-overlapping appointment record.

Backend implementation: a RESTful API + Postgres, OpenAPI-documented, client layer stubbed via
`/docs` and the cURL examples in [docs/06_api_contracts.md](docs/06_api_contracts.md).

> 📖 **New here? Start with the [case study](CASE_STUDY.md)** ([Tiếng Việt](CASE_STUDY.vi.md)) — what
> the problem is, who really has it, why it isn't CRUD, the design and the alternatives rejected,
> what you'd learn, and the traps. This `readme.md` is the project's own front page; the case study
> is the one written for someone learning from it.

## Suggested reading path

Five stopping points, each complete on its own — read further only if you want to. Skipping straight
to "half a day" without the earlier rows works too; it's just a longer way to arrive at the same
understanding §D.3 and §D.4 of the case study state directly.

| Budget | Read, in order | What you'll have |
|---|---|---|
| 2 min | [`../README.md`](../README.md) — the collection index | Whether this problem is worth your time (prevalence/difficulty ratings) |
| 15 min | [`CASE_STUDY.md`](CASE_STUDY.md) start to end — especially §C (why it isn't CRUD) and §D.4 (the five alternatives rejected) | The whole argument: the problem, why it's hard, how it's solved, what you'd learn, the traps |
| 1 hour | this file → [`docs/00_overview.md`](docs/00_overview.md) → [ADR-0002](docs/adr/0002-booking-concurrency-control.md) → [ADR-0003](docs/adr/0003-availability-and-selection-policy.md) → [`docs/03`](docs/03_system_architecture_diagrams.md) | The full design: every rejected alternative, and what was deliberately deferred and why |
| half a day | [`RUN.md`](RUN.md) → `npm run test:integration` (watch two concurrent bookings collide) → `npm run test:e2e` → the [init migration](apps/scheduler-api/prisma/migrations/20260810051339_init/migration.sql) itself | Proof the guarantee is real — not just described |
| optional | [`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md) → `.ai/plans/` in order (`init-source` → `booking-domain` → `hardening` → `submission-readiness`) → `.ai/memory/gotchas.jsonl` | How an AI-assisted build was directed, verified, and corrected — including the two places it was wrong |

## The problem this solves

Stated verbatim from the brief this repository implements
([`KeyloopCodingChallange.pdf`](KeyloopCodingChallange.pdf), *Scenario A: The Unified Service
Scheduler*), because a design should be readable against the requirement it claims to satisfy:

> - **Domain:** Ownership
> - **Task:** Build an Appointment Scheduler application to replace manual booking systems.
> - **Core Requirements:**
>   1. **Resource Constrained Booking:** Allow a user to request a service appointment for a
>      specific vehicle, service type, and dealership at a desired time.
>   2. **Real-Time Availability Check:** Before confirming, check for the availability of both a
>      ServiceBay and a qualified Technician for the entire service duration.
>   3. **Confirmed Appointment Record:** Upon success, create a persistent Appointment record
>      associating the customer, vehicle, technician, and service bay.

The brief asks for **one** service layer implemented fully, with the other stubbed. This repository
implements the **backend**: a RESTful API over a persistent database, with the client layer stubbed
by the OpenAPI spec at `/docs` and the cURL walkthrough in [RUN.md](RUN.md) — one of the three forms
the brief names for that stub.

### Requirement → code → the test that proves it

| Requirement | Endpoint | Implemented in | Proven by | Design reasoning |
|---|---|---|---|---|
| **1. Resource Constrained Booking** — vehicle, service type, dealership, desired time | `POST /api/v1/appointments` | [`book-appointment.handler.ts`](apps/scheduler-api/src/modules/booking/application/commands/book-appointment/book-appointment.handler.ts) | `book-appointment.handler.spec.ts` (selection and every refusal path) · `booking.e2e-spec.ts` (the contract over HTTP) | [docs/02 UC-1](docs/02_use_cases.md) |
| **2. Real-Time Availability Check** — a bay **and a qualified** technician, for the **entire** duration | checked inside `POST`; exposed for browsing by `GET /api/v1/availability` | same handler (`findQualifiedByDealership` + the busy set over `[startAt, startAt+duration)`) · [`check-availability.handler.ts`](apps/scheduler-api/src/modules/booking/application/queries/check-availability/check-availability.handler.ts) | `business-hours.spec.ts`, `resource-selection.spec.ts`, `check-availability.handler.spec.ts` — **and** [`book-appointment.handler.int-spec.ts`](apps/scheduler-api/src/modules/booking/application/commands/book-appointment/book-appointment.handler.int-spec.ts), which proves the check survives concurrency | [ADR-0002](docs/adr/0002-booking-concurrency-control.md) · [ADR-0003](docs/adr/0003-availability-and-selection-policy.md) |
| **3. Confirmed Appointment Record** — persistent, associating customer, vehicle, technician, bay | created by `POST`, readable at `GET /api/v1/appointments/:id`, cancellable at `POST /api/v1/appointments/:id/cancel` | [`appointment.entity.ts`](apps/scheduler-api/src/modules/booking/domain/entities/appointment.entity.ts) + `PrismaAppointmentRepository` | `appointment.entity.spec.ts` · `get-appointment.handler.spec.ts` · the e2e round trip (book → read back → cancel → read back) | [docs/04](docs/04_database_schema.md) |

**Requirement 2 is the one that makes this more than CRUD**, and it is worth saying exactly how far
the guarantee goes: the application-level availability check is a *read*, so under concurrent
requests it is a time-of-check/time-of-use race no service-layer code can close. It is kept because
it produces useful, specific refusals — but correctness rests on a Postgres `EXCLUDE USING gist`
constraint that makes an overlapping booking **unrepresentable**, whatever the application believed
a moment earlier. `npm run test:integration` fires two real concurrent bookings at the same slot and
asserts exactly one survives.

Ambiguities in the brief, and the assumption made for each, are logged in
[docs/01 § Assumptions](docs/01_business_requirements.md) — 16 of them, each with its reasoning.

> **Status:** all endpoints above are implemented and backed by real command/query handlers, not a
> skeleton. See [`.ai/PROJECT_STATUS.md`](.ai/PROJECT_STATUS.md) for the current, curated state.

## Quick start

```bash
cp .env.example .env          # works verbatim — CI uses this exact copy
npm install
npm run infra:up              # postgres · prometheus · grafana
npm run db:migrate && npm run db:seed
npm run dev                   # :4002 — /docs for the OpenAPI UI, /health, /metrics
```

Full instructions, troubleshooting, and test commands: [RUN.md](RUN.md).
How this repo was assembled from a reusable base: [SETUP.md](SETUP.md).

## System design

The full System Design Document is [docs/03_system_architecture_diagrams.md](docs/03_system_architecture_diagrams.md),
supported by [docs/04_database_schema.md](docs/04_database_schema.md),
[docs/06_api_contracts.md](docs/06_api_contracts.md), the observability strategy in
[docs/03 §6](docs/03_system_architecture_diagrams.md) and
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
npm test                                                # unit — 172 tests, no infra needed
npm run test:integration --workspace=@scheduler/api     # the concurrency proof — needs Postgres up + migrated
npm run test:e2e --workspace=@scheduler/api             # the HTTP contract — same prerequisites
```

Three suites with three deliberately different entry points, because they prove different kinds of
claim:

- **`npm test`** enters at the class with repositories mocked — the ported shared-kernel (CQRS bus,
  transient-error classification, response envelope) plus the scheduler domain's own unit suite
  (entity, business-hours incl. real DST-transition dates, resource-selection, every handler and
  every refusal path). Fast, no Docker: a fresh clone can run it before infra is up.
- **`test:integration`** enters at the `CommandBus`, below HTTP, and dispatches two real
  `BookAppointmentCommand`s concurrently at real Postgres, asserting exactly one wins. Below HTTP on
  purpose: nothing about controllers or serialization can explain away the result.
- **`test:e2e`** enters at the socket via `app.inject()`, because a contract published in `docs/06`
  and in the OpenAPI spec is a claim about what a *client* receives. It found a real defect on its
  first run — see [docs/08](docs/08_testing_and_qa_strategy.md) § *What passing tests did not catch*.

CI runs all three: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## AI Collaboration Narrative

Full account: [docs/12_ai_collaboration.md](docs/12_ai_collaboration.md). Summary:

**Strategy for guiding the AI.** Every phase was planned before it was coded, and each plan is
committed as evidence rather than kept in a transcript (a discipline that itself failed once — for
most of the build those plans sat in an uncommitted working tree, which is not evidence of anything;
`git log` now carries them) — [`init-source.plan.md`](.ai/plans/init-source.plan.md)
(~750 lines: what to port from the reference project, what to strip, what to defer and why; it went
through two independent review passes that caught a wrong directory structure, a missing infra
decision, and an ADR numbering collision that would have orphaned ~20 code comments),
[`booking-domain.plan.md`](.ai/plans/booking-domain.plan.md),
[`hardening.plan.md`](.ai/plans/hardening.plan.md), and
[`submission-readiness.plan.md`](.ai/plans/submission-readiness.plan.md). Each carries a
*References & Compliance* section
naming the `directives/*.md`/`docs/*.md` files that constrained it (`AGENTS.md`'s Citation Protocol).
Plans are never retouched after execution: where one predicted something that turned out wrong, the
wrong prediction stays in and is annotated, because that contradiction is the evidence.

The design questions were settled in ADRs *before* the corresponding code existed —
[ADR-0003](docs/adr/0003-availability-and-selection-policy.md) fixed the availability algorithm, the
selection policy, and the conflict-retry rule ahead of any handler. And the flagship guarantee
(double-booking prevention, [ADR-0002](docs/adr/0002-booking-concurrency-control.md)) deliberately
does not depend on the AI having reasoned correctly: it depends on a Postgres constraint that fails
loudly if a write violates it, plus lint-enforced architecture boundaries and 187 tests.

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

Repeating that pass a second time paid again, and is the reason the e2e suite exists. It found that
`GET /availability` answered `200 {"availableSlots": []}` for a dealership that did not exist — the
same defect the previous audit had fixed on the write path, surviving on the read path because "no
results" is also a legitimate answer and therefore looks like correct output. And the very first
test to drive a real HTTP request found that a prompt retry with the same idempotency key received
`409 already in progress` for a request that had already succeeded: the response was persisted
without being awaited, and a human retrying by hand types slower than that write commits, so the
manual check had passed. That pass also produced one finding that was **wrong** — a claimed
interaction between soft deletes and the booking constraints, which querying Postgres's catalog
disproved in ten seconds. It is written up in
[`docs/12` §5](docs/12_ai_collaboration.md) rather than deleted, because a confident argument built
from a document instead of from the system is the failure mode worth showing.

What stayed human, not delegated: the scenario/layer choice, the scope-tier boundary, solving
booking concurrency at the database layer specifically, the selection and retry policy
([ADR-0003](docs/adr/0003-availability-and-selection-policy.md)), which audit findings to fix versus
document as assumptions, and every deferral trigger in
[docs/03_system_architecture_diagrams.md § Deferred scope](docs/03_system_architecture_diagrams.md).

## Assumptions

Ambiguities in the problem brief and the reasonable assumption made for each are logged in
[docs/01_business_requirements.md § Assumptions](docs/01_business_requirements.md).
