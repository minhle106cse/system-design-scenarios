# Project Status

> Curated by hand, After-Task. A WHAT-is-true-now summary, not a log — detail belongs in
> `.ai/memory/*.jsonl`.

## Phase

**Backend architecture reversal — all six phases (A–F) complete.**
(`.ai/plans/backend-architecture-reversal.plan.md`), superseding the Next.js-only shape
`init-source.plan.md` §0.0 chose. Phases A–C (infra, shared-kernel, scheduler-api skeleton), D
(scheduling domain module — Schedule/Staff/Shift CRUD, CSV import, auto-schedule, manual roster
editing, coverage view), E (`apps/web` reduced to a pure frontend calling `apps/scheduler-api` over
HTTP), and now **F (doc reconciliation)** are done and verified — Phase F's own verification was
running every documented command for real, not just editing prose (`docs/09_running_it.md`'s
five-command sequence, `npm run dev`, both apps confirmed listening). `docs/04_data_model.md` and
`docs/06_api_contracts.md` were reconciled early, as a side effect of Phase D.

Earlier phases still stand: **Phase 0 (init)** and **Phase 1 (the algorithm,
`packages/scheduling-core`)** are both complete and untouched by the reversal —
`packages/scheduling-core` has zero runtime dependencies (ADR-0004) and was always going to be
importable from any backend shape. 80/80 specs green (unit + property + golden-file).

### Backend architecture reversal — done so far

- **Phase A** — `turbo.json`, root `package.json` (Turborepo tasks), `docker-compose.yml`
  (Postgres only — Prometheus/Grafana deferred, plan §6), `docker-init/init-dbs.sql`,
  `.env.example` (`DB_*`/`SCHEDULER_DATABASE_URL`/`PORT`/`CORS_ALLOWED_ORIGINS`/`LOG_LEVEL`).
- **Phase B** — `packages/shared-kernel` ported from `../service-appointment-scheduler`: CQRS bus
  (command/query/event + discovery), Unit-of-Work (`TxScope`/`AbstractTxRunner`), errors
  (`AppError`/`ApplicationError`/`InfraError`), logger (`createLogger`, redaction, `LogContext`
  trimmed to this domain), resilience (Prisma transient-error classification), http response
  utils, tracing. 53/53 ported tests green, typecheck/lint clean. Two real defects found and fixed
  while porting (logged to `.ai/memory/gotchas.jsonl`): a stray dead property in `AppError`, and an
  ADR-number collision (source's ADR-0001 → this repo's **ADR-0005**,
  `docs/adr/0005-transaction-retry-boundary.md`, section numbers preserved).
