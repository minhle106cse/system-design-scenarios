# Agent Instructions — Demand-Driven Staff Scheduler

> **AGENTS.md is the canonical agent instruction file.** `CLAUDE.md` is a thin pointer so the same
> instructions load in any AI environment. Edit instructions here.
>
> For the full picture of how this project's knowledge is organized — what goes in `docs/` vs
> `directives/` vs `.ai/` vs agent memory, and the rules that keep them from rotting — read
> **`.ai/KNOWLEDGE_ARCHITECTURE.md`** (the meta-doc). This file is the operating summary.

## 📦 Project Context — Demand-Driven Staff Scheduler

**Scenario 02** in a personal collection of real-world system-design scenarios (see the parent
`system-design-scenarios/` repo's README for how the collection is organized).

⚠️ **The requirement this code answers to is
[`SWE_Take-Home_Staff_Scheduling_System.pdf`](SWE_Take-Home_Staff_Scheduling_System.pdf)**, tracked
at the repo root. The collection framing is where the repo *lives*; the PDF is what it must
*satisfy*. When the two appear to disagree, the PDF wins — `docs/01_business_requirements.md`
quotes it verbatim and logs every assumption made where it was ambiguous.

A store manager plans a weekly staff schedule from historical transaction demand: add staff and
their weekly-hours cap, upload a CSV of hourly transaction counts, define shifts, click
auto-schedule, and read the resulting roster and its coverage/fairness diagnostics. Single-user,
single-process — see `readme.md` for scope.

This repo's monorepo tooling and AI-agent workflow were **ported from
`../service-appointment-scheduler/`** (scenario 01), and so — after a reversal — is most of its
stack. `init-source.plan.md` §0.0 originally trimmed scenario 01's stack away entirely (no
Turborepo, no NestJS/Fastify, no PostgreSQL/Docker, no CQRS bus, no shared-kernel), arguing none of
the brief's five grading criteria is infrastructure. **The user overruled that**: this collection's
own standard is that a scenario ships a real backend design. `.ai/plans/backend-architecture-reversal.plan.md`
is the governing plan; §0 records the overruled argument verbatim rather than deleting it.

- **Stack**: npm workspaces + **Turborepo**, TypeScript. **`apps/scheduler-api`** — NestJS +
  Fastify, CQRS + Hexagonal, **PostgreSQL** via Prisma, **Docker** (Postgres only), Jest — owns all
  persistence and business orchestration. **`apps/web`** — Next.js 15, App Router, Tailwind,
  Vitest — **UI only, owns no database**, reaches the API through `src/lib/api-client.ts`.
  **`packages/shared-kernel`** — the CQRS bus / Unit-of-Work / logger / resilience, ported from
  scenario 01. The algorithm lives in **`packages/scheduling-core`**, a
  **zero-runtime-dependency** package (plan §2.1) — no React, no Prisma, no date library, no
  `Date.now()`/`Math.random()` — and is the one thing the reversal left completely untouched
  (ADR-0004).
- **Source of truth for product/business**: `.ai/KNOWLEDGE_INDEX.md` → then the specific
  `docs/NN_*.md` → `readme.md`.

## 🧠 Session Start Protocol (do this first)

1. **Read `.ai/KNOWLEDGE_INDEX.md`** — the whole project context (overview, live status, directive
   map, docs map). One read instead of grepping the codebase blind.
2. **When debugging, or designing in an area you may have burned on before** — read
   `.ai/GOTCHAS.md` (generated, newest first). **Not** for questions or small fixes. Need the
   untruncated text of an entry? `grep` `.ai/memory/*.jsonl`.
3. **Before creating/modifying code**, read the relevant `directives/*.md` for that area.

> **Budget honestly.** Full compliance costs real tokens before any work starts. That is cheap
> insurance on an architecture task and pure waste on a typo fix — see *Task Classification* below.

