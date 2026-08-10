/**
 * Re-exports `SchedulerApiRepos` under `@/infrastructure/cqrs` so a
 * transactional command handler can type its `execute(command, tx: S)`
 * parameter without importing `@/infrastructure/database` directly —
 * `eslint.config.mjs` blocks that path from a module's application layer
 * (ORM/DB must stay behind a repository interface), but a handler's `S` type
 * parameter is the repos SHAPE, not the ORM itself, and CQRS wiring
 * (`@/infrastructure/cqrs`) is the one infrastructure import application code
 * is already allowed to make (`directives/cqrs_pattern.md` §3).
 *
 * Kept as a type-only re-export: this file adds no runtime code, so it cannot
 * become a second source of truth for the repos shape — the factory in
 * `database/prisma/scheduler-api-repos.factory.ts` is still the only place it
 * is defined and constructed.
 */
export type { SchedulerApiRepos } from '../database/prisma/scheduler-api-repos.factory'
