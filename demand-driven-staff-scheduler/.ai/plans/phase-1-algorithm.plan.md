# PHASE 1 PLAN — The auto-scheduler algorithm

> **Scope:** `packages/scheduling-core` complete — the five stages of `init-source.plan.md` §7.2–§7.7,
> built TDD with §8.1's property tests written alongside. **No database, no HTTP, no React.**
>
> **Predecessor:** `.ai/plans/init-source.plan.md` §12 Phase 0, executed and verified below.
> That plan is **not edited by this one** — CLAUDE.md's Citation Protocol forbids retouching an
> executed plan. Where it turned out wrong, the wrong prediction stays in it and is **annotated
> here** (§1). That contradiction is the audit trail.

---

## 0. Inherited state — verified, not assumed

Re-measured on 2026-08-17 rather than taken from the Phase 0 report:

| Check (init plan §10) | Result |
|---|---|
| `npm run typecheck` | ✅ clean, both workspaces |
| `npm test` | ✅ 9 tests green (8 core + 1 web), not zero |
| `packages/scheduling-core/package.json` → `"dependencies": {}` | ✅ |
| `.ai/memory/*.jsonl` exist | ✅ — but **no longer empty** (6 lines). §10 expected empty; Phase 0 correctly logged its own lessons per the After-Task Protocol. The checklist item is self-contradictory with `AGENTS.md` and is satisfied in spirit. |
| Importer parses 112 cells / 3,058 transactions | ⏳ Phase 2 — but the CSV was independently re-measured here and **all of §7.1's figures reproduce exactly** (112 cells, 3,058 total, peak 64 @ Fri 1pm, min 2 @ Tue 10pm, 1pm=329, 10pm=37, day totals Sat 508 … Sun 390) |
| §7.2 calibration table | ✅ **all seven rows, all four columns reproduce exactly** from the committed CSV |
| §7.8 seed arithmetic | ✅ capacity 46 seats/368 h · floor 34/272 · target 38/304 · U_min 32 seats — the last one confirmed to be `Σ ceil(0.6 × cap / 8)` per staff, not `0.6 × 368 / 8` (which is 27.6) |

**Consequence for Phase 1: the numbers in §7.1, §7.2 and §7.8 are trustworthy inputs.** They can be
written directly into tests as expected values. That is a meaningful result — it means stage 1 and
stage 2 have pinned, independently-derived targets before a line of them is written.

### 0.1 The three things Phase 0 correctly did *not* build

`sample-data/malformed/` (Phase 2) · `CASE_STUDY.*` (Phase 5) · the five stage modules, route
handlers and seven screens (Phases 1–3). Nothing outside init plan §0.2 was added. Confirmed by
diffing the tree against §0.2.

---

## 1. ⚠️ Defects inherited from the init plan — Phase 1 must resolve these first

These are annotations on `init-source.plan.md`, per the Citation Protocol. **That file stays as
written.**

### D1 ⭐ — §7.2's calibration rule does not produce §7.2's own answer

The plan states the rule:

> `suggestTransactionsPerStaff` binary-searches for the `N` where
> `floorStaffHours(N) ≈ targetUtilisation × Σ maxWeeklyHours`

and then states the result: *"For the §7.8 seed team (12 staff, 368 contracted hours), that yields
**`N` ≈ 18** — 272 floor staff-hours against a 294-hour target."*

**It does not.** Target is `0.8 × 368 = 294.4`. Sweeping every `N` from 8 to 40:

| N | 14 | **15** | 16 | 17 | **18** | 19 | 20 |
|---|---:|---:|---:|---:|---:|---:|---:|
| floor staff-hours | 312 | **296** | 280 | 272 | **272** | 264 | 264 |
| distance from 294.4 | 17.6 | **1.6** | 14.4 | 22.4 | **22.4** | 30.4 | 30.4 |

