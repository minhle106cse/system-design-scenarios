# QA Standard & Active Reflection

> Read before reporting any task "done". **Never** claim completion without an independent
> verification step whose output you actually read.

## Principle 1 — Assume the code is wrong until proven otherwise (Zero Trust)

Whether you added logic in `apps/scheduler-api` or `packages/shared-kernel`, never assume it runs
correctly on the first try.

- New logic ships with a unit test.
- A change to an existing business flow re-runs the existing tests (`npm run test`, or
  `npm run test --workspace=@scheduler/api`) — and you read the output, not just the exit code.

## Principle 2 — Active Reflection

Before concluding, run this loop:

1. **Hypothesis** — what does this do? Inputs? Expected output?
2. **Test run** — feed a wrong input to check error handling, then a correct input to see real
   output.
3. **Reflect** — does the output match the hypothesis? Any warning in the terminal? A **TypeScript
   or lint warning must be fixed now**, not ignored (`npm run check` =
   `typecheck lint format:check`).

## Principle 3 — Auto-Evaluation for complex work

For a non-trivial task (e.g. the booking command, the availability check), don't stop at unit
tests — exercise it end-to-end:

- Call the new endpoint against a live `npm run dev` instance (`curl`, or the OpenAPI UI at
  `/docs`).
- Query the database (`docker exec scheduler-postgres psql -U root -d scheduler_db`) to confirm
  the data was actually written correctly — for booking specifically, confirm the
  anti-double-booking exclusion constraint actually rejects an overlapping insert (see how this
  was verified during init, `.ai/memory/architecture.jsonl`).
- Check relationships/invariants hold (an appointment's bay and technician both belong to the same
  dealership, its technician is qualified for its service type).

Only report Done once this passes.

## Completion workflow

1. Code the feature / fix the bug.
2. Write / update the test case.
3. Run `npm run test` (or the relevant test command). Read the log carefully.
4. FAIL → back to step 1.
5. PASS → if the change is structurally complex, run a live end-to-end verification (Principle 3).
6. When fully confident, run the **After-Task Protocol** (see `AGENTS.md`): log the lesson to
   `.ai/memory/<category>.jsonl`, update the relevant `directives/*.md`, reconcile any affected
   `docs/NN_*.md`, update `.ai/PROJECT_STATUS.md` if a phase/module changed — then report Done.
