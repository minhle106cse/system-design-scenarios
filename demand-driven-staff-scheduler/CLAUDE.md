# Claude Code Entry Point

> **`AGENTS.md` is canonical; this file duplicates the sections you need to make decisions.**
> Claude Code auto-loads **only this file** at session start — `AGENTS.md` is never injected — so
> anything that lives there alone is invisible during ordinary work. The sections below are
> therefore copied in full rather than linked. `AGENTS.md` still holds what is genuinely
> reference-only: the docs↔directives litmus table, hook internals, and how the workflow is wired.
> `.ai/KNOWLEDGE_ARCHITECTURE.md` explains how all the knowledge fits together.
>
> ⚠️ **Editing `AGENTS.md`? Port the change here in the same task.** `scripts/sync.cjs` **blocks the
> turn from ending** if `AGENTS.md` moved and this file didn't (guard file
> `.ai/.claude-drift-guard`, fires once per `AGENTS.md` state). If the edit genuinely didn't touch a
> section this file mirrors, say so explicitly when the block fires and continue.

## 🧠 Session Start Protocol (do this first)

1. Read `.ai/KNOWLEDGE_INDEX.md` — project context: overview, live status, directive and docs maps.
2. **Only when debugging** (or designing where you may have burned before): `.ai/GOTCHAS.md`.
   Skip it for questions and small fixes. Untruncated text: `grep .ai/memory/*.jsonl`.
3. Read the relevant `directives/*.md` SOP before creating/modifying code.

## 📦 Project Context — Demand-Driven Staff Scheduler

Scenario 02 in a personal collection of real-world system-design scenarios. A store manager plans
a weekly staff schedule from historical transaction demand: staff + weekly-hours caps, a CSV
import of hourly demand, shift definitions, and an auto-schedule button that drafts a roster
respecting every hard constraint and reporting a fairness/coverage diagnosis.

**Stack** (workspace tooling, AI workflow *and* most of the stack ported from
`../service-appointment-scheduler/`): Turborepo + npm workspaces. **`apps/scheduler-api`** —
NestJS + Fastify, CQRS + Hexagonal, PostgreSQL via Prisma, Docker (Postgres only), Jest — owns all
persistence. **`apps/web`** — Next.js 15, Tailwind, Vitest — UI only, no database, calls the API
via `src/lib/api-client.ts`. **`packages/shared-kernel`** — CQRS bus / Unit-of-Work, ported.
**`packages/scheduling-core`** — the zero-runtime-dependency algorithm, untouched by the reversal.

⚠️ `init-source.plan.md` §0.0 originally argued this down to one Next.js app + SQLite with **none**
of that infrastructure; **the user overruled it** — this collection's standard is that a scenario
ships a real backend design. `.ai/plans/backend-architecture-reversal.plan.md` governs; its §0
keeps the overruled argument rather than deleting it. Do not "restore" the trimmed stack.

⚠️ **The requirement this code answers to is
`SWE_Take-Home_Staff_Scheduling_System.pdf`** (repo root) — `docs/01_business_requirements.md`
quotes it verbatim and logs every assumption made where it was ambiguous.

Source of truth: `.ai/KNOWLEDGE_INDEX.md` → `docs/00..12` → `readme.md`.

## ⛔ Hard Rules (see AGENTS.md for full text)

- **Never** add a runtime dependency to `packages/scheduling-core` — `dependencies` must stay `{}`;
  lint fails on any `react`/`next`/`@prisma/client`/`zod` import there (plan §2.1, §0.1).
- **Never** validate input inside `scheduling-core` or a command/query handler — Zod at the
  controller boundary (`ZodValidationPipe`) only.
- **Never** call `prisma.*` outside a repository
  (`apps/scheduler-api/src/modules/*/infrastructure/repositories/`) — eslint enforces the layers.
- **Never** use `autoincrement()` primary keys — `@default(uuid())`.
- **Never** let `generateRoster`/`validateRoster` throw on a feasible-but-bad input — that's a
  diagnostics case (plan §7.6), not an error. Thrown in a property test = a real bug.
- **Never** parse the demand CSV with `line.split(',')` — day labels contain a quoted comma
  (`"Fri, 07 Aug"`); use a real quoted-field CSV parser (plan §4).
- Run TS through Turborepo from the root: `npm run typecheck` / `npm run lint` / `npm run test`,
  or `npm run check` (typecheck + lint + format:check).

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

**Plans live in `.ai/plans/<phase>.plan.md`, committed.** A plan kept only in a chat transcript or a
scratch directory is not evidence of anything.

**Never retouch a plan after execution.** If it predicted something that turned out wrong, leave the
wrong prediction in and annotate it — that contradiction *is* the evidence
(`docs/12_ai_collaboration.md`). Rewriting a plan to match what happened converts the audit trail
into fiction.

## 📝 After-Task Protocol (every non-trivial task — don't wait to be asked)

1. **Log the lesson** — one JSON line appended to the right `.ai/memory/<category>.jsonl`
   (`errors` · `architecture` · `conventions` · `gotchas`), canonical shape
   `{"timestamp","type","title","detail","context"}`; full rules in `directives/memory_sop.md`.
   **This step is mandatory and is the one `scripts/sync.cjs` enforces** — it blocks the turn from
   ending when source files changed and no `.jsonl` is newer. Touching `.ai/PROJECT_STATUS.md`
   alone does *not* satisfy it.
2. **Update the rule** — if a convention was established or refined, edit the relevant
   `directives/*.md` **now**, not later.
3. **Reconcile the spec** — if the change touches **schema, API contract, or the algorithm's
   public surface**, update the matching `docs/04` / `06` / `03` *in the same task*. Never leave a
   design doc contradicting the code. (Stable-intent docs — `01`, `02` — change only when the
   intent does.)
4. **Update live status** — if a module/phase changed, edit `.ai/PROJECT_STATUS.md` (step 4 is
   conditional; step 1 is not).
5. The `Stop` hook regenerates `.ai/KNOWLEDGE_INDEX.md` and `.ai/GOTCHAS.md` — **edit the sources,
   never the generated index.**
