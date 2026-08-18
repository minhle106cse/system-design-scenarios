<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: the layer table; which runner each package uses; the property-based section only applies to a scenario with an algorithm core.
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# SOP: Testing Standard

> Rewritten from `../service-appointment-scheduler/directives/testing_standard.md`, not ported —
> that file exists mainly to document Jest's ESM/CJS bridging (`shared-kernel` is ESM, Jest is
> CommonJS). Where a scenario uses **Vitest** it needs none of that. What's genuinely new
> here is §2 — **property-based testing**, the flagship layer for a scenario with an algorithm core — which the
> source file has no section for at all.

## 🎯 Goal

One way to organize test files and one bar for what "tested" means, so the same approach works
whether an AI agent or a human writes the next test — and so the flagship layer (§2) is written
with the same rigor every time, not reinvented per file.

## 📜 The three layers — pick by what the test needs to prove

| Layer | Suffix | Proves | Cannot prove |
|---|---|---|---|
| 1 ⭐ Property-based | `*.prop-spec.ts` | For **arbitrary** inputs: hard constraints hold, the function is total, determinism | The app is wired up; the roster is *good* |
| 2 Golden file | `*.spec.ts` (snapshot) | The exact result for the real committed dataset | Anything about other inputs |
| 3 Integration | `*.spec.ts` (`apps/scheduler-api`, real Postgres) | Controllers/handlers, the CSV importer, `validateRoster` against a manual edit | Generality, algorithm quality |

## 1. Co-location and naming

- Test files sit **directly next to** the source file they test — `hour-range.ts` →
  `hour-range.spec.ts`; a property test for the assigner is `assigner.prop-spec.ts`, next to
  `assigner.ts`, not a third file elsewhere.
- **Forbidden**: a root-level `test/`/`tests/` folder. Delete any a framework CLI scaffolds.
- **A runner per package is fine** — match whatever toolchain each package was ported with rather
  than migrating a green suite for consistency alone (scenario 02 runs Vitest in its core package
  and frontend, Jest in shared-kernel and the API). `npm test` at the root fans out to every
  workspace through Turborepo.
- Both suffixes run on `npm test` (`vitest.config.ts`'s `include` lists both). Layers 1–2 need no
  infrastructure (a dependency-free core package runs in milliseconds); **layer 3 needs Postgres
  up** (`docker compose up -d`), which is why a change to the API service is verified against
  a live database per `qa_standard.md` Principle 3, not by unit tests alone.

## 2. ⭐ Property-based testing (fast-check) — the flagship layer

Read this before writing **any** `*.prop-spec.ts` under `packages/scheduling-core`.

### 2.1 Arbitraries are co-located, not shared blind

Define arbitraries in the same `*.prop-spec.ts` file, or in a `*.arbitraries.ts` file next to it if
more than one spec needs the same shape. Don't reach for a generic "any valid SchedulingInput"
arbitrary that hides which dimension is actually being varied — a property test should make obvious,
from its arbitrary alone, what it is trying to break.

### 2.2 The arbitraries must deliberately generate the degenerate cases

A property test over tame inputs proves nothing and looks rigorous — worse than no test, because it
reads as coverage. `fc.integer()` alone will rarely hit zero staff or an all-zero demand grid inside
a reasonable run count. Bias the arbitrary explicitly, e.g.:

```typescript
const staffArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant([]) },              // zero staff
  { weight: 1, arbitrary: fc.array(staffMemberArb, { minLength: 1, maxLength: 1 }) },
  { weight: 1, arbitrary: fc.array(staffMemberArb).map((s) => s.map((m) => ({ ...m, maxWeeklyHours: 0 }))) },
  { weight: 5, arbitrary: fc.array(staffMemberArb, { maxLength: 20 }) }, // the general case
);
```

The plan's required degenerate set (§8.1): zero staff · one staff · `maxWeeklyHours = 0` · a max
smaller than one shift · all-zero demand · a single enormous spike · more shift-hours than the team
can legally cover · overlapping shift definitions · a shift covering no whole hour. A `*.prop-spec.ts`
missing several of these from its arbitraries is missing the point of the layer, even if it passes.

### 2.3 What every property spec must assert, at minimum

- **H1–H3 hold** (`validateRoster(result.roster, input)` returns `[]` for every generated case).
- **Totality** — `generateRoster` never throws for any input the arbitrary can produce (a thrown
  error here is *always* a bug where the brief requires graceful degradation).
- **Determinism** — same input twice → structurally equal roster (`expect(a).toEqual(b)`, not `===`).

### 2.4 Shrinking and failing seeds

When fast-check finds a counterexample, it shrinks to the smallest failing case — read that
shrunk case, not the original random seed, when debugging. If a shrunk failure is a real bug, **fix
the bug**; only pin the seed (`fc.assert(prop, { seed, path })`) as a temporary regression guard
while the fix lands in the same commit, and remove the pin once the underlying arbitrary would catch
it unaided. Never widen an arbitrary specifically to stop hitting a case that exposed a real bug.

## 3. TypeScript mocking standard

A dependency-free core package has nothing to mock — its tests call the real functions. When
a handler's test needs to isolate it from a repository, use a type-safe cast — identical in shape to
`../service-appointment-scheduler/directives/testing_standard.md` §2, with the runner's own mock
factory:

```typescript
// apps/scheduler-api (Jest)
let mockShiftRepo: jest.Mocked<IShiftRepository>

beforeEach(() => {
  mockShiftRepo = {
    create: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<IShiftRepository>
})
```

Under Vitest the same pattern uses `vi.fn()` and `Mocked<T>` from `vitest`. This avoids
TypeScript complaining about missing private/inherited properties of the real interface.

> ⚠️ `apps/scheduler-api/eslint.config.mjs` disables `@typescript-eslint/unbound-method` and
> `no-unnecessary-type-assertion` for spec files **because of this exact pattern** — see that file's
> comment. Don't "clean up" the `as unknown as` cast; it is load-bearing.

## 4. Import path alias (`@/`)

No long relative paths reaching outside the current directory cluster — use the `@/` alias.
A Vitest package maps it in `tsconfig.json` + `vitest.config.ts`; a Jest package maps it in
`tsconfig.json` + `package.json`'s `jest.moduleNameMapper`.
