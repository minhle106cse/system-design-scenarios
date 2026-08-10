# PLAN — Submission readiness

> **Status: approved for execution 2026-08-11.** Written after auditing the finished work against
> `KeyloopCodingChallange.pdf` (Scenario A · "The Challenge Structure" · "Deliverables & Submission")
> and against the three prior plans in `.ai/plans/`.
>
> Prior plans: [`init-source.plan.md`](init-source.plan.md), [`booking-domain.plan.md`](booking-domain.plan.md),
> [`hardening.plan.md`](hardening.plan.md). Per `AGENTS.md`'s Citation Protocol they are never
> retouched — this file continues the sequence, it does not amend them.

---

## Part 1 — Audit: is Scenario A actually satisfied?

**Yes, all three core requirements have working, tested code.** Verified by reading the source, not
by trusting `PROJECT_STATUS.md`.

| PDF requirement (Scenario A) | Where it lives | Verified |
|---|---|---|
| 1. **Resource Constrained Booking** — request an appointment for a specific vehicle, service type, dealership, desired time | `POST /api/v1/appointments` → `BookAppointmentHandler`. Body carries exactly `customerId`, `vehicleId`, `dealershipId`, `serviceTypeId`, `startAt`; all four ids resolved and 404'd explicitly before any write | ✅ |
| 2. **Real-Time Availability Check** — both a ServiceBay **and a qualified** Technician, for the **entire** service duration | `book-appointment.handler.ts:110-140`: bays by dealership, technicians filtered through the `TechnicianServiceType` join (= "qualified"), busy set over the half-open window `[startAt, startAt+durationMinutes)` — the *whole* derived duration, not the start instant. Backed at the DB layer by ADR-0002's two `EXCLUDE USING gist` constraints, so the TOCTOU race is closed rather than merely checked | ✅ |
| 3. **Confirmed Appointment Record** — persistent record associating customer, vehicle, technician, service bay | `Appointment` entity + `PrismaAppointmentRepository.save()` inside one transaction; the row carries all four FKs plus dealership, service type, window, status | ✅ |
| Part 2 — Backend: RESTful API + persistent DB, client stubbed | NestJS/Fastify + Postgres/Prisma with committed migrations; `/docs` + `/docs-json` carry real request/response schemas generated from the same Zod schemas the API validates with; cURL examples in `docs/06` and `RUN.md` | ✅ |
| Part 1 — System Design Document (diagram · component roles · data flow · tech justification · observability · GenAI-in-design) | `docs/03_system_architecture_diagrams.md` — all six required contents present, plus `§ Deferred scope` with per-capability triggers | ✅ |
| README: build/run/test + **AI Collaboration Narrative** + test suite | `readme.md`, `RUN.md`, `SETUP.md`; 166 unit + 3 integration tests | ✅ |
| "Note on Ambiguity" — assumptions documented | `docs/01 § Assumptions` — 16 rows, each with the assumption *and* its reasoning | ✅ |
| **Video, 5–10 min** | — | ❌ not produced |

**Gates re-run 2026-08-11, independently of the claim in `PROJECT_STATUS.md`:**
`npx turbo run typecheck lint test` → 8/8 tasks green, **166 tests** (52 shared-kernel + 114
scheduler-api), 0 lint errors.

**Did the three prior plans do what they said?** Yes — spot-checked the load-bearing claims rather
than the summaries: `git diff` on `prisma/migrations/20260810051339_init/` is empty (ADR-0002's
constraints untouched); the `23P01`→`P2039` correction is in the code and annotated in
`booking-domain.plan.md` rather than quietly rewritten; every Tier-1 defect from `hardening.plan.md`
has code behind it.

---

## Part 2 — Findings

Ten, each reproduced before being written down.

