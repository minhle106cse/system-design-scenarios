# Agent Instructions — Service Appointment Scheduler

> **AGENTS.md is the canonical agent instruction file.** `CLAUDE.md` is a thin pointer so the same
> instructions load in any AI environment. Edit instructions here.
>
> For the full picture of how this project's knowledge is organized — what goes in `docs/` vs
> `directives/` vs `.ai/` vs agent memory, and the rules that keep them from rotting — read
> **`.ai/KNOWLEDGE_ARCHITECTURE.md`** (the meta-doc). This file is the operating summary.

## 📦 Project Context — Service Appointment Scheduler

**Scenario 01** in a personal collection of real-world system-design scenarios (see the parent
`system-design-scenarios/` repo's README for how the collection is organized — each subfolder is
one self-contained scenario, built to the same senior-level bar).

⚠️ **The requirement this code answers to is `KeyloopCodingChallange.pdf` § *Scenario A: The Unified
Service Scheduler*, tracked at the repo root.** The collection framing is where the repo *lives*;
the PDF is what it must *satisfy*. When the two appear to disagree, the PDF wins — `readme.md`
quotes its three core requirements verbatim and maps each to the code and the test that proves it,
and `docs/01_business_requirements.md` logs every assumption made where it was ambiguous. Read the
requirement before changing behaviour that one of those rows depends on.

This scenario: a resource-constrained **appointment scheduler** for vehicle service. Given a
customer, vehicle, service type, dealership, and desired time, it checks real-time availability of
both a **service bay** and a **qualified technician** for the full service duration, and creates a
persistent, non-overlapping appointment record. Single service, backend implementation — see
`readme.md` for scope.

This repo's monorepo tooling, AI-agent workflow, and shared-kernel were **ported from Cortex**
(`distributed-social-platform`), stripped to the single bounded problem this scenario asks for —
no submodules, no message broker, no second service. The full reasoning for every inclusion and
every deferral lives in `.ai/plans/init-source.plan.md`. Do NOT reintroduce Cortex's business
domain (knowledge hub, credits, tenancy, RAG) — none of it applies here.

- **Stack**: Turborepo monorepo, TypeScript, npm workspaces. One NestJS + Fastify service
  (`apps/scheduler-api`), PostgreSQL (Prisma v7, port configurable via `.env` — see
  `.env.example`). Postgres is also the idempotency store (no Redis). Prometheus + Grafana for
  observability. Patterns in use: CQRS (command/query bus), Unit-of-Work (TxScope), HTTP
  idempotency (claim-before-execute), a Postgres exclusion constraint for the anti-double-booking
  guarantee.
- **Source of truth for product/business**: `.ai/KNOWLEDGE_INDEX.md` → then the specific
  `docs/NN_*.md` → `readme.md`.
- `SETUP.md` records **how this codebase was assembled** from the Cortex base — read it before
  assuming a piece of infrastructure works the way a from-scratch NestJS app would.

## 🧠 Session Start Protocol (do this first)

1. **Read `.ai/KNOWLEDGE_INDEX.md`** — the whole project context (overview, live status, directive
   map, docs map). One read instead of grepping the codebase blind.
2. **When debugging, or designing in an area you may have burned on before** — read
   `.ai/GOTCHAS.md` (generated, newest first). **Not** for questions or small fixes. Need the
   untruncated text of an entry? `grep` `.ai/memory/*.jsonl`.
3. **Before creating/modifying code**, read the relevant `directives/*.md` for that area.

> **Budget honestly.** Full compliance costs real tokens before any work starts, more if you also
> pull gotchas. That is cheap insurance on an architecture task and pure waste on a typo fix — the
> table under *Task Classification* below says which is which.

> The `UserPromptSubmit` hook (`.claude/hooks/turn-context.cjs`) injects **turn-local state** —
> branch, uncommitted paths, outstanding After-Task debt — plus a one-line routing pointer. It
> deliberately does **not** restate this file: a hook that repeats a static rule the model has
> already read changes nothing. Still a nudge, not a substitute for step 3.

## 🗂️ How this project's knowledge is organized (the boundary that matters)

Two families of Markdown, split by **purpose**, not by "who reads it" (agents and humans read both)
— this is also the What/Why/How convention in `.ai/plans/init-source.plan.md` §5.1:

| | `docs/` — **Design & Spec** (the WHAT & WHY) | `directives/` — **SOP & Rules** (the HOW) |
|---|---|---|
| Answers | "What is the system, why does it exist, what must it do, how is it run/secured?" | "When I write code, what rule must I not violate?" |
| Reader intent | Understand / operate / deploy / audit the system | Execute — write code that complies |
| Style | Complete, narrative, diagrams, tables, rationale, audit trail | Terse, imperative, litmus-driven, lists 'known exceptions' |
| Changes when | Requirements / architecture intent / API contract / schema / observability posture changes | A convention or pattern is established or refined |
| Litmus | *"Would a new engineer need this to understand or run the system?"* → `docs/` | *"Would an agent about to write a file violate something without this?"* → `directives/` |

