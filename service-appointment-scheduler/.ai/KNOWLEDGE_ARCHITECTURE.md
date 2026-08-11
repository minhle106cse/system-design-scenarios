# 🗺️ Knowledge Architecture — how this project remembers things

> The **map** of this project's knowledge system, ported from Cortex
> (`distributed-social-platform`) with the submodule-specific mechanics removed — this repo has
> no `.gitmodules` (single repo, single app, see `.ai/plans/init-source.plan.md` §0). `AGENTS.md` is the operating
> summary; this is the rationale behind it.

## The problem this solves

Knowledge drifts when facts can land in more than one place with no rule for which store owns
what. The fix is a **single home per fact + forcing-functions + generated views** so nothing is
maintained in two places.

## The two document families (purpose, not audience)

Both agents and humans read both. They split by **what the reader is trying to do** — this is
also the What/Why/How convention in `.ai/plans/init-source.plan.md` §5.1, stated here for the agent's benefit:

| | `docs/` — **Design & Spec** (WHAT & WHY) | `directives/` — **SOP & Rules** (HOW) |
|---|---|---|
| Answers | "What is the system, why, what must it do, how is it run/secured?" | "When I write a file, what rule must I not violate?" |
| Reader intent | Understand / operate / deploy / audit | Execute — write compliant code |
| Style | Complete, narrative, diagrams, rationale, audit trail | Terse, imperative, litmus-driven, lists known exceptions |
| Index | `docs/README.md` | `directives/README.md` (the rulebook index) |

**Litmus:** *"Would a new engineer need this to understand or operate the system?"* → `docs/`.
*"Would an agent about to write a file violate something without this?"* → `directives/`.

## The `.ai/` layer — machine-maintained knowledge

| File | Role | Who writes it |
|---|---|---|
| `KNOWLEDGE_INDEX.md` | The session-start read. **Generated — never hand-edit.** | `knowledge_builder.py` (via the Stop hook) |
| `GOTCHAS.md` | The **on-demand** lesson buffer, newest first. Read when debugging; skipped otherwise. **Generated.** | `knowledge_builder.py` (same run) |
| `PROJECT_STATUS.md` | Live status (what's done, current focus, live debts). Injected into the index. | Curated by hand, After-Task |
| `memory/*.jsonl` | Experience buffer: `errors` / `gotchas` / `architecture` / `conventions`. Local, gitignored. Surfaced in the index. | Appended by hand, After-Task — see `.ai/plans/init-source.plan.md` §6.4.2 for why this discipline is a submission deliverable, not housekeeping |
| `knowledge_builder.py` | The generator. Scans `directives/` + `docs/` + `memory/` + `apps/*/src` + curated files. Ported as-is from Cortex. | — |
| `KNOWLEDGE_ARCHITECTURE.md` | This map. | By hand, rarely |

The index is a **view**, not a source. To change the index, change the source; the Stop hook
regenerates it.

> **Why `GOTCHAS.md` is split out of the index (carried from Cortex).** Cortex measured its index
> at ~21k tokens with the gotcha buffer alone at 63% of that — read at *every* session start,
> including questions where a "have I hit this before?" lookup buys nothing. Splitting it into a
> separate, on-demand file cut the mandatory read with no loss. This repo's corpus starts much
> smaller (a fraction of Cortex's directive/doc count), but the split is kept because the
> principle — pay for a lookup only when debugging, not on every prompt — doesn't depend on scale.
> `GOTCHAS.md` **is committed** even though `.ai/memory/*.jsonl` is gitignored, so lessons survive
> a machine change.

## Agent memory (`~/.claude/.../memory/`) — the working relationship

Holds **who the user is, how they want me to work, and cross-session working-state**. **Never**
project facts that belong in the repo. Governed by `directives/memory_sop.md`.

## The one routing rule — where does a fact go?

| The fact is… | Home |
|---|---|
| An enforceable coding rule / convention / pattern | `directives/*.md` |
| Design / spec / business intent (schema, API, security, ops, why) | `docs/*.md` |
| Where the project is now (what's done, current focus, live debts) | `.ai/PROJECT_STATUS.md` |
| Ephemeral experience (error→fix, gotcha, decision rationale) | `.ai/memory/*.jsonl` |
| Who the user is / how they want me to work | agent memory |

Everything else *points* to the home; it does not copy.

## What keeps the stores honest (forcing-functions)

1. **Docs sync-trigger** — a task that changes schema / API / observability MUST reconcile the
   matching `docs/NN_*.md` in the **same task** (`AGENTS.md` After-Task Protocol).
2. **The `Stop` hook** (`scripts/sync.cjs`) — regenerates the index + `GOTCHAS.md`, and **blocks the
   turn from ending** on two independent checks, each guarded to fire at most once per state:
   source files changed with no newer `.ai/memory/*.jsonl` entry (`.ai/PROJECT_STATUS.md` is
   deliberately **not** accepted as a substitute — it is a conditional After-Task step, and while it
   counted, the mandatory step could be skipped by editing the one file most likely to be touched
   for unrelated reasons); and `AGENTS.md` edited without `CLAUDE.md` in the same change — Claude
   Code auto-loads only the latter, which is why the latter duplicates rather than links, and why
   that check blocks rather than just warns.
   > Ported with the submodule-descent logic removed (`.ai/plans/init-source.plan.md` §6.3) — Cortex's version
   > filters root `git status` by submodule paths because every `apps/*` there is a git submodule
   > whose root status shows only a pointer. This repo has no submodules, so plain root
   > `git status --short` already sees every changed file.
3. **The `UserPromptSubmit` hook** (`.claude/hooks/turn-context.cjs`) — injects **turn-local
   state** into the agent's context: branch, uncommitted paths, outstanding After-Task debt, plus
   a one-line pointer at `directives/README.md`. Same submodule-removal as `sync.cjs`
   (`.ai/plans/init-source.plan.md` §6.1.1).
   > **Why state, not prose.** A per-turn hook only earns its token cost by carrying what a static
   > `AGENTS.md` **cannot**: things that differ between turns. Restating a rule the agent has
   > already read changes nothing.
   > **Hook output rule.** A hook meant to steer the *agent* must emit
   > `hookSpecificOutput.additionalContext` (or plain stdout) — valid for `UserPromptSubmit` /
   > `SessionStart`. `systemMessage` renders in the user's terminal and never reaches the model.
4. **Citation Protocol** (`AGENTS.md`) — plans must cite which directives/docs they used. See
   `.ai/plans/init-source.plan.md` §6.4.1 for how this feeds the AI Collaboration Narrative.

## Entry points — what to read when

- **Every session:** `.ai/KNOWLEDGE_INDEX.md` (whole context).
- **Before writing code in an area:** the relevant `directives/*.md` — see `directives/README.md`'s
  index (the `turn-context` hook points you there each turn).
- **Need business/design context:** the relevant `docs/NN_*.md` (`docs/README.md` indexes them).
- **Debugging:** `.ai/memory/errors.jsonl` + `gotchas.jsonl`.
- **Instruction set:** `AGENTS.md` (canonical) / `CLAUDE.md` (pointer).
- **How this repo was assembled from a reusable base:** `SETUP.md`; the full reasoning is
  `.ai/plans/init-source.plan.md`.

## Not built (deliberately)

The AI workflow is intentionally lightweight: Markdown + two hooks + a Python generator, no
framework. See `docs/03_system_architecture_diagrams.md § Deferred scope` and `.ai/plans/init-source.plan.md` §1
for the same "sequence, not omission" reasoning applied to the product's own architecture.