| # | Finding | Severity |
|---|---|---|
| **F1** | **The entire scheduler domain is uncommitted.** 3 commits total, newest is a rename; 49 modified/untracked paths hold the whole booking module, both post-init plans, the new migration, ADR-0003. Deliverable 2 is *"a Git repository containing your chosen service implementation"* — a clone right now yields a skeleton. `readme.md` also cites commit history as evidence of *"AI output arriving, then being corrected"* | Blocking |
| **F2** | No git remote | Deferred by decision — see below |
| **F3** | No video, and no runbook that would make recording one repeatable | Blocking (deliverable 3) |
| **F4** | `GET /availability` does not validate the dealership; `POST /appointments` does. Unknown/soft-deleted `dealershipId` → `200 {"availableSlots":[]}` (indistinguishable from "fully booked") vs `404` on the write path. Same defect class the hardening pass fixed, on the path it did not cover | Real bug |
| **F5** | No way to read an appointment back. `POST` creates it, `POST :id/cancel` cancels it, nothing fetches it — requirement 3's record is invisible to the client, the cURL walkthrough cannot show what it created, and the video demo has nothing to display | Real gap |
| **F6** | No test exercises the HTTP layer. 114 unit tests use mocked repositories; the 3 integration tests enter *below* the controller. Nothing tests Zod-over-the-wire, idempotency replay on a real duplicate `POST`, `GlobalExceptionFilter`'s status mapping, or the response envelope — all documented as contract in `docs/06` | Evidence gap |
| **F7** | A soft-deleted `SCHEDULED` appointment would strand its bay and technician: ADR-0002's constraints are `WHERE status='SCHEDULED'` and know nothing about `deletedAt`, while every application read filters `deletedAt IS NULL`. No write path does this today — latent, undocumented | ~~Latent~~ **WRONG — see below** |

> **F7 was wrong, and is kept here rather than deleted.** Executing Tier 4 started by reproducing the
> claim, and `pg_get_constraintdef` shows the real predicate is
> `WHERE status = 'SCHEDULED' AND deleted_at IS NULL`. Both constraints have always been
> soft-delete-aware; there is no latent bug and nothing to fix. The finding came from reading
> `docs/02`, `docs/03` and `docs/06`, which abbreviate the predicate to its status half in
> cancellation contexts, while ADR-0002 and `docs/04` state it in full — a summary that was accurate
> for what it was summarising and misleading for what it was read for. Tier 4 below therefore became
> *fix the three abbreviations*, not *document a latent bug*. Same reason `booking-domain.plan.md`
> keeps its wrong guess about the Prisma error shape: a plan that shows only correct predictions is
> not evidence of a verification process, it is evidence of editing.
| **F8** | Nothing maps the code back to Scenario A. `readme.md` never names the assessment, the scenario, or its three core requirements; `docs/01` quotes the PDF's ambiguity clause as *"this collection's own convention"* | Communication |
| **F9** | `docs/03` §2 has two stale rows (Domain *"added as the scheduler domain is implemented"*; metrics row omits the two booking metrics §6 documents) — in the System Design Document itself | Doc drift |
| **F10** | No CI. Gates exist and are green, but nothing runs them on push; the only evidence is a claim in a status file | Evidence gap |

---

## Part 3 — Decisions taken before execution

| # | Decision | Consequence |
|---|---|---|
| 1 | **Commit locally, do not push.** No remote is created | F2 stays open by choice. T1.2's clean-clone check clones from the local path, which exercises the same thing a reviewer's `git clone` would |
| 2 | **`KeyloopCodingChallange.pdf` stays tracked**, and the README must **extract Scenario A verbatim** with attribution, so the repo states the problem it solves rather than assuming the reader has the PDF | Rewrites T3.3 from "consider naming the assessment" into a required, verbatim requirement block + traceability table. Every doc claim must match the PDF's wording, not a paraphrase of it |
| 3 | **Commits are split by dependency order, not by invented phase chronology.** Many files were touched by *both* the domain and the hardening phase; reconstructing per-phase hunks would produce commits that never existed | 5 commits, each of which builds on its predecessor. Only `HEAD` is gate-verified — stated here rather than implied, because claiming five independently green commits without checking each out would be exactly the kind of unverified claim this repo's own method rejects |
| 4 | `GET /appointments/:id` is a **single-id fetch only** — no list/filter endpoint | A list endpoint needs pagination and an index decision, and no PDF requirement asks for it. Recorded as a deferral with a trigger in `docs/03 § Deferred scope` |

