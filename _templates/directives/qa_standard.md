<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: Principle 1's test commands, Principle 3's database-inspection command and the example invariant (the scenario's own core guarantee).
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# QA Standard & Active Reflection

> Read before reporting any task "done". **Never** claim completion without an independent
> verification step whose output you actually read. Copied from
> `../_templates/directives/qa_standard.md` — the three principles are stack-agnostic; only the
> commands and the example invariant below are scenario-specific.

## Principle 1 — Assume the code is wrong until proven otherwise (Zero Trust)

Whether the change is in `{{the app/service package}}` or `{{the core algorithm/domain package,
if this scenario has one split out like scenario 01's shared-kernel or scenario 02's
scheduling-core}}`, never assume it runs correctly on the first try.

- New logic ships with a unit test.
- A change to an existing flow re-runs the existing tests (`{{npm run test / npm run test
  --workspace=<path>}}`) — and you read the output, not just the exit code.

## Principle 2 — Active Reflection

Before concluding, run this loop:

1. **Hypothesis** — what does this do? Inputs? Expected output?
2. **Test run** — feed a wrong input to check error handling, then a correct input to see real
   output.
3. **Reflect** — does the output match the hypothesis? Any warning in the terminal? A **TypeScript
   or lint warning must be fixed now**, not ignored (`npm run check` = `typecheck lint
   format:check` where the scenario has that combined script; otherwise the equivalent commands).

## Principle 3 — Auto-Evaluation for complex work

For a non-trivial task (`{{name 1-2 real examples — the core algorithm, an importer, a command
that touches the database}}`), don't stop at unit tests — exercise it end-to-end:

- Call the new endpoint against a live `npm run dev` instance (`curl`, or the OpenAPI/Swagger UI
  at `{{/docs path}}` if one exists, or the UI itself).
- <!-- {{FILL IN}} — how do you actually inspect persisted state in THIS scenario? Examples from
       existing scenarios: `docker exec <container> psql -U <user> -d <db>` for a real Postgres,
       or `npm run db:studio` for Prisma Studio against whatever database is real here. Don't
       leave a stale reference to a database/file path a later phase might delete — this is
       exactly the bug this template exists to prevent (see ../../README.md's provenance note). -->
- Check relationships/invariants hold — `{{name the scenario's own core guarantee here, the thing
  its flagship ADR proves}}`.

Only report Done once this passes.

## Completion workflow

1. Code the feature / fix the bug.
2. Write / update the test case, at the layer that actually proves the claim (`testing_standard.md`).
3. Run `npm test` (or the relevant test command). Read the log carefully.
4. FAIL → back to step 1.
5. PASS → if the change is structurally complex, run a live end-to-end verification (Principle 3).
6. When fully confident, run the **After-Task Protocol** (see `AGENTS.md`): log the lesson to
   `.ai/memory/<category>.jsonl`, update the relevant `directives/*.md`, reconcile any affected
   `docs/NN_*.md`, update `.ai/PROJECT_STATUS.md` if a phase/module changed — then report Done.
