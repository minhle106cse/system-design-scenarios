<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: the repos-shape interface + every repository/handler name in the code blocks; §2's query-repository name; §5's cross-ref; the mid-flight-read example at the bottom. Copy ONLY if the scenario uses shared-kernel's CQRS bus.
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# CQRS Command Pipeline & the Unit-of-Work boundary

> Ported from `../service-appointment-scheduler/directives/cqrs_pattern.md`
> — the mechanism is
> `packages/shared-kernel`'s CQRS bus, ported byte-for-byte, so the rules are the same rules; only
> the domain examples below are this repo's own. Read
> the scenario's transaction/retry-boundary ADR for why the mechanism is shaped this way.

## Problem

A command handler often writes through several repositories and they must commit together. Two
things must be true at once:

1. Repository interfaces must not leak ORM types (`domain/` stays pure) — so a `tx` parameter on
   every repository method is not acceptable.
2. "These writes are in one transaction" must be impossible to get wrong — not merely documented.

An ambient transaction in `AsyncLocalStorage` satisfies (1) but fails (2): a repository has to
*remember* to call `getTx() ?? client`, and forgetting is silent.

## Solution: the transaction is a VALUE that owns the repositories

A service's repos shape is every write repository in its database, already bound to one open
transaction. Handlers receive it as a parameter; they never construct or inject a repository
themselves. **One repos shape per service**, not one per module — this service has exactly one
module (`scheduling`) today, but the shape stays service-wide on principle; see
`packages/shared-kernel/src/database/tx-scope.ts`'s doc for why per-module scopes were rejected
even then (they overlap heavily and buy a soft autocomplete boundary at real upkeep cost).

```typescript
// infrastructure/database/prisma/scheduler-api-repos.factory.ts
export interface SchedulerApiRepos {
  readonly schedules: IScheduleRepository
  readonly staff: IStaffMemberRepository
  readonly shifts: IShiftRepository
  readonly demandCells: IDemandCellRepository
  readonly assignments: IAssignmentRepository
  readonly runs: IScheduleRunRepository
}
```

Repository interfaces keep clean signatures (`create(data)`, `findById(id)` — no `tx` argument),
because the client is supplied at CONSTRUCTION, not per call.

### 1. The write repository takes the transaction client

```typescript
export class PrismaShiftRepository implements IShiftRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}
  // no getTx(), no `?? this.prisma.client` — there is no fallback branch to forget
}
```

**It is NOT a DI provider.** Only the ONE service-wide repos factory constructs it:

```typescript
@Injectable()
export class SchedulerApiRepoFactory implements IRepoFactory<SchedulerApiRepos, Prisma.TransactionClient> {
  create(tx: Prisma.TransactionClient): SchedulerApiRepos {
    return {
      schedules: new PrismaScheduleRepository(tx),
      staff: new PrismaStaffMemberRepository(tx),
      shifts: new PrismaShiftRepository(tx),
      demandCells: new PrismaDemandCellRepository(tx),
      assignments: new PrismaAssignmentRepository(tx),
      runs: new PrismaScheduleRunRepository(tx),
    }
  }
}
```

### 2. Reads that run outside a transaction use a READ port

`GetScheduleHandler`, `GetSummaryHandler`, `GetCoverageHandler` have no transaction and must not
open one. They read through `ISchedulingQueryRepository`
(`application/queries/scheduling.query-repository.ts`) on the plain Prisma client — one query
repository for the whole module today, because every query so far needs the same `ScheduleDetail`
shape (schedule + staff + shifts + demand + assignments + latest run), not one per entity.

### 3. The handler's TYPE declares what it needs — there is no flag

```typescript
export interface ITransactionalCommandHandler<C extends ICommand, R, S> {
  readonly kind: 'transactional'
  execute(command: C, tx: S): Promise<R>
}

export interface ISagaCommandHandler<C extends ICommand, R> {
  readonly kind: 'saga'
  readonly dispatches: readonly string[]   // REQUIRED — every command name passed to ctx.dispatch
  execute(command: C, ctx: SagaContext): Promise<R>
}
```

`CommandOptions.transactional` does not exist. Taking the `tx` parameter IS the opt-in. `S` is
always the SAME type for every transactional handler in this service (`SchedulerApiRepos`) —
every transactional handler in the module implements this interface with that exact `S`.

⛔ **A transactional handler MUST NOT be injected with an HTTP client or the CommandBus.** Its
only capability is the scope. Work that calls another service is a saga instead — not needed yet
(single service, single database), which is exactly why the saga interfaces are ported but
unexercised.

### 4. Saga = compensation stack, not atomicity (kept for the seam, not currently used)

```typescript
async execute(command: SomeMultiStepCommand, ctx: SagaContext) {
  const result = await this.someExternalClient.doSomething(...)
  ctx.onCompensate(async () => { await this.someExternalClient.undo(result.id) })
  const id = await ctx.dispatch<string>(new SomeOtherCommand(...))   // only sagas may dispatch
  ...
}
```

⛔ **A saga MUST NOT `ctx.dispatch` another saga command.** `CommandBus.register` cross-checks
every saga's declared `dispatches` against every other registered handler's `kind`, so nesting
throws `NestedSagaDispatchError` at composition-root startup, not only if that branch runs.

### 5. The pipeline order is structural

```
CommandBus.execute(command)
  → withLogging          (always)
  → withRetry            (transactional branch only — deadlock/serialization, resilience_patterns.md §2)
  → txRunner.run(scope)  (opens the transaction, builds the scope)
  → handler.execute(command, tx)
```

