# QA Standard & Active Reflection

> Read before reporting any task "done". **Never** claim completion without an independent
> verification step whose output you actually read. Ported from
> `../service-appointment-scheduler/directives/qa_standard.md` — the three principles are
> stack-agnostic; only the commands and the example invariant differ per scenario.

## Principle 1 — Assume the code is wrong until proven otherwise (Zero Trust)

Whether the change is in `apps/scheduler-api`, `packages/scheduling-core`, or `apps/web`, never
assume it runs correctly on the first try.

- New logic ships with a test (plan §8's right layer for the claim — see `testing_standard.md`).
- A change to `scheduling-core` re-runs `npm run test --workspace=packages/scheduling-core`; a
  change to `apps/scheduler-api` re-runs `npm run test --workspace=@scheduler/api` — and you read
  the output, not just the exit code.

## Principle 2 — Active Reflection

Before concluding, run this loop:

1. **Hypothesis** — what does this do? Inputs? Expected output?
2. **Test run** — feed a wrong input to check error handling, then a correct input to see real
   output.
3. **Reflect** — does the output match the hypothesis? Any warning in the terminal? A **TypeScript
   or lint warning must be fixed now**, not ignored (`npm run check` =
   `typecheck lint format:check`).

## Principle 3 — Auto-Evaluation for complex work

For a non-trivial task (the auto-scheduler, the CSV importer, a command/handler touching Prisma),
don't stop at unit tests — exercise it end-to-end:

- Call the new route against a live `npm run dev` instance (`curl`, or the Swagger UI at
  `apps/scheduler-api`'s `/docs`).
- Query the database (`docker exec staff-scheduler-postgres psql -U root -d staff_scheduler_db`,
  or `npm run db:studio`) to confirm the data was actually written correctly — for a roster change
  specifically, confirm `validateRoster`/`FeasibilityGate` actually rejects an illegal manual edit
  (H1–H3, ADR-0001), not just that the happy path returns `201` (see how this was verified during
  Phase D, `.ai/memory/architecture.jsonl`).
- Check relationships/invariants hold (every assignment's staff and shift belong to the same
  schedule; no two assignments for the same staff overlap on the same day).

Only report Done once this passes.

## Completion workflow

1. Code the feature / fix the bug.
2. Write / update the test case, at the layer that actually proves the claim (`testing_standard.md`).
3. Run `npm test`. Read the log carefully.
4. FAIL → back to step 1.
5. PASS → if the change is structurally complex, run a live end-to-end verification (Principle 3).
6. When fully confident, run the **After-Task Protocol** (see `AGENTS.md`): log the lesson to
   `.ai/memory/<category>.jsonl`, update the relevant `directives/*.md`, reconcile any affected
   `docs/NN_*.md`, update `.ai/PROJECT_STATUS.md` if a phase/module changed — then report Done.