> The `UserPromptSubmit` hook (`.claude/hooks/turn-context.cjs`) injects **turn-local state** —
> branch, uncommitted paths, outstanding After-Task debt — plus a one-line routing pointer. It
> deliberately does **not** restate this file. Still a nudge, not a substitute for step 3.

## 🗂️ How this project's knowledge is organized (the boundary that matters)

Two families of Markdown, split by **purpose**, not by "who reads it":

| | `docs/` — **Design & Spec** (the WHAT & WHY) | `directives/` — **SOP & Rules** (the HOW) |
|---|---|---|
| Answers | "What is the system, why does it exist, what must it do?" | "When I write code, what rule must I not violate?" |
| Reader intent | Understand / operate / audit the system | Execute — write code that complies |
| Style | Complete, narrative, diagrams, tables, rationale | Terse, imperative, litmus-driven, lists 'known exceptions' |
| Changes when | Requirements / architecture intent / API contract / schema changes | A convention or pattern is established or refined |
| Litmus | *"Would a new engineer need this to understand or run the system?"* → `docs/` | *"Would an agent about to write a file violate something without this?"* → `directives/` |

`.ai/` is the **machine-maintained knowledge layer** (generated index + curated status + experience
buffer). Agent **memory** (`~/.claude/.../memory/`) holds **who the user is + how they want me to
work** — never project facts that belong in the repo. Full routing rules:
`.ai/KNOWLEDGE_ARCHITECTURE.md`.

## ⚙️ How the AI workflow actually runs

Two Claude Code hooks (`.claude/settings.json`) automate the loop:

- **`UserPromptSubmit` → `.claude/hooks/turn-context.cjs`** — injects branch + uncommitted paths +
  After-Task debt. State, not prose.
