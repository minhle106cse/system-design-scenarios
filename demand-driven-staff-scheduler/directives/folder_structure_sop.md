# Folder Structure SOP — Demand-Driven Staff Scheduler

> **This is an immutable directive.** `apps/scheduler-api` MUST follow this structure. The agent
> MUST NOT create files/folders that deviate from it without owner approval.
>
> Ported from `../service-appointment-scheduler/directives/folder_structure_sop.md` (itself ported
> from Cortex). The layout is **identical** — same stack, same layering, same lint enforcement —
> so this file is deliberately kept the same rather than re-derived; only the module name and the
> not-yet-populated slots differ, and those are annotated in place rather than deleted (a slot that
> is empty today is still the canonical home if that concern ever arrives).

## Canonical `src/` Structure

```
src/
├── bootstrap/                       # App wiring: Fastify adapter, plugin registration, swagger
│   ├── fastify.ts                   # Fastify instance + plugins (cors/helmet/compress/multipart)
│   ├── server.ts                    # NestFactory.create, global prefix, app.init()
│   └── swagger.ts                   # OpenAPI / Swagger setup
├── common/                          # Cross-cutting ABSTRACTIONS only — NO infrastructure code
│   │                                # ⚠️ Error base classes do NOT live here — see
│   │                                # packages/shared-kernel/src/errors/
│   └── errors/                      # Domain-specific ApplicationError subclasses
│                                    #   scheduling.error.ts
├── config/                          # Environment config loading & validation (Zod + @nestjs/config)
├── infrastructure/                  # Concrete implementations — framework-specific code goes HERE
│   ├── cqrs/                        # NestJS wiring for the shared-kernel CQRS bus
│   │   ├── cqrs.module.ts
│   │   └── decorators/              # @CommandHandler / @QueryHandler / @EventHandler
│   ├── database/
│   │   └── prisma/
│   │       ├── prisma.service.ts / prisma.module.ts
│   │       ├── prisma-tx-runner.ts / prisma-tx-runner.module.ts
│   │       ├── prisma-transient-error.ts
│   │       └── scheduler-api-repos.factory.ts   # the ONE write-side repos shape (Unit of Work)
│   ├── http/
│   │   ├── controllers/             # health.controller.ts — infra endpoints only (/health, /metrics)
│   │   ├── filter/                  # global-exception.filter.ts
│   │   ├── interceptors/            # http-logging, response
│   │   ├── middlewares/             # trace-context
│   │   ├── pipes/                   # zod-validation.pipe.ts
│   │   └── idempotency/             # ⏸ not built — no append-only mutation exists
│   │                                #   (directives/resilience_patterns.md §1). Canonical home
│   │                                #   if one ever does; do not invent a different location.
│   └── observability/               # ⏸ not built — domain-specific Prometheus counters.
│                                    #   `/metrics` exposes prom-client's default registry today
│                                    #   (health.controller.ts); a domain counter goes HERE, not
│                                    #   inline in a handler (observability_monitoring.md).
├── modules/                         # Feature modules — business logic by domain
│   └── scheduling/                  # the only module at this scope
│       ├── application/             # Application Layer (Orchestration & CQRS)
│       │   ├── commands/            # Command Handlers (Write Model), one folder per command
│       │   ├── queries/             # Query Handlers + Query Repository Interfaces + flat DTOs
│       │   │                        # (⚠️ NOT a separate `repositories/` folder — see
│       │   │                        #  directives/cqrs_pattern.md's CANONICAL placement rule)
│       │   └── shared/              # orchestration helpers used by >1 handler
│       │                            #   build-scheduling-input.ts
│       ├── domain/                  # Domain Layer (Core Business Rules) — PURE TS, no NestJS
│       │   ├── entities/            # plain readonly interfaces (domain_modeling.md §2)
│       │   ├── value-objects/       # ⏸ not built — this domain's value objects live in
│       │   │                        #   packages/scheduling-core (ADR-0004), not here
│       │   └── repositories/        # Command Repository Interfaces (returns Entities)
│       ├── infrastructure/          # Infrastructure Layer (Concrete Implementations)
│       │   ├── mappers/             # ⏸ empty — this module's row→entity conversion is a private
│       │   │                        #   toDomain() inside each Prisma repository
│       │   │                        #   (domain_modeling.md §2). A standalone mapper file belongs
│       │   │                        #   here if one is ever extracted.
│       │   └── repositories/        # Concrete Prisma Repositories
│       └── presentation/            # HTTP delivery layer
│           ├── controllers/         # NestJS controllers
│           └── schemas/             # Zod Validation Schemas
├── app.module.ts                    # Root NestJS module
├── app.ts                           # createApp() — calls bootstrap/server.ts
└── main.ts                          # Entrypoint
```

`modules/scheduling/` is the only module at this scope and follows the layout above exactly — read
it as the worked example. A second bounded context gets its own sibling folder with the same shape.

> **`apps/web` is not covered by this SOP** — it is a Next.js App Router frontend with no server
> layer of its own (`directives/frontend_standard.md` governs it). The layering rules below apply
> to `apps/scheduler-api`.

