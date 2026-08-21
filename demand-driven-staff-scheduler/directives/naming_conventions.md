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

**Rule:** one file per pipeline stage (plan §7), named for the stage's output, not its mechanism —
`demand-model.ts` (not `stage1.ts`), `shift-requirements.ts`, `feasibility-gate.ts`, `assigner.ts`,
`rebalancer.ts`, `diagnostics.ts`, `summary.ts`. A stage's public function is a verb naming what it
produces: `computeRequiredStaff`, `computeShiftRequirements`, `generateRoster`.

## 2. The gate and its verdict types

**Rule:** `FeasibilityGate` is the only class name for the chokepoint (plan §7.4) — never
`Validator`, never `Checker`. `Eligibility` is the nominal type only the gate can construct;
`RosterState` is the only mutable structure, with exactly one mutator, `commit()`. Do not add a
second way to express "this assignment is allowed."

## 3. Reason codes

**Rule:** `SCREAMING_SNAKE_CASE`, present-tense description of what the constraint says, not what
went wrong grammatically: `WOULD_EXCEED_MAX_HOURS`, not `MAX_HOURS_ERROR`. New reason codes are
added to the `ReasonCode` union in `model/types.ts` and to the table in `docs/adr/0001-*.md` in the
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
  entities: `ISchedulingQueryRepository` (**`application/repositories/scheduling.query-repository.ts`**),
  implemented by `PrismaSchedulingQueryRepository` — one query repository for the whole module,
  not one per entity, because every query so far reads the same `ScheduleDetail` shape.

Example: `IShiftRepository` (domain) ↔ `PrismaShiftRepository` (infrastructure).


**⚠️ `.query-repository.ts` is reserved for `application/repositories/` ports — do NOT use it for a
domain-layer READ port.** That suffix means something specific (an application-layer port whose
result goes back to a query handler) and implies a location; using it for a domain-consumed reader
is misleading about both. A read port that a **domain** class depends on stays in
`domain/repositories/`, named `I{X}Reader` in `<name>.repository.ts`, implemented as
`Prisma{X}ReaderRepository`.

**Where a repo interface goes is not a naming question** — this file names things,
`cqrs_pattern.md` decides the location via an ordered 2-step procedure (step 1: has a mutating
method? -> domain; step 2: read-only, does anything in `domain/` import it? -> domain if yes,
`application/repositories/` if no). Read that first, then name per the two cases above. Placement is
machine-checked by `npm run check:arch`; naming is not, so the cases above still need a human eye.

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
- `apps/web` (the frontend) has exactly one env var, `NEXT_PUBLIC_API_BASE_URL` — Next.js's own
  `NEXT_PUBLIC_` prefix convention, not this repo's, since it must be readable client-side.

## 10. Application Service (application-layer orchestration with no CommandBus/QueryBus)

**Rule:** `{{Verb}}{{Noun}}Service`, file `{{verb}}-{{noun}}.service.ts`, in `application/queries/`
(or `application/` when there is no query-repo) — this is what a query handler would be called if
the service HAD a bus to dispatch through.

⏸ **Not currently used in this scenario** — every read here goes through the QueryBus, so the
Command/Query Handler group applies instead. Kept because the trigger is concrete and cheap to
miss: **the moment a read path is called directly from the controller via DI rather than
dispatching a `Query` object**, this is its naming rule. Naming such a class `...Handler` without a
matching `Query` implies a bus dispatch that does not exist.

Upstream example (Cortex `search-service`): `SearchKnowledgeService` sits in `application/queries/`,
called straight from the controller, because that service deliberately has no CommandBus/QueryBus —
its only write arrives as an event, not an HTTP command. Its sibling `IndexKnowledgeHandler` IS a
`...Handler` because an event router dispatches it. The asymmetry is the rule working, not an
inconsistency.

Do **not** reach for this group to dodge naming a `Query`/`Handler` pair when a bus IS available.

## 11. `presentation/` controller sub-folder — always nested under `controllers/`

**Rule:** `presentation/controllers/{{name}}.controller.ts`, never
`presentation/{{name}}.controller.ts` — matching `folder_structure_sop.md`'s tree, and matching
`presentation/schemas/`, which is already nested the same way.

The failure this prevents is silent: a module with exactly ONE controller has no second file to
look inconsistent against, so the flat form reads fine right up until a second controller appears
and the layout is now half-nested. Upstream, two of Cortex's four services had drifted flat this
way while its six core-api modules were all correctly nested.

## ⚠️ How to apply this file

- **Rules here apply to NEW code.** If a later refactor reveals a better name for an existing
  group, update this file in the same task (`directives/memory_sop.md` §"self-annealing loop") —
  don't let the file and the code drift.
- When unsure what to name something in one of the groups above, ask that group's naming question
  directly rather than copying the nearest-looking name found via search.
