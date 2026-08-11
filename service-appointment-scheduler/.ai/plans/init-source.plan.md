# INIT PLAN — Keyloop Service Scheduler

> **Scope of this document:** how to stand up this repository by porting the reusable base from
> Cortex (`~/Vscode/distributed-social-platform`) **without carrying over any Cortex business
> domain**. System design for the scheduler itself is a separate document, written after init.
>
> Source of truth for every path below: verified against the Cortex working tree on 2026-08-07,
> **re-verified and corrected 2026-08-10** (§3.1a/§3.1b/§3.1c, §5 ADR numbering, §6.1.1, §6.4.1,
> §8 tree, §8.1–§8.5, §9 grep scope, §11 gotchas 2/8/9, §13 deliverables map).

---

## 0. Decisions locked before any file is copied

| Decision | Value | Why |
|---|---|---|
| Repo name | `keyloop-service-scheduler` | Matches Scenario A ("The Unified Service Scheduler") |
| Repo layout | **Single repo, NO git submodules** | Cortex uses submodules per service. Reviewers must `git clone` once and run. Submodules would break that. |
| npm scope | `@scheduler/*` | Replaces `@distributed-social-platform/*` everywhere |
| Services | **One** — `apps/scheduler-api` | Challenge asks for one service layer. Monorepo shape is kept so the structure reads as intentional, not accidental. |
| Package manager | `npm@11.4.2` workspaces + Turborepo | Same as Cortex |
| DB | PostgreSQL + Prisma | Same as Cortex |
| Node/TS | Node 22+, TypeScript `^5.9.3` | Same as Cortex |

### Target tree after init is complete

```
keyloop-service-scheduler/
├── .ai/
│   ├── GOTCHAS.md                  (empty scaffold)
│   ├── KNOWLEDGE_ARCHITECTURE.md   (ported, rewritten)
│   ├── KNOWLEDGE_INDEX.md          (generated — do not hand-edit)
│   ├── PROJECT_STATUS.md           (new content)
│   ├── knowledge_builder.py        (ported as-is)
│   ├── memory/                     (4 empty .jsonl files)
│   └── plans/                      (this file moves here after init)
├── .claude/
│   ├── hooks/turn-context.cjs      (ported, path strings updated)
│   └── settings.json               (ported as-is)
├── apps/
│   └── scheduler-api/              (NestJS service — skeleton only at init)
├── packages/
│   └── shared-kernel/              (ported, business stripped)
├── directives/                     (subset ported — see §4)
├── docs/                           (numbered scaffolds — see §5)
├── docker-init/                    (postgres + prometheus + grafana only)
├── scripts/sync.cjs                (ported, SUBMODULE LOGIC REMOVED — see §6.3)
├── AGENTS.md                       (ported, rewritten)
├── CLAUDE.md                       (mirror of AGENTS.md)
├── docker-compose.yml              (reduced — see §7)
├── package.json / turbo.json
├── tsconfig.base.json / tsconfig.json
├── .env.example / .gitignore / .gitattributes
└── readme.md
```

---

## 1. Porting tiers — decide scope BEFORE copying

Cortex's base is built for 5 services, Kafka, Elasticsearch and an 18-service compose file. Every
piece of it earns its place *there* — it is a platform that grew into those problems. This repo
solves one bounded problem, so the question is not whether a capability is good but **whether this
problem has reached it yet**.

The evaluation criterion is *"clarity, logic, and **foresight** of your architecture"*. Foresight is
demonstrated by showing the sequence: what is needed now, what is deliberately held back, and what
seam it will arrive through. So each tier below is a **stage of that sequence**, not a quality
judgment — and every capability held back gets written down in
`docs/03_system_architecture_diagrams.md § Deferred scope` with the trigger that would bring it in.

Pick a tier, stick to it, and document the boundary.

| Tier | Contents | Effort | Recommended |
|---|---|---|---|
| **T1 — Core** | Monorepo tooling, AI workflow, shared-kernel (cqrs/database/errors/http/logger/resilience/tracing/schemas), one NestJS app, Postgres | ~4h | ✅ **Yes** |
| **T2 — Observability** | + Prometheus/Grafana, structured logging, `/metrics`, health checks | ~2h | ✅ Yes — challenge explicitly asks for an observability strategy |
| **T3 — Async** | + Kafka, Transactional Outbox, DLQ replay, resilient consumer | ~4h | ⚠️ Only if the design doc justifies async (e.g. appointment-confirmation notifications) |
| **T4 — Multi-service** | + gRPC, second service, submodules, Elasticsearch | — | ❌ Held back — the challenge scopes the build to **one service layer**. Trigger: a second bounded context with its own release cadence. |

> **Recommendation: T1 + T2, with T3 and T4 written up in the design document as the next two stages.**
> *"The outbox is the right pattern the moment confirmation notifications land — here is the seam,
> here are the interfaces already in place, here is what would change"* demonstrates the same
> architectural understanding as shipping Kafka, and it demonstrates judgment about sequencing on
> top of it. The capability is not dismissed; it is **scheduled**.
>
> Where a T3/T4 interface is already a compile-time dependency of something T1 needs — the saga
> interfaces (§3.1) are the clearest case — it ships **with its reasoning intact**, and the ADR says
> why the mechanism is present but not yet exercised.

---

## 2. Root-level files — port table

Copy from `~/Vscode/distributed-social-platform/` unless noted.

| # | Source | Action | Required edits |
|---|---|---|---|
| 2.1 | `package.json` | Copy + edit | `name` → `keyloop-service-scheduler`. Delete scripts: `sync:all`, `sync:check` if unused. Keep `check`, `typecheck`, `lint`, `test`, `format`. Drop `monitor:up` if T2 skipped. |
| 2.2 | `turbo.json` | **Copy as-is** | None. Task graph is domain-free. |
| 2.3 | `tsconfig.base.json` | Copy + edit | Update `paths` mapping `@distributed-social-platform/*` → `@scheduler/*` |
| 2.4 | `tsconfig.json` | Copy + edit | Update `references` to only `apps/scheduler-api` + `packages/shared-kernel` |
| 2.5 | `.gitignore` | Copy + edit | **Remove** the submodule note (lines about `apps/auth-service` / `apps/search-service` having their own `.gitignore`). Keep `.ai/memory/` ignore and the `!.ai/KNOWLEDGE_INDEX.md` / `!.ai/knowledge_builder.py` negations. |
| 2.6 | `.gitattributes` | Copy as-is | None |
| 2.7 | `.env.example` | **Rewrite from scratch** | Cortex's version has CORE/AUTH/NOTIFICATION/SEARCH DB URLs, 4 Kafka client IDs, consumer groups. Keep only: `NODE_ENV`, `DB_*`, `SCHEDULER_DATABASE_URL`, `PORT`, `LOG_LEVEL`. **No `REDIS_*`** — idempotency is Postgres-backed, see §8.3 |
| 2.8 | `.gitmodules` | ❌ **Do not copy** | Single repo |
| 2.9 | `RUN.md`, `SETUP.md` | Copy as skeleton | Replace all Cortex commands. **Challenge requires a README with build/run/test instructions** — these two feed it. |
| 2.10 | `readme.md` | **Rewrite** | Must satisfy the challenge README requirements, including the **AI Collaboration Narrative** section |
| 2.11 | `readme.phases.md` | ❌ Skip | Cortex roadmap artifact |
| 2.12 | `proto/` | ❌ Skip | T4 only |