---

## ⛔ Forbidden Patterns — NEVER DO

| Mistake | Why it's wrong |
|---|---|
| Put a Fastify hook/interceptor/filter in `common/` | `common/` holds ABSTRACTIONS only, not concrete framework code |
| Put Prisma files in a top-level `prisma/` under `src/` | Prisma is an infrastructure detail → belongs in `infrastructure/database/prisma/` |
| Put a concrete logger implementation in `common/` | The shared implementation already lives in `packages/shared-kernel` |
| Define `ILogger`-style interfaces inside this app | Shared interfaces live in `packages/shared-kernel`, not per-service |
| Put error base classes in `common/errors/` | Base classes (`AppError`, `ApplicationError`, `InfraError`) live in `packages/shared-kernel/src/errors/` — import from `@scheduler/shared-kernel`. `common/errors/` here holds only *domain-specific* subclasses. |
| Put scheduling arithmetic in `modules/scheduling/domain/` | The algorithm is `packages/scheduling-core`'s job (ADR-0004) — the domain layer here orchestrates, it does not re-derive business rules |
| Create a folder outside the layout above without a documented reason | Breaks the layout this SOP exists to keep consistent |

---

## The 5 Main Components & Responsibilities

| Folder | Role | Allowed to import |
|---|---|---|
| `bootstrap/` | App startup, Fastify plugin registration | `infrastructure/`, `config/` |
| `common/` | Abstractions, domain-specific error classes | `packages/shared-kernel` ONLY |
| `config/` | Env loading, validation (Zod) | `packages/shared-kernel` |
| `infrastructure/` | Framework-specific implementations (Prisma, Fastify hooks, Pino) | `common/`, `packages/shared-kernel` |
| `modules/` | Business logic by domain | `common/`, `packages/shared-kernel`, `infrastructure/cqrs` (application layer only), `@scheduler/scheduling-core` |

---

## 🔒 Enforcement — Lint-Enforced Boundaries

> This document describes **intent**; lint makes it **mandatory**. The boundaries below are
> enforced via `@typescript-eslint/no-restricted-imports` in `apps/scheduler-api/eslint.config.mjs`
> (the `@typescript-eslint/` variant also catches `import type` — a type-only dependency across a
> layer boundary is still a dependency). A violation is a **lint failure at commit/CI**, with a
> message pointing at the fix.

| Layer (`files`) | Forbidden imports | Allowed |
|---|---|---|
| `modules/*/domain/**` | NestJS, Fastify, Prisma/`@/generated`, every outer layer (`@/common`, `@/infrastructure`, the module's own application/infrastructure/presentation) | shared-kernel + relative imports within the same domain |
| `modules/*/application/**` | ORM/DB/HTTP infra; **HTTP exceptions** (`NotFoundException`, …) from `@nestjs/common` | repository interfaces; `@/infrastructure/cqrs` (decorators); NestJS DI (`@Injectable`/`@Inject`); `@scheduler/scheduling-core` |
| `modules/*/presentation/**` | Prisma/`@/generated`, `@/infrastructure/database` | go through CommandBus/QueryBus |
| `common/**` | `@/modules`, `@/infrastructure`, NestJS, Fastify, Prisma | shared-kernel + relative |

**Settled exception (NOT a violation):** `@Injectable()` / `@Inject()` / `@CommandHandler()` in the
application layer is a **valid NestJS DI idiom** — only HTTP exceptions are forbidden there. This
is a framework difference, not an architecture violation.

**Second settled exception:** the application layer may import `@/infrastructure/cqrs/scheduler-api-repos`
for the repos *shape* type — see that file's own doc comment for why a type-only re-export is not
the same as depending on the ORM.

**Recommended workflow for a new module:** get the lint boundary matching *before* writing the
module's code, so the lint gate itself blocks a misplaced file at generation time instead of at a
later audit.

**Quality gate (whole monorepo):** `npm run check` = `turbo run typecheck lint format:check`
(read-only). `typecheck` = `tsc --noEmit` per workspace — catches compile errors lint/format miss
(lint only catches rule violations, not e.g. `TS2322`). Quick fix: `npm run lint:fix` + `npm run format`.

---

## Checklist When The Agent Creates A New File

1. Is this file an **abstraction/interface** or an **implementation**?
   - Interface → `common/`
   - Implementation (imports Prisma/Fastify/Pino/...) → `infrastructure/`
2. Is this a **framework-specific HTTP concern** (filter, interceptor, decorator)?
   - → `infrastructure/http/`
3. Is this a **contract shared across the whole service or reusable across services**?
   - → `packages/shared-kernel` (only if genuinely reusable, not just "might be later")
4. Is this **scheduling arithmetic / a constraint rule**?
   - → `packages/scheduling-core` — never a module folder (ADR-0004)
5. Does the file belong to a specific **feature domain**?
   - → `modules/<domain>/`
6. Run `npm run lint` before committing — the boundary rules in §Enforcement will block a
   misplaced file / cross-layer import automatically.
