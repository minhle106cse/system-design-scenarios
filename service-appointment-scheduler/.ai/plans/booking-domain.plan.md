# PLAN — Scheduler domain (booking / availability / cancellation)

> **Status: executed.** Approved 2026-08-10, before any file in `src/modules/booking/` existed.
> Reproduced here as the artifact `AGENTS.md`'s Citation Protocol requires and
> `init-source.plan.md` §6.4.1 names as the primary exhibit for the AI-collaboration criterion.
>
> **Preserved as written, including where it was wrong.** §"The most important point" below guessed
> the shape of Prisma's exclusion-constraint error. The guess was incorrect. It is left in place
> because a plan that only shows correct predictions is not evidence of a verification process —
> see `docs/12_ai_collaboration.md` §5. Authored in the session's working language (Vietnamese) and
> translated for the repository; content unchanged.

---

## Context

Init is complete: monorepo tooling, `packages/shared-kernel`, the `apps/scheduler-api` skeleton
(Nest/Fastify, Prisma, CQRS bus, idempotency, observability), the 9-table schema with **two
live-verified anti-double-booking exclusion constraints**, seed data, 13 directives, 10 docs and
2 ADRs. `src/modules/` is **completely empty** — not one line of business logic.

Against `KeyloopCodingChallange.pdf` (Scenario A), none of the three core requirements has code:
Resource-Constrained Booking, Real-Time Availability Check (both a bay **and** a qualified
technician, for the **entire** service duration), Confirmed Appointment Record.

A documentation audit found **8 design gaps** unanswered anywhere. The most important:

- the availability algorithm itself;
- the bay/technician selection policy — `docs/02` UC-1 step 4 forwards the question to `docs/06`,
  and `docs/06` is silent;
- where the 30-minute slot grid comes from (there is no opening-hours concept in the ERD at all);
- whether a `23P01` conflict should be retried — ADR-0002 §6 deliberately deferred this decision to
  the booking handler.

Additionally `docs/00_overview.md §Status` and `readme.md §Testing` **state things that are false**
(both claim the domain is implemented).

**Intended outcome:** three endpoints running against real Postgres, a concurrency test proving
exactly one of two simultaneous requests wins, and architecture/infrastructure documentation that
matches the code 1-to-1 — no dangling references, no false sentences.

## Decisions taken before coding

| # | Decision | Consequence |
|---|---|---|
| 1 | Business hours from **env**, no new table | `BUSINESS_HOURS_START/END`, `BUSINESS_TIMEZONE`, `SLOT_GRANULARITY_MINUTES`. **No new migration** → the two exclusion constraints are never touched |
| 2 | `GET /availability` returns **slot + counts** | `{startAt, endAt, availableBays, availableTechnicians}` — resolves the contradiction between `docs/02` and `docs/06` |
| 3 | Cancel is **idempotent, blocks COMPLETED** | CANCELLED → 200 no-op · COMPLETED → 409 · missing → 404 |
| 4 | Integration test kept **separate** | `*.int-spec.ts` + `npm run test:integration`, deliberately outside `turbo test` |

---

## Core design

### Availability — Prisma-native, no raw SQL

The half-open `[start, end)` overlap predicate is expressible in plain Prisma and is **exactly
equivalent** to the constraint's `tstzrange(...,'[)') &&`:

```ts
{ status: 'SCHEDULED', startAt: { lt: windowEnd }, endAt: { gt: windowStart } }
```

Three queries, set subtraction in memory (bays/technicians per dealership number in the dozens — no
need for complex SQL):

1. `tx.serviceBay.findMany({ where: { dealershipId } })` → candidate bays
2. `tx.technician.findMany({ where: { dealershipId, qualifications: { some: { serviceTypeId } } } })`
   → candidates **already filtered by qualification** (the `TechnicianServiceType` join *is*
   requirement 2's "qualified" condition)
3. `tx.appointment.findMany({ where: <overlap predicate>, select: { serviceBayId, technicianId } })`
   → the busy set

Selection: first free bay by `label` ASC, first free technician by `name` ASC — **deterministic**,
so demos and tests are reproducible. A collision between two concurrent requests is the DB
constraint's job, not the tie-break's. (Soft-delete `deletedAt: null` is injected by the Prisma
extension in `prisma.service.ts` — never written by hand.)

### The most important point: where to translate the `23P01` error

Lint **forbids** `modules/*/application/**` from importing Prisma (`eslint.config.mjs`). Therefore:

- `PrismaAppointmentRepository.save()` (infrastructure) catches the Postgres error and throws
  `AppointmentSlotConflictError`;
- the handler (application) only ever sees a domain error, never Prisma;
- `AppointmentSlotConflictError` carries no `transient: true`, so `CommandBus.withRetry` will not
  retry it (it only retries `P2034`). This settles the question ADR-0002 §6 deferred: **a genuine
  conflict must surface to the caller so they can pick another slot — it must not be auto-retried.**

⚠️ **The error object's shape through `@prisma/adapter-pg` is unverified** (possibly a
`PrismaClientKnownRequestError` with `meta.code='23P01'`, possibly a
`PrismaClientUnknownRequestError` carrying only a message). The first step of the infrastructure
phase is to **force a real conflict against real Postgres, log the whole object, and only then fix
the predicate** — do not guess. Record the result in `.ai/memory/gotchas.jsonl`.