---

## 3. `packages/shared-kernel` — file-by-file

Create `packages/shared-kernel/` and copy `package.json`, `tsconfig.json`, `eslint.config.mjs`,
`.prettierrc`, `.prettierignore` first. In `package.json`: rename to `@scheduler/shared-kernel`,
**drop** deps `@bufbuild/protobuf`, `@grpc/grpc-js`, `grpc-tools`, `ts-proto`, `pino-elasticsearch`
(T4/ES only). Delete the `proto:gen` script and `scripts/` folder.

### 3.1 Copy AS-IS — zero business coupling

| Source path (under `packages/shared-kernel/src/`) | Notes |
|---|---|
| `cqrs/command-bus.ts`, `query-bus.ts`, `event-bus.ts`, `constants.ts` | The CQRS bus + fixed pipeline |
| `cqrs/errors/cqrs.error.ts` | |
| `cqrs/interfaces/*.ts` (all 8) | **Including the two saga interfaces — they are structural.** `command-bus.ts:7-8` and `command-handler.interface.ts:2` import `SagaContext` / `CompensationAction` / `ISagaCompensationStore` directly: the compensation contract is part of how the bus defines a command, not an add-on. Port the bus intact and let ADR-0002 explain the boundary — a single-database booking is one transaction, so compensation is *available* and *unexercised*. That distinction is itself worth stating. |
| `database/tx-scope.ts`, `abstract-tx-runner.ts`, `transaction.context.ts`, `tx.error.ts` | **The Unit-of-Work story. Highest-value port in this list.** |
| `errors/app-error.ts`, `application-error.ts`, `infra-error.ts` | Error taxonomy |
| `http/response.ts`, `response.utils.ts` | Envelope + helpers |
| `logger/log-context.ts` | LogContext taxonomy. `logger/index.ts` is **not** as-is — see §3.2 |
| `resilience/prisma-transient-error.ts` | P2034 detection — needed by retry |
| `tracing/trace-context.ts` | W3C traceparent |
| `schemas/common.schema.ts` | Zod primitives — **strip `JwtPayloadSchema`** (Cortex auth) unless auth is modelled |

### 3.1a Sub-barrels — there are FIVE barrels, not one

The root `index.ts` does `export * from './cqrs/index.js'` and `'./messaging/index.js'`. Missing any
of these is a build failure, and none of them are listed above:

| Barrel | Action |
|---|---|
| `cqrs/index.ts` | Copy as-is (exports all 4 buses + 8 interfaces + `cqrs.error`) |
| `messaging/index.ts`, `messaging/events/index.ts`, `messaging/routing/index.ts` | T3 only — delete at T1/T2 along with the whole `messaging/` tree |
| `src/index.ts` | **Rewrite by hand, last** — see §3.2 |

### 3.1b Test files — port them, they are a deliverable

The challenge requires *"a suite of tests that validate core business logic"*. Cortex ships specs
next to the sources being ported. They are already green, and they carry Cortex's reasoning in
executable form — a spec states what the kernel guarantees more precisely than a comment can.

| Spec | Port? |
|---|---|
| `cqrs/command-bus.spec.ts`, `query-bus.spec.ts`, `event-bus.spec.ts` | ✅ Covers the bus + the saga/compensation path kept in §3.1 |
| `http/response.utils.spec.ts` | ✅ |
| `resilience/prisma-transient-error.spec.ts` | ✅ Retry classification — directly supports the booking-concurrency story |
| `logger/redact.spec.ts` | ✅ (tests `logger/index.ts`; re-run after the ES strip in §3.2) |
| `resilience/circuit-breaker.spec.ts` | ❌ Cut with its source (§3.1c) |
| `grpc/internal-grpc-auth.spec.ts`, `messaging/*.spec.ts`, `events/integration-event.spec.ts` | ❌ T3/T4 |

Jest config lives inside `shared-kernel/package.json` (`rootDir: src`, `testRegex: .*\.spec\.ts$`) —
it is copied with the package, no extra wiring.

### 3.1c Held back pending a trigger — decide per file, record the decision

Two files are **structurally free to defer**: each is referenced only by the root barrel and its own
spec, so including or holding back either is a local decision with no ripple. That makes them a
scope choice rather than a build constraint — which means the choice has to be *argued*, not just
made. Whichever way each goes, the reasoning belongs in
`docs/03_system_architecture_diagrams.md § Deferred scope`.

| File | Its job | The trigger that brings it in | Default at T1/T2 |
|---|---|---|---|
| `resilience/circuit-breaker.ts` (+ `.spec.ts`) | Stops a failing outbound dependency from consuming the caller's threads and latency budget | The first synchronous call to something this service does not own — a DMS integration, a payment gateway, a notification provider. Scenario A as specified has none. | Hold back, and write the trigger down. **Include it the moment an outbound call appears** — do not retrofit resilience after the integration ships. |
| `logger/audit.ts` | Structured audit trail, currently routed to the Cortex Elasticsearch ingest pipeline (`audit.ts:17` cites `docker-init/elasticsearch/`) | An appointment lifecycle that needs a who-changed-what record — cancellation and reschedule are the obvious candidates | Hold back at T1. **Reconsider as soon as cancel is implemented**; if it ships, the ES sink is replaced by the same stdout transport as §3.2's `logger/index.ts`. |

> This is the pattern to apply to every "held back" call in this plan: name what the capability
> does, name the condition that would require it, and state where the seam is. A reviewer reading
> `§ Deferred scope` should be able to tell that the capability was **understood and sequenced** —
> which is a stronger signal than either shipping it unused or omitting it silently.

### 3.2 Copy + STRIP — structure is reusable, contents are Cortex business

