# Project Status

> Curated by hand, After-Task. This is a WHAT-is-true-now summary, not a log —
> see `.ai/knowledge_builder.py`'s history handling for why detail belongs in
> `.ai/memory/*.jsonl` instead of here.

## Phase

**Scheduler domain implemented, hardened, and submission-ready.** Five phases done and verified,
each with its plan committed in `.ai/plans/`: init (`init-source.plan.md`), the booking domain
(`booking-domain.plan.md`), a post-audit hardening pass (`hardening.plan.md`), a
submission-readiness pass (`submission-readiness.plan.md`), and a query-optimization + OOP-refactor
pass (`query-and-oop-refactor.plan.md`). All four endpoints named in `docs/06_api_contracts.md` are
real, not planned.

Done — query optimization + OOP domain services (`.ai/plans/query-and-oop-refactor.plan.md`):

User code review found two real issues. Both fixed, both measured rather than assumed:

- **Missing index on the hottest read in the module.** `findBusyResourceIds` (every booking
  transaction) and `findOverlappingAppointments` (every `GET /availability` call) filter
  `Appointment` by `dealershipId + status + startAt/endAt range`; no existing index led with
  `dealershipId`, so both did a sequential scan across every dealership's appointments, not just the
  one requested. Measured on a real 6,000-row/30-dealership fixture: `Seq Scan`, 114 buffers, 2.2ms
  before → `Bitmap Index Scan`, 8–9 buffers, 0.24–0.3ms after `@@index([dealershipId, status,
  startAt])` (migration `20260811095104_appointment_dealership_status_start_index`). The scaling
  class changes, not just the constant — see `docs/04_database_schema.md`.
- **Domain services were exported-function modules, not classes.** `business-hours.ts`,
  `resource-selection.ts`, and `infrastructure/repositories/exclusion-violation.ts` converted to
  `BusinessHoursCalculator`, `ResourceSelector`, `ExclusionViolationDetector` — state that repeated
  at every call site (`BusinessHours`) moved into constructor state; genuinely stateless,
  independently-multi-input-tested utilities (`zonedTimeToUtc`, `zonedDateOf`, `isoWeekdayOf`,
  `filterFutureWindows`) stayed `static`. Domain-layer classes remain framework-free, constructed
  with `new`, never `@Injectable` (lint-enforced). No directive previously covered domain-service
  style — added `directives/domain_modeling.md` §4 and a naming rule in
  `directives/naming_conventions.md` §6, rather than overriding an existing one.

**Found, not caused, and not yet fixed**: `book-appointment.handler.int-spec.ts`'s concurrency test
is flaky — reproduced on both the pre-refactor baseline and the refactored code at a similar rate.
Root cause: `Promise.allSettled([dispatch(), dispatch()])` does not guarantee the two transactions'
read steps interleave before either commits, so the losing request sometimes refuses via its own
application-level check (`no_free_service_bay`) instead of the DB exclusion constraint
(`service_bay_taken_concurrently`) the test hardcodes. **The guarantee itself never failed** — in
every failing run, exactly one request still won and exactly one row still existed; only the exact
409 reason string varied by which correct code path caught it. Logged to `.ai/memory/gotchas.jsonl`;
needs a real synchronization barrier to fix properly, out of scope for this pass.

**Verification, all green**: `npx turbo run typecheck lint test format:check build --force` (172
tests, 0 lint errors) · `npm run test:e2e` (12/12) · `npm run test:integration` (3/3 on a clean run;
the pre-existing flake above noted, not silently ignored) · `git diff` on both prior migrations
(`20260810051339_init`, `20260810150000_service_type_duration_positive`) stays empty · the real
Prisma-generated index name confirmed via `EXPLAIN` before the throwaway fixture was dropped.

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

Done — submission readiness (`.ai/plans/submission-readiness.plan.md`):