`N = 15` is the answer under every reading of "≈": nearest (296, off by 1.6), largest `N` with
`floor ≥ 294.4` (15), smallest `N` with `floor ≤ 294.4` (16). **`N = 18` is off by 22.4 hours and is
the 5th-best candidate.** The plan's own sentence "272 floor staff-hours against a 294-hour target"
states the mismatch out loud without noticing it.

This matters because `18` is not just prose — it is `@default(18)` in `prisma/schema.prisma`, it is
in the shipped migration, and §7.8's whole demo is computed at it. Implementing §7.2's rule literally
in Phase 1 produces a function that **contradicts the seeded default and the README's headline
number**.

> **Decision D1 — ✅ resolved (user, 2026-08-17): ship `18`, have `suggest` honestly return `15`,
> explain the divergence in ADR-0003.** Rationale and the rejected alternatives: §2.0.

### D2 — the frozen signature cannot compute what it is specified to compute

```ts
export function suggestTransactionsPerStaff(demand: DemandGrid, staff: Staff[], shifts: Shift[]): number;
```

`floorStaffHours(N)` needs `required[d][h] = clamp(ceil(txn/N), minStaffWhenOpen, maxStaffPerHour)`.
Neither `minStaffWhenOpen` nor `maxStaffPerHour` is reachable from those three arguments, and the
`targetUtilisation` (0.8) has no home either — `SchedulingParameters.minUtilisationTarget` is `0.6`
and is a **different quantity** (the fairness floor `U_min` of §7.5, not the calibration target of
§7.2). Two different utilisation numbers, one of which the type system cannot express.

**Resolution:** widen with a fourth *optional* argument, so the frozen 3-arg call still typechecks
and the package stays honest:

```ts
export interface CalibrationOptions {
  readonly minStaffWhenOpen?: number;      // default 1
  readonly maxStaffPerHour?: number;       // default none
  readonly targetUtilisation?: number;     // default DEFAULT_CALIBRATION_UTILISATION
}
export const DEFAULT_CALIBRATION_UTILISATION = 0.8;
export function suggestTransactionsPerStaff(
  demand: DemandGrid, staff: readonly Staff[], shifts: readonly Shift[], options?: CalibrationOptions,
): number;
```

`targetUtilisation` is deliberately **not** added to the Prisma `Schedule` model: it is an input to a
one-shot suggestion, not a stored per-schedule tunable. Adding a column for it would imply the
scheduler reads it, which it never does. `docs/04_data_model.md` needs no change; `docs/06` gains the
suggest endpoint (§7 below).

### D3 — four documents claim "no `.env` required", which is now false

The previous agent's finding is **correct and its fix is correct**: Prisma's `env("DATABASE_URL")`
has no default syntax, so a missing `.env` fails `prisma generate` with P1012. Committing
`apps/web/.env` (with `!apps/web/.env` negating the ignore) is the right call and is verified in
place.

But the fix stopped at the file. The stale claim survives in **four** places and one of them is the
`.env.example` written by the same change:

| File | Text |
|---|---|
| `apps/web/.env.example:1` | "a default SQLite path is baked in so no .env is required to run" |
| `docs/09_running_it.md:11` | "no `.env` required — `apps/web/.env.example` exists for overrides only" |
| `docs/09_running_it.md:29` | "on a machine with no `.env`" |
| `readme.md:72`, `RUN.md:10` | "No Docker, no `.env` required." |

**Resolution:** the user-facing claim is defensible if reworded to what is actually true — *"no `.env`
to create: `apps/web/.env` ships committed (a local SQLite path, not a secret)."* Fix all four in
Phase 1's first commit. The init plan §9's wording stays wrong-and-annotated.

### D4 — `.ai/PROJECT_STATUS.md`'s "Live debts" is stale

It claims *"`apps/web`'s `package-lock.json` is not yet generated"*. It is: 290 KB, committed at the
repo root, and `npm install` has demonstrably run (`.next/`, `node_modules/.cache/prisma` present).
Clear that line as part of Phase 1's status update.

### D5 — accepted as correct: the §10 grep checklist