---

## Part 4 — Execution, tier by tier

### Tier 1 — Make the deliverable real (F1, F3)

#### T1.1 Commit the 49 outstanding paths as 5 dependency-ordered commits

Existing 3 commits are **not** rewritten. Paths are staged explicitly (`git add <path>`), never `-A`.

| # | Message | Paths |
|---|---|---|
| 1 | `fix(http): align ZodValidationPipe error shape with GlobalExceptionFilter` | `apps/scheduler-api/src/infrastructure/http/pipes/zod-validation.pipe.ts`, `…/zod-validation.pipe.spec.ts` |
| 2 | `feat(config,observability): foundations for the booking domain` | `.env.example`, `apps/scheduler-api/src/config/env.config.ts`, `…/env.validation.ts`, `packages/shared-kernel/src/logger/log-context.ts`, `apps/scheduler-api/src/common/errors/booking.error.ts`, `…/infrastructure/observability/booking.metrics.ts`, `…/infrastructure/cqrs/scheduler-api-repos.ts`, `…/infrastructure/database/prisma/scheduler-api-repos.factory.ts`, `apps/scheduler-api/eslint.config.mjs`, `apps/scheduler-api/package.json`, `package-lock.json`, the three deleted `.gitkeep`s |
| 3 | `feat(booking): scheduler domain — book, check availability, cancel` | `apps/scheduler-api/src/modules/booking/**` *except* `**/*.int-spec.ts`, `apps/scheduler-api/src/app.module.ts`, `apps/scheduler-api/prisma/migrations/20260810150000_service_type_duration_positive/` |
| 4 | `test(booking): prove the concurrency guarantee against real Postgres` | `apps/scheduler-api/jest.integration.config.js`, `apps/scheduler-api/src/modules/booking/**/*.int-spec.ts` |
| 5 | `docs: reconcile the documentation set with the implemented, hardened domain` | `docs/**`, `readme.md`, `RUN.md`, `SETUP.md`, `AGENTS.md`, `directives/**`, `docker-init/**`, `.ai/GOTCHAS.md`, `.ai/PROJECT_STATUS.md`, `.ai/KNOWLEDGE_INDEX.md`, `.ai/knowledge_builder.py`, `.ai/plans/booking-domain.plan.md`, `.ai/plans/hardening.plan.md` |
| 6 | `plan: submission readiness` | `.ai/plans/submission-readiness.plan.md` (this file) — committed **before** the work it describes, which is the point |

Commit messages state *why*, not a file list. Every subsequent tier gets its own commit(s) on top.

#### T1.2 Clean-clone verification

`git clone <local path> <scratch dir>` → `npm install` → `npm run check`. Anything that only passes
because of local state is a bug in the deliverable, not in the check. (No push — decision 1.)

#### T1.3 `.ai/plans/video-runbook.md`

Not a script to read aloud — a runbook: the PDF's five segments with a time budget (intro+scenario ·
design & implementation walkthrough · AI story 1–2 min · live demo · learnings), the exact demo
sequence (`db:seed` ids → `GET /availability` → `POST /appointments` → **`GET /appointments/:id`** →
replay with the same `X-Idempotency-Key` → `npm run test:integration` → `/metrics` + Grafana panel),
and the three "challenges faced" stories taken from `.ai/GOTCHAS.md` (the `P2039` discovery, the
`fastify` version duplication, the audit that found a `500` inside green code). **Written after
Tier 2**, so the demo can show the record being read back.

### Tier 2 — Close the two real gaps (F4, F5)

#### T2.1 `GET /availability` validates the dealership