| Source | What to strip | What to replace it with |
|---|---|---|
| `logger/index.ts` | **The pino-elasticsearch transport branch, lines ~155–190** (`target: 'pino-elasticsearch'`, the `dsp-logs` / `dsp-audit-logs` data-stream comments). §3 drops the `pino-elasticsearch` dependency — leaving this branch in means the transport fails to resolve the moment its env gate flips. | `createLogger` with the stdout/pretty transports only. Keep `traceLogMethodHook` (it is what puts `traceparent` on every line). Re-run `logger/redact.spec.ts` after the strip. |
| `auth/system-permissions.ts` | All `REPORT_*`, knowledge/credit permission codes | Scheduler codes: `APPOINTMENT_READ`, `APPOINTMENT_WRITE`, `APPOINTMENT_CANCEL` — or delete the file at T1 if the challenge needs no RBAC |
| `auth/org-permissions.ts` | Same | Delete unless multi-dealership tenancy is modelled |
| `messaging/events/event-types.ts` | `KNOWLEDGE_*`, `VOTE_*`, `FOLLOW_*`, `BOOKMARK_*`, `CREDIT_*` | T3 only: `APPOINTMENT_CONFIRMED`, `APPOINTMENT_CANCELLED` |
| `messaging/events/definitions/*.ts` (3 files) | All 3 are Cortex events | Delete; write scheduler events at T3 |
| `messaging/routing/maps.ts` | Both routing tables reference Cortex `EventType` — **will not compile until rewritten** | T3 only |
| `messaging/routing/kafka-topic.ts` | Cortex topic names | T3 only |
| `src/index.ts` | Barrel re-exports every file above, plus 4 `grpc/*` blocks and `messaging/index.js` | **Rewrite by hand last**, after all files exist. A stale barrel is the #1 source of build failure in this port. Lines to delete: all `./grpc/*` exports, `./messaging/index.js`, `./resilience/circuit-breaker.js`, `./logger/audit.js`, and `./auth/*` if RBAC is dropped. Keep the comment explaining why `transaction.context.ts` is deliberately **not** exported — it is a design statement, not clutter. |

### 3.3 T3 — arrives with the first asynchronous flow

`messaging/dlq-replay-consumer.ts`, `event-router.ts`, `resilient-consumer.ts`,
`messaging/events/cloud-event.ts`, `integration-event.ts`, `messaging/interfaces/*`,
`messaging/kafka-shapes/*`, `messaging/routing/transport.ts`

**Trigger:** work that must survive the request that started it — appointment-confirmation
notifications are the canonical example. Until then the outbox seam is described in the SDD
(§1), not built.

### 3.4 T4 — arrives with the second service

`grpc/` (all 4 files: `internal-grpc-auth.ts`, `membership.ts`, `org-provisioning.ts`,
`trace-propagation.ts`)

**Trigger:** a second bounded context that ships on its own cadence. A single service calling
itself over gRPC would add a network hop and a proto toolchain to a function call.

---

## 4. `directives/` — port subset

Copy from `directives/`. Each ported file needs Cortex domain examples swapped for scheduler ones.

| Port | File | Why |
|---|---|---|
| ✅ | `README.md` | **The routing index. `turn-context.cjs` points the agent here — must exist or the hook is a dead link.** Rewrite the table to list only ported directives. |
| ✅ | `folder_structure_sop.md` | Hexagonal layout rules |
| ✅ | `cqrs_pattern.md` | Handler types, TxScope. Its ADR-0001 references stay valid now that `0001-transaction-retry-boundary.md` is ported (§5) — keep them and drop only the Cortex-specific migration history. |
| ✅ | `domain_modeling.md` | Entity style: mutable + individual fields, `create<Variant>` factories |
| ✅ | `database_standard.md` | UUID PK, camelCase/`@map` snake_case, soft delete via `deletedAt` |
| ✅ | `naming_conventions.md` | |
| ✅ | `zod_validation.md` | |
| ✅ | `testing_standard.md` + `qa_standard.md` | **Challenge requires "a suite of tests that validate core business logic"** |
| ✅ | `logging_standard.md` | Never `console.log`; use `createLogger` |
| ✅ | `idempotency_strategy.md` | Directly relevant — double-submit booking |
| ✅ (T2) | `observability_monitoring.md` | Challenge requires an observability strategy |
| ✅ (whole file) | `resilience_patterns.md` | Retry + idempotency + graceful shutdown apply now. **Keep the circuit-breaker and DLQ sections too**, annotated with the triggers from §3.1c / §3.3 — a written standard whose implementation is scheduled is the HOW half of the deferral argument (§5.1). |
| ⚠️ (T3) | `eventing_patterns.md`, `event_sourcing.md` | Port when the outbox is built (§3.3 trigger) |
| ✅ | `memory_sop.md` | **Upgraded from optional.** §6.4.2 makes `.ai/memory` + `GOTCHAS.md` discipline the evidence behind an entire evaluation dimension — the SOP is the directive that keeps it happening |
| ❌ | `microservice_architecture.md` | Its subject arrives with §3.4's trigger; `03_system_architecture_diagrams.md § Deferred scope` carries the summary until then |
| ❌ | `multi_tenancy.md` | Unless dealership = tenant |
| ❌ | `rag_ai_integration.md` | No AI features in this scenario (the AI is in the *workflow*, §6 — not in the product) |

---

## 5. `docs/` — scaffolds only

The knowledge builder globs `docs/*.md` (see §6.2). Create these as **real files with headings**,
not empty ones, or the generated index will show blank entries.

| File | Content at init | Layer (§5.1) |
|---|---|---|
| `README.md` | Index of the docs folder — **state the What/Why/How convention here** | — |
| `00_overview.md` | **New, not from Cortex.** One page: What this system is · Why it exists · How it is built · Where to read next. The entry point for a reviewer with ten minutes. | all three |
| `01_business_requirements.md` | Scenario A requirements from the challenge PDF, plus an **Assumptions** heading (see §13.2) | WHY |
| `02_use_cases.md` | Book appointment / check availability / cancel | WHAT |
| `03_system_architecture_diagrams.md` | **Becomes the System Design Document deliverable.** Must contain a **`§ Deferred scope`** section (§1, §3.1c) | WHAT + WHY |
| `04_database_schema.md` | Customer, Vehicle, Dealership, ServiceType, ServiceBay, Technician, Appointment — **and why the booking constraint has the shape it does** (§8.2) | WHAT + WHY |
| `06_api_contracts.md` | REST endpoints + OpenAPI | WHAT |
| `08_testing_and_qa_strategy.md` | Incl. the concurrent-booking test | HOW |
| `09_devops_infrastructure.md` | docker-compose, migrate, seed, run instructions | HOW |
| `12_ai_collaboration.md` | **New, not from Cortex.** The full AI method; the README section is its summary (§6.4.2) | HOW |
| `adr/README.md` | Index + the immutability convention (see §11 gotcha 7) |
| `adr/0001-transaction-retry-boundary.md` | **Ported from Cortex.** Not optional — see the numbering note below. |
| `adr/0002-booking-concurrency-control.md` | **The flagship artifact — the double-booking decision.** Builds directly on ADR-0001's retry boundary. |

