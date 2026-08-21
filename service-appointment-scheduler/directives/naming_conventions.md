# SOP: Naming Conventions

> Naming standard for class/file families that repeat across the codebase. Read this BEFORE
> creating a class in one of the groups below — the goal is that the name states the mechanism,
> without needing to open the file.
>
> Trimmed from Cortex's version: dropped Guard/Caller/gRPC-Client/Domain-Port/Messaging-Port
> naming groups entirely — this repo has no auth guards, no gRPC, no outbound AI/service calls,
> no messaging layer at T1/T2 (see `.ai/plans/init-source.plan.md` §4). Re-add the relevant group from Cortex's
> original if any of that arrives.

## 1. Repository (Domain interface + Infrastructure impl)

**Rule:**
- Interface: `I{Entity}Repository` (domain layer)
- Implementation: `Prisma{Entity}Repository implements I{Entity}Repository`
- A separate read-side interface that returns DTOs instead of Entities (CQRS query side): suffix
  **`application/repositories/`** + the `.query-repository.ts` suffix / `I{Entity}QueryRepository`

Example: `IAppointmentRepository` (domain) ↔
`PrismaAppointmentRepository` (infrastructure).


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

## 2. Command/Query Handler (CQRS)

**Rule:** `{Verb}{Noun}Command` / `{Verb}{Noun}Query` always pairs with `{Verb}{Noun}Handler` — the
handler's name must match the command/query it handles EXACTLY (no abbreviation, no reordered words).

Example: `BookAppointmentCommand` ↔ `BookAppointmentHandler`,
`CheckAvailabilityQuery` ↔ `CheckAvailabilityHandler`.

## 3. Domain Error class

**Rule:** `{SpecificReason}Error extends ApplicationError` (never `AppError`/`Exception` directly).

**Location + filename:** `common/errors/{module}.error.ts` — **singular** (`error`, not `errors`).

Example (once written): `common/errors/booking.error.ts` exporting
`AppointmentSlotConflictError`, `TechnicianNotQualifiedError`.

## 4. NestJS Module (`@Module`)

**Rule:** `{Feature}Module`, filename `{feature}.module.ts` — the class name must match the
filename (no hidden prefix that doesn't appear in the filename).

⚠️ **Known exception, carried from Cortex, not yet fixed:**
`apps/scheduler-api/src/infrastructure/http/idempotency/idempotency.module.ts` — filename says
`idempotency.module.ts` but the actual class is `HttpIdempotencyModule`, not `IdempotencyModule`.
Historical reason: `HttpIdempotencyModule` deliberately distinguishes HTTP-layer idempotency from
a message-consumer idempotency mechanism at a different layer (see `idempotency_strategy.md`) —
still worth fixing the filename to `http-idempotency.module.ts` to match when convenient; don't
rename the class (its name is the correct one).

## 5. Config env var

**Rule:**
- `.env`: `SCREAMING_SNAKE_CASE`. This repo has one service, so there is no `{SERVICE}_` prefix
  disambiguation problem Cortex has across 5 services — keep names short (`PORT`, `LOG_LEVEL`),
  except where the value is genuinely service-scoped by convention (`SCHEDULER_DATABASE_URL`,
  `SCHEDULER_DB_NAME`), matching `.env.example`.
- `env.config.ts` (after `registerAs('env', ...)` reshapes it): `camelCase`, preserve the
  singular/plural of the source name (`corsAllowedOrigins` is plural because
  `CORS_ALLOWED_ORIGINS` is a comma-separated list).
- Singular/plural must match real semantics: one value → singular (`PORT`); a list of
  comma-separated values → plural (`CORS_ALLOWED_ORIGINS`).

## 6. Domain Service (pure logic, class not functions)

**Rule:** `{Concern}Calculator` / `{Concern}Selector` / `{Concern}Detector` — the suffix names the
kind of operation, `{Concern}` names what it operates over. Never a plain module of `export
function`s; see `directives/domain_modeling.md` §4 for the full rule (state as constructor config,
genuinely stateless operations may stay `static`, domain-layer instances built with `new`, never
`@Injectable`).

Examples: `BusinessHoursCalculator` (business-hours arithmetic), `ResourceSelector` (bay/technician
selection policy), `ExclusionViolationDetector` (Postgres exclusion-constraint error detection —
infrastructure-layer, no I/O of its own, still follows this rule per §4's note on pure logic that
happens to live under `infrastructure/`).

## 7. Application Service (application-layer orchestration with no CommandBus/QueryBus)

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

## 8. `presentation/` controller sub-folder — always nested under `controllers/`

**Rule:** `presentation/controllers/{{name}}.controller.ts`, never
`presentation/{{name}}.controller.ts` — matching `folder_structure_sop.md`'s tree, and matching
`presentation/schemas/`, which is already nested the same way.

The failure this prevents is silent: a module with exactly ONE controller has no second file to
look inconsistent against, so the flat form reads fine right up until a second controller appears
and the layout is now half-nested. Upstream, two of Cortex's four services had drifted flat this
way while its six core-api modules were all correctly nested.

## ⚠️ How to apply this file

- **Rules here apply to NEW code.** Any exception listed is known technical debt — don't mass-rename
  while just reading past it; fix only when another legitimate change already touches that exact file.
- When creating a class in one of the groups above and unsure what to name it, ask that group's
  decision question — don't copy the nearest-looking name found via Ctrl+F, since that name might
  itself be one of the documented exceptions.