- ⚠️ **This scenario is a subdirectory of the `system-design-scenarios` repository, not its own
  repo.** Both hooks therefore read `git status --short --porcelain` (repo-root-relative) and map
  each path back to scenario-relative, dropping anything outside this folder — a change in a
  sibling scenario is not this scenario's After-Task debt. **If you change how either hook reads
  git status, re-verify by planting a probe source file** (plan §5's acceptance check) — a broken
  normalisation here reports "no debt" while actually blind, and that is exactly the incident
  `../service-appointment-scheduler`'s commit `ddc46b2` records.
- **`Stop` → `scripts/sync.cjs`** — after every response, detects what changed and runs only what's
  needed: typecheck `scheduling-core` (if its `src/` changed), `prisma generate` (if the schema
  changed), and **regenerate `.ai/KNOWLEDGE_INDEX.md`** (if `directives/`, `docs/`,
  `.ai/memory/`, or `PROJECT_STATUS.md` changed). Two checks **BLOCK the turn from ending**, each
  guarded to fire at most once per state:
  - **After-Task discipline** — source files changed with **no newer `.ai/memory/*.jsonl` entry**.
    **Touching `.ai/PROJECT_STATUS.md` does not clear it.** Guard file `.ai/.after-task-guard`.
  - **`AGENTS.md`/`CLAUDE.md` drift** — `AGENTS.md` changed without `CLAUDE.md` in the same
    change. Guard file `.ai/.claude-drift-guard`.

  If either genuinely doesn't apply, say so explicitly and continue — the guard lets the turn end
  on the second pass either way. Worktree-topology warnings stay warn-only, to the user.
- Both hooks skip both test suffixes (`*.spec.ts`, `*.prop-spec.ts`) when deciding what counts as
  changed source, and their file lists must stay identical — two halves of one check.

`.ai/knowledge_builder.py` is the generator; `sync.cjs` runs it with **host `python`** (it probes
`python`/`python3`/`py`). Run TypeScript through **Turborepo** from the root — `npm run typecheck`,
`npm run lint`, `npm run test`, or `npm run check` (typecheck + lint + format:check together) fan
out across all four workspaces.

## ⛔ Hard Rules (real, enforced)

- **Never** add a runtime dependency to `packages/scheduling-core` — `dependencies` must stay `{}`
  (plan §2.1). `eslint.config.js` in that package fails the build on `react`, `next`, `@prisma/client`,
  or `zod` imports — this is the single most important rule in the repo; see plan §0.1 for why.
- **Never** validate input inside `scheduling-core` or a command/query handler — Zod at the
  controller boundary, via `ZodValidationPipe`, is the only validation layer
  (`directives/zod_validation.md` §4).
- **Never** call `prisma.*` from anywhere except a repository
  (`apps/scheduler-api/src/modules/*/infrastructure/repositories/`) —
  `directives/domain_modeling.md` §2, `directives/cqrs_pattern.md`. Eslint enforces the layer
  boundaries (`apps/scheduler-api/eslint.config.mjs`).
- **Never** place a repository interface by eye. Write port (has a mutating method) ->
  `domain/repositories/`. Read-only port -> `domain/repositories/` **only if** a `domain/` file
  imports it, else `application/repositories/` as `<module>.query-repository.ts`. Full 2-step
  procedure: `directives/cqrs_pattern.md`; **machine-checked by `npm run check:arch`**, which also
  blocks the Stop hook (the eslint layer boundary only matches the `@/` alias form, not a relative
  `../../application/...` import).
- **Never** use `autoincrement()` primary keys in `schema.prisma` — `@default(uuid())`.
- **Never** let `generateRoster` / `validateRoster` throw on a *feasible-but-bad* input (a real
  scheduling shortfall) — that is a diagnostics case, not an error (plan §7.6, assumption 7). A
  thrown error from those two functions in a property test is always a bug.
- **Never** parse the demand CSV with `line.split(',')` — day labels contain a comma inside
  quotes (`"Fri, 07 Aug"`); a real quoted-field parser is mandatory (plan §4).

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
exactly which `directives/*.md` and `docs/NN_*.md` files you read, and where each decision's logic
came from. A plan missing this section may be rejected outright.

**Plans live in `.ai/plans/<phase>.plan.md`, committed.** A plan kept only in a chat transcript or
a scratch directory is not evidence of anything.

**Do not retouch a plan after execution.** If it predicted something that turned out wrong, leave
the wrong prediction in and annotate it — that contradiction *is* the evidence
(`docs/12_ai_collaboration.md`). Rewriting a plan to match what actually happened converts the
audit trail into fiction. `init-source.plan.md` §0.0 is the concrete example: it records the
reversed stack decision rather than deleting the wrong first draft.

Current plan: [`init-source.plan.md`](.ai/plans/init-source.plan.md).

## 📝 After-Task Protocol (run every non-trivial task — don't wait to be asked)

1. **Log the lesson** — append one JSON line to the right `.ai/memory/<category>.jsonl`:
   - `errors.jsonl` — build/test/runtime error → solution
   - `architecture.jsonl` — design decisions (reactive **and** proactive "chose A over B")
   - `conventions.jsonl` — new coding conventions
   - `gotchas.jsonl` — framework/library gotchas
   - Canonical format: `{"timestamp","type","title","detail","context"}` — `context` optional.
     Full rules: `directives/memory_sop.md`.
2. **Update the rule** — if a convention/pattern was established or refined, edit the relevant
   `directives/*.md` **now**, not later.
3. **Reconcile the spec (the docs forcing-function)** — if the change touches **schema, API
   contract, or the algorithm's public surface**, update the matching living-spec doc *in the same
   task*: `docs/04_data_model.md`, `docs/06_api_contracts.md`, `docs/03_architecture.md`. **Do not
   leave a design doc contradicting the code.** (Stable-intent docs — 01 business requirements, 02
   use-cases — only change when the intent itself changes.)
4. **Update live status** — if a module/phase changed, edit `.ai/PROJECT_STATUS.md`.
5. The `Stop` hook then regenerates `.ai/KNOWLEDGE_INDEX.md` automatically. Only run
   `python .ai/knowledge_builder.py` by hand if you need to see the regenerated index immediately.

*Be pragmatic. Be reliable. Keep the docs honest.*