An audit against the brief confirmed all three core requirements were genuinely satisfied and that
the three prior plans did what they claimed (checked against the code and against `git`, not against
this file's own summary). It also found ten gaps, of which two were real defects and one turned out
to be a false alarm worth recording.

- **The work is now committed.** The entire booking domain, both post-init plans, ADR-0003 and the
  `duration_minutes` migration had been sitting in an uncommitted working tree — `git log` held three
  commits, the newest a rename. Split into dependency-ordered commits (fix → foundations → domain →
  concurrency test → docs), since many files were touched by both the domain and the hardening phase
  and reconstructing per-phase hunks would have fabricated commits that never existed. **No remote:
  local commits only, by decision.**
- **`GET /availability` validates the dealership** (`404`). An unknown id used to yield zero bays,
  hence zero slots, hence `200 {"availableSlots": []}` — a typo reported as "fully booked", while
  `POST` answered `404` for the same id. The read path and the write path now agree on which
  requests are answerable at all.
- **`GET /appointments/:id`** (new, UC-4). Requirement 3's persistent record was previously
  observable only in the response to the request that created it. Returns the same DTO the write
  endpoints return, so all three routes publish one `appointmentResponseSchema`.
- **An HTTP-level e2e suite** (`npm run test:e2e`, 12 tests, third Jest project) — and it found a
  real defect on its first run: `IdempotencyInterceptor` persisted its response fire-and-forget, so a
  client retrying promptly read `response: null` and got `409 in progress` for a request that had
  already succeeded. Manual cURL had passed because a human retypes slower than the write commits.
  Fixed: the write is awaited before the response is emitted.
- **CI** (`.github/workflows/ci.yml`) — `check` (Node only) and `database` (Postgres service:
  migrations, integration, e2e). It copies `.env.example` to `.env` verbatim, so the workflow fails
  if that file ever drifts from what the app requires; verified locally by booting the app from
  `.env.example` alone. **Never executed on a runner — there is no remote.**
- **Scenario A is quoted verbatim in `readme.md`**, with a requirement → endpoint → handler → test →
  ADR table, and the brief is attributed in `docs/00`, `docs/01`, `docs/03`, `AGENTS.md` and
  `CLAUDE.md`. The collection framing is where the repo lives; the PDF is what it must satisfy.
- **A finding that was wrong, kept because the correction is the lesson**: the audit claimed the
  exclusion constraints ignore `deletedAt`, making a soft-deleted `SCHEDULED` row strand its bay.
  `pg_get_constraintdef` shows the real predicate is `status = 'SCHEDULED' AND deleted_at IS NULL`.
  ADR-0002 and `docs/04` had it right; `docs/02`, `docs/03` and `docs/06` abbreviated it to the
  status half, and reading those produced the false alarm. All three now quote it in full.
- `.ai/plans/video-runbook.md` — the demo sequence, the three AI-collaboration artifacts to show,
  and the two honest "what went wrong" stories, so the recording is repeatable rather than improvised.

**Verification, all green**: `npx turbo run typecheck lint test format:check build` (10/10 tasks,
**172 unit tests**, 0 lint errors) · `npm run test:integration` (3/3, real Postgres) ·
`npm run test:e2e` (12/12, real HTTP + real Postgres) — **187 tests total** · fresh-clone
`npm install && npm run check` · the availability defect and the e2e idempotency defect each
reproduced red *before* the fix · `git diff` on `prisma/migrations/20260810051339_init/` still empty.

Not started:
- Everything in `docs/03_system_architecture_diagrams.md § Deferred scope` (outbox/broker, circuit
  breaker, rate limiting, second service, RBAC/multi-tenancy, appointment list/search) plus
  ADR-0003's own three additions (raw-SQL availability query, per-dealership business hours,
  load-balanced selection) — all deferred with a named trigger, none needed yet.
- Per-country holiday calendars (`BUSINESS_CLOSED_DATES` is a hand-maintained list).
- **`COMPLETED` has no write path at all**, so `AppointmentNotCancellableError`'s 409 branch is
  unreachable in practice. Documented rather than hidden; trigger is a check-in/check-out flow.
- The video walkthrough itself — `.ai/plans/video-runbook.md` is the runbook for it, but the
  recording has no repo artifact by design.

Done — bilingual case study (`.ai/plans/case-study-docs.plan.md`):

The repository was complete as a *deliverable* and unreadable as a *learning resource* — a newcomer's
only doors in were `readme.md` (the project's own front page) and nine spec documents written for
someone reviewing a build. Added the missing genre:

- **`CASE_STUDY.md` + `CASE_STUDY.vi.md`** at the scenario root — seven criteria groups (problem
  identity incl. a prevalence rating and the same problem's aliases in seven other industries ·
  requirements incl. what was never measured · why it's hard, with the TOCTOU timeline drawn out ·
  the design and the five rejected alternatives · correctness and what each of the three test layers
  structurally cannot prove · learning value incl. nine named traps and interview framing · evolution
  at 10×/100× with deferral triggers). Links out to the spec rather than restating it.
- **The collection README rewritten** (`../README.md` + `../README.vi.md`) — states the criteria
  framework once so scenario #2 fills in a form rather than a blank page, plus a rated index
  (prevalence ★, difficulty ★) and a per-scenario summary card.
- Convention fixed and logged: English is the default filename, Vietnamese takes `.vi.md`, and
  **only the entry-point layer is translated** — not `docs/`, `directives/`, ADRs or plans.

**Verification**: every internal link in all four new documents resolved by script, both languages,
both directory levels; every technical claim taken from the artifact rather than from another
document (constraint SQL read from the migration, alternatives from ADR-0002 §4, counts from a real
test run) — the discipline that the previous audit's one wrong finding came from ignoring.

## Current focus

Record the video against `.ai/plans/video-runbook.md`. Everything else the brief asks for exists in
the repository and is verified.

## Live debts

None blocking. Three open by decision rather than by omission, all stated here so none reads as an
oversight: **there is no git remote** (local commits only); consequently **CI has never run on a
runner** — the workflow is structurally reviewed and each of its steps verified locally, which is not
the same as a green run; and **the parent collection folder is not a git repository**, so
`../README.md` and `../README.vi.md` have no history — flagged to the user, since `git init` there
changes how this repo nests and is their structural call, not a documentation task.

`.ai/memory/gotchas.jsonl` (20 entries), `architecture.jsonl` (5) and now `conventions.jsonl` (2)
carry this build's real lessons. `errors.jsonl` is still **empty** — nothing so far was a bare
error→solution pair rather than a gotcha or a design decision.