> ⚠️ **ADR numbering is load-bearing.** Cortex's `docs/adr/0001-transaction-retry-boundary.md` is
> cited by **~20 comments inside the source being ported as-is** — `database/tx-scope.ts:2` names the
> filename verbatim, plus `command-bus.ts:34,73,166`, `cqrs.error.ts:37,54`,
> `command-handler.interface.ts:5,34`, `command.interface.ts:4`, `saga-context.interface.ts:8,21`,
> `saga-compensation-store.interface.ts:9`, `abstract-tx-runner.ts:8,26`, `tx.error.ts:13`,
> `index.ts:28,34`. Numbering the booking ADR `0001` would point every one of those at the wrong
> document. Port the transaction ADR as **0001**, make booking concurrency **0002**. This is also the
> better narrative: 0001 establishes the Unit-of-Work/retry boundary, 0002 applies it to the
> double-booking problem.

Out of scope for this repo: `05_web_ui_ux_guidelines.md`, `07_design_system_assets.md` (backend
layer chosen), `10_security_rbac.md` (unless RBAC is modelled), `11_auth_service_review.md`,
`archive/`, `linkedin_posts_plan.md`.

### 5.1 The What / Why / How convention

A reviewer reads a submission in a fixed order — *what is this, why is it like this, how do I run
and extend it* — and a repo that answers those three questions in three predictable places is read
faster and more favourably than one with the same content scattered. Adopt the split explicitly and
state it in `docs/README.md`:

| Layer | Question it answers | Lives in | Test for "is this in the right place?" |
|---|---|---|---|
| **WHAT** | What does this system do, and what is it made of? | `docs/00_overview.md`, `02_use_cases.md`, `03_*` (diagrams + component roles), `04_*`, `06_*` | Describes structure and behaviour. True regardless of who built it or why. |
| **WHY** | Why this shape and not another? | `docs/adr/*`, `01_business_requirements.md` (incl. Assumptions), `03_* § Deferred scope` | Names alternatives and a trade-off. **If a paragraph has no rejected option in it, it is not WHY.** |
| **HOW** | How do I build on this correctly? | `directives/*` (§4), `08_*`, `09_*`, `12_ai_collaboration.md`, `RUN.md`/`SETUP.md`, code comments | Prescriptive. A rule someone could violate. |

Three rules that make the convention hold:

1. **Every ADR is a WHY document and must state the alternatives it rejected.** "We chose Postgres"
   is WHAT. "We chose a DB-level exclusion constraint over optimistic locking and over an
   application-level lock, because …" is WHY. ADR-0002 is the one a reviewer will read closest.
2. **Every non-obvious mechanism gets one WHY sentence at its definition site.** Cortex already does
   this well — `shared-kernel/src/index.ts` explains why `transaction.context.ts` is *not* exported;
   `tx-scope.ts:2` names the ADR behind Unit-of-Work-as-a-value. Preserve those comments during the
   port (§3.2); they are the WHY layer living inside the code, and they are a large part of what
   makes the ported base read as considered rather than inherited.
3. **`00_overview.md` links to one entry per layer, and stays under a page.** If it grows, the
   detail belongs in the layer document, not the overview.

> The docs and `directives/` split Cortex already uses **is** this convention — `docs/` is
> WHAT + WHY (this system), `directives/` is HOW (any code in it). §6.4's "Knowledge boundary"
> section in `AGENTS.md` states that boundary for the agent; §5.1 states the same boundary for the
> human reader. Keep both wordings consistent.

---

## 6. AI workflow — the part most likely to break

### 6.1 `.claude/`

| Source | Action |
|---|---|
| `.claude/settings.json` | **Copy as-is.** Both hook paths (`node .claude/hooks/turn-context.cjs`, `node scripts/sync.cjs`) stay valid. |
| `.claude/hooks/turn-context.cjs` | ⚠️ **MUST be modified — see §6.1.1.** Same class of surgery as `sync.cjs`, not a path-string edit. |
| `.claude/launch.json` | Copy + rewrite — Cortex's entry points at `web` on port 3001; replace with `scheduler-api` |
| `.claude/settings.local.json` | ❌ Do not copy (machine-local) |

#### 6.1.1 ⚠️ `turn-context.cjs` — submodule-aware, same as `sync.cjs`

The hook is not a dumb context printer. Verified behaviour:

- `submodulePaths()` reads and parses `.gitmodules` (≈ lines 50–62)
- The dirty-file loop descends with `git -C "${sub}" status --short` per submodule (≈ lines 66–78)
- `subSet` then filters submodule pointer lines back out of the root status (≈ line 80)

**This repo has no `.gitmodules`.** Required edits:

1. Delete `submodulePaths()`, the per-submodule descend loop, and the `subSet` filter
2. Keep: the branch + `git status --short` block, the **After-Task debt** mtime check
   (compares changed `src/**.ts` against newest `.ai/memory/*.jsonl` + `PROJECT_STATUS.md`),
   and the one-line routing reminder
3. The routing line points the agent at `directives/*.md` — that folder must exist (§4)

**Test after editing:** `node .claude/hooks/turn-context.cjs` must print valid JSON containing
`hookSpecificOutput.additionalContext` and exit 0 in a repo with no `.gitmodules`.

### 6.2 `.ai/`

| Source | Action |
|---|---|
| `knowledge_builder.py` | **Copy as-is.** Paths are all derived from `WORKSPACE_ROOT`. |
| `KNOWLEDGE_ARCHITECTURE.md` | Copy + rewrite to describe this repo's layout |
| `PROJECT_STATUS.md` | New content — init status |
| `GOTCHAS.md` | Create as empty scaffold with a heading |
| `memory/` | Create 4 empty files: `architecture.jsonl`, `conventions.jsonl`, `errors.jsonl`, `gotchas.jsonl`. **Start empty** — Cortex's 161 entries are that platform's hard-won lessons, indexed to its code; imported here they would route this agent to files and decisions that do not exist. These four files fill up during *this* build, and that is what §6.4.2 §5 draws on. |
| `KNOWLEDGE_INDEX.md` | ❌ Never copy. Generated by the builder. |
| `plans/` | Create dir; move this file here as `plans/init-source.plan.md` once init is done |

**Builder inputs that must exist or the run fails** (verified in `knowledge_builder.py` lines 33–48):
`.ai/memory/`, `.ai/GOTCHAS.md`, `.ai/PROJECT_STATUS.md`, `directives/`, `docs/`, `apps/`,
`packages/`, `readme.md`.

### 6.3 ⚠️ `scripts/sync.cjs` — MUST be modified, not copied

Cortex's `sync.cjs` is submodule-aware. Verified behaviour:

- Line 122 comment: *"Every `apps/*` is a git submodule, so the root `git status --short` reports only the submodule pointer"*
- Lines 136–168: reads `.gitmodules`, iterates each submodule, runs `git status` inside each
- Lines 183–190: detects linked worktrees and aborts with a Cortex-specific message

**This repo has no `.gitmodules`.** Required edits:

1. Delete the `.gitmodules` parsing block and the per-submodule `git status` loop
2. Keep: the root `git status --short --porcelain` call, the `.ai/memory` mtime freshness check
   (lines 78–88), and the Python-detection block (line ~103)
3. Delete or rewrite the worktree-abort message (lines 183–190)
4. Verify `python`/`python3` resolution still works on Windows

**Test after editing:** `node scripts/sync.cjs` must exit 0 in a clean tree and regenerate
`.ai/KNOWLEDGE_INDEX.md`. If it throws on missing `.gitmodules`, step 1 is incomplete.

### 6.4 `AGENTS.md` / `CLAUDE.md`

Port the **structure**, rewrite the **content**. Sections to keep:

`Project Context` · `Session Start Protocol` · `Knowledge boundary (docs ↔ directives)` ·
`Hard Rules` · `Task Classification` · **`Citation Protocol`** · **`After-Task Protocol`**

> **Citation Protocol is the highest-value section to port.** It requires every generated plan to
> carry a *"References & Compliance"* listing which directive/doc files it read. This is the
> concrete artifact behind the challenge's **"AI Engineering & Verification"** criterion — it is
> evidence, not a claim.

`CLAUDE.md` stays a thin pointer to `AGENTS.md`, exactly as in Cortex.

#### 6.4.1 The evidence trail behind the AI Collaboration Narrative

The Citation Protocol is only worth porting if its output survives to submission. The narrative
section the challenge asks for should **cite artifacts in this repo**, not describe a process from
memory. Decide the mechanism now, at init, because the artifacts accumulate during the build and
cannot be reconstructed afterwards:

| Artifact | Produced by | What it proves |
|---|---|---|
| `.ai/plans/*.plan.md`, each with *References & Compliance* | Citation Protocol (§6.4) | **Direction** — which directives constrained each task before code was written |
| `docs/adr/0002-booking-concurrency-control.md` | Human decision, AI-drafted | **Ownership** — the one decision that was not delegated |
| `.ai/GOTCHAS.md` + `.ai/memory/*.jsonl` | After-Task Protocol | **Verification** — what the AI got wrong and how it was caught |
| Green `npx turbo check` + the ported specs (§3.1b) | CI-style gates | **Quality control** — the mechanical half of the claim |
| Commit history | `git` | **Refinement** — AI output arriving, then being corrected |

Two consequences for init:

1. **`.ai/plans/` must be committed, not gitignored.** `.gitignore` ignores `.ai/memory/` (gotcha 3)
   — keep that, but make sure `plans/` is not swept up with it. The plans are the primary exhibit.
2. **Keep this file.** §12 step 10 moves it to `.ai/plans/init-source.plan.md`; that is deliberate —
   an init plan written *before* any code, listing verified source paths and known traps, is the
   cleanest possible evidence of directing the AI rather than accepting its output.

Write the README narrative **last**, from what these artifacts actually show. Do not draft it early
and then make the work match the story.

#### 6.4.2 `docs/12_ai_collaboration.md` — the method, not just the story

*"AI Engineering & Verification"* is **one of four evaluation dimensions**, weighted equal to system
design and to technical execution, and the PDF asks for it twice: a section in the SDD on how GenAI
assisted the **design phase**, and a section in the README on the collaboration **narrative**. Two
required mentions of the same practice is a strong signal that a paragraph of generalities will not
carry it. Write the method down once, properly, in `docs/12_ai_collaboration.md`; the README section
and the SDD section then summarise it and link.

The distinguishing claim is *ownership*: that the AI was directed by a standard the human set, and
that its output was checked by mechanisms the human built. This repo can show that concretely.

**Structure for `12_ai_collaboration.md`:**

| Section | Content | Backed by |
|---|---|---|
| **1. Direction — the standard came first** | `directives/` existed before the code and constrained it; each task cites the directives it read | §4, Citation Protocol (§6.4) |
| **2. Context engineering** | How the agent gets the right context per turn instead of re-reading everything: `AGENTS.md` routing, `KNOWLEDGE_INDEX.md`, the `UserPromptSubmit` hook injecting working-tree state, GOTCHAS split out of the index because it was 63% of ~21k tokens and rarely needed | §6.1.1, §6.2 |
| **3. Guardrails the AI cannot talk its way past** | Lint-enforced Hexagonal boundaries (§8.6), Zod validation at the edge, typecheck, the ported specs, and the DB constraint in §8.2 — **the booking guarantee does not depend on the AI having reasoned correctly** | §3.1b, §8.2, §8.6 |
| **4. The verification loop** | Read plan → check citations → run `turbo check` → review the diff against the directive it claims to follow → log the lesson. `sync.cjs` at Stop and the hook at prompt-submit make the loop mechanical, not remembered | §6.1.1, §6.3 |
| **5. Where the AI was wrong** | The most credible section. Real entries from `.ai/GOTCHAS.md` and `.ai/memory/*.jsonl`: what was proposed, how it was caught, what changed. **This plan's own §11 gotcha table is an example of the output** | §6.4.1 |
| **6. What stayed human** | Scenario choice, tier boundary (§1), the concurrency mechanism (ADR-0002), the deferral triggers (§3.1c). Naming what was *not* delegated is what makes the rest believable | §1, §3.1c, §5 |

**Two things to do during init, not after:**

1. **`.ai/GOTCHAS.md` and `.ai/memory/*.jsonl` start empty (§6.2) and only have value if they are
   actually written during the build.** Section 5 above cannot be reconstructed at the end — a
   correction that was not logged when it happened is gone. Treat the After-Task Protocol as part of
   the deliverable, not as housekeeping.
2. **Keep the prompts that produced the significant artifacts.** Not a transcript dump — the three
   or four directions that shaped the design, quoted in section 1. The difference between *"I asked
   the AI to build a scheduler"* and *"I gave it a folder-structure SOP, a CQRS directive and a
   concurrency ADR, and rejected its first schema because it made the constraint unenforceable"* is
   the whole dimension.

> `12_ai_collaboration.md` is a HOW document (§5.1) — it is the method someone else could follow.
> Keep the "what happened in this project" specifics in it as evidence, and keep the narrative
> summary itself in the README where the challenge asks for it.

Hard Rules to carry over verbatim: never `console.log` (use `createLogger`); never
`autoincrement()` PK (use UUID); never CORS `['*']`; never put infrastructure code in `common/`.

---

## 7. `docker-compose.yml` + `docker-init/`