| File | Change |
|---|---|
| `application/queries/booking.query-repository.ts` | Add `findDealership(dealershipId): Promise<DealershipSummary \| null>` + the `DealershipSummary { id }` type. Doc-comment: why a read that returns only an id still earns a round trip |
| `infrastructure/repositories/prisma-booking.query-repository.ts` | `dealership.findUnique({ where: { id }, select: { id: true } })` — the soft-delete-aware client, so a soft-deleted dealership is also `404` |
| `application/queries/check-availability/check-availability.handler.ts` | Resolve dealership + service type in one `Promise.all`; throw `DealershipNotFoundError` **before** `ServiceTypeNotFoundError`, matching `BookAppointmentHandler`'s existing order so the two paths agree on which error a doubly-wrong request gets |
| `check-availability.handler.spec.ts` | Existing mocks gain `findDealership`; new case: unknown dealership → `DealershipNotFoundError` (not empty slots) |
| `presentation/controllers/availability.controller.ts` | `@ApiResponse(404)` description → `DEALERSHIP_NOT_FOUND \| SERVICE_TYPE_NOT_FOUND` |
| `docs/06_api_contracts.md` | `GET /availability` error table gains the 404 row |

#### T2.2 `GET /api/v1/appointments/:id`

| File | Change |
|---|---|
| `application/queries/booking.query-repository.ts` | `findAppointmentById(id): Promise<AppointmentDetail \| null>` |
| `infrastructure/repositories/prisma-booking.query-repository.ts` | `appointment.findUnique` including `serviceBay {id,label}` and `technician {id,name}` — the same fields `POST` returns |
| `application/queries/get-appointment/get-appointment.query.ts` | `GetAppointmentQuery(appointmentId)` |
| `application/queries/get-appointment/get-appointment.handler.ts` | `@QueryHandler`, no transaction (`directives/cqrs_pattern.md` §2); `AppointmentNotFoundError` when absent — the error class, its code and its `docs/06` row **already exist** (cancel uses them) |
| `application/queries/get-appointment/get-appointment.handler.spec.ts` | Found → DTO; missing → `AppointmentNotFoundError`; a `CANCELLED` appointment is returned, not hidden |
| `presentation/schemas/get-appointment.schema.ts` | `getAppointmentParamsSchema` — per-route schema file (`directives/zod_validation.md` §2), not a reuse of the cancel schema |
| `presentation/controllers/appointments.controller.ts` | `@Get(':id')` — `ApiOperation`, `ApiParam`, 200 `appointmentResponseSchema` (reused, so the OpenAPI response is not described twice), 400, 404. **No** `IdempotencyInterceptor` (per-route, write-only) |
| `booking.module.ts` | Register `GetAppointmentHandler` as a provider so `DiscoveryService` finds it |
| `docs/06`, `docs/02`, `RUN.md` | New endpoint contract, UC coverage, and the walkthrough step that shows the created record |
| `docs/03 § Deferred scope` | New row: list/filter endpoint, trigger = "a client screen listing a customer's appointments" |

Return type is the existing `AppointmentSummaryDto` (`application/commands/appointment-summary.dto.ts`)
— same layer, same module, so no boundary is crossed; to be confirmed against
`eslint.config.mjs` before writing, and if it *is* restricted, the DTO moves to
`application/` root rather than being duplicated.

### Tier 3 — Evidence a reviewer can see (F6, F10, F8, F9)

#### T3.1 HTTP-level e2e suite

