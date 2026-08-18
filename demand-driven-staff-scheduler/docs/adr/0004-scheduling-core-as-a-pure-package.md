# ADR-0004 — `scheduling-core` as a Zero-Dependency Package

**Status:** Accepted.

## Context

The brief calls the auto-scheduler *"the heart of the exercise."* It also asks the candidate to
*"be ready to make or discuss small changes to the code on the spot."* The algorithm needs to be
provable (ADR-0001's property-based layer) and fast enough that a thousand-case property suite runs
on every commit without becoming the test nobody runs.

## Decision

The algorithm lives in its own npm workspace package, `packages/scheduling-core`, with **zero
runtime dependencies**: no React, no Prisma, no Next, no date library, no `process.env`, no
`Date.now()`, no `Math.random()`. Plain data in, plain data out (`docs/00_overview.md`).

Enforced, not stated: `dependencies` in `packages/scheduling-core/package.json` is `{}`, and its
own `eslint.config.js` adds a `no-restricted-imports` rule naming every framework the rest of the
repo uses. Adding `import { PrismaClient } from '@prisma/client'` to any file under `src/` **fails
lint** — this is the check `docs/09_running_it.md`'s verification gate runs.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Algorithm as a server module inside `apps/web/src/server/` | Nothing stops a future edit from reaching for `prisma` "just this once" inside a use-case that happens to also hold algorithm code — the boundary has to be a *package* boundary (a different `node_modules` resolution root, a different `package.json`) to be lint-enforceable at all, not a folder convention that depends on discipline |
| Algorithm logic embedded in the React tree (compute-on-render) | Couples the algorithm to a rendering framework's lifecycle; makes `summarise` un-callable from a server-side golden-file test without a DOM; violates "plain data in, plain data out" the moment a hook or component prop shape leaks into the algorithm's types |
| Algorithm expressed in SQL (views/stored procedures) | SQLite's SQL surface can't express the fairness rebalance's iterative local search; ties the algorithm to a specific database engine, defeating the point of keeping persistence swappable; makes property-based testing impractical (fast-check drives TypeScript functions, not stored procedures) |

## Consequences

- Property tests (`*.prop-spec.ts`) run in milliseconds with no infrastructure — the whole basis
  for `directives/testing_standard.md` §2's "thousands of generated cases per commit" claim.
- Determinism is structural, not conventional: nothing in the package *can* read a clock or a
  random seed, so "same input → same roster" (needed for the golden-file layer, plan §8) is a fact
  about the type signatures, not a promise kept by convention.
- The graded target is isolated from the scaffolding — a reviewer with limited time can read one
  package (`packages/scheduling-core/src/`) and have the whole algorithmic answer, without wading
  through Next.js routing or Prisma config first.