Cortex's compose file defines 18 services. Start these:

| Service | Tier | Purpose |
|---|---|---|
| `postgres` | T1 | Primary DB — **and the idempotency store**, see §8.3 |
| `prometheus` | T2 | Metrics scrape |
| `grafana` | T2 | Dashboard + alert rules as code |

Not started here — each is the infrastructure behind a tier this repo has not reached (§1), except
`redis`, which this path simply does not touch: Cortex's idempotency interceptor is Prisma-backed
(§8.3), so Postgres already **is** the idempotency store.

`redis`, `kafka`, `elasticsearch`, `elasticsearch-setup`, `kibana`, `kafka-ui`, `redisinsight`,
`api-gateway`, `fluent-bit`, `embedding`, and all 6 `*-exporter` containers.

`docker-init/`: port `init-dbs.sql` (rewrite to create one DB), `prometheus/prometheus.yml`,
`grafana/provisioning/**`. Drop `elasticsearch/`, `fluent-bit/`, `nginx.conf`.

---

## 8. `apps/scheduler-api` — skeleton only at init

No business logic during init. Port the shape from `apps/core-api` — the tree below matches that
app's **actual** layout (verified 2026-08-10; earlier drafts of this plan invented a `container/`
directory that exists in `auth-service`, not `core-api`, and collapsed `bootstrap/` into `main.ts`).

```
apps/scheduler-api/
├── prisma/
│   ├── schema.prisma             (datasource + generator + IdempotencyRecord — see §8.3)
│   ├── migrations/               (committed — see §8.2)
│   └── seed.ts                   (demo fixtures — see §8.4)
├── prisma.config.ts
├── src/
│   ├── main.ts                   (thin entry — calls bootstrap/server.ts)
│   ├── app.ts                    (Nest app factory)
│   ├── app.module.ts
│   ├── bootstrap/
│   │   ├── fastify.ts            (adapter + plugins)
│   │   ├── server.ts             (listen + graceful shutdown)
│   │   └── swagger.ts            ⚠️ port it — see §8.5
│   ├── config/
│   │   ├── config.module.ts
│   │   ├── env.config.ts
│   │   └── env.validation.ts     (Zod env schema — port the pattern, rewrite keys)
│   ├── common/errors/
│   ├── infrastructure/
│   │   ├── cqrs/
│   │   │   ├── cqrs.module.ts
│   │   │   └── decorators/       (command / query / event handler)
│   │   ├── database/prisma/
│   │   │   ├── prisma.service.ts / prisma.module.ts
│   │   │   ├── prisma-tx-runner.ts / prisma-tx-runner.module.ts
│   │   │   ├── prisma-transient-error.ts (+ .spec.ts)
│   │   │   └── scheduler-api-repos.factory.ts   (was core-api-repos.factory.ts — TxScope wiring)
│   │   ├── http/
│   │   │   ├── controllers/health.controller.ts
│   │   │   ├── filter/global-exception.filter.ts (+ .spec.ts)
│   │   │   ├── interceptors/  (http-logging + .spec.ts, response)
│   │   │   ├── middlewares/trace-context.middleware.ts
│   │   │   ├── pipes/zod-validation.pipe.ts
│   │   │   └── idempotency/   (interceptor + .spec.ts, cleanup service, module)
│   │   └── observability/     (T2: prom metrics)
│   └── modules/               (empty at init)
├── package.json                  (@scheduler/api)
├── tsconfig.json / tsconfig.build.json
├── nest-cli.json
├── eslint.config.mjs             ⚠️ see §8.6
└── .prettierrc / .prettierignore
```

❌ Do not port from `core-api`: `src/generated/**` (regenerated by Prisma), `src/common/tenant/`,
`infrastructure/{grpc,kafka,messaging,outbox,saga-compensation,scheduled-jobs}/`,
`http/{guards,decorators,types}/` (auth/org — T4 or RBAC-only), `bootstrap/grpc.ts`,
`http/middlewares/tenant-context.middleware.ts`.

❌ Do not port the `test:e2e` script — it points at `./test/jest-e2e.json`, which **does not exist**
in Cortex's `core-api`. Either write a real e2e config or drop the script; do not ship a broken one.

### 8.1 Prisma models required at init

`schema.prisma` is **not** empty at init. Two things must exist before the skeleton typechecks and
before the concurrency decision can be written down:

| Model | Why at init |
|---|---|
| `IdempotencyRecord` | §8.3 — the ported interceptor will not compile without it |
| Domain models (`Customer`, `Vehicle`, `Dealership`, `ServiceType`, `ServiceBay`, `Technician`, `Appointment`) | Needed by §8.2's first migration and §8.4's seed. Fields can stay minimal, but the **table shapes are a design decision, not scaffolding** — see §8.2. |

### 8.2 Migrations, not `db push` — and the anti-double-booking constraint

Cortex ships `db:push` only (no `migrations/` folder). That is fine for a platform being reshaped
daily; it is the wrong signal for a challenge whose deliverable is *"a persistent database"*. Use
`prisma migrate dev` and **commit `prisma/migrations/`** — a reviewer can then read the schema's
history, and the CI-style verification in §10 becomes reproducible.

This matters more than tooling taste, because **the double-booking guarantee lives in a migration**:

- The application-level availability check (Scenario A requirement 2) is a read — under concurrent
  requests it is a TOCTOU race, and no amount of service-layer code closes it alone.
- The closing move is a **database-level constraint** on `Appointment`: an exclusion constraint over
  (`serviceBayId`, time range) and (`technicianId`, time range), or a unique index over a discrete
  slot key if time is slotted. Postgres `EXCLUDE USING gist` with `tstzrange` needs `btree_gist` —
  which means **raw SQL inside a Prisma migration**, and that is exactly why `db push` is not enough.
- Retry on the resulting conflict reuses `prisma-transient-error.ts` (§3.1) and the TxScope retry
  boundary from ADR-0001.

**Chose the constraint shape during init, not during implementation** — it determines `Appointment`'s
columns, and it is the substance of ADR-0002.

### 8.3 Idempotency is Postgres-backed — no Redis

Verified in `core-api/src/infrastructure/http/idempotency/idempotency.interceptor.ts`: it injects
`PrismaService` and reads/writes `prisma.client.idempotencyRecord` (lines 72, 87, 106, 117). There is
no Redis anywhere in that path.

Consequences, all already reflected above: no `redis` container (§7), no `REDIS_*` env keys (§2.7),
and `IdempotencyRecord` must be in `schema.prisma` **at init** (§8.1) or the ported interceptor fails
typecheck on the very first `npx turbo typecheck`.

Directly relevant to Scenario A: a double-submitted booking form must not create two appointments.

### 8.4 Seed data — required for the deliverable to be demoable

