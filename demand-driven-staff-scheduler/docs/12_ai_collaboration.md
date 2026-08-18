# AI Collaboration Note

The brief asks for an AI-usage note: what was delegated, what was verified, what was overridden.
This is that note — updated as the build proceeds, not written once at the end.

## Delegated

- Full scaffolding of Phase 0 (plan §12): workspace layout, `scheduling-core`'s skeleton and
  eslint purity guard, the Next.js app shell, the Prisma schema, the ported/trimmed AI-workflow
  apparatus (`.claude/`, `scripts/sync.cjs`, `directives/*.md`), and this doc set — generated from
  a plan written and reviewed before any file existed (`.ai/plans/init-source.plan.md`).
- The demand CSV's four parser traps (plan §4) were found by having the agent open and measure the
  actual file, not by reasoning about the brief's idealised description of it.

## Verified

- `npm run typecheck`, `npm run lint`, `npm test` — read, not just exit-code-checked (§10).
- The importer's 112-cell/3,058-transaction assertion against the real committed CSV, before any
  UI existed (plan §12 Phase 2 gate) — a number that could be independently recomputed from the
  file, not just asserted.
- Every property test's arbitraries checked by hand for the degenerate cases plan §8.1 requires,
  not assumed present because the test passed.

## Overridden

- **The stack itself.** The first draft mirrored scenario 01's NestJS + Fastify + PostgreSQL +
  Docker + Turborepo, and was reversed on review — none of the brief's five grading criteria is
  infrastructure. `.ai/plans/init-source.plan.md` §0.0 records the wrong first draft rather than
  deleting it.
- **The `N` calibration base.** An early version of the plan calibrated `N` against raw required
  staff-hours; measuring the real dataset showed the shift-quantisation gap (~20%) that made that
  wrong, and the plan was corrected to calibrate against *floor* staff-hours instead (plan §7.2).

This file is reconciled in the same task as any decision it documents changes — see `AGENTS.md`'s
Citation Protocol and After-Task Protocol.
