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

The same discipline was applied to the two phases after init, each with its plan committed
alongside the init one:

| Phase | Plan | What the plan settled before code was written |
|---|---|---|
| Init | [`init-source.plan.md`](../.ai/plans/init-source.plan.md) | What to port, strip, and defer |
| Scheduler domain | [`booking-domain.plan.md`](../.ai/plans/booking-domain.plan.md) | Four design questions no document answered — the availability algorithm, who selects the resources, where business hours come from, and whether a slot conflict may be retried. Answered in [ADR-0003](adr/0003-availability-and-selection-policy.md) **first**, then implemented. |
| Hardening | [`hardening.plan.md`](../.ai/plans/hardening.plan.md) | A findings-first plan: an audit ran against the finished domain, every finding was independently reproduced before being accepted, and only then was a fix scoped. |

That last one is worth stating plainly, because it is the least flattering and the most useful:
**the domain shipped "green" — all gates passing, 92 tests, three endpoints demonstrably working —
and a deliberate adversarial pass still found three runtime defects and two gaps against the
brief.** Green gates prove the code does what the tests say; they do not prove the tests asked the
right questions. Scheduling a pass whose explicit job is to attack finished work is a control, not
an admission of failure — see §5.

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
- **166 unit tests** across both workspaces (52 in shared-kernel, 114 in the app) plus a separate
  real-Postgres integration suite (`npm run test:integration`) — these don't test that the AI's
  reasoning was sound, they test that the code's behavior is correct.
- **Database constraints**, the strongest guardrail here, because they hold regardless of what any
  handler does:
  - the two `EXCLUDE USING gist` constraints (ADR-0002) — even a future bug in the
    application-level availability check cannot produce a double-booking;
  - `service_types_duration_positive` (added during hardening) — a zero-length service would make
    `tstzrange(x, x, '[)')` empty, and an empty range overlaps nothing, so **both** exclusion
    constraints would have silently stopped applying. Fixing that in the handler alone would have
    left the hole open to the seed script and any future write path.
- **Type-level contract guards.** `presentation/schemas/responses.schema.ts` asserts at compile
  time that the Zod schemas published in the OpenAPI spec are mutually assignable with the DTOs the
  handlers return. Documentation drift becomes a build failure rather than a stale spec.

None of these depend on anyone remembering to check.

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

The same loop, applied to the domain and hardening phases, added two things:

- **An application-level concurrency proof.** `npm run test:integration` dispatches two real
  `BookAppointmentCommand`s concurrently through the real `CommandBus` against real Postgres and
  asserts exactly one wins, with the *specific* error the repository is responsible for producing —
  not merely "the second one failed".
- **A defect-by-defect smoke script.** Every fix in the hardening phase was verified by reproducing
  the defect first and then re-running the same request: unknown customer `500 → 404`, unknown
  dealership `409 (wrong reason) → 404`, a 2020 booking `201 → 400`, a Saturday booking
  `201 → 422 closed_day`, `+07:00` offsets `400 → 201`, `/docs-json` empty `→` full request and
  response schemas. A fix that isn't demonstrated against the failing case it claims to fix is a
  guess.

**A loop failure worth recording, because it indicts this very section**: during init, `npm run
check` was never once run as its own command — only its three sub-tasks separately. Its third task,
`format:check`, therefore never ran at all, and a real Prettier failure in three files survived
every "green" verification pass until the fresh-clone test. Running an equivalent-seeming
substitute assembled from a checklist's parts is not running the checklist.

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

### From the scheduler-domain and hardening phases

- **An ADR asserted a fact nobody had checked.** ADR-0002 §5 said a conflicting insert "surfaces as
  a Postgres error (`23P01`)" and flagged translating it as "a real seam to get right". Writing that
  translation, the assumed Prisma wrapper was `P2010`. Provoking a real violation against live
  Postgres showed it is actually **`P2039`**, with the Postgres error nested at
  `error.meta.driverAdapterError.cause`. Had the guess shipped, `detectExclusionViolation` would
  have matched nothing, every genuine race would have surfaced as a `500`, and the flagship
  guarantee would have *appeared* broken. The fix was not cleverness — it was refusing to write the
  predicate until the real error object had been printed. `exclusion-violation.spec.ts` now pins
  that verified shape as its fixture.