> **What actually happened:** neither guess was right. Prisma wraps it as
> `PrismaClientKnownRequestError` with **`code: 'P2039'`** and the Postgres error nested at
> `meta.driverAdapterError.cause`. The plan's instruction not to guess is what caught it.

---

## Execution phases

**Phase 0 — design documents before code.** ADR-0003 (availability + selection policy, with the
mandatory "Alternatives considered" section per `adr/README.md`); finalize all three endpoints in
`docs/06_api_contracts.md`; remove the dangling reference in `docs/02`; add assumptions to `docs/01`.

**Phase 1 — shared foundations.** Four business-hours env keys (validated at boot);
`common/errors/booking.error.ts`; `LogContext.BOOKING`/`AVAILABILITY`;
`infrastructure/observability/booking.metrics.ts`; **fix a real bug** in `ZodValidationPipe` (it
throws `{errorCode, ...}` but `GlobalExceptionFilter` reads `response.code`, so validation failures
surface as `BAD_REQUEST` / `"Internal server error"`).

**Phase 2 — domain layer** (pure TS, co-located specs): `Appointment` entity (mutable, private
`_fields`, defensive `Date` cloning, `createScheduled` factory generating UUIDv7, `cancel()`);
`business-hours.ts` (DST-correct local↔UTC via `Intl`, no date library); `resource-selection.ts`;
repository interfaces.

**Phase 3 — infrastructure.** *First* verify the `23P01` shape against real Postgres, then: mapper
(trust persistence on read), `PrismaAppointmentRepository`, query-repository, wire `SchedulerApiRepos`.

**Phase 4 — application.** `BookAppointmentHandler` (transactional; reads through the write repo
inside the transaction per `cqrs_pattern.md`), `CancelAppointmentHandler`, `CheckAvailabilityHandler`
(no transaction).

**Phase 5 — presentation + wiring.** Zod schemas, two controllers, `BookingModule` into `AppModule`.

**Phase 6 — the most important test.** `jest.integration.config.js` with `testRegex` matching
`*.int-spec.ts` (which the main config's `*.spec.ts` regex does **not** match, so `turbo test` stays
Docker-free); two concurrent `BookAppointmentCommand`s asserting exactly one wins; plus back-to-back
and cancel-then-rebook cases.

**Phase 7 — reconcile documentation and run the After-Task Protocol.**

---

## Verification

`npx turbo run typecheck lint format:check build test` → `docker compose up -d && db:migrate &&
db:seed` → `npm run test:integration` → boot and cURL all three endpoints (including idempotent
replay and the 409 conflict) → `/docs`, `/metrics` → `node scripts/sync.cjs` →
`python .ai/knowledge_builder.py`.

⚠️ **Mandatory final check:** `git diff` on `prisma/migrations/20260810051339_init/` must be
**empty** — the two exclusion constraints are requirement 2's guarantee, and this plan deliberately
creates no new migration.

---

## References & Compliance

Read before writing any code, per `AGENTS.md`'s Citation Protocol.

| Source | What it constrained |
|---|---|
| `KeyloopCodingChallange.pdf` (Scenario A) | The three core requirements; the Part 2 backend choice; the four evaluation dimensions |
| `directives/cqrs_pattern.md` | One repos shape per service; write repos take the transaction client and are never DI providers; **a command that reads mid-flight reads the write repo, never a query-repo**; CANONICAL placement of query-repositories and DTOs |
| `directives/domain_modeling.md` | Mutable entity with individual `_fields`; defensive `Date` cloning in and out; `create<Variant>` factory owning identity (UUIDv7); validate on write, **trust on read** in the mapper |
| `directives/database_standard.md` | UUID PK, `camelCase` ↔ `@map("snake_case")`, soft delete via `deletedAt` and its automatic filter |
| `directives/folder_structure_sop.md` | The `domain`/`application`/`infrastructure`/`presentation` layout and the lint-enforced boundaries |
| `directives/naming_conventions.md` | `I{Entity}Repository` ↔ `Prisma{Entity}Repository`; `{Verb}{Noun}Command` ↔ `{Verb}{Noun}Handler`; `common/errors/{module}.error.ts` |
| `directives/zod_validation.md` | Zod only, per-route pipe, schemas in `presentation/schemas/`; **no input validation inside the entity** |
| `directives/testing_standard.md` | Co-located specs; `jest.Mocked<T>` mocking; the `@/` alias; the ESM/CJS Jest bridge; the documented wiring for adding `uuid` |
| `directives/idempotency_strategy.md` | Claim-before-execute; attach the interceptor **per-route**, never globally |
| `directives/resilience_patterns.md` §3 | Only `P2034` is retried; never retry 4xx-class errors — the basis for ADR-0003 §2.4 |
| `directives/logging_standard.md` | Every log call passes an explicit `context` from the `LogContext` registry |
| `directives/observability_monitoring.md` | Counter vs Gauge; custom metrics live in `infrastructure/observability/` |
| `docs/adr/0001-transaction-retry-boundary.md` | Unit of Work; retry wraps the transaction; handler kind inferred from its type |
| `docs/adr/0002-booking-concurrency-control.md` | The exclusion constraints and their `'[)'` semantics; §5's warning that the error translation is "a real seam to get right"; §6's deferred retry question |
| `docs/01/02/04/06/08` | Requirements, use cases, schema, API contracts, testing strategy |
| `.ai/plans/init-source.plan.md` §8, §13 | The app skeleton's shape and the deliverables map |
