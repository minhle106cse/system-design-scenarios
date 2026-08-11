# ADR-0001 — Transaction & Retry Boundary: Unit of Work + Inferred from Signature + Fail-Fast at Boot

> **Ported from Cortex.** Section numbering preserved exactly — the source code in
> `packages/shared-kernel` cites this ADR by section (`command-bus.ts` §2.3/§2.4, `tx-scope.ts`,
> `cqrs.error.ts`, several interfaces). Renumbering it would point every one of those comments at
> the wrong document; see `.ai/plans/init-source.plan.md` §5 for why the booking-concurrency ADR is 0002, not 0001.
> Condensed in §9/§9b/§9c: Cortex's version narrates a migration across 5 services; this repo has
> one, so only the substance (what shipped, what was fixed after implementation) is kept, not the
> per-service rollout log. Translated from the original Vietnamese, decisions unchanged.

- **Status:** Accepted. Implemented across shared-kernel + the app that consumes it (in Cortex,
  across all 5 packages; in this repo, across `packages/shared-kernel` +
  `apps/scheduler-api` — see §9 for what shipped vs. the original design).
- **Decided by:** the project owner. **Drafted by:** an AI agent, from sourced research (§8).
- **Scope:** every write path through `CommandBus`.

---

## 1. Context

The design this ADR replaced: `CommandBus` + a middleware pipeline
`Logging → Retry → Transaction → Handler`, with the transaction passed implicitly via
`AsyncLocalStorage` (`runInTransaction` / `getTx()`), repositories reading via
`getTx() ?? this.prisma.client`, and commands declaring `options.transactional: boolean`.

That design is **mechanically correct** and has real precedent (§4). The problem isn't the
mechanism — it's that **every invariant keeping it correct was protected only by comment,
discipline, or an extra lint rule, never by the type system or the structure itself.** An audit
found 6 gaps:

| # | Gap | Real evidence |
|---|---|---|
| 1 | A repository forgets `getTx()` → a write lands OUTSIDE the open transaction | A service had `TransactionMiddleware` wired but both its repositories wrote straight to `this.prisma.client`. The trap was set, hadn't fired yet only because no command was `transactional: true` |
| 2 | The `transactional` flag lives on the command DTO, the write lives in the handler → **they can silently drift** | Adding a second write to a handler without also opening the command file to flip the flag ⇒ atomicity lost, no error |
| 3 | Nested dispatch → 2 INDEPENDENT transactions | `TransactionMiddleware` called `run()` unconditionally, no ambient check. The base client does **not** join an already-open transaction — different connection, inner commit independent |
| 4 | A saga forgets compensation | Nothing enforces it; a handler having compensation is the author remembering to write it |
| 5 | External I/O (network calls) inside a transaction | Only prevented by a JSDoc comment. Prisma's own docs warn against network requests inside transaction functions |
| 6 | **Pipeline order isn't guaranteed** | Order comes from the order `commandBus.use()` happened to be called at the composition root. Swap `Retry`/`Transaction` ⇒ retry runs inside an already-aborted transaction ⇒ retry becomes **completely useless, with no error reported** |

### 1.1 A finding that reframed the goal