There is **no `use()` and no `ICommandMiddleware`**. The order lives inside one method body of
`CommandBus`, so "retry must wrap the transaction" is not a comment — the wrong order is
unrepresentable.

### 6. Construction-time guarantee + re-entrancy guard

`PrismaTxRunner`'s constructor takes the service's ONE repos factory as a required argument —
TypeScript refuses to compile the runner without it.

```typescript
export class PrismaTxRunner extends AbstractTxRunner<SchedulerApiRepos, Prisma.TransactionClient> {
  constructor(prisma: PrismaService, logger: PinoLogger, factory: SchedulerApiRepoFactory) {
    super(logger, factory)
  }
}
```

```typescript
// PrismaTxRunner.run
if (getTx() !== undefined) throw new NestedTransactionError()
```

`AsyncLocalStorage` survives ONLY as this detector. Nesting would open a second transaction on
another pooled connection that commits independently, so an outer rollback would not undo it —
fail loudly rather than silently pick savepoint semantics.

---

## Folder Structure & Clean Architecture

1. **`packages/shared-kernel/src/cqrs/`**: pure abstractions (Commands, Queries, Events, Handlers,
   Buses). Pure TypeScript (POJO). No infra imports (no Prisma), **no framework decorators**.
2. **`apps/scheduler-api/src/infrastructure/cqrs/`**: DI wiring and NestJS-specific modules
   (`cqrs.module.ts`). This is where pure CQRS classes are instantiated and provided to Nest's DI.
3. **shared-kernel `database/`**: generic abstractions only — `ITxRunner`/`IRepoFactory`/
   `AbstractTxRunner`. Completely agnostic of the underlying ORM.
4. **`src/modules/scheduling/domain/`**: entities (plain interfaces, `directives/domain_modeling.md`
   §2), repository interfaces. Pure TypeScript. No external library imports.
5. **`src/modules/scheduling/application/`**: Command/Query Handlers, plus `shared/` for orchestration
   helpers used by more than one handler (`build-scheduling-input.ts`). Orchestrates domain logic via
   interfaces AND `@scheduler/scheduling-core`'s pure functions. Never imports Prisma or HTTP request
   objects.
6. **`src/modules/scheduling/infrastructure/`**: concrete repository implementations. Write
   repositories take a `Prisma.TransactionClient` in their constructor and are built ONLY by
   `SchedulerApiRepoFactory`; the read-side query repository is an ordinary singleton on the plain
   client.
7. **`src/modules/scheduling/presentation/`**: NestJS controllers. Translate HTTP requests into
   Commands/Queries and push them to the `CommandBus`/`QueryBus` — never touch Prisma directly
   (eslint-enforced, `eslint.config.mjs`).

## Repository-interface & DTO placement — CANONICAL

**Decision rule — classify a repo by what its result is used for, not by whether it happens to
read or write:**

| Repo kind | Location | File | Types |
|---|---|---|---|
| **Command / write-side** (entity-based, serves command handlers) | `domain/repositories/` | `<name>.repository.ts` | write-input types **inline** in the file (`CreateShiftData`, `AssignmentInput`, …) |
| **Query-side** (returns a DTO handed **straight back** to a query handler / the client) | `application/queries/` | `<module>.query-repository.ts` | response DTO (`ScheduleDetail`) in the **same** file today — one query-repo, one DTO shape, no split warranted yet |

- A query-repo interface shared by more than one query lives at the **`application/queries/`
  level**, not buried inside one query's sub-folder — `ISchedulingQueryRepository` is exactly this:
  shared by `GetScheduleHandler`, `GetSummaryHandler`, and `GetCoverageHandler`.
- **Response DTOs are FLAT** — one `<name>.dto.ts` per query-repo at the `application/queries/`
  level, not nested per-query. Request/input DTOs are a different artifact — Zod-schema types in
  `presentation/schemas/`. *Current state:* this module has exactly one query-repo and one DTO
  shape (`ScheduleDetail`), so it still lives inline in `scheduling.query-repository.ts` — the
  moment a second query needs a different shape, split both out into `scheduling.dto.ts` rather
  than nesting either one under a query's own folder.
- The deciding question for a repo that both reads and writes: **"does its read result go
  straight out as the query response, or is it an intermediate step inside a handler?"**
  Straight-out → `application/queries/`. Intermediate → `domain/repositories/`.
- **NEVER** create `application/repositories/` — a neutral "I'm not sure" folder; there are exactly
  two legal locations.

## A command that needs to read mid-flight reads through the domain/write repo, NEVER through a query-repo

**Rule:** if a command handler needs to read **transactionally-consistent** data mid-flight (must
see writes not yet committed in the same transaction), it reads through the **write repository
inside the transaction scope** (`tx.<repo>`), **never** through a query-repository — even if
technically both point at the same database today. Query = always reads from a read model (may be
eventually-consistent once/if a read model is ever split out). Command = writes to the
source-of-truth; if it needs to read to decide something, it must read the source-of-truth itself.

Directly relevant here: `AddAssignmentHandler` (manual roster editing) reads `tx.staff`,
`tx.shifts`, `tx.demandCells`, and `tx.assignments` — every one through the write-side `tx`
parameter, never through `ISchedulingQueryRepository` — before replaying `validateRoster` against
the candidate assignment. Reading through the query-repo instead would risk validating against a
roster that doesn't yet include a write made earlier in the same request, the exact class of bug
scenario 01's booking availability check has to avoid for the identical reason.
