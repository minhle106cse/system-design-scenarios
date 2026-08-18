# SOP: Knowledge Routing & Agent Memory

> Read at session start and whenever you're about to record a lesson. Answers **which store owns
> which fact** — see `.ai/KNOWLEDGE_ARCHITECTURE.md` for the full rationale + diagram; this file
> is the terse operating version. Ported near-verbatim from
> `../service-appointment-scheduler/directives/memory_sop.md` — the routing rule is stack-agnostic.

## 🗺️ The one routing rule (where does this fact go?)

| The fact is… | Home | Not here |
|---|---|---|
| An enforceable **coding rule / convention / pattern** | `directives/*.md` | not memory, not docs |
| **Design / spec / business intent** (what & why, schema, API, observability) | `docs/*.md` | not directives |
| **Where the project is now** (what's done, current focus, live debts) | `.ai/PROJECT_STATUS.md` | not the index (it's generated) |
| **Ephemeral experience** — a build error→fix, a library gotcha, a design decision's rationale | `.ai/memory/*.jsonl` | not directives (unless it becomes a rule) |
| **Who the user is + how they want me to work** (prefs, feedback) | agent memory (`~/.claude/.../memory/`) | **never** project facts that belong in the repo |

Litmus for the last two rows: *does this fact belong to the project (any engineer would need it)
or to the working relationship (only this agent+user need it)?* Project → repo. Relationship →
agent memory.

> `.ai/KNOWLEDGE_INDEX.md` is **generated** from directives + docs + `PROJECT_STATUS` + memory by
> `knowledge_builder.py` (run automatically by the `Stop` hook). **Never hand-edit it** — edit the
> source, the hook regenerates it. The same run generates `.ai/GOTCHAS.md`.

## ⚙️ Session start

1. Read `.ai/KNOWLEDGE_INDEX.md` — whole project context.
2. **Debugging only:** read `.ai/GOTCHAS.md`. `grep .ai/memory/*.jsonl` for full text.
3. Read the relevant `directives/*.md` before writing code (`directives/README.md` indexes them;
   the `turn-context` hook points there each turn).

## 📖 When to SEARCH `.ai/memory/`

| Task | Read |
|---|---|
| Debug a TS/Prisma/Jest/Vitest error | `errors.jsonl` + `gotchas.jsonl` |
| Design a pattern (the gate, the assigner, the importer, a CQRS handler) | `architecture.jsonl` |
| Configure infra (Prisma, Docker, NestJS bootstrap, Next.js config) | `gotchas.jsonl` |
| Refactor `scheduling-core` or `apps/scheduler-api` | `architecture.jsonl` + `conventions.jsonl` |
| Write new UI code | `conventions.jsonl` |

Search by reading the file or `grep`. All four files are small — reading one fully is cheap.

## 📝 When to LOG to `.ai/memory/` (After-Task Protocol)

Log after solving something non-obvious (anything that took real effort, a gotcha, a design decision):

- `errors.jsonl` — build/test/runtime error → solution
- `gotchas.jsonl` — framework/library gotcha
- `architecture.jsonl` — architecture decision (reactive **or** proactive "chose A over B")
- `conventions.jsonl` — a new coding convention

**`errors` vs `gotchas`, concretely** (the two get conflated otherwise — almost every gotcha is
*found* via some error message, so "did an error appear" doesn't distinguish anything):
`errors.jsonl` is for a terse, mechanical **error → solution** pair — one or two sentences, no
root-cause narrative, the kind of thing anyone hitting the identical message can copy-paste and
move on (see `.ai/memory/errors.jsonl` in a repo that has real entries for the shape). `gotchas.jsonl`
is for an entry with an actual **lesson**: root cause explained, why it's non-obvious, how to
recognize/avoid it next time — regardless of whether an error message happened to appear while
finding it. When in doubt: if writing it as one line would lose the reason the entry is worth
having, it's a gotcha, not an error.

**CANONICAL entry format** — one shape for every category:

```json
{"timestamp": "2026-08-17T10:00:00+07:00", "type": "gotchas", "title": "the one-line lesson", "detail": "what happened, why, how it was fixed / chose A over B because …", "context": "file/module"}
```

`type` = the file's own category (`errors` / `gotchas` / `architecture` / `conventions`). `context`
is optional. For an architecture decision, put the choice in `title` and the rationale + rejected
alternatives in `detail`.

> See `.ai/memory/gotchas.jsonl` and `.ai/memory/architecture.jsonl` for real examples from this
> repo's own build (the two-apps-one-Prisma-client-output gotcha, the `@fastify/multipart` module-
> augmentation gotcha, the recompute-live-vs-stored-snapshot coverage decision) — written using this
> exact format, not retrofitted. This discipline being genuinely maintained (not just scaffolded
> empty) is part of the AI Collaboration Narrative evidence — see `docs/12_ai_collaboration.md`.

**If the lesson is really a durable rule**, don't stop at memory — promote it: add/refine the
relevant `directives/*.md`. Memory is the experience buffer; directives are the law.

## 🔄 The self-annealing loop (do it without being asked)

When a pattern is settled or an architectural boundary is clarified during work, **before
reporting done**:

1. Append the lesson to `.ai/memory/<category>.jsonl`.
2. Update the relevant `directives/*.md` immediately (create one only if a genuinely new area).
3. If the change touches schema / API / algorithm contract, reconcile the matching `docs/NN_*.md`.
4. Update `.ai/PROJECT_STATUS.md` if a phase/module changed.

The `Stop` hook then regenerates `KNOWLEDGE_INDEX.md`. To see it immediately:
`python .ai/knowledge_builder.py`.
