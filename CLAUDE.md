# Claude Code Entry Point

> **This file mirrors `AGENTS.md` (the canonical agent instruction file).** Read `AGENTS.md` for the
> full Session Start Protocol, the docs↔directives boundary, how the AI workflow actually runs, and
> the After-Task Protocol. Read `.ai/KNOWLEDGE_ARCHITECTURE.md` for how all the knowledge fits together.

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
- After non-trivial work (After-Task Protocol): log a lesson to `.ai/memory/<category>.jsonl`; update
  the relevant `directives/*.md`; if the change touches schema/API/observability, reconcile the
  matching `docs/NN_*.md` in the **same task**; update `.ai/PROJECT_STATUS.md` if a phase/module
  changed. The `Stop` hook regenerates `.ai/KNOWLEDGE_INDEX.md` — **edit the sources, not the
  generated index.**