Not in Cortex (`core-api/prisma/` contains only `schema.prisma`) — write it here.

A reviewer's path is `docker compose up -d` → migrate → run → cURL. With an empty database there is
nothing to book against. `prisma/seed.ts` must create at least: one dealership, 2–3 service bays,
2–3 technicians with differing qualifications (requirement 2 says *"a qualified Technician"* — the
seed has to make qualification visible), a few service types with realistic durations, and one
customer with a vehicle. Wire it as `db:seed` in `package.json` and reference it in the README's
run instructions and in `docs/09_devops_infrastructure.md`.

### 8.5 Swagger / OpenAPI

`core-api/src/bootstrap/swagger.ts` exists — port it. The challenge names an **OpenAPI spec** as an
accepted way to stub the client layer, and §5 already plans `docs/06_api_contracts.md`. A live
`/docs` endpoint plus a committed spec covers the "mock or stub the other layer" requirement with
almost no extra work.

### 8.6 `eslint.config.mjs`

⚠️ **Port the architectural boundary rules.** Cortex's core-api config uses
`@typescript-eslint/no-restricted-imports` to forbid the domain layer from importing NestJS,
Fastify, Prisma, `@/generated`, `@/infrastructure/**`, `@/common/**`, or sibling layers. This is the
lint-enforced Hexagonal boundary claimed on the CV — port it and translate the Vietnamese rule
messages to English (see §11 gotcha 8 for the wider translation sweep).

❌ Do not port: `main.lambda.ts`, `serverless.yml` (Cortex AWS Lambda artifacts).

---

## 9. Global find-and-replace after all files are in place

Run across the whole tree; each must return **zero** hits when done:

| Find | Replace |
|---|---|
| `@distributed-social-platform/shared-kernel` | `@scheduler/shared-kernel` |
| `@distributed-social-platform/` | `@scheduler/` |
| `distributed-social-platform` | `keyloop-service-scheduler` |
| `core-api` / `CORE_` | `scheduler-api` / `SCHEDULER_` |
| `core_db` | `scheduler_db` |
| `Cortex` | `Keyloop Service Scheduler` |
| `knowledge` / `credit` / `tenant` / `engagement` | (must not appear — audit each hit) **Scope: `packages/`, `apps/`, `docs/`, `directives/` only.** |

> ⚠️ **Do not run the domain-word sweep over `.ai/`.** "knowledge" is legitimate vocabulary of the
> AI workflow itself — `.ai/KNOWLEDGE_INDEX.md`, `.ai/KNOWLEDGE_ARCHITECTURE.md`,
> `.ai/knowledge_builder.py`, and the `knowledge:build` task inside `scripts/sync.cjs`. An unscoped
> grep flags the entire workflow as Cortex residue and buries the real hits.

---

## 10. Verification — init is done when all of these pass

```bash
npm install                       # workspaces resolve, no missing @scheduler/* refs
docker-compose up -d              # postgres + prometheus + grafana only, all healthy, NO redis
npm run db:migrate                # applies prisma/migrations incl. the anti-double-booking constraint
npm run db:seed                   # dealership + bays + technicians + service types + vehicle
npx turbo build                   # shared-kernel compiles; all 5 barrels resolve
npx turbo typecheck               # zero errors — IdempotencyRecord must exist or this fails
npx turbo lint                    # boundary rules load without crashing
npx turbo test                    # ported shared-kernel specs are GREEN, not zero
node scripts/sync.cjs             # exits 0, no .gitmodules error
node .claude/hooks/turn-context.cjs  # valid JSON, exits 0, no .gitmodules error
python .ai/knowledge_builder.py   # regenerates KNOWLEDGE_INDEX.md
```

Then, with the app running: `GET /health` responds, `GET /docs` serves the OpenAPI UI (§8.5).

Then manual checks:

- [ ] `grep -ri "distributed-social-platform" . --exclude-dir=node_modules` → **0 hits**
- [ ] `grep -ri "cortex" directives/ docs/ .ai/ apps/ packages/ --exclude-dir=node_modules` → **0 hits**
- [ ] `grep -ri "knowledge\|credit\|tenant\|engagement" directives/ docs/ apps/ packages/ --exclude-dir=node_modules`
      → every hit reviewed. **`.ai/` is excluded on purpose — see the note in §9.**
- [ ] No Vietnamese text left in `apps/`, `packages/`, `directives/`, `docs/` (§11 gotcha 8)
- [ ] `.ai/KNOWLEDGE_INDEX.md` regenerated, lists only this repo's directives/docs
- [ ] `.ai/memory/*.jsonl` all exist and are **empty**
- [ ] `.gitmodules` does **not** exist
- [ ] `git status` clean after a full build (no generated files untracked)
- [ ] Fresh-clone test: `git clone` to a temp dir → `npm install && npm run check` passes

---

## 11. Known gotchas — carried from Cortex, verified

| # | Gotcha | Mitigation |
|---|---|---|
| 1 | `sync.cjs` assumes git submodules | §6.3 — must be rewritten, not copied |
| 2 | shared-kernel has **five** barrels, not one: `src/index.ts`, `cqrs/index.ts`, `messaging/index.ts`, `messaging/events/index.ts`, `messaging/routing/index.ts` | Root `index.ts` does `export * from './cqrs/index.js'` — copying the bus files without `cqrs/index.ts` is a build failure. Rewrite `src/index.ts` **last**, after all files exist. Delete the three `messaging/*` barrels with the rest of `messaging/` at T1/T2 (§3.1a). |
| 3 | `.gitignore` ignores `.ai/memory/` | Intentional. Memory is local. Keep the two `!` negations for the index and builder. |
| 4 | `routing/maps.ts` uses `Record<EventTypeValue, …>` (exhaustive) | Deleting an `EventType` without updating both maps is a **compile error**. Delete all three together or none. |
| 5 | `.env.example` is hand-synced with each service's Zod schema | Rewriting env keys means updating `config/env.*.ts` in the same pass |
| 6 | `turn-context.cjs` points the agent at `directives/README.md` | That file must exist and its index must be accurate, or the hook sends the agent to a dead link |
| 7 | Cortex `docs/adr/README.md` declares ADRs immutable | Keep that convention — the challenge rewards visible design reasoning |
| 8 | **Vietnamese comments are far wider than the eslint messages.** Measured 2026-08-10: **75 occurrences across 14 files** in `packages/shared-kernel/src`, plus 19 across 6 files in `core-api/src/infrastructure`. The heaviest files are `cqrs/command-bus.spec.ts` (22), `resilience/prisma-transient-error.spec.ts` (8), `cqrs/event-bus.spec.ts` (6) — i.e. **exactly the specs §3.1b ports as test evidence**, which is what a reviewer opens to judge "a suite of tests". `logger/index.ts` and `auth/*-permissions.ts` also carry them. | Budget a real translation pass, not a find-and-replace. Run it **after** the port and **before** the first commit; add "no Vietnamese in `apps/`/`packages/`/`docs/`/`directives/`" to the §10 checklist. |
| 9 | **`shared-kernel` is ESM, the app and the root are CommonJS.** Verified: `shared-kernel/package.json` has `"type": "module"` with `module`/`moduleResolution: NodeNext` and `.js` suffixes on every relative import; root `package.json` is `"type": "commonjs"` and `core-api` declares no `type` at all (→ CJS, `nest build`). Jest bridges the gap with overrides *inside* `shared-kernel/package.json`: `tsconfig: { module: "CommonJS" }` plus `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}`. | Do not "tidy" any of it. Dropping a `.js` suffix breaks the NodeNext build; deleting the Jest overrides breaks the specs; adding `"type": "module"` to the app breaks Nest. Note also `shared-kernel/tsconfig.json` has `exclude: ["**/*.spec.ts"]` — the specs ported in §3.1b are compiled by ts-jest only, never by `turbo build`, so a spec can be red while `turbo build` is green. Record this asymmetry in `AGENTS.md`. |

