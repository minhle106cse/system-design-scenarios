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
  `.query-repository.ts` / `I{Entity}QueryRepository`

Example: `IAppointmentRepository` (domain) ↔
`PrismaAppointmentRepository` (infrastructure).

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

## ⚠️ How to apply this file

- **Rules here apply to NEW code.** Any exception listed is known technical debt — don't mass-rename
  while just reading past it; fix only when another legitimate change already touches that exact file.
- When creating a class in one of the groups above and unsure what to name it, ask that group's
  decision question — don't copy the nearest-looking name found via Ctrl+F, since that name might
  itself be one of the documented exceptions.
