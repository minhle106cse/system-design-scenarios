# AI Collaboration — Method

> The full account. The README's "AI Collaboration Narrative" section and
> `docs/03_system_architecture_diagrams.md` §7 both summarize and link here — see
> `.ai/plans/init-source.plan.md` §6.4.2 for why this file exists separately from the summaries. This is a HOW
> document (`docs/README.md`'s layer convention): the method someone else could follow, backed by
> the specific evidence from this project as proof it was actually followed, not just described.

The claim this document supports: the AI was **directed** by a standard set in advance, and its
output was **checked** by mechanisms built for that purpose — not accepted on trust.

## 1. Direction — the standard came first

Before any file was copied from the reference project (Cortex), a written init plan
(`.ai/plans/init-source.plan.md`, ~750 lines) specified: which files to port as-is, which to strip
of business content, which to defer to a later tier and why, the exact global find-and-replace
sweep, and a verification checklist. The plan itself went through **two independent review
passes** before execution began — the first surfaced 8 concrete defects (a wrong app directory
structure, a missing Redis-vs-Postgres decision, an incomplete barrel-export list, an ADR
numbering collision that would have orphaned ~20 code comments) verified against Cortex's actual
working tree, not assumed from memory; the second removed language that dismissed deferred
capabilities as inferior rather than sequenced, and added the What/Why/How documentation
convention this file follows.

During implementation, every non-trivial task cites which `directives/*.md` and `docs/*.md` files
constrained it (`AGENTS.md`'s Citation Protocol) — the "References & Compliance" discipline is
what keeps a generated plan grounded in this project's actual rules instead of improvised ones.

## 2. Context engineering

The agent doesn't re-read the whole repository every turn. `.ai/knowledge_builder.py` (ported
as-is from Cortex) generates `.ai/KNOWLEDGE_INDEX.md` from `directives/` + `docs/` + memory +
status — one bounded read at session start instead of grepping blind. `.ai/GOTCHAS.md` is split
out as a separate, on-demand file rather than inlined in the index (Cortex measured its own
version of this split cutting the mandatory per-session read substantially with no loss — see
`.ai/KNOWLEDGE_ARCHITECTURE.md` for the reasoning, carried over as a principle even though this
repo's corpus is much smaller than Cortex's).

A `UserPromptSubmit` hook (`.claude/hooks/turn-context.cjs`) injects only what changes between
turns — branch state, uncommitted paths, outstanding After-Task debt — instead of restating static
rules the agent has already read. A `Stop` hook (`scripts/sync.cjs`) regenerates the knowledge
index automatically and flags (via a blocking `decision: "block"` response, not just a comment)
when source files changed with no corresponding `.ai/memory` entry.

## 3. Guardrails the AI cannot talk its way past

The point of this section: the booking guarantee does **not** depend on the AI having reasoned
correctly about concurrency. It depends on mechanisms that fail loudly if it didn't:

- **Lint-enforced Hexagonal boundaries** (`apps/scheduler-api/eslint.config.mjs`,
  `directives/folder_structure_sop.md`) — a domain-layer file importing Prisma or NestJS is a lint
  failure, not a style suggestion.
- **`tsc --noEmit`** across both workspaces, run independently of lint (`npx turbo typecheck`) —
  catches type errors lint doesn't.
- **The ported shared-kernel test suite** (52 tests) and the app-level interceptor/filter tests (16
  tests, including two that specifically guard against real historical bugs — see
  `directives/logging_standard.md`'s "Two real bugs" section) — these don't test that the AI's
  reasoning was sound, they test that the code's behavior is correct.
- **The database exclusion constraint itself** (ADR-0002) is the strongest guardrail in this
  submission: even a future bug in the application-level availability check cannot produce a
  double-booking, because Postgres rejects the conflicting row unconditionally. This is a
  deliberate design choice, not an accident — see §6.

## 4. The verification loop

For each task: read the plan/directive → check it against the actual source (not memory of it) →
implement → run the relevant gate (`typecheck`/`lint`/`test`/a live boot) and **read the output**,
not just the exit code → log what was learned. The `Stop` hook makes the last step mechanical
rather than optional — it compares the newest changed source file's timestamp against the newest
`.ai/memory/*.jsonl` entry and blocks the turn from ending if code moved without a corresponding
entry.

Concretely, during this repo's init: every `npx turbo build/typecheck/lint/test` run's actual
output was read (not assumed green), the app was **booted and curled**, not just typechecked, and
the double-booking guarantee was verified against a **live Postgres instance** with real SQL
(insert, reject, back-to-back-succeed, cancel-then-rebook) before being written up as ADR-0002 —
see `docs/08_testing_and_qa_strategy.md`.

## 5. Where the AI was wrong

The most credible section — real entries, not retrofitted. Full text: `.ai/memory/gotchas.jsonl`,
`.ai/memory/architecture.jsonl`.

- **Copied a `url` line into `schema.prisma` from habit**, breaking `prisma generate` immediately
  — Prisma 7 (already in use by the reference project) removed that field from the schema DSL;
  the reference project's own file correctly omits it, but the port initially didn't match it.
  Caught by the first `prisma generate` failing loudly (`P1012`), not by review.
- **Two dependencies silently missing** (`@nestjs/cli`, `@fastify/static`) — the reference
  project's `core-api` never declares either; both only worked there by accident of npm workspace
  hoisting from *other* services in that monorepo declaring them. This repo has one app workspace,
  so nothing hoisted them in — `nest build` and, separately, the Swagger UI at runtime, both
  failed. The second one specifically was caught only because the app was actually **booted**, not
  just typechecked/linted/tested — a purely static verification pass would have shipped a runtime
  crash.
- **A `fastify` package-version duplication** broke TypeScript's structural typing on every
  `fastify.register()` call — `@nestjs/platform-fastify` pins an exact internal `fastify` version
  that didn't match this app's own range-pinned dependency, so npm couldn't deduplicate them into
  one physical copy. Fixed by pinning to the exact version, after a first attempt using npm
  `overrides` was tried and found not to take effect on the existing lockfile.
- **An `eslint-disable-next-line` comment split across three lines** disabled the wrong line — the
  directive only suppresses violations on the literal next physical line, and a multi-line
  explanatory comment pushed the target out of range. Caught by re-running lint and seeing both
  "unused directive" and the original violation reported together.

## 6. What stayed human

Not delegated:

- **Scenario choice** and the decision to implement the backend layer (not frontend).
- **The tier boundary** (`.ai/plans/init-source.plan.md` §1) — which capabilities from the reference project earn
  their place now versus later, and the standard applied to make that call ("has this problem
  reached this capability yet," not "is this capability good").
- **The concurrency mechanism** (ADR-0002) — the AI proposed and implemented the exclusion
  constraint; a human directed that the guarantee be solved at the database layer specifically
  (not application-only, not a distributed lock), and required live verification against a real
  database before accepting it as correct, not merely "looks right."
- **The deferral triggers** (`docs/03_system_architecture_diagrams.md § Deferred scope`) — naming
  what was left out and the condition that would bring each one back is itself a judgment call
  about what this specific problem needs, made and reviewed by a human, not generated as a
  checklist.

Naming what was *not* delegated is what makes the rest of this document believable — a narrative
that claims full AI autonomy with no human decision points would be describing something other
than what evaluation criterion 3 ("your strategy for directing AI... and owning the final
solution") actually asks for.