The previous agent's second objection is **verified**. Both greps hit only prose. Critically,
`grep -ril "appointment\|dealership\|technician" apps/ packages/` returns **zero** — every hit is in
`docs/` or `directives/`, explaining a rejected alternative or citing scenario 01. Same for the infra
grep: the only `apps/` hit is `tsconfig.tsbuildinfo`, a build artifact. Its reading-by-intent is
right, and logging it to `conventions.jsonl` rather than silently passing was the correct channel.

No further action — but note its *proposed* remedy ("sửa lại câu đó trong plan §9/§10") **must not be
carried out**: editing an executed plan is exactly what the Citation Protocol forbids. Annotation
here is the mechanism.

---

## 2. Build order — six steps, each green before the next

TDD throughout. Every stage lands with its `*.spec.ts`; stages 3–4 also land with `*.prop-spec.ts`.

### 2.0 Step 0 — apply D1's decision, then fix D2/D3/D4

D1 is a decision, not a derivation, and it gates the expected values every later test asserts.
Options, with what each costs:

| | Option | `suggest` returns | Ships as default | Cost |
|---|---|---|---|---|
| **A** ⭐ | Implement the rule honestly; keep `18` as an explicitly hand-chosen default | 15 | 18 | No schema/migration/seed change. README must state both numbers and why they differ. |
| B | Implement the rule; move the default to what it returns | 15 | 15 | New migration, re-run §7.8's table, demo slack drops from 8 seats to 2 |
| C | Retune `targetUtilisation` until the rule outputs 18 (≈0.74) | 18 | 18 | A constant reverse-engineered from its answer — the weakest option, and a grader will see it |

> ✅ **DECIDED by the user, 2026-08-17: Option A.** Not a default — chosen against B and C with the
> costs above on the table. The rest of this plan assumes it.

**Why A.** It costs nothing structurally, keeps §7.8's demo ordering comfortable
(`32 < 34 < 38 < 46`, eight seats of genuine slack) rather than knife-edge (`32 < 37 < 44 < 46`), and
an honestly-reported divergence between a data-driven suggestion and a shipped default is *better*
evidence of judgement than a formula tuned to its own answer. `docs/12_ai_collaboration.md` is
already the place that argument lands.

Under A, `ADR-0003` gains a section: *"the suggestion says 15; we ship 18"* — with the reason being
that 15 commits 296 of 368 contracted hours to the floor alone, leaving almost nothing for the peak
top-up or the rebalance pass to work with.

### 2.1 Step 1 — `demand/demand-model.ts` (init plan §7.2)

```ts
export function computeRequiredStaff(demand: DemandGrid, p: SchedulingParameters): RequiredGrid;
```

`required[d][h] = clamp(ceil(txn/N), minStaffWhenOpen, maxStaffPerHour)` where a cell exists; absent
⇒ closed ⇒ 0 (never `minStaffWhenOpen`).

**Pinned edge cases** — each a named test, not left to the property layer:

- `N ≤ 0` → must not divide by zero. Define: treat as "one staff per transaction", i.e. clamp `N` to
  a minimum of a small positive epsilon, **or** return `maxStaffPerHour ?? minStaffWhenOpen`. Pick
  one and assert it; do **not** let it produce `Infinity`, which would silently poison every
  downstream sum.
- `maxStaffPerHour < minStaffWhenOpen` → the clamp is inverted. Define: `maxStaffPerHour` wins
  (a floor bigger than the room is not satisfiable), and stage 5 reports it.
- transactions `0` in an existing cell → still open, so `minStaffWhenOpen`, not 0.

**Acceptance:** re-derives §7.2's "required staff-hours" column for all seven `N` — 361 · 306 · 257 ·
226 · 210 · 173 · 162.

### 2.2 Step 2 — `requirements/shift-requirements.ts` (init plan §7.3)

