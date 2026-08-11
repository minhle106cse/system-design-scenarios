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

## 📦 Project Context — Service Appointment Scheduler

Scenario 01 in a personal collection of real-world system-design scenarios. A resource-constrained
appointment scheduler for vehicle service — real-time availability checks against service bays and
qualified technicians, backed by a persistent, non-overlapping `Appointment` record. Monorepo tooling and AI workflow
ported from Cortex (`distributed-social-platform`) with business content stripped — see
`.ai/plans/init-source.plan.md` for the full reasoning. Do NOT reintroduce Cortex's business
domain (knowledge hub, credits, tenancy, RAG).

⚠️ **The requirement this code answers to is `KeyloopCodingChallange.pdf` § *Scenario A: The Unified
Service Scheduler*** (repo root). The collection framing is where the repo lives; the PDF is what it
must satisfy — `readme.md` quotes its three core requirements verbatim and maps each to the code and
the test that proves it.

Source of truth: `.ai/KNOWLEDGE_INDEX.md` → `docs/00..12` → `readme.md`.

## ⛔ Hard Rules (see AGENTS.md for full text)

- Never `console.log` (use `createLogger`); never `autoincrement()` PK (use UUID); never CORS `['*']`;
  never put infrastructure code in `common/`.
- Entities: UUID PK, `camelCase` code / `@map("snake_case")` DB, soft delete via `deletedAt`.
- Zod validation only, per-route (no global pipe).
- **Never** modify or drop the two hand-added exclusion constraints in the first Prisma migration
  — see `docs/adr/0002-booking-concurrency-control.md`.
- Run TS via `turbo` (`npm run check`). `docker exec <container>` is only for infra (Postgres)
  during smoke tests — there is no agent sandbox.

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
scratch directory is not evidence of anything — and for most of this build the plans sat in an
uncommitted working tree, which is exactly that failure.

**Never retouch a plan after execution.** If it predicted something that turned out wrong, leave the
wrong prediction in and annotate it — that contradiction *is* the evidence
(`docs/12_ai_collaboration.md` §5). Rewriting a plan to match what happened converts the audit trail
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
3. **Reconcile the spec** — if the change touches **schema, API contract, or observability**, update
   the matching `docs/04` / `06` / `09` / `03` *in the same task*. Never leave a design doc
   contradicting the code. (Stable-intent docs — `01`, `02` — change only when the intent does.)
4. **Update live status** — if a module/phase changed, edit `.ai/PROJECT_STATUS.md` (step 4 is
   conditional; step 1 is not).
5. The `Stop` hook regenerates `.ai/KNOWLEDGE_INDEX.md` and `.ai/GOTCHAS.md` — **edit the sources,
   never the generated index.**
