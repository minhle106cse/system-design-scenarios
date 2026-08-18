<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: groups 1-3 are per-scenario (its own core package); groups 4-9 are the shared Repository/CQRS/error/module/env families — port those verbatim.
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# SOP: Naming Conventions

> Naming standard for the file/class families that repeat across this codebase. Read this BEFORE
> creating a file in one of the groups below — the goal is that the name states the mechanism,
> without needing to open the file.
>
> Groups 1–3 (`scheduling-core`) are this scenario's own. Groups 4–9 are ported from
> `../service-appointment-scheduler/directives/naming_conventions.md` — this repo has the same
> Repository / CQRS-Handler / domain-error / NestJS-Module families since the backend-architecture
> reversal, so the naming rules for them are the same rules, not a parallel invention.

## 1. `scheduling-core` stage modules

**Rule:** one file per pipeline stage, named for the stage's output, not its mechanism —
`demand-model.ts` (not `stage1.ts`), `shift-requirements.ts`, `feasibility-gate.ts`, `assigner.ts`,
`rebalancer.ts`, `diagnostics.ts`, `summary.ts`. A stage's public function is a verb naming what it
produces: `computeRequiredStaff`, `computeShiftRequirements`, `generateRoster`.

## 2. The gate and its verdict types

**Rule:** the chokepoint class has exactly ONE name (here `FeasibilityGate`) — never
`Validator`, never `Checker`. `Eligibility` is the nominal type only the gate can construct;
`RosterState` is the only mutable structure, with exactly one mutator, `commit()`. Do not add a
second way to express "this assignment is allowed."

## 3. Reason codes

**Rule:** `SCREAMING_SNAKE_CASE`, present-tense description of what the constraint says, not what
went wrong grammatically: `WOULD_EXCEED_MAX_HOURS`, not `MAX_HOURS_ERROR`. New reason codes are
added to the reason-code union in the core package's types AND to the table in the constraint ADR in the
same change — a reason code that exists in code but not in the ADR's table is undocumented law.

## 4. Repository (domain interface + infrastructure impl)

**Rule:**
- Interface: `I{Entity}Repository`, in `modules/scheduling/domain/repositories/{entity}.repository.ts`
  — `IShiftRepository`, `IAssignmentRepository`, `IStaffMemberRepository`.
- Implementation: `Prisma{Entity}Repository implements I{Entity}Repository`, in
  `modules/scheduling/infrastructure/repositories/prisma-{entity}.repository.ts`.
- Method names say what they return, never a bag of exported functions:
  `findById`, `listByScheduleId`, `create`, `update`, `softDelete`/`delete`, `replaceAll`,
  `upsertMany` — matching `../service-appointment-scheduler`'s own rule 1.
- The read-side (CQRS query) uses a **separate** interface returning plain DTOs, not domain
  entities: `ISchedulingQueryRepository` (`application/queries/scheduling.query-repository.ts`),
  implemented by `PrismaSchedulingQueryRepository` — one query repository for the whole module,
  not one per entity, because every query so far reads the same `ScheduleDetail` shape.

Example: `IShiftRepository` (domain) ↔ `PrismaShiftRepository` (infrastructure).

## 5. Command/Query Handler (CQRS)

**Rule:** `{Verb}{Noun}Command` / `{Verb}{Noun}Query` always pairs with `{Verb}{Noun}Handler` — the
handler's name must match exactly, no abbreviation, no reordered words.

Example: `AddShiftCommand` ↔ `AddShiftHandler`, `GetCoverageQuery` ↔ `GetCoverageHandler`.

One file per command/query, one file per handler, one directory per command/query
(`application/commands/add-shift/{add-shift.command.ts, add-shift.handler.ts}`) — never a
command and its handler sharing one file, even though it's a small handler.

## 6. Domain error class

**Rule:** `{SpecificReason}Error extends ApplicationError` (never `AppError` or a bare
`Error`/`HttpException` directly). Location + filename: `common/errors/scheduling.error.ts` —
**singular** `error`, not `errors`, and every error for the whole module in one file (this module
has one domain, `scheduling` — a per-entity split would be premature).

Example: `ScheduleNotFoundError`, `RosterViolationError`, `InvalidShiftTimeRangeError`.

## 7. NestJS Module (`@Module`)

**Rule:** `{Feature}Module`, filename `{feature}.module.ts` — the class name must match the
filename. This repo has exactly one feature module, `SchedulingModule`
(`modules/scheduling/scheduling.module.ts`) — a second one (if this domain ever grows a genuinely
separate bounded context) follows the same pattern.

## 8. Zod schemas

**Rule:** `{noun}Schema` (camelCase, not `{Noun}Schema` — matches how they're actually declared:
`createShiftSchema`, `updateStaffSchema`), colocated under
`modules/scheduling/presentation/schemas/{resource}.schema.ts` — one file per resource, one schema
per shape. The inferred type is exported as `{Noun}Input` — `createStaffSchema` /
`CreateStaffInput`. See `directives/zod_validation.md` for the full rule.

## 9. Config env var

**Rule:**
- `.env`: `SCREAMING_SNAKE_CASE`. One service (`apps/scheduler-api`) owns all persistence, so most
  names need no service prefix (`PORT`, `LOG_LEVEL`) — except where the value is genuinely
  service-scoped by convention (`SCHEDULER_DATABASE_URL`, `SCHEDULER_DB_NAME`), matching
  `.env.example`.
- `env.config.ts` (after `registerAs('env', ...)` reshapes it): `camelCase`, preserving the source
  name's singular/plural — `corsAllowedOrigins` is plural because `CORS_ALLOWED_ORIGINS` is a
  comma-separated list, `port` is singular because `PORT` is one value.
- **If the scenario has a frontend**, its env vars follow the *framework's* prefix convention, not
  this one — e.g. Next.js requires `NEXT_PUBLIC_` for anything readable client-side.

## ⚠️ How to apply this file

- **Rules here apply to NEW code.** If a later refactor reveals a better name for an existing
  group, update this file in the same task (`directives/memory_sop.md` §"self-annealing loop") —
  don't let the file and the code drift.
- When unsure what to name something in one of the groups above, ask that group's naming question
  directly rather than copying the nearest-looking name found via search.
