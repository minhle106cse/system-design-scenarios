# CQRS Command Pipeline & the Unit-of-Work boundary

> Ported from `../service-appointment-scheduler/directives/cqrs_pattern.md`
> (`.ai/plans/backend-architecture-reversal.plan.md` §4) — the mechanism is
> `packages/shared-kernel`'s CQRS bus, ported byte-for-byte, so the rules are the same rules; only
> the domain examples below are this repo's own. Read
> `docs/adr/0005-transaction-retry-boundary.md` for why the mechanism is shaped this way.

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
always the SAME type for every transactional handler in this service (`SchedulerApiRepos`) — every
handler built in Phase D (`AddStaffHandler`, `AddShiftHandler`, `ImportDemandHandler`,
`AddAssignmentHandler`, `AutoScheduleHandler`, …) implements this interface with that exact `S`.

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

> **Upstream ruling ported from Cortex 2026-08-21.** This section previously ended with
> "**NEVER** create `application/repositories/`" and routed query-repo interfaces into
> `application/queries/`. That rule came from Cortex, and **Cortex has since reversed it** — for a
> reason worth reading before assuming this is churn: Cortex's own two directives had contradicted
> each other for ~6 weeks (`folder_structure_sop.md`'s canonical tree listed
> `application/repositories/` as the query-repo home while this file declared that folder banned),
> nothing cross-checked them, and the code followed the ban. The visible symptom was that
> `application/queries/` held two different KINDS of thing at once — per-query sub-folders, each a
> `.query.ts` + `.handler.ts` pair, sitting next to a loose port file (`scheduling.query-repository.ts`)
> — so a reader could not tell ports from use-cases without opening files. The original concern was
> never the folder itself but that it had **no defined meaning** and became an "I'm not sure where
> this goes" bucket. That is answered by definition, not deletion: it now holds exactly one thing.

A repository interface has exactly two legal homes, split by LAYER, each in its own
`repositories/` folder:

| Repo kind | Location | File | Types |
|---|---|---|---|
| **Command / write-side** (entity-based, serves command handlers; mutation goes through a mapper when an Entity exists) | `domain/repositories/` | `<name>.repository.ts` | write-input types **inline** in the file |
| **Projection / write-model** (maintained from events; no entity/invariant; any read it exposes is an *internal* pipeline lookup, not an HTTP response) | `domain/repositories/` | `<name>.repository.ts` | input/intermediate types **inline** |
| **Domain READ port** (a **domain-layer class** — a domain service, not just a query handler — depends on it; domain must not import `application/`, so this is structural, not a style choice) | `domain/repositories/` | `<name>.repository.ts`, interface named `I{X}Reader` | **inline**; impl `Prisma{X}ReaderRepository`, **never** `.query-repository.ts` |
| **Application READ port** (only an `application/`-layer class consumes it — a query handler, or an application service — nothing in `domain/` imports it) | `application/repositories/` | `<module>.query-repository.ts` | response DTO (`ScheduleDetail`) in the same file today - one query-repo, one DTO shape, no split warranted yet |

### The decision procedure — answer in this ORDER, stop at the first Yes

Two steps, and **the order matters**. Asking only step 2 gets write ports wrong: most write ports
are referenced only by the service's repos-factory in `infrastructure/`, never by a `domain/` file,
so step 2 alone would wrongly evict all of them. (Cortex measured this upstream: 15 of its 19
`domain/repositories/` files have zero domain-internal importers.)

1. **Does the interface have ANY method that mutates state** (`save`, `create`, `update`,
   `replaceAll`, `upsertMany`, `delete`...)? → **`domain/repositories/`**. A write port is the
   domain's persistence contract, and that stays true no matter who assembles it. A mixed
   write+read port (written by one path, read back internally to feed further logic) is a write
   port by this step.
2. **Read-only port. Does any file under `domain/` import it?**
   - **Yes → `domain/repositories/`**, named `I{X}Reader`, regardless of how "query-shaped" it
     looks. Structural, not stylistic: Clean Architecture's Dependency Rule makes domain the
     innermost layer, so a domain class depending on an application-layer interface is not fixable
     by relocating the file — only by not needing the dependency.
   - **No → `application/repositories/`**, named `I{X}QueryRepository`, file
     `<module>.query-repository.ts`. `ISchedulingQueryRepository` is exactly this: consumed only by query handlers,
     nothing in `domain/` touches it.

**This is machine-checked — `npm run check:arch` (`scripts/check-repo-placement.cjs`), part of
`npm run check`.** The script does NOT guess at steps 1-2 (that is a design judgement, and a
heuristic that misfires just teaches people to ignore the gate). It enforces the deterministic
consequences: a `*.query-repository.ts` anywhere but `application/repositories/` fails; that suffix
inside `domain/repositories/` fails; a non-port file inside `application/repositories/` fails;
anything under `domain/**` importing `application/**` fails — **including relative-path imports,
which the eslint `no-restricted-imports` boundary does not catch** (it only matches the literal
`@/modules/*/application/**` alias form); and a stray file inside a per-query sub-folder fails.

### Remaining rules

- `application/queries/` now holds **only use-cases and their response DTOs**: per-query
  sub-folders (`{verb}-{noun}/` with `.query.ts` + `.handler.ts`) and the flat `<module>.dto.ts`
  files. A port file loose among them is the layout this ruling removed.
- A query-repo interface shared by more than one query lives in **`application/repositories/`**,
  not buried inside one query's sub-folder — `ISchedulingQueryRepository` is exactly this: shared by `GetScheduleHandler`, `GetSummaryHandler`, `GetCoverageHandler`, `ListSchedulesHandler` and `SuggestNHandler`.
- **Response DTOs stay in `application/queries/`** (they belong to the use-case, not the port) and
  are FLAT — one `<name>.dto.ts` per query-repo at the `application/queries/` level, not nested
  per-query. Request/input DTOs are a different artifact — Zod-schema types in
  `presentation/schemas/`. *Current state:* this module has exactly one query-repo and one DTO shape (`ScheduleDetail`), so it still lives inline in the query-repo file - the moment a second query needs a different shape, split it out into `application/queries/scheduling.dto.ts`, and the port then imports it as `from '../queries/scheduling.dto'`.
- **Still NEVER** put a repository interface loose in `application/` itself, or nested inside one
  query's own sub-folder. The two `repositories/` folders (domain + application) are the only legal
  homes, and the reason the original ban existed — a folder with no defined meaning invites drift
  — still applies to any third location.

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