- **Phase C** — `apps/scheduler-api` skeleton: NestJS + Fastify bootstrap (CORS/helmet/compress/
  Swagger at `/docs`), config module (Zod-validated env, business-hours block dropped — this
  domain has no opening-hours concept, assumption 2), global exception filter, per-route Zod
  pipe, trace-context middleware, `/health` + `/metrics`, Prisma schema (`prisma/schema.prisma`,
  **PostgreSQL**, six models + `deletedAt` soft-delete on `Schedule`/`StaffMember`/`Shift` only —
  see `PrismaService`'s `SOFT_DELETE_MODELS` comment for why not all six).
  - **Deliberate deviation from the source repo**: standard `@prisma/client` (v5.22, matching the
    rest of this repo) instead of Prisma 7 + `@prisma/adapter-pg`'s driver-adapter/wasm engine —
    same CQRS+Hexagonal+Postgres+Docker architecture, lower version risk. Flagged to the user, not
    silently substituted.
  - A real fastify version-duplication bug was hit and fixed here too: `@nestjs/platform-fastify`
    nests its own `fastify` copy unless the app's own `fastify` dependency is pinned to the exact
    same version, otherwise TS sees two incompatible `FastifyInstance` types and every plugin
    `.register()` call fails to typecheck. Logged to gotchas.
- **Phase D (in progress)** — the `scheduling` domain module, one vertical slice built and
  typechecking/linting clean: domain entities (plain data, not stateful classes — see
  `scheduling.module.ts`'s docstring for why this domain has no domain-service layer the way
  `booking` does), five write repositories + Prisma impls, one read query-repository, five command
  handlers (`CreateSchedule`, `AddStaff`, `UpdateStaff`, `RemoveStaff`, `AutoSchedule`) and two
  query handlers (`GetSchedule`, `GetSummary`), two controllers (`SchedulesController`,
  `StaffController`), Zod schemas. `AutoScheduleHandler` is the one that matters: loads rows →
  shapes `SchedulingInput` → calls `generateRoster` from `@scheduler/scheduling-core` (unchanged)
  → persists via `assignments.replaceAll` (full replace, assumption 11) → records a `ScheduleRun`.
  **Verified end-to-end against a live Postgres**: `docker compose up -d` → `prisma migrate dev`
  → seed (112 real demand cells, 12 staff, 2 shifts) → `node dist/main.js` → `GET /health` (200,
  `database: ok`) → `POST /api/v1/schedules/:id/auto-schedule` (200, persisted **38 assignments** +
  1 `ScheduleRun` row, confirmed via `psql`) → `GET /api/v1/schedules/:id` (200, all six related
  collections present) → `GET /api/v1/schedules/:id/summary` (200). Two real integration bugs
  found and fixed in the process (logged to gotchas): `scheduling-core`'s `package.json` pointed
  `main` at raw `.ts` source (worked under Vitest, crashed under Node's real `require()` — fixed by
  giving it a proper `tsc` build, matching `shared-kernel`'s pattern); `@fastify/static` was
  dropped while trimming the ported `package.json` and turned out to be a hard boot-time
  requirement of `@nestjs/platform-fastify` even though nothing calls `useStaticAssets()`.

- **Phase D — Shift CRUD + CSV demand importer (this session).** `IShiftRepository` extended with
  `findById`/`update`/`softDelete` (it only had `create`/`listByScheduleId` before, since the seed
  script was the only writer); `AddShift`/`UpdateShift`/`RemoveShift` commands + `ShiftsController`
  mirror Staff's shape exactly. `UpdateShiftHandler` adds a check Zod structurally cannot do: a
  partial `PATCH` (only `endMinute`, say) is merged with the EXISTING row before the
  `endMinute > startMinute` rule is re-checked (`InvalidShiftTimeRangeError`, 422) — Zod's
  `.refine` only sees the request body, not the row it's patching (`.ai/memory/conventions.jsonl`).
  The CSV importer (`application/commands/import-demand/demand-csv.parser.ts`) is a hand-written
  quoted-field parser — CLAUDE.md's hard rule against `line.split(',')` — matching column-by-day
  via a weekday TOKEN regex, never by position, so reordered columns are handled for free; returns
  `{ cells, warnings, errors }` with 1-based row/column locations, never throws
  (business-requirements.md #9). `DemandController`'s `POST .../demand/import` takes
  `multipart/form-data`, wired via `@fastify/multipart` (bootstrap/fastify.ts).
  **Verified end-to-end against a live Postgres, not just unit tests**: booted the real server,
  imported `sample-data/report_Transaction_20260807_20260813.csv` over actual HTTP multipart —
  **112 cells / 3,058 transactions**, matching `sample-data/README.md`'s numbers exactly; a
  malformed CSV (non-numeric cell) came back `HTTP 200` with a located `errors[0]`, not a 500; a
  re-import stayed at 112 cells (upsert, not append, assumption 10); the shift merged-range guard
  returned `422 INVALID_SHIFT_TIME_RANGE` on the exact partial-PATCH case described above.
  Two real pre-existing bugs found and fixed while doing this (both logged to
  `.ai/memory/gotchas.jsonl`, neither caused by this session's own new code):
  (1) `apps/scheduler-api`'s own `npm test` had been silently broken for 3 of its 5 suites since
  Phase B/C — its `jest.moduleNameMapper` was missing the `.js`-extension-strip rule
  `shared-kernel`'s own jest config carries, so any spec importing `@scheduler/shared-kernel`
  failed to resolve `./errors/app-error.js` and errored out at suite-load time. Nobody had noticed
  because Phase C/D's verification ran the compiled server + curl, never this app's own test
  runner.
  (2) `@fastify/multipart`'s `declare module 'fastify'` type augmentation doesn't reach this app's
  `FastifyRequest` — it hoists to the workspace root while `fastify` itself is a nested,
  non-hoisted copy under `apps/scheduler-api/` (the Phase C version-pin fix), so TypeScript
  resolves two physically different `fastify` modules and never merges the two. Worked around by
  hand-typing the one route that needs `.file()` instead of touching the node_modules layout again.
  `docs/06_api_contracts.md` reconciled to the real routes as a side effect (see above).

- **Phase D — manual roster editing (this session).** `IAssignmentRepository` extended with
  `findById`/`create`/`delete` (it only had `listByScheduleId`/`replaceAll` before — auto-schedule's
  full-replace path). `AddAssignmentHandler` builds the candidate roster as
  `[...existing, candidate]` and replays the WHOLE thing through `validateRoster` — the same
  `FeasibilityGate` `generateRoster` uses (assumption 12: one set of rules, two callers), then acts
  only on a violation attributed to the candidate itself, not a pre-existing assignment that
  happens to also fail replay. `RemoveAssignmentHandler` needs no gate replay — removing can only
  relax the roster. Extracted `buildSchedulingInput` (Prisma rows → `SchedulingInput`) out of
  `AutoScheduleHandler` into `application/shared/` so both handlers build the exact same shape —
  the same "one implementation, two callers" argument the gate itself is built on, one layer up.
  **Verified end-to-end against a live Postgres**: `POST /roster/assignments` against an
  8-hour shift for a 2-hour-cap staff member → `422 ROSTER_VIOLATION` /
  `WOULD_EXCEED_MAX_HOURS`; raised the cap, retried → `201`; the identical request again →
  `422` / `ALREADY_ASSIGNED`; an unknown `staffId` → `422` / `UNAVAILABLE`; `DELETE` → `204`,
  repeated → `404 ASSIGNMENT_NOT_FOUND`. `docs/06_api_contracts.md`'s Roster section reconciled to
  match.

- **Phase D — coverage view, closing out Phase D (this session).** `GetCoverageHandler`
  (`GET /schedules/:id/coverage`) recomputes `scheduling-core`'s `Diagnostics.hours` (required vs
  scheduled per hour) LIVE from the currently persisted roster on every call, by replaying
  `detail.assignments` through a fresh `FeasibilityGate`/`RosterState` (same public surface
  `generateRoster`/`validateRoster` use — `computeRequiredStaff`, `computeShiftRequirements`,
  `FeasibilityGate`, `RosterState`, `buildDiagnostics`, all already exported from
  `scheduling-core`'s `index.ts`, no new surface needed there). **Found and reconciled a real
  design contradiction, not silently overridden**: `docs/04_data_model.md` originally said the
  coverage view should read `ScheduleRun.diagnostics` — a stored snapshot from the last
  auto-schedule run — specifically to avoid "recomputing one that might disagree with what the
  manager saw at the time." That was written before manual roster editing existed; once an
  assignment can be added/removed after the last run (this session's earlier work), a stored
  snapshot goes stale the moment the manager makes that edit — and `GetSummaryHandler` had already
  made the opposite call, for the identical reason, for the summary report. Recompute-live was
  chosen to match that existing precedent rather than leave two structurally identical reads
  (summary and coverage) disagreeing on freshness for no principled reason. `docs/04`'s comment
  corrected in place with a dated note, not rewritten silently.
  **Verified end-to-end against a live Postgres**: seeded a schedule with the real CSV + 6 staff,
  confirmed coverage read **all 112 hours UNDERSTAFFED** before auto-schedule, **38
  OVERSTAFFED / 56 OK / 18 UNDERSTAFFED** immediately after (matching `POST .../auto-schedule`'s
  own persisted roster) — then, the case that actually matters: `DELETE` on one assignment from an
  OVERSTAFFED hour dropped that hour's `scheduled` count from 3 to 2 on the VERY NEXT
  `GET .../coverage` call, with no auto-schedule re-run in between. Phase D
  (`backend-architecture-reversal.plan.md` §7) is now fully built.

- **Phase E — `apps/web` reduced to a pure frontend (this session).** Deleted: `prisma/` (schema,
  migrations, seed scripts, `dev.db`), `src/lib/prisma.ts`, `src/app/api/health/route.ts` (and its
  spec — a Phase-0-only placeholder so a fresh clone didn't 404, obsolete once the page has real
  content), `@prisma/client`/`prisma` from `package.json` plus every `db:*` script.
  `@scheduler/scheduling-core` and `zod` also dropped — confirmed unused first (`grep`), not
  guessed: neither belongs in a pure frontend, the algorithm stays server-side in
  `apps/scheduler-api`, and Zod validation now happens once, at that app's boundary. Added
  `src/lib/api-client.ts` — the fetch wrapper backend-architecture-reversal.plan.md §2 names —
  covering every route Phase D built (schedules, staff, shifts, demand import, roster, summary,
  coverage), unwrapping the `{success, data}`/`{success:false, error}` envelope into a typed
  `ApiError` on failure rather than a caller having to reach into the envelope by hand. `/`
  (`page.tsx`) now has one real, working piece — a create-schedule form
  (`src/components/create-schedule-form.tsx`, pending/success/error states per
  `directives/frontend_standard.md` §1 rule 3) — rather than the Phase-0 static placeholder; the
  "list" half of brief §2.1 needs a `GET /schedules` collection route `apps/scheduler-api` doesn't
  have (Phase D only ever built per-schedule reads), so it's left honestly unbuilt rather than
  faked — adding that route is Phase 3 UI-screen work, not Phase E's job of shrinking `apps/web`.
  **Two real bugs found and fixed, both pre-existing environmental hazards this session's first
  real client-side code was the first thing to trip**: (1) `tsconfig.base.json`'s `lib: ["ES2022"]`
  has no DOM types — fine for the Node-shaped backend packages, but `apps/web` had never had
  client-side code (an `onChange` handler, `File`/`FormData`) to need `HTMLInputElement` etc.
  before now; fixed with a `lib` override in `apps/web/tsconfig.json` (every `create-next-app`
  scaffold sets this by default — this app just never had). (2) `apps/scheduler-api` failed to boot
  (`P1012`, "the URL must start with the protocol file:") after `npm install --workspace=@scheduler/web`
  — apps/web's now-deleted SQLite `schema.prisma` and apps/scheduler-api's PostgreSQL one shared
  ONE generated-client output directory (the workspace-hoisted root `node_modules/@prisma/client`);
  whichever app's `prisma generate` ran last silently overwrote the other's client. Fixed by
  regenerating scheduler-api's client — and this whole class of bug is now permanently closed by
  Phase E's own deletion of `apps/web/prisma/`, since only one schema exists in the workspace from
  here on. **Verified end-to-end**: `apps/web`'s production build succeeds with zero Prisma
  references left; a real `POST /api/v1/schedules` with `Origin: http://localhost:3000` (the
  Next.js dev port `api-client.ts` and `apps/scheduler-api`'s `CORS_ALLOWED_ORIGINS` both assume)
  returned `201` with the exact `access-control-allow-origin` header the browser needs.

- **Phase F — doc/ADR reconciliation (this session).** `docs/03_architecture.md` (Shape rewritten
  to the real two-app tree, `§ Deferred scope` reconciled — Postgres/Docker/CQRS bus moved OUT of
  "not built", kept in the table with a note rather than silently deleted from it), `docs/09_running_it.md`
  and `RUN.md` (the real five-command sequence — `docker compose up -d` → `npm install` →
  `npm run db:deploy` → `npm run db:seed` → `npm run dev` — every command run for real this
  session, not just written down), `readme.md` (status banner, stack section, a new "Why the stack
  changed mid-build" section making the reversal's own trade-off explicit for a reader who never
  sees `.ai/`), `docs/adr/README.md` (ADR-0005 was missing from the index entirely, and its own
  "nothing is ported verbatim" closing line had been false since Phase B). Ported
  `directives/resilience_patterns.md` from `../service-appointment-scheduler/`, condensed to this
  repo's actual scope (retry + graceful shutdown built; idempotency/circuit-breaker/outbox/rate-limiting
  deferred with triggers, not silently omitted) — `directives/README.md`'s index and ported/not-ported
  list updated to match.
  **Real gap found while writing this**: root `.env` was gitignored (never force-added, unlike
  `apps/web/.env`), so a fresh clone could not actually reach the "no `.env` to write" claim this
  doc was about to make — fixed by staging it (`git add -f`), same reasoning `apps/web/.env`'s own
  comment already gave (non-secret local dev values, committed for zero setup), not silently
  assumed already true.
  **Deliberately not done in this pass** (flagged, not silently skipped — see Live debts):
  `directives/naming_conventions.md`/`domain_modeling.md`/`zod_validation.md` still describe the
  pre-reversal Next.js route-handler shape; the collection `../README.md` scenario-index row. Both
  since done — see the two entries below.

- **`directives/naming_conventions.md`/`domain_modeling.md`/`zod_validation.md` reconciled to the
  real NestJS/CQRS shape (this session).** Rewritten against the actual code, not the plan's prose:
  `naming_conventions.md` gained the Repository (`I{Entity}Repository`/`Prisma{Entity}Repository`),
  CQRS Command/Query Handler, domain-error, and NestJS-Module groups
  `../service-appointment-scheduler/directives/naming_conventions.md` already had — this repo
  genuinely has all four now, unlike when the file was first written for the Next.js-only shape.
  `domain_modeling.md` §2 corrected a real factual reversal: the old text said "Prisma models are
  the entities, no parallel hand-written domain class" — **false now**. `apps/scheduler-api`
  genuinely has both: a hand-written plain-interface entity (`domain/entities/*.entity.ts`) AND the
  Prisma row, converted between by a private `toDomain()` in each repository. Documented why that's
  not a contradiction of the old rule's *spirit* (no stateful class, no behaviour methods — still
  plain data) even though the letter of "no parallel class" flipped. `zod_validation.md` rewired §2–3
  from `schema.safeParse` in a Next.js route handler to `ZodValidationPipe` in a NestJS controller,
  and added the `InvalidShiftTimeRangeError` merged-state check as a documented, narrow exception to
  rule 4 — not a precedent for handlers re-validating requests generally.
  `directives/README.md`'s warning banner removed, index descriptions updated to match.

- **Cross-scenario directive audit (this session, user-directed).** The user asked directly
  whether directives that should be near-identical across the two scenarios in this collection
  actually were — they weren't. `directives/cqrs_pattern.md` was referenced by name in **eight**
  real locations (`scheduler-api-repos.ts`, `scheduling.query-repository.ts`, every controller,
  `eslint.config.mjs`, `docs/adr/0005-*.md`) since Phase D, but the file itself never existed —
  the original "not ported, self-explanatory" call in `init-source.plan.md` §5 was **wrong**, not
  merely superseded; nothing checks that a `directives/*.md` path named in a code comment actually
  resolves to a file. Ported it now (`.ai/memory/gotchas.jsonl`), adapted to this scenario's real
  entities, preserving scenario 01's exact subsection numbering so every existing `§N` reference in
  `apps/scheduler-api`'s own comments stays correct. Separately, `directives/qa_standard.md` still
  had "no Docker/psql, SQLite" in its header and `apps/web/prisma/dev.db` in Principle 3 — both
  false since the backend reversal; fixed. `directives/memory_sop.md`'s infra example row updated
  (Prisma/Next.js config → Prisma/Docker/NestJS bootstrap/Next.js config).
  **New**: `../_templates/directives/` at the collection root — canonical, `{{PLACEHOLDER}}`-marked
  copies of exactly the three files that are genuinely stack-agnostic in mechanism
  (`memory_sop.md`, `qa_standard.md`, `cqrs_pattern.md`), with a usage protocol
  (`../_templates/README.md`) explicit about the failure mode this whole audit was responding to:
  a real fix made in one scenario's copy has to be ported back to the template in the same task,
  or the template silently regresses to worse-than-current.
  A final grep across `apps/*/src`, `docs/`, `directives/`, `.ai/plans/` for every
  `directives/*.md` reference (excluding `node_modules`/build output) found one more real one:
  `frontend_standard.md` §4 still told a component to call `apps/web/src/app/api/**/route.ts` —
  deleted in Phase E — fixed to describe `src/lib/api-client.ts` instead; §2's data-fetching rule
  had the same stale "or a route handler" clause, also fixed. Confirmed via a second grep pass:
  every `directives/*.md` path referenced anywhere in the repo now resolves to a real file.

- **Entry-point + shared-directive audit, done by DIFFING against scenario 01 (this session).**
  The user's rule: business/domain docs may differ between scenarios, but process, coding-
  architecture, testing and convention docs must not. Diffing every shared file (rather than
  reading each in isolation, which had already missed this twice) found the worst staleness in the
  repo: **`CLAUDE.md` and `AGENTS.md` — auto-loaded every session — still said "Do NOT reintroduce
  NestJS, Fastify, PostgreSQL, Docker, Turborepo, a CQRS bus; none of it applies here"**, on a repo
  rebuilt on all six, plus Hard Rules pointing at the deleted `src/server/repositories/`, "Zod at
  the route boundary", and "no orchestrator". Phase F had missed both files because its plan line
  item enumerated `docs/NN_*.md` by name and these live at the repo root. Fixed in both, in one
  task (the drift guard requires it).
  Shared directives, drift closed: `memory_sop.md` had silently dropped the "observability"
  routing category and the whole "real examples = AI-collaboration evidence" paragraph;
  `cqrs_pattern.md` had dropped the "Response DTOs are FLAT" placement rule; `qa_standard.md`
  named `npm run typecheck && npm run lint` when this repo has the same `npm run check` script
  scenario 01's copy uses; `testing_standard.md` described layer 3 as "apps/web, real SQLite file"
  and prescribed a Vitest mocking pattern while `apps/scheduler-api/eslint.config.mjs`
  cross-references that very file for the **Jest** `jest.Mocked<T>` pattern. Remaining stale
  architecture claims fixed in `docs/00_overview.md`, `docs/02_use_cases.md`, `docs/04_data_model.md`
  (its header still said SQLite — Phase D reconciled only its `ScheduleRun` paragraph), and
  `sample-data/README.md` (documented a `malformed/` directory that was never created; the corpus
  lives as inline fixtures in `demand-csv.parser.spec.ts`). ADR-0003's stale schema path was
  **annotated with a footnote, not rewritten** — an accepted ADR's body is not edited to match a
  later refactor. Style normalized too: the earlier "Reconciled to the real two-app shape (Phase
  F…)" headers read as changelog entries; scenario 01's convention is a terse provenance note, and
  changelog belongs in this file, not in a rule file.

## What the real data changed

The brief's CSV was downloaded and **measured rather than read about**, and it moved three decisions
that were already written down:

1. **Four parser traps invisible in the brief's description of its own file** — a title row, a UTF-8
   BOM, an empty first header cell, and day labels (`"Fri, 07 Aug"`) containing a comma inside quotes.
   The last one shreds a naive `split(',')` header into 15 fields, and the brief's idealised
   `Hour | Fri | Sat | …` table is exactly what would lead someone to write that parser. Plan §4.
2. **`N` must be calibrated against *floor* staff-hours, not raw required staff-hours.** The
   shift-quantisation gap — you cannot hire someone for the 1pm hour alone — is ~20% at every value of
   `N`. Plan §7.2. A second correction, found re-deriving the plan's own math during Phase 1: the
   plan's calibration rule actually returns **N=15** for the seed team, not the **N=18** it claimed —
   `suggestTransactionsPerStaff` reports 15 honestly; `18` ships as the default anyway, deliberately
   (`phase-1-algorithm.plan.md` D1, `docs/adr/0003-demand-to-headcount-model.md`).
3. **The demand variance is within the day, not across days** (day totals 390–508; cell range 2–64).
   The interesting stage is therefore mapping demand onto shifts, not distributing across the week.
   Plan §7.1.

- **Common-directive completeness audit against Cortex (this session, user-directed).** The user
  corrected the premise behind every earlier "not ported — doesn't apply here" call: these are
  **common** documents (Cortex → scenario 01 → here), surplus is not wrong, and a rule must be
  marked ⏸ with its trigger rather than deleted. Checking Cortex
  (`../../distributed-social-platform/directives/`, 19 files) against scenario 01 (14) and this
  repo (then 8) found **five** genuinely-applicable directives missing, not one:
  `cqrs_pattern.md` (found last session), `folder_structure_sop.md`, `logging_standard.md`,
  `database_standard.md`, `observability_monitoring.md` — plus `idempotency_strategy.md`, now kept
  as ⏸-not-needed rather than absent. Each was verified against the real code before porting
  (prom-client + `/metrics`; `LogContext`/`createLogger`/nestjs-pino across 8+ files; 35
  `@map`/`@default(uuid())`/`deletedAt` occurrences; `eslint.config.mjs`'s own layer rules) — all
  four apply today. **Root cause, same class as the CLAUDE.md finding:** `init-source.plan.md` §5
  judged them inapplicable against the *pre-reversal* Next.js+SQLite stack and nothing re-checked
  that judgment once the reversal reinstated NestJS/Postgres/CQRS/Docker.
  Ported files keep scenario 01's exact section numbering so in-code `§N` citations stay valid.
  **Two places where copying verbatim would have been actively dangerous** were adapted with the
  divergence stated inline rather than silently: `database_standard.md` §5 (scenario 01 runs
  Prisma 7, where `url` in the datasource block is an *error*; this repo pins Prisma 5, where it is
  *required* — a verbatim copy would have instructed the next agent to break the schema) and §2's
  `uuid(7)` (needs Prisma 6+). `resilience_patterns.md` was re-derived from scenario 01's file
  after I found my earlier rewrite had reordered its sections and dropped §7 (Correlation-id)
  entirely. `../_templates/directives/` now carries all 13 common directives, each with a
  mandatory `SPECIALIZE:` header, and `../_templates/README.md` documents the two verification
  commands used here (resolve every `directives/*.md` reference; diff section *headings* between
  scenarios — structural difference is drift, content difference is fine).

- **Audit of `../_templates/` itself (this session).** The user asked for the templates to be
  checked too — correctly: **the folder built to prevent referenced-but-missing directives was
  full of them.** Because the templates were copied from scenario 02's specialized files, they
  carried ~34 scenario-local citations (`backend-architecture-reversal.plan.md §4/§6`,
  `docs/adr/0005-*`, `ADR-0001`/`ADR-0004`, `plan §0.1`…`§8.1`, `assumption 10/11/12/14`) — none of
  which exist in a scenario 03. Neutralized in three reviewed passes (explicit from→to pairs, never
  a blind regex over prose), plus scenario-02 facts stated as universal rules (a specific
  Vitest/Jest package split, `NEXT_PUBLIC_` env vars, API port `4102`, "every handler built in
  Phase D"). **Deliberately kept concrete:** domain examples (`FeasibilityGate`,
  `SchedulerApiRepos`) — an un-swapped example is merely unspecialized, a dangling citation or a
  wrong command is broken; that distinction is now the documented rule for `{{PLACEHOLDER}}` vs a
  concrete example. `database_standard.md` §5 was additionally rewritten to lead with the Prisma
  5-vs-7 warning rather than assert one repo's pin, since copying the wrong shape breaks a schema.
  All 13 templates now carry a `SPECIALIZE:` header; verified 0 dangling citations remain.

## Current focus

**`backend-architecture-reversal.plan.md` is fully executed — all six phases (A–F) done — and every
Live debt Phase F itself created has since been closed, including a follow-up cross-scenario
directive audit that found and fixed real drift Phase F's own pass missed** (see the log entry
above). What remains is optional, not blocking any status claim this repo currently makes:

1. `apps/web`'s remaining six UI screens (plan §3.1) — optional per this collection's stated
   priority (system design over UI completeness), `readme.md`'s "Why the stack changed mid-build"
   makes this explicit rather than leaving it unexplained.
2. `../_templates/` is unproven until a third scenario in this collection actually uses it —
   treat it as a hypothesis about what reduces cross-scenario drift, not a guarantee, until then.

## Live debts

*(None outstanding as of this session.)* Both entries this section used to carry are resolved — the
three `directives/*.md` files (reconciled to the real NestJS/CQRS shape, see the Phase F log entry
above) and the collection `../README.md`/`../README.vi.md` scenario-index rows (added once
`CASE_STUDY.md`/`.vi.md` existed to link to — `CASE_STUDY.md`/`.vi.md` written this session, the
seven-group A–G structure matching scenario 01's depth; `readme.vi.md` also added for both this
scenario AND `../service-appointment-scheduler/` for cross-collection parity, user-directed scope).

## Decisions taken by the user, not by default

- **Architecture reversal (this session, superseding the entry below).** The user rejected the
  Next.js-only collapse: this collection's system design principle is a real backend service, not
  route handlers absorbing persistence and business logic. Confirmed via `AskUserQuestion`: mirror
  `../service-appointment-scheduler` as closely as practical — NestJS + Fastify, PostgreSQL +
  Docker, CQRS + Hexagonal + a ported shared-kernel, Turborepo.
  `backend-architecture-reversal.plan.md` is the plan; `packages/scheduling-core` is unchanged.
- ~~**Simplicity over infrastructure.**~~ *(Superseded — kept for the audit trail, per this
  project's own rule against rewriting history.)* An earlier NestJS + Fastify + PostgreSQL +
  Docker + Turborepo decision was reversed to one Next.js app + SQLite on the argument that none of
  the brief's five grading criteria is infrastructure. The user overturned this reversal directly:
  the collection's own architecture principle outranks that argument for this repo.
- **Repo strategy:** build inside the collection, `git subtree split` at submission (plan §11.3).
- **Folder name:** `demand-driven-staff-scheduler` — the problem class, not the brief's title.