Research (§4) showed **every real framework has at least one silent-failure mode**, even the most
advanced ones (Spring `@Transactional`'s self-invocation bypass, MediatR's unvalidated DI-order
pipeline, Wolverine's silently-discarded writes when middleware is missing) — except **EF Core**,
which throws `InvalidOperationException` when a retry strategy meets a user-initiated transaction.

⇒ The right goal is **not** "make it impossible to write it wrong" (impossible in TypeScript, no
effect system) but:

> **Wherever it CAN be made impossible, make it impossible. Wherever it can't, make it fail LOUD
> and EARLY — at boot, not in production.**

## 2. Decision

**Unit of Work exposing repositories** + inferring transaction need from the **handler's
signature** (drop the flag entirely) + **boot-time validation** + a re-entrancy guard + a
structurally fixed pipeline order.

### 2.1 Unit of Work exposes repositories (`TxScope`)

A repository does **not** go looking for its client — it is **handed one at construction**. No
fallback branch left to forget.

```typescript
// domain — pure, no Prisma
export interface SchedulerApiRepos {
  readonly appointments: IAppointmentRepository
}

// infrastructure
export class SchedulerApiRepoFactory implements IRepoFactory<SchedulerApiRepos, Prisma.TransactionClient> {
  create(tx: Prisma.TransactionClient): SchedulerApiRepos {
    return { appointments: new PrismaAppointmentRepository(tx) }
  }
}
```

> **Preserves the original hexagonal goal.** The problem `AsyncLocalStorage` originally solved was
> keeping repository signatures free of Prisma types. `TxScope` injects the client at
> *construction*, not per method call ⇒ `IAppointmentRepository.save(item)` stays clean, no `tx`
> parameter. Same goal, minus the fallback branch.

### 2.2 Drop the flag — classify handlers by TYPE

```typescript
export interface ITransactionalCommandHandler<C extends ICommand, R, S> {
  readonly kind: 'transactional'
  execute(command: C, tx: S): Promise<R>
}

export interface ISagaCommandHandler<C extends ICommand, R> {
  readonly kind: 'saga'
  execute(command: C, ctx: SagaContext): Promise<R>
}
```

- **Kills gap #2:** no flag left to drift. Want to write to a repo ⇒ need `tx` ⇒ must be a
  transactional handler ⇒ the bus already opened the transaction. Adding a second write needs no
  other file edited.
- **Narrows gap #5:** a transactional handler's `execute` only receives `tx` — the constructor is
  never injected with an outbound HTTP/gRPC client. Not handed the capability ⇒ can't call it
  (capability-based DI). External clients only ever live in a saga handler.

### 2.3 Pipeline fixed in STRUCTURE, not remembered by the composition root

Drop arbitrary `commandBus.use()`. The bus builds the order inside **one function body** — the
wrong order becomes unrepresentable:

```typescript
private dispatch<C extends ICommand, R>(command: C, handler: ICommandHandler<C, R>): Promise<R> {
  return this.withLogging(command, () => {
    if (handler.kind === 'saga') return handler.execute(command, this.sagaContext())
    return this.withRetry(command, () =>                                  // retry WRAPS the outside
      this.txRunner.run((tx) => handler.execute(command, tx)),
    )
  })
}
```

**Kills gap #6.** This is exactly how `dotnet/eShop` does it: retry and transaction live in **one
code block**, not two independent DI registrations.

### 2.4 Re-entrancy guard + fail-fast at boot

```typescript
// AbstractTxRunner.run — kills gap #3
if (getTx() !== undefined) {
  throw new NestedTransactionError()   // FAILS LOUD, doesn't silently open a second tx
}
```

> **This exceeds Wolverine.** Wolverine lets "handler needs a session but the chain is missing
> middleware" happen **at runtime and silently swallow the write**. Here, the same situation ⇒
> **the service fails to boot** (see `CommandBus`'s boot-time handler validation).

### 2.5 Rollback stays the default

Prisma's `$transaction(callback)` already rolls back when the callback throws — kept as-is, and
**no** separate "explicit commit" mechanism was added. Matches Cosmic Python: *"only one code path
that leads to changes."*

---

## 3. How far each gap is closed

| # | Gap | Level after this ADR |
|---|---|---|
| 1 | Repo forgets `getTx()` | **Structural** — no fallback exists to forget |
| 2 | Flag drifts from handler | **Structural** — no flag left |
| 6 | Pipeline order | **Structural** — lives in one function body |
| 3 | Nested dispatch | **Fails loud** (`NestedTransactionError`) + a transactional handler is never injected with the bus |
| 5 | External I/O in a transaction | **Not handed the capability** + lint blocks the import; **not** absolutely prevented |
| 4 | Saga forgets compensation | See §6b amendment below — evolved past the original compile-time-required-field design |

**4/6 eliminated structurally, 2/6 turned from silent to loud.** Not claiming 6/6 — see §6.

---

## 4. Precedent — piece by piece, sourced

The owner's requirement: **no home-grown architecture without precedent.** Checked against each piece:

| Piece | Precedent | Note |
|---|---|---|
| UoW **exposing repositories** (`tx.items`) | *Architecture Patterns with Python* (O'Reilly), ch.6 | *"a single entrypoint to our persistent storage… a handy place to get a repository"* |
| Rollback by default, one path to change | same source | *"only one code path that leads to changes"* |
| **Inferring transaction need from the handler's signature**, dropping the flag | Wolverine `AutoApplyTransactions()` | *"automatically use the transactional middleware for handlers that have a dependency on `IDocumentSession`"* |
| Retry + Transaction inside the command-bus pipeline | `dotnet/eShop`'s `TransactionBehavior.cs` (a live reference architecture) | `CreateExecutionStrategy()` wraps `BeginTransactionAsync()` |
| **Retry wraps Transaction** (not the reverse) | eShop (above) + EF Core **enforces it**: throws `InvalidOperationException` if done backwards | |
| **Re-entrancy guard — deliberately diverges from eShop, not the same precedent** | eShop: `if (_dbContext.HasActiveTransaction) { return await next(); }` — i.e. it **JOINS** the open transaction | This design **THROWS** instead of joining — Prisma's base client doesn't auto-join an open transaction (unlike EF Core's `DbContext`, one shared connection); real joining needs a savepoint (Prisma 7.5+), deliberately not used yet since nesting a command inside a transaction is almost always a design smell |
| Fail-fast at handler registration | EF Core (throws instead of silence) + this codebase's own `EventRouter.register()` pattern | Not a new technique in this codebase |
| Transaction boundary belongs to the application layer | DDD/Clean Architecture: *"one business operation → one transaction"* | Handler = application service |

### 4.1 Technical constraints verified against this actual stack

- Prisma installed: **7.8.0** (checked against `node_modules`).
- `Prisma.TransactionClient` still has `$transaction` on it (the real deny-list is
  `["$connect","$disconnect","$on","$use","$extends"]`) — ⚠️ many blog posts claim otherwise; that
  claim is false for 7.x, don't rely on it as a safety mechanism.
- Prisma **7.5.0+** supports nested transactions via **SAVEPOINT** — but only when nesting through
  the **tx client**. Calling `$transaction` on the **base client** does **not** join — separate
  connection. This is the exact source of gap #3.
- **Chose to throw** rather than use a savepoint: nesting a command inside a transaction is almost
  always a design smell. Savepoint stays available as an escape hatch if a genuinely valid case
  ever appears.

---

## 5. Alternatives considered and REJECTED

| Alternative | Why rejected |
|---|---|
| **Keep as-is + add lint only** | Patches #1/#6 but #2/#3/#4/#5 still rely on discipline. Lint is an outer layer; a new codebase not copying the config is the same trap again |
| **Spring-style `@Transactional()` decorator** | Spring has a **famous silent-failure mode**: self-invocation bypasses the proxy, the transaction just doesn't run, no error. Trading one silent trap for another |
| **NestJS Interceptor** | Always sits OUTSIDE the bus ⇒ can't be inserted between Retry and Handler ⇒ breaks gap #6's fix |
| **Ambient UoW (ABP.IO-style, keep ALS, no explicit param)** | The ambient camp's argument is real (less noise, no layer leakage), BUT ambient is safe **only when the framework enforces it** (ABP.IO, Spring, EF Core). A home-grown version gets the **invisibility without the enforcement** — the worst of both camps, which is exactly where the old design sat |
| **Wolverine-style source generation** | Needs a build step + code generator, .NET-specific. Infrastructure cost disproportionate to one invariant |
| **Effect-TS (typed effects)** | The ONLY option that can forbid `fetch()` inside a transaction at the type level. But it's a paradigm change for the whole codebase — cost far exceeds the benefit |
| **Relying on Prisma 7.5+ savepoints for nesting** | Real and available, but turns a design smell into something silently valid. Chose to throw; savepoint stays as an escape hatch |

---

## 6. Consequences

**Gained:**
- 4/6 invariants moved from "correct if remembered" to "cannot be wrong."
- `options.transactional` dropped from every command DTO — one fewer concept.
- Easier to test: `TxScope` is a plain object, mocks don't need ALS.

**Lost / accepted:**
- `tx` appears explicitly in the handler signature — **noisier** than ALS. An explicitness ↔
  ergonomics trade-off, chosen deliberately for this specific situation (no framework enforcement
  available).
- A write repository stops being a singleton, becomes a per-transaction constructed object
  (a cheap, stateless wrapper).
- Query-side is **unchanged** (query repositories still use the plain client, no `tx` needed).

**NOT solved:**
- TypeScript cannot forbid `fetch()` inside a method body ⇒ gap #5 stays *safe by capability*, not
  *safe by proof*.
- Nothing prevents holding onto `tx` and using it after the transaction closes — but Prisma throws
  *"Transaction already closed"*, i.e. **fails loud**, which is an acceptable outcome.

---

## 6b. AMENDMENT (during implementation) — sagas use a compensation STACK, not `compensate(command)`

The original §2.2 required `ISagaHandler.compensate(command, ctx)` as a mandatory member. Turned
out not usable: a real saga undoing a partially-created external resource needs a value only
available *during* `execute` (e.g. an id returned by an external call) — a signature that only
receives `command` can't see that value without stuffing it into a state bag, which is worse than
the status quo.

Replaced with a **compensation stack via closures** (the standard saga pattern):

```typescript
const { userId } = await this.externalClient.provisionSomething(...)
ctx.onCompensate(async () => { await this.externalClient.cancelSomething(userId) })
```

The bus runs the stack in REVERSE order on failure, and **swallows compensation errors** so they
never mask the original one.

## 9. What actually shipped

Fully migrated in Cortex across all 5 packages; kept here because the same code is what's ported
into this repo's `packages/shared-kernel`. Summarized (Cortex's per-service rollout narrative
doesn't apply to a single-service repo):

- **Read/write split became mandatory** wherever something running OUTSIDE a transaction (a guard,
  a query handler) used to read through a write repository — since a write repository now only
  exists inside a `TxScope`, any such caller needs its own read port. This is exactly the CQRS rule
  `cqrs_pattern.md` already stated; the new architecture **enforces** it instead of merely advising it.
- The lint rule that used to block `this.prisma.client.<model>` in write repositories was
  **removed** — it became both redundant (that pattern can no longer be expressed in a write repo)
  and wrong (it would incorrectly block legitimate query-repository code, which is supposed to use
  the plain client).

## 9b. Post-implementation review — execution gaps found and patched

An independent review found the *design* in §2 correctly reflected in code, but several
*execution* gaps. Two are directly relevant to what's ported into this repo:

1. **5 near-identical copies of the tx-runner + transient-error-classification code** across
   services were collapsed into `AbstractTxRunner` (shared-kernel — each service now only
   implements `beginTransaction`) and a `makePrismaTransientErrorHelpers` factory. This is exactly
   what `apps/scheduler-api/src/infrastructure/database/prisma/prisma-tx-runner.ts` and
   `prisma-transient-error.ts` are instances of.
2. **The metric counting transient errors was counting business errors too** (unique-constraint
   violations, not-found, foreign-key errors), not just the two codes actually being tracked.
   Fixed by scoping `recordObservation` to exactly the tracked codes — see `resilience_patterns.md` §3.

## 9c. AMENDMENT — dropped the `compensation` flag, added `dispatches` + blocked saga-nesting

Reviewing the one real saga in Cortex surfaced two problems:

1. The `readonly compensation: 'registered' | 'not-needed'` field added in §6b was only ever
   checked in a `catch` block, **after** the handler had already failed — logging an `error` if it
   mismatched actual `ctx.onCompensate` calls. Nothing forced correct declaration at compile time,
   and nothing blocked anything at runtime — just a log line, exactly the kind of "remind via a
   field instead of a comment" pattern that belongs in documentation instead. **Dropped entirely.**
   The compensation-stack mechanism itself (`ctx.onCompensate`, run in reverse on failure, errors
   swallowed) is unchanged.
2. **A saga dispatching another saga command** was not blocked — genuinely dangerous: the inner
   saga self-compensates and rethrows, and if the outer saga ALSO registered `onCompensate` for
   that same dispatch (easy to happen, since every other step needs one too), the bus would
   compensate the inner saga's already-cleaned-up work a second time. Added
   `readonly dispatches: readonly string[]` (required, this time actually checked): every command
   name `execute` will `ctx.dispatch`. `CommandBus.register` re-scans the whole registry after
   EVERY registration, cross-checking each saga's `dispatches` against the target handler's `kind`
   — a match against another saga throws `NestedSagaDispatchError` immediately at `register()`,
   regardless of registration order. Since registration happens synchronously at the composition
   root during boot, the error surfaces **before the first request**, not after a saga-nesting
   branch actually runs in production.

`directives/cqrs_pattern.md` §3-4 reflects this amendment.

## 9d. AMENDMENT (2026-08-11) — `recordObservation` was blind to `MarkedTransientError`, even though `isTransient` already retried it

Ported from Cortex (`211399c`) — `packages/shared-kernel/src/resilience/prisma-transient-error.ts`
is otherwise byte-identical between the two repos, and the gap this fixes is structural to the file
itself, not specific to any one service's error set.

Auditing `isTransient` next to `recordObservation` in that file (§9b item 2 fixed the opposite
direction of this same class of bug, 2026-07-30) found the two functions **do not share scope**,
despite reading as if they must:

- `isTransient` retries both `P2034` **and** any error declaring `transient: true`
  (`MarkedTransientError` — an escape hatch for a domain/application error that is safe to retry
  even though it isn't a raw Prisma error, e.g. an optimistic-concurrency conflict detected via a
  `@@unique` violation and re-thrown as a typed error before `CommandBus` ever sees the underlying
  Prisma code).
- `recordObservation` only counts `OBSERVED_CODES` (`P2034`/`P2028`) via the structural check
  `isPrismaKnownRequestError`, which requires a `clientVersion` field — a `MarkedTransientError` has
  none (it's a domain error, not a real Prisma error), so it **never gets counted**, even on a
  request where a retry genuinely happened.

Consequence: a hot contention point driving frequent retries through the `MarkedTransientError` path
would be invisible to `*_db_transient_error_total`, traceable only through per-attempt retry-warning
log lines. Not a repeat of §9b item 2 (that was counting **too much** — business errors leaking in);
this is the opposite — a valid retry branch counted **too little**. Same root cause either way: two
separate predicates for one concept ("what counts as transient") drift apart the moment one changes
and the other doesn't.

**Fix**: `recordObservation` gained a second branch counting `isMarkedTransient(error)` under a
synthetic label `code="A2001"` — shaped like a Prisma code (letter + 4 digits) so it reads
consistently next to `P2034`/`P2028` on a dashboard, but deliberately `A`, not `P` — Prisma owns the
real `Pxxxx` namespace, and reusing it for a made-up code risks colliding with a genuine future
Prisma code or misleading anyone who greps Prisma's docs for it. Kept as its own branch rather than
folded into `OBSERVED_CODES`, preserving §9b item 2's original scoping intent — don't count every
business error, only the ones that are actually retried.

Added a spec asserting `isTransient` and `recordObservation` **agree on the same input**, not two
specs that each pass in isolation while silently disagreeing with each other — the exact shape of
bug this amendment closes.

**Not currently exercised in this repo**: no error in `apps/scheduler-api` marks `transient: true`
today (`common/errors/booking.error.ts` says so explicitly — ADR-0002/ADR-0003's slot-conflict errors
are deliberately the opposite, never retried). The fix is ported anyway because
`prisma-transient-error.ts` is shared, ported infrastructure, and the defect is in the mechanism
itself — the moment any future domain error here is marked `transient: true`, the gap would exist
silently unless closed now.

## 8. References

**Architectural precedent**
- [Cosmic Python — Ch.6 Unit of Work](https://www.cosmicpython.com/book/chapter_06_uow)
- [dotnet/eShop — TransactionBehavior.cs](https://github.com/dotnet/eShop/blob/main/src/Ordering.API/Application/Behaviors/TransactionBehavior.cs)
- [dotnet/eShop Issue #302](https://github.com/dotnet/eShop/issues/302) — retry + EF Core change-tracker error; doesn't apply here, Prisma has no change tracker
- [Wolverine — Transactional Middleware](https://wolverinefx.net/guide/durability/marten/transactional-middleware.html) — source of the "writes are silently discarded" warning
- [Wolverine for MediatR Users](https://wolverinefx.net/introduction/from-mediatr)
- [MikroORM — Unit of Work and Transactions](https://mikro-orm.io/docs/unit-of-work)

**Technical constraints**
- [Prisma — Transactions and batch queries](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
- [Prisma v7.5.0 — nested transaction savepoints](https://www.prisma.io/changelog/2026-03-11)
- [prisma/prisma Discussion #12373](https://github.com/prisma/prisma/discussions/12373) — base client doesn't join an open transaction
- [EF Core — Connection Resiliency](https://learn.microsoft.com/en-us/ef/core/miscellaneous/connection-resiliency)

**Silent failures of rejected alternatives**
- [When @Transactional Doesn't Work — Spring AOP proxy](https://medium.com/@youngjae991/when-transactional-doesnt-work-understanding-spring-aop-s-proxy-behavior-acf37c1ab284)
- [MediatR Pipeline Behaviors — DI-registration order, no safeguard](https://deepwiki.com/jbogard/MediatR/2.3-pipeline-behaviors)
- [Unit of Work — ABP.IO](https://abp.io/docs/latest/framework/architecture/domain-driven-design/unit-of-work)

**Internal**
- `directives/cqrs_pattern.md` §5 — current repository rules
- `docs/adr/0002-booking-concurrency-control.md` — the decision built on top of this boundary