`.ai/` is the **machine-maintained knowledge layer** (generated index + curated status + experience
buffer). Agent **memory** (`~/.claude/.../memory/`) holds **who the user is + how they want me to
work** — never project facts that belong in the repo. Full routing rules:
`.ai/KNOWLEDGE_ARCHITECTURE.md`.

## ⚙️ How the AI workflow actually runs

Two Claude Code hooks (`.claude/settings.json`) automate the loop:

- **`UserPromptSubmit` → `.claude/hooks/turn-context.cjs`** — injects branch + uncommitted paths +
  After-Task debt. State, not prose. (Ported from Cortex with the submodule-descent logic removed
  — this repo has no `.gitmodules`, see `.ai/plans/init-source.plan.md` §6.1.1.)
- ⚠️ **This scenario is a subdirectory of the `system-design-scenarios` repository, not its own
  repo.** Both hooks therefore read `git status --short --porcelain` (repo-root-relative, and
  independent of the `status.relativePaths` config) and map each path back to scenario-relative,
  dropping anything outside this folder — a change in a sibling scenario is not this scenario's
  After-Task debt. Before that normalisation existed, every path arrived prefixed with
  `service-appointment-scheduler/`, was joined onto the scenario root a second time, resolved to
  nothing, and both checks silently reported "nothing to log". **If you change how either hook reads
  git status, re-verify by planting a probe source file** — this failure mode is invisible in the
  output.
- **`Stop` → `scripts/sync.cjs`** — after every response, detects what changed and runs only what's
  needed: rebuild `shared-kernel` (if its `src/` changed), `prisma generate` (if a schema changed),
  and **regenerate `.ai/KNOWLEDGE_INDEX.md`** (if `directives/`, `docs/`, `.ai/memory/`, or
  `PROJECT_STATUS.md` changed). Two checks **BLOCK the turn from ending** (`decision: "block"`),
  each guarded to fire at most once per state so neither loops forever:
  - **After-Task discipline** — source files changed with **no newer `.ai/memory/*.jsonl` entry**.
    **Touching `.ai/PROJECT_STATUS.md` does not clear it**: the memory entry is step 1 (mandatory,
    every task), the status file is step 4 (conditional), and while the status file counted, the
    check could be satisfied by the artifact least likely to carry a reusable lesson. Guard file
    `.ai/.after-task-guard`.
  - **`AGENTS.md`/`CLAUDE.md` drift** — `AGENTS.md` changed without `CLAUDE.md` in the same change.
    Upgraded from warn-only: a rule only a human enforces is not a rule this project actually has.
    Guard file `.ai/.claude-drift-guard`.

  If either genuinely doesn't apply (no entry warranted; the `AGENTS.md` edit touched a section
  `CLAUDE.md` doesn't mirror), say so explicitly and continue — the guard lets the turn end on the
  second pass either way. Worktree-topology warnings stay warn-only, to the user. (Also ported with
  submodule logic removed — see
  `.ai/plans/init-source.plan.md` §6.3.)
- Both hooks skip the three test suffixes (`*.spec.ts`, `*.int-spec.ts`, `*.e2e-spec.ts`) when
  deciding what counts as changed source, and their file lists must stay identical — they are two
  halves of one check, and if they disagree the turn opens with "no debt" and ends with a block.

`.ai/knowledge_builder.py` is the generator; `sync.cjs` runs it with **host `python`** (it probes
`python`/`python3`/`py`). Run TypeScript via **`turbo`** (`npm run check` = `typecheck lint
format:check`). Use `docker exec <container>` only to reach **infra containers** (Postgres) during
smoke tests — there is no agent sandbox and nothing here needs one.

## ⛔ Hard Rules (real, enforced)

- **Never** `console.log` — use the structured logger (`createLogger` from `@scheduler/shared-kernel`).
- **Never** `autoincrement()` primary keys — UUID (`@default(uuid(7))`).
- **Never** CORS wildcard `['*']` — origins from env (`CORS_ALLOWED_ORIGINS`).
- **Never** put infrastructure code in `common/` — `common/` is abstractions only (see
  `directives/folder_structure_sop.md`; layer boundaries are lint-enforced in `apps/scheduler-api`).
- **Never** place a repository interface by eye. Write port (has a mutating method) ->
  `domain/repositories/`. Read-only port -> `domain/repositories/` **only if** a `domain/` file
  imports it, else `application/repositories/` as `<module>.query-repository.ts`. Full 2-step
  procedure: `directives/cqrs_pattern.md`; **machine-checked by `npm run check:arch`**, which also
  blocks the Stop hook (the eslint layer boundary only matches the `@/` alias form, not a relative
  `../../application/...` import).