```ts
export function computeShiftRequirements(required: RequiredGrid, shifts: readonly Shift[]): ShiftRequirements;
// floor[d][s]  = ceil(mean(required[d][h] for h in hoursTouchedBy(s)))
// target[d][s] = max (required[d][h] for h in hoursTouchedBy(s))
```

**Pin the "h in s" ambiguity now** — `hoursTouchedBy` (any overlap ≥ 1 minute), not "hours fully
contained". The distinction is invisible for the two seeded whole-hour shifts and changes every
number for a 07:30 shift, so it must be a decision rather than a side effect of how the loop was
written. `hour-range.ts` already provides it and is tested.

**Pinned edge cases:**

- **Zero-length or sub-hour shift** (`startMinute === endMinute`) → `hoursTouchedBy` is `[]` →
  `mean([])` is `NaN`. Define `floor = target = 0`. This is init plan §8.1's required degenerate case
  *"a shift covering no whole hour"* and is the single most likely `NaN` leak in the package.
- **Overlapping shifts** — process in `startMinute` order, subtracting coverage already committed by
  earlier shifts. Pin the tie-break for equal `startMinute`: by `(endMinute, id)`, never array order.
- A shift covering hours where the store is closed → those hours contribute `0` to the mean, which
  *lowers* `floor`. Assert this deliberately; the alternative (excluding them) is also defensible and
  the two differ, so the choice must be visible.

**Acceptance:** re-derives §7.2's `floor` and `target` columns — 408/512 · 344/440 · 296/352 ·
272/304 · 264/288 · 216/240 · 200/208 — and §7.8's 34 seats / 272 h and 38 / 304 at `N`=18.

### 2.3 Step 3 ⭐ — `assignment/feasibility-gate.ts` (init plan §7.4)

**The chokepoint. Build before either pass that uses it.** The structural claim of ADR-0001 lives or
dies on the nominal type actually being unforgeable:

```ts
declare const brand: unique symbol;
export interface Eligibility { readonly [brand]: 'Eligibility'; /* staffId, day, shift */ }
```

A `unique symbol` brand cannot be constructed outside the module that declares it — object literals
and `as` casts both fail without importing a symbol that is never exported. That is what makes
*"no code path can add an assignment without a gate verdict"* a compiler-checked fact rather than a
convention. `RosterState` exposes exactly one mutator, `commit(e: Eligibility)`.

Gate returns a **discriminated union**, not a boolean — the blocked reason is needed by stage 5:

```ts
type Verdict = { ok: true; eligibility: Eligibility } | { ok: false; reason: ReasonCode };
```

