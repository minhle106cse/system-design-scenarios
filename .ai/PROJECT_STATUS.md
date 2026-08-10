# Project Status

> Curated by hand, After-Task. This is a WHAT-is-true-now summary, not a log —
> see `.ai/knowledge_builder.py`'s history handling for why detail belongs in
> `.ai/memory/*.jsonl` instead of here.

## Phase

**Scheduler domain implemented and hardened.** Three phases done and verified, each with its plan
committed in `.ai/plans/`: init (`init-source.plan.md`), the booking domain
(`booking-domain.plan.md`), and a post-audit hardening pass (`hardening.plan.md`). All three
endpoints named in `docs/06_api_contracts.md` are real, not planned.

Done — init base (unchanged since last entry, still green):
- Monorepo tooling, `packages/shared-kernel` (52 tests), `apps/scheduler-api` skeleton, Docker
  stack (postgres/prometheus/grafana), AI workflow, `directives/` + `docs/` scaffolds, Vietnamese
  translation + global rename sweep. See prior entries in `.ai/memory/*.jsonl` for detail.

Done — scheduler domain (`.ai/plans/booking-domain.plan.md`):
- **`docs/adr/0003-availability-and-selection-policy.md`** (new, Accepted) — settles four questions
  no prior doc answered: the availability overlap predicate (kept arithmetically identical to
  ADR-0002's DB constraint), server-side deterministic resource selection, business-hours-from-env
  instead of a table, and — closing ADR-0002 §6's open question — that a slot conflict is never
  auto-retried.
- **`modules/booking/domain/`** — `Appointment` entity (mutable, defensive-cloned, `cancel()`
  transition table), `business-hours.ts` (DST-correct local-time↔UTC via `Intl`, pure TS, no date
  library), `resource-selection.ts` (deterministic `selectFirstFree`/`countFree`), 4 repository
  interfaces.
- **`modules/booking/infrastructure/`** — `PrismaAppointmentRepository` (tx-scoped; translates
  ADR-0002's `23P01` exclusion violation into `AppointmentSlotConflictError`, verified against a
  **real provoked violation on live Postgres**, not assumed — the actual Prisma wrapper is `P2039`
  with the Postgres error nested at `error.meta.driverAdapterError.cause`, not `P2010` as the ADR's
  prose implied before checking), `PrismaBookingQueryRepository` (plain-client reader for
  `GET /availability`), `AppointmentMapper`. `SchedulerApiRepos` now carries `appointments` +
  `serviceBays` + `technicians` + `serviceTypes`, all tx-constructed.
- **`modules/booking/application/`** — `BookAppointmentHandler` (transactional; business-hours
  check → availability check → deterministic selection → save, with per-outcome metrics),
  `CancelAppointmentHandler` (idempotent on already-`CANCELLED`, refuses `COMPLETED`),
  `CheckAvailabilityHandler` (no transaction; one query per input, per-slot in-memory filtering).
- **`modules/booking/presentation/`** — 3 Zod schemas, `AppointmentsController`
  (`POST /appointments` with `IdempotencyInterceptor`, `POST /appointments/:id/cancel`),
  `AvailabilityController` (`GET /availability`). `BookingModule` wired into `AppModule`.
- **Env**: 4 new keys (`BUSINESS_HOURS_START/END`, `BUSINESS_TIMEZONE`, `SLOT_GRANULARITY_MINUTES`),
  validated at boot (start < end, valid IANA zone) — added to `env.validation.ts`, `env.config.ts`,
  `.env.example`.
- **Real bug fixed in the init skeleton**: `ZodValidationPipe` threw `{errorCode, ...}` but
  `GlobalExceptionFilter` reads `response.code` — a validation failure was surfacing as
  `BAD_REQUEST`/`"Internal server error"` instead of `VALIDATION_ERROR` with the actual field
  errors. Fixed + regression-tested (`zod-validation.pipe.spec.ts`, new).
- **Tests**: `apps/scheduler-api` unit suite grew from 16 → 92 tests (12 suites) — domain entity,
  business-hours (incl. real DST-transition dates), resource-selection, exclusion-violation
  detection (fixture shape verified against a real provoked error), all three handlers against
  mocked repositories. **New**: `npm run test:integration` (separate Jest project,
  `*.int-spec.ts`, not part of `npm test`/`turbo test`) — dispatches two concurrent
  `BookAppointmentCommand`s through the real `CommandBus` against real Postgres, asserts exactly
  one wins with `AppointmentSlotConflictError.reason === 'service_bay_taken_concurrently'` and the
  DB has exactly one `SCHEDULED` row; plus back-to-back-window and cancel-then-rebook cases. Own
  fixture data, torn down after; never touches `prisma/seed.ts`'s shared demo data.
- **Docs reconciled in the same task** (After-Task Protocol): `docs/01/02/03/04/06/08/09`,
  `docs/00_overview.md` §Status and `readme.md` (both previously claimed the domain was done when
  it wasn't — now true), `RUN.md` (booking cURL walkthrough added),
  `directives/folder_structure_sop.md` (fixed a real contradiction with `cqrs_pattern.md`'s
  query-repository placement rule), `directives/resilience_patterns.md` (worked example: a
  transactional handler whose own error must not auto-retry), Grafana dashboard (booking-attempt
  and availability-latency panels replace the placeholder text panel).
- **`eslint.config.mjs`**: added a `**/*.spec.ts` override disabling
  `@typescript-eslint/unbound-method` and `@typescript-eslint/no-unnecessary-type-assertion` — both
  misfire on `testing_standard.md`'s own sanctioned `jest.Mocked<T>` mocking pattern whenever the
  mocked interface uses TS method-shorthand (every repository interface in this repo does).

**§10-equivalent verification, all green this phase**: `npx turbo run typecheck lint format:check`
(0 errors), `npx turbo run build test` (144 unit tests, both workspaces), `npm run test:integration`
(3/3, real Postgres), app booted + manually curled through all 3 booking endpoints + idempotency
replay + business-hours rejection + not-found/not-cancellable errors, `/docs-json` lists all 3
routes, `/metrics` exposes `scheduler_api_booking_attempt_total`, Grafana restarted clean (no
crash-loop) with the new panels, `prisma/migrations/*_init/migration.sql` confirmed byte-identical
(`git diff` empty) — the exclusion constraints were never touched.

Done — hardening pass (`.ai/plans/hardening.plan.md`):

An adversarial audit of the *finished, fully green* domain phase found 13 real problems. All fixed,
each verified by reproducing the defect first and re-running the same request:

- **Foreign keys are validated.** `customerId`/`vehicleId`/`dealershipId` previously reached Prisma's
  nested `connect` unchecked — a mistyped id returned **500**. Three new tx-scoped repositories on
  `SchedulerApiRepos` now yield explicit `404`s. Side effect: closes a second hole, since the
  soft-delete extension filters `find*`/`count` but **not** `create`, so a soft-deleted customer used
  to `connect` successfully and book silently.
- **An unknown dealership returned `409 no_free_service_bay`** — a code `docs/06` defines as "every
  bay is busy" — and counted client typos into the booking-conflict metric. Now `404`.
- **Vehicle ownership is enforced** (`422`). The ERD asserts it; the database only had the two keys
  independently.
- **No clock existed anywhere in the module.** `2020-01-01` was accepted and `GET /availability`
  advertised yesterday. Now a Zod `refine` on the write path and `filterFutureWindows` on the read
  path (taking `now` as a parameter, so specs pin it without mocking `Date`).
- **Closed days**: `BUSINESS_DAYS` (default Mon–Fri) + `BUSINESS_CLOSED_DATES`. The service used to
  be open 365 days a year — and this repo's own cURL example booked a **Saturday**.
- **`duration_minutes > 0` CHECK constraint** in a new migration on `service_types`. A zero duration
  makes `tstzrange` empty, which overlaps nothing, which silently disables **both** ADR-0002
  exclusion constraints.
- **OpenAPI now carries real schemas** — request bodies, query parameters and response envelopes,
  generated from the same Zod schemas the API validates against via zod 4's native
  `z.toJSONSchema()` (no new dependency), with compile-time assertions that the spec and the handler
  DTOs cannot drift. Previously `/docs-json` had no `content` block and no `parameters` at all.
- **The success metric moved to `afterCommit`** — it was firing inside the transaction, so a failed
  COMMIT (or a retried `P2034`) over-counted bookings that never existed.
- Plus: `+07:00` datetimes accepted, one message per conflict reason, two new reasons separating
  permanent misconfiguration from transient contention, `status` typed as the domain union.
- **Documentation**: `docs/12_ai_collaboration.md` rewritten (§3–§6 were entirely init-era and 7 of
  12 memory entries were unreflected); both post-init plans committed to `.ai/plans/` with
  *References & Compliance* sections; `AGENTS.md` now states where plans live and that they are
  never retouched after execution; `docs/01/02/04/06/08/09/00`, `readme.md`, `SETUP.md`, three
  directives and `prometheus.yml` reconciled; three obsolete `.gitkeep` files removed.

**Verification, all green**: `npx turbo run typecheck lint format:check build test` (10/10 tasks,
**166 unit tests**, 0 lint errors), `npm run test:integration` (3/3 against real Postgres), plus an
11-case manual smoke script covering every defect listed above. `git diff` on
`prisma/migrations/20260810051339_init/` is **empty** — ADR-0002's constraints untouched; the new
CHECK is a separate migration.

Not started:
- Everything in `docs/03_system_architecture_diagrams.md § Deferred scope` (outbox/broker, circuit
  breaker, rate limiting, second service, RBAC/multi-tenancy) plus ADR-0003's own three additions
  (raw-SQL availability query, per-dealership business hours, load-balanced selection) — all
  deferred with a named trigger, none needed yet.
- Per-country holiday calendars (`BUSINESS_CLOSED_DATES` is a hand-maintained list).
- **`COMPLETED` has no write path at all**, so `AppointmentNotCancellableError`'s 409 branch is
  unreachable in practice. Documented rather than hidden; trigger is a check-in/check-out flow.
- The submission's video walkthrough (`.ai/plans/init-source.plan.md` §13.3) — has no repo artifact
  by design.

## Current focus

Scheduler domain complete, hardened, and verified. Next: record the video walkthrough; otherwise the
repository is submission-ready per `.ai/plans/init-source.plan.md` §13's deliverables map.

## Live debts

None blocking. `.ai/memory/gotchas.jsonl` (15 entries) and `architecture.jsonl` (3) carry this
build's real lessons. `conventions.jsonl` and `errors.jsonl` are still **empty** — nothing this
phase was a distinct coding convention or a bare error→solution pair rather than a gotcha or a
design decision. (An earlier revision of this file claimed "all four files now have real entries" in
the same sentence as "errors.jsonl remains empty"; two are empty, not one.)