---

## 12. Execution order

1. §0 decisions confirmed → §1 tier chosen → **§8.2 constraint shape chosen** (it drives the schema)
2. Root scaffolding (§2) — `npm install` must succeed before anything else
3. `shared-kernel` (§3): as-is files → sub-barrels (§3.1a) → specs (§3.1b) → stripped files (§3.2)
   → **`src/index.ts` last**
4. `npx turbo build` + `npx turbo test` green before touching the app
5. Docker (§7) + `schema.prisma` (§8.1) + first migration (§8.2) + seed (§8.4)
6. `apps/scheduler-api` skeleton (§8) — boots, `/health` responds, `/docs` serves OpenAPI
7. AI workflow (§6) — **`sync.cjs` (§6.3) and `turn-context.cjs` (§6.1.1) are the two risk items**
8. `directives/` + `docs/` scaffolds (§4, §5) — What/Why/How convention stated in `docs/README.md`
   (§5.1), `00_overview.md` + `12_ai_collaboration.md` created, ADR **0001 ported, 0002 authored**
9. Vietnamese translation pass (§11 gotcha 8) → global replace (§9) → full verification (§10)
10. `git init`, first commit, move this file to `.ai/plans/init-source.plan.md`

Throughout, not at the end: log to `.ai/GOTCHAS.md` + `.ai/memory/*.jsonl` as things are learned
(§6.4.2), and fill `docs/03_* § Deferred scope` as each tier boundary is hit (§1, §3.1c). Both are
inputs to deliverables that cannot be reconstructed afterwards.

**Only after §10 is fully green:** write the System Design Document and start the scheduler domain.

---

## 13. Challenge deliverables — what init must leave a home for

Init does not produce these, but every one of them needs a place to land. Anything without a row
here has no owner and will be discovered missing at the end.

### 13.1 The three submitted artifacts

| # | Deliverable | Lands in | Prepared at init? |
|---|---|---|---|
| 1 | **System Design Document** | `docs/03_system_architecture_diagrams.md`, supported by `04_database_schema.md`, `06_api_contracts.md`, `09_devops_infrastructure.md` and both ADRs | ✅ Scaffolded (§5) |
| 2 | **Working code + README** | repo root + `apps/scheduler-api` | ✅ §2.10, §8 |
| 3 | **Video, 5–10 min** | not in the repo | ❌ **No init artifact — see §13.3** |

### 13.2 Required sections, mapped

The PDF names specific contents. Each maps to something this plan already creates:

| Required by the challenge | Where it comes from |
|---|---|
| Architecture diagram | `docs/03_*` — Mermaid, committed as text so it diffs |
| Component roles + data flow | `docs/03_*` + `folder_structure_sop.md` (§4) |
| Technology choices **with justification** | `docs/03_*`; the "why" for Postgres/Prisma/Nest/CQRS is already implicit in §0 — write it down there |
| **Observability strategy** | T2 (§1): `createLogger` + trace-context middleware + `/metrics` + Grafana. `observability_monitoring.md` (§4) is the standard behind it |
| **How GenAI assisted the design phase** (a section of the SDD, separate from the README narrative) | Summarises `docs/12_ai_collaboration.md` §1–2 (§6.4.2); this file itself is the design-phase exhibit |
| README: build / run / test instructions | `RUN.md` + `SETUP.md` (§2.9) feed it; must include `db:migrate` and `db:seed` (§8.2, §8.4) |
| README: **AI Collaboration Narrative** | Summarises `docs/12_ai_collaboration.md` (§6.4.2), written last from the artifacts in §6.4.1 |
| First-read orientation (not required, but it is what a reviewer opens first) | `docs/00_overview.md` + the What/Why/How convention (§5.1) |
| Tests validating **core business logic** | §3.1b ported specs + the concurrent-booking test (`docs/08_*`). The ported specs cover the *kernel*; the double-booking test is the one that covers the *scenario*, and it is the single most important test in the submission |
| Documented assumptions (the PDF's "Note on Ambiguity") | `docs/01_business_requirements.md` — add an **Assumptions** heading at init so ambiguities get written down as they are hit, not recalled at the end |

### 13.3 Video — the only deliverable with no repo home

5–10 minutes covering: intro + scenario · design and implementation walkthrough · AI collaboration
story (1–2 min) · live demo · what was learned. Two init-time consequences:

1. **The demo must be runnable from a clean clone**, or there is nothing to film. That is exactly
   what §10's fresh-clone check and §8.4's seed exist for — treat them as video prerequisites,
   not as nice-to-haves.
2. **Keep a running notes file** for the "challenges faced" segment. `.ai/GOTCHAS.md` already serves
   this purpose if it is actually maintained (After-Task Protocol, §6.4) — the honest debugging
   stories live there, and they are the hardest part of the video to invent afterwards.

### 13.4 Evaluation dimensions → artifacts

| Dimension | Carried by |
|---|---|
| Problem Solving & System Design | `docs/03_*` incl. **`§ Deferred scope`**, ADR-0001 + ADR-0002, and the §1 tier sequence — the capabilities held back are stated with their triggers (§3.1c), so the boundary reads as sequencing rather than omission |
| Technical Execution | Hexagonal boundaries lint-enforced (§8.6), TxScope/UoW (§3.1), DB-level booking constraint (§8.2), green tests |
| AI Engineering & Verification | `docs/12_ai_collaboration.md` (§6.4.2), backed by the artifact trail in §6.4.1 |
| Communication & Presentation | `docs/00_overview.md` + the What/Why/How convention (§5.1), README, SDD, ADR immutability convention (gotcha 7), video |