H1 `WOULD_EXCEED_MAX_HOURS` · H2 `OVERLAPS_EXISTING_SHIFT` (via `shiftsOverlap`, same-day only) ·
H3 `ALREADY_ASSIGNED` · H4 `UNAVAILABLE` specified-and-unimplemented (init plan §1's stretch slot).

**Evaluation order is load-bearing** and must be pinned: H3 → H2 → H1. `ALREADY_ASSIGNED` before
`OVERLAPS_EXISTING_SHIFT` because a shift trivially overlaps itself, and reporting "overlaps" for a
duplicate is a misleading diagnostic.

**Pinned edge case:** `maxWeeklyHours = 0` → every seat blocked `WOULD_EXCEED_MAX_HOURS`. Must not
throw, must not divide by zero downstream (see §2.5).

### 2.4 Step 4 — `assignment/assigner.ts` + `rebalancer.ts` (init plan §7.5)

Three deterministic passes: fairness (staff below `U_min`, lowest utilisation first) → coverage
(remaining floor seats, then top up toward target, largest uncovered peak first) → rebalance
(bounded local search, hard cap 200 iterations).

**Determinism is the whole point** (init plan §2.2) — every ordering ties break on `(name, id)`,
never insertion order, never `Math.random()`, never `Date.now()`. The lint rule already forbids the
last two; the first is a review item, because `Array.prototype.sort` is stable in V8 and will
*silently* pass a determinism test while depending on input order. **Assert determinism under input
permutation**, not just under repetition — repeating the same call proves nothing about ordering
dependence.

Rebalance accepts a move only if: the gate approves **and** coverage does not fall **and** the
max−min utilisation gap strictly shrinks. Strictly — a non-strict test can cycle forever under the
200-iteration cap and burn it every run.

### 2.5 Step 5 — `reporting/diagnostics.ts` + `summary.ts` (init plan §7.6, §7.7)

**`utilisation` when `maxWeeklyHours === 0`** — `0/0` is `NaN`, and `NaN < 0.6` is `false`, so the
`belowTarget` flag would come out *correct by accident* while `utilisation` renders as `NaN` in the
UI. Define explicitly: `maxWeeklyHours === 0` ⇒ `utilisation = 1`, `belowTarget = false`. A person
contracted for zero hours is not under-utilised.

**`summarise`** — the two week-level averages are the plan's own flagged bug risk:

| Metric | Formula | `staffHours = 0` behaviour |
|---|---|---|
| Transactions per staff hour (overall) | `Σtxn ÷ ΣstaffHours` — **weighted** | `null` when `ΣstaffHours = 0` |
| Average transactions per staff hour | mean of per-cell ratios — **unweighted** | cell **excluded from the mean** |

Two behaviours hang off `staffHours = 0`: the cell renders `–` (ratio `null`) **and** it is excluded
from the unweighted mean. Getting one right and the other wrong is the predicted bug — so they get
**two separate assertions**, not one.

**Acceptance:** the brief's illustrative day — `33 + 48 + 33 = 114` over 8 staff-hours = `14.25` —
is a unit test, per init plan §7.7.

### 2.6 Step 6 — wire `index.ts`, delete the four `throw`s

`generateRoster` · `summarise` · `suggestTransactionsPerStaff` · `validateRoster`. `validateRoster`
**replays the same `FeasibilityGate`** over a supplied roster — assignment by assignment against a
fresh `RosterState`. One implementation of the rules, two callers. A second copy for the manual path
is how the two paths drift (init plan §7.4).

---

## 3. The property layer (init plan §8.1) — the flagship

Per `directives/testing_standard.md` §2. Arbitraries co-located; **the arbitraries are the test.**

Required degenerate cases, all nine, explicitly weighted rather than hoped for: zero staff · one
staff · `maxWeeklyHours = 0` · a max smaller than one shift · all-zero demand · a single enormous
spike · more shift-hours than the team can legally cover · overlapping shift definitions · a shift
covering no whole hour.

Three assertions minimum on every spec:

1. **H1–H3 hold** — `validateRoster(result.roster, input)` returns `[]` for every generated case.
   This is the ADR-0001 claim under test.
2. **Totality** — `generateRoster` never throws. A throw here is *always* a bug, never a "bad input":
   infeasible is a diagnostics case (init plan §7.6), and CLAUDE.md's hard rules name this
   explicitly.
3. **Determinism** — same input twice → `toEqual`; **and** permuted `staff`/`shifts` arrays → the
   same roster up to assignment ordering.

Add a fourth, which the plan implies but never states: **no seat is invented** — every assignment in
the roster corresponds to a `(day, shift)` in the input and a staff member in the input. A generator
that emits a `shiftId` not in `input.shifts` would satisfy 1–3 and be catastrophically wrong.

---

## 4. The golden file (init plan §8.2)

Snapshot on the real committed CSV at the seeded parameters. **Blocked on Phase 2's importer** — so
Phase 1 lands it against a hand-built `DemandGrid` fixture derived from the CSV's 112 cells, and
Phase 2 swaps the fixture for the importer's output and asserts they are identical. That swap is the
importer's strongest test and costs nothing to set up now.

---

## 5. Exit criteria — Phase 1 is done when

- [ ] `npm test` green; the four `throw new Error('not implemented')` are gone from `index.ts`
- [ ] `npm run typecheck` + `npm run lint` clean; `dependencies` still `{}`
- [ ] Stage 1 re-derives §7.2's `required` column for all seven `N`
- [ ] Stage 2 re-derives §7.2's `floor` **and** `target` columns for all seven `N`
- [ ] §7.8's seed arithmetic asserted: 46 seats/368 h · 34/272 · 38/304 · `U_min` 32 seats
- [ ] The brief's `114 ÷ 8 = 14.25` passes
- [ ] Property specs green with all nine degenerate cases present in the arbitraries
- [ ] `Eligibility` provably unforgeable — a test file that tries to build one **fails to compile**
      (keep it as a `// @ts-expect-error` assertion, which turns a compile failure into a passing test)
- [ ] D1 decided and recorded in ADR-0003; D2's signature widened; D3's four files reworded;
      D4's stale debt line cleared
- [ ] **No database, no HTTP, no React was involved** — the Phase 1 gate from init plan §12

---

## 6. After-Task obligations (CLAUDE.md)

1. `.ai/memory/architecture.jsonl` — D1's resolution and the `unique symbol` brand mechanism.
   `.ai/memory/gotchas.jsonl` — the `NaN` traps (`mean([])`, `0/0` utilisation) if they bite.
2. `directives/testing_standard.md` — add the permutation-determinism and no-invented-seat
   assertions to §2.3 if they prove out.
3. **Spec reconciliation (step 3, mandatory here):** `docs/03_architecture.md` (the algorithm's
   public surface changed — D2) · `docs/06_api_contracts.md` (add the suggest endpoint, absent
   today) · `docs/adr/0003-demand-to-headcount-model.md` (D1). `docs/04_data_model.md` needs **no**
   change — D2 deliberately adds no column.
4. `.ai/PROJECT_STATUS.md` — phase flip, and clear D4.

---

## References & Compliance

| Source read | What it decided here |
|---|---|
| `.ai/plans/init-source.plan.md` §§0.1, 2.3, 7.2–7.8, 8.1, 10, 12 | The entire stage specification, the frozen surface, the property layer's required degenerate set, and §5's exit criteria. **§7.2 and §7.8 were re-derived from the CSV rather than trusted — which is what surfaced D1.** |
| `sample-data/report_Transaction_20260807_20260813.csv` (re-measured) | §0's verification table · D1's sweep of `N` from 8 to 40 · the pinned acceptance values in §2.1 and §2.2 |
| `packages/scheduling-core/src/model/types.ts`, `index.ts`, `model/hour-range.ts` (read) | D2 (the signature gap and the missing home for `targetUtilisation`) · §2.2's `hoursTouchedBy` decision · §2.5's `NaN` traps, found in the existing type definitions |
| `directives/testing_standard.md` §§1, 2.1–2.4 | §3 in full — co-location, weighted arbitraries, the three mandatory assertions |
| `directives/naming_conventions.md` §§1–3 | Every module and function name in §2; the `FeasibilityGate`/`Eligibility`/`RosterState` naming; the reason-code-plus-ADR-table rule |
| `CLAUDE.md` — Citation Protocol, After-Task Protocol, Hard Rules | Why §1 annotates instead of editing the init plan; §6's obligations; the "never throw on feasible-but-bad input" rule behind §3's assertion 2 |
| `apps/web/prisma/schema.prisma`, `.env`, `.env.example`, `.gitignore`, `docs/09`, `readme.md`, `RUN.md` (read) | D3's confirmation and its four-file blast radius · D2's decision not to add a `targetUtilisation` column |
| `docs/06_api_contracts.md` (read) | §6 step 3 — the suggest endpoint is missing from the contract |

**Not delegated — decided by hand and open to challenge:** D1's Option A recommendation (ship 18,
report 15, explain the gap) · D2's optional-fourth-argument widening rather than a breaking change ·
§2.2's `hoursTouchedBy` reading of "h in s" · §2.3's H3→H2→H1 evaluation order · §2.5's
`utilisation = 1` when `maxWeeklyHours = 0` · §3's fourth assertion, which the init plan does not
contain.