- **A JSDoc comment containing `modules/*/application/**` silently terminated itself.** TypeScript's
  tokenizer scans for the first `*/` after `/**`, and `*/` appears inside that glob — everything
  after it became live code (`TS2304: Cannot find name 'application'`). Hit **twice in one
  session**, the second time in a brand-new file after having already fixed the first. A mistake
  repeated after being fixed is a process signal, not bad luck: the lesson went into
  `.ai/memory/gotchas.jsonl` with a grep to self-check for it.
- **A directive contradicted the repo's own lint config.** `directives/testing_standard.md` §2
  prescribes `{...} as unknown as jest.Mocked<T>` for mocks. Following it verbatim produced *lint
  errors*, because two type-aware rules misfire on exactly that pattern when the mocked interface
  uses TS method-shorthand — which every repository interface here does. The resolution was to fix
  the config once, with the reasoning written into it, rather than work around the false positive
  in every spec file. Worth noting the failure mode: a directive can be wrong, and "the standard
  came first" (§1) is only a virtue if the standard is also allowed to be corrected.
- **"Ported as-is" did not mean "still correct."** The init plan classified
  `.ai/knowledge_builder.py` as copy-as-is because its traversal logic derives everything from
  `WORKSPACE_ROOT`. True — but the script also contains a **hardcoded** project description, and it
  still described Cortex (knowledge hub, RAG, credits, Kafka, Elasticsearch, Redis). That text is
  the first section of `KNOWLEDGE_INDEX.md`, i.e. the first thing the agent reads every session, and
  it survived the entire init phase *and* the whole domain phase undetected. Generated files are
  exactly where stale content hides, because nobody diffs them.
- **A "green" phase still shipped defects.** After the domain phase passed every gate, an
  adversarial audit found: a non-existent customer/vehicle/dealership id returning `500` instead of
  `404`; an unknown dealership reported as `409 no_free_service_bay` — a code the API contract
  defines as "every bay is busy" — while also polluting the booking-conflict metric with client
  typos; and **no clock reference anywhere in the module**, so a booking for 2020 was accepted and
  `GET /availability` advertised yesterday. None of these were caught by 92 passing tests, because
  the tests encoded the same blind spots as the code.

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
- **The availability and selection policy** ([ADR-0003](adr/0003-availability-and-selection-policy.md)) —
  four questions the AI would otherwise have answered implicitly by writing whatever code came
  first: that the server (not the client) picks the resources, that selection is *deterministic*
  rather than load-balanced so the concurrency test can assert one exact outcome, that business
  hours are configuration rather than a table (because a migration next to the hand-written
  exclusion constraints is a risk not worth taking for a demo), and — settling what ADR-0002 §6
  explicitly left open — that a slot conflict is **never** auto-retried, because a taken slot stays
  taken.
- **Where each hardening gap was fixed versus documented.** The audit surfaced eight behavioural
  gaps; the decision of which to close in code (past bookings, zero-duration service types, vehicle
  ownership, weekend/holiday closures) and which to record as deliberate assumptions with a trigger
  (per-country holiday calendars, per-dealership opening hours, the unreachable `COMPLETED` state)
  is a scoping judgment, not a technical one. An agent left to itself will either build all eight or
  none.
- **Reframing the repository** from a single company's assessment submission into Scenario 01 of a
  general system-design collection — including the choice to leave `init-source.plan.md` untouched
  as a dated historical record, because rewriting its history would falsify the very audit trail
  this section relies on.

Naming what was *not* delegated is what makes the rest of this document believable — a narrative
that claims full AI autonomy with no human decision points would be describing something other
than what evaluation criterion 3 ("your strategy for directing AI... and owning the final
solution") actually asks for.