- Entities: UUID PK, `camelCase` in code / `@map("snake_case")` in DB, soft delete via `deletedAt`.
- Zod is the **only** input-validation library, applied per-route via `ZodValidationPipe`
  (`infrastructure/http/pipes/zod-validation.pipe.ts`) — no global validation pipe.
- **Never** touch the two hand-added exclusion constraints in the first Prisma migration
  (`appointments_service_bay_no_overlap`, `appointments_technician_no_overlap`) via `prisma db
  push` or by regenerating the migration — they are raw SQL Prisma cannot express and will be
  silently dropped by any tool that doesn't know about them. See `docs/adr/0002-booking-concurrency-control.md`.

## 🧭 Task Classification

| Task | `KNOWLEDGE_INDEX` | `GOTCHAS.md` | Directive |
|---|---|---|---|
| Question / explain / review code | ✅ | ❌ | if area-specific |
| Small fix / format / comment | ✅ | ❌ | — |
| Debug build/test/runtime error | ✅ | ✅ | — |
| Design a pattern / refactor architecture | ✅ | ✅ | ✅ |
| Implement a complex new feature | ✅ | ✅ | ✅ |

The ❌ are deliberate, not laziness: gotchas are a *"have I hit this before?"* lookup and buy
nothing on a question or a typo fix.

## 📎 Citation Protocol (plans must cite their sources)

Any implementation plan you generate MUST contain a **"References & Compliance"** section listing
exactly which `directives/*.md` SOP files and which `docs/NN_*.md` business files you read, and where
each decision's logic came from. A plan missing this section may be rejected outright. This exists to
keep plans grounded in the project's actual rules instead of improvised ones — and it is the
concrete artifact behind this scenario's AI Collaboration Narrative
(`docs/12_ai_collaboration.md`, `.ai/plans/init-source.plan.md` §6.4.1).

**Where plans live: `.ai/plans/<phase>.plan.md`, committed.** A plan kept only in a chat transcript
or a tool's scratch directory is not evidence of anything — `init-source.plan.md` §6.4.1 calls the
committed plans the *primary exhibit* for the AI-collaboration criterion, and an exhibit that isn't
in the repository doesn't exist. Applies to any phase big enough to warrant a plan at all; a typo
fix does not.

**Do not retouch a plan after execution.** If it predicted something that turned out wrong, leave
the wrong prediction in and annotate it — that contradiction *is* the evidence
(`docs/12_ai_collaboration.md` §5). Rewriting a plan to match what actually happened converts the
audit trail into fiction. Same reasoning as `docs/adr/README.md`'s immutability convention, and the
reason `init-source.plan.md` is left untouched even where it is now dated.

Current plans: [`init-source.plan.md`](.ai/plans/init-source.plan.md) (port the base),
[`booking-domain.plan.md`](.ai/plans/booking-domain.plan.md) (the scheduler domain),
[`hardening.plan.md`](.ai/plans/hardening.plan.md) (post-audit hardening),
[`submission-readiness.plan.md`](.ai/plans/submission-readiness.plan.md) (commit history, the read
path, the e2e suite, CI), plus [`video-runbook.md`](.ai/plans/video-runbook.md), which is a runbook
rather than an implementation plan and so carries no *References & Compliance* section.

## 📝 After-Task Protocol (run every non-trivial task — don't wait to be asked)

1. **Log the lesson** — append one JSON line to the right `.ai/memory/<category>.jsonl`:
   - `errors.jsonl` — build/test/runtime error → solution
   - `architecture.jsonl` — design decisions (reactive **and** proactive "chose A over B")
   - `conventions.jsonl` — new coding conventions
   - `gotchas.jsonl` — framework/library gotchas
   - Canonical format (one shape for all four files):
     `{"timestamp","type","title","detail","context"}` — `context` optional. For a decision, the
     choice goes in `title`, the rationale + rejected alternatives in `detail`. Full rules:
     `directives/memory_sop.md`.
2. **Update the rule** — if a convention/pattern was established or refined, edit the relevant
   `directives/*.md` **now**, not later.
3. **Reconcile the spec (the docs forcing-function)** — if the change touches **schema, API
   contract, or observability posture**, update the matching living-spec doc *in the same task*:
   `docs/04_database_schema.md`, `docs/06_api_contracts.md`, `docs/09_devops_infrastructure.md`,
   `docs/03_system_architecture_diagrams.md`. **Do not leave a design doc contradicting the
   code.** (Stable-intent docs — 01 business requirements, 02 use-cases — only change when the
   intent itself changes.)
4. **Update live status** — if a module/phase changed, edit `.ai/PROJECT_STATUS.md`.
5. The `Stop` hook then regenerates `.ai/KNOWLEDGE_INDEX.md` automatically. Only run
   `python .ai/knowledge_builder.py` by hand if you need to see the regenerated index immediately.

*Be pragmatic. Be reliable. Keep the docs honest.*