- `apps/scheduler-api/jest.e2e.config.js` — sibling of `jest.integration.config.js`, `testRegex`
  `.*\.e2e-spec\.ts$`, same ts-jest/moduleNameMapper/`forceExit` block (same reasons, documented in
  that file's header).
- `apps/scheduler-api/package.json` → `"test:e2e": "jest -c jest.e2e.config.js --runInBand"`.
  Deliberately outside `turbo test`, exactly like the integration suite — it needs Postgres.
- `src/modules/booking/presentation/controllers/booking.e2e-spec.ts` — boots the real app via
  `createApp()` and drives it with Fastify's `app.inject()` (**no supertest dependency**), own
  fixture data, torn down after, far-future dates. Cases, each one a line `docs/06` already promises:

  | Case | Expected |
  |---|---|
  | `startAt` in the past | `400 VALIDATION_ERROR` |
  | Same `X-Idempotency-Key` twice, identical body | one appointment in the DB, second response replayed |
  | Unknown `vehicleId` | `404 VEHICLE_NOT_FOUND` |
  | Another customer's vehicle | `422 VEHICLE_NOT_OWNED_BY_CUSTOMER` |
  | Saturday | `422 APPOINTMENT_OUTSIDE_BUSINESS_HOURS`, `details.reason = 'closed_day'` |
  | Success | `201`, envelope `{success,data,message,meta}`, `data` matches the DTO |
  | `GET /appointments/:id` after that success | `200`, same id and window |
  | `GET /availability` with unknown dealership | `404` (T2.1's fix, proven over the wire) |

  This converts `hardening.plan.md`'s 11-case manual smoke script into something that runs.

#### T3.2 CI — `.github/workflows/ci.yml`

Job `check`: Node 22, `npm ci`, `npm run check` (typecheck · lint · format:check · build · test).
Job `integration`: a `postgres:17` service container, env from `.env.example`, `npm run db:deploy`,
then `test:integration` and `test:e2e`. Badge into `readme.md`. This is the mechanical half of the
quality-control claim in `docs/12_ai_collaboration.md` §3, which currently has no artifact.

#### T3.3 Scenario A, extracted and traced (decision 2 — required, not optional)

- **`readme.md`**: a new section directly under the title — *"The problem: Scenario A — The Unified
  Service Scheduler"* — quoting the PDF's **Domain**, **Task** and **three core requirements
  verbatim**, attributed to `KeyloopCodingChallange.pdf` (tracked in this repo), followed by a
  traceability table: requirement → endpoint → handler → the test that proves it → the ADR that
  justifies its shape.
- **`docs/00_overview.md`**: the same table under § Status, so the docs entry point and the README
  agree.
- **`docs/01_business_requirements.md`**: replace *"this collection's own convention"* /
  *"this collection's accepted approach"* with attribution to the brief. The three requirements are
  already verbatim — verify each against the PDF word for word rather than assuming.
- Sweep `docs/00`, `docs/03`, `readme.md` for any claim that no longer matches the PDF's wording.

#### T3.4 `docs/03` §2 stale rows

Domain row → the domain layer exists, name the module. Metrics row → add
`scheduler_api_booking_attempt_total` and `scheduler_api_availability_check_duration_seconds`, which
§6 of the same file already documents in full.

### Tier 4 — ~~Record the latent interaction (F7)~~ → Fix the abbreviation that invented it

> **Rewritten during execution.** The planned work assumed F7 was real. It is not (see the note
> under F7). What survives is the part that was actually wrong: three documents abbreviating a
> database predicate until it implied a bug.

Not code. `docs/02`, `docs/03` (twice, including the architecture diagram) and `docs/06` describe
ADR-0002's constraints as *"scoped to `status = 'SCHEDULED'`"*; the real predicate is
`status = 'SCHEDULED' AND deleted_at IS NULL`, as ADR-0002 and `docs/04` already state. Quote it in
full in all three, with one sentence in `docs/03` saying why the abbreviation is not harmless. Log
the episode to `.ai/memory/gotchas.jsonl` — for a claim about what the *database* enforces, query
`pg_constraint` before writing it down.

### After-Task Protocol (part of this task, not a follow-up)

`.ai/memory/*.jsonl` entries as things are learned · `directives/testing_standard.md` gains the
three-Jest-project pattern · `docs/08` (new suites) and `docs/09` (CI) reconciled ·
`.ai/PROJECT_STATUS.md` updated · `python .ai/knowledge_builder.py` regenerates
`.ai/KNOWLEDGE_INDEX.md` (**edit the sources, never the generated index**).

---

## Verification

Nothing is "done" on an exit code alone.

- **T1**: `git log --stat` reads as a coherent sequence; working tree clean; fresh clone →
  `npm install && npm run check` green.
- **T2**: reproduce the current `200 {"availableSlots":[]}` for an unknown dealership **first**, then
  see it become `404`; `GET /appointments/:id` returns the record the preceding `POST` created, in the
  same envelope; full gate + integration suite still green.
- **T3**: every e2e case must **fail first** against a deliberately wrong expectation, then pass — a
  test that has never been red proves nothing. CI YAML validated by structure review (no push, so no
  live run — stated as a limitation rather than claimed green).
- **T4**: the claim is reproducible — soft-delete a `SCHEDULED` row by hand in `psql`, confirm the
  window is both invisible to `GET /availability` and refused by `POST`, then roll it back.

⚠️ Unchanged from every prior plan: `git diff` on `prisma/migrations/20260810051339_init/` must stay
**empty**. Tiers 2–4 add no migration.

## Deliberately not in this plan

- **Appointment list/search, reschedule, a `COMPLETED` write path** — new features, not gaps against
  Scenario A. `COMPLETED`'s missing write path is already documented as a known dead branch.
- **Everything already in `docs/03 § Deferred scope`** — their triggers have not fired; building any
  of them now would contradict the foresight argument the SDD makes.
- **Vehicle double-booking prevention** — `docs/01 § Assumptions` argues its absence from the literal
  requirement. Keep the assumption; do not silently implement it.
- **Pushing to a remote** — decision 1.

---

## References & Compliance

Read before writing this plan, per `AGENTS.md`'s Citation Protocol.

| Source | What it constrained |
|---|---|
| `KeyloopCodingChallange.pdf` | Re-read in full: Scenario A's three core requirements (Part 1 audit and T3.3's verbatim block), Part 1's six required SDD contents, Part 2's backend-stub wording, the three deliverables, the four evaluation dimensions the findings are ranked against |
| `.ai/plans/init-source.plan.md` §6.4.1, §10, §13 | Why F1 is blocking rather than cosmetic (the artifact trail *is* the AI-collaboration evidence); the clean-clone check reused in T1.2; the deliverables map behind T1.3 |
| `.ai/plans/booking-domain.plan.md` | ADR-0003's decisions T2.1/T2.2 must not contradict; the separate-Jest-project precedent T3.1 copies |
| `.ai/plans/hardening.plan.md` | Its own "an unknown dealership must not look like a capacity problem" finding — F4 is that same defect on the path it did not cover; its 11-case smoke script is what T3.1 automates |
| `docs/adr/0002-booking-concurrency-control.md` | The `status='SCHEDULED'` scoping behind F7; the untouchable init migration |
| `docs/adr/0003-availability-and-selection-policy.md` §2.1/§2.6 | The overlap predicate and the "availability is a projection, not a reservation" position T2.1/T2.2 must preserve |
| `docs/adr/README.md` | ADR immutability — why T4's note goes to `docs/04` and `.ai/memory/`, not into ADR-0002 |
| `directives/cqrs_pattern.md` | T2.2 is a **query**: no transaction, reads through `IBookingQueryRepository`, DTO placement at the `application/queries/` level |
| `directives/zod_validation.md` | Per-route schema files (T2.2's own params schema rather than reusing the cancel one); Zod stays the single source of the OpenAPI schemas |
| `directives/testing_standard.md` | Co-location, `jest.Mocked<T>`, `@/` alias, the ESM/CJS Jest bridge that `jest.e2e.config.js` must reproduce |
| `directives/naming_conventions.md` | `{Verb}{Noun}Query` ↔ `{Verb}{Noun}Handler` for T2.2 |
| `directives/folder_structure_sop.md` | Which layer each new file belongs in, and the lint-enforced import boundaries T2.2's DTO reuse must be checked against |
| `directives/observability_monitoring.md` | Whether T2.2 warrants a metric (it does not — a read with no failure mode of its own) |
| `AGENTS.md` | Citation Protocol (this section); the After-Task Protocol, which makes the doc reconciliation part of each tier rather than a follow-up |
