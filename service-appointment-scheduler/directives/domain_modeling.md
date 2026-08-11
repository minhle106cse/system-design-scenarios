# SOP: Domain Modeling — Entity Factories & Persistence Boundary

> Applies to **every domain entity**. Goal: entities are always **valid-by-construction**, with a
> clear split between **where to validate (WRITE)** and **where to trust (READ)**.
>
> Ported from Cortex, translated, and trimmed of the event-sourcing/`.aggregate.ts` distinction —
> no event-sourced module exists in this scope (see `.ai/plans/init-source.plan.md` §4, `event_sourcing.md` is not
> ported). If a module ever needs replay-from-event-history as its source of truth, port that
> section back from Cortex's original before modeling it.

## 0. Entity = mutable + individual `_fields` (canonical style)

- Entity is **mutable**, stores **individual private fields** (`private _id: string`, `private
  _status: AppointmentStatus`), assigned in the constructor. **Not** a props-bag
  (`private readonly props: Props`).
- **Behavior methods MUTATE in-place + enforce a rule on the same identity**, return `void` — not
  `return new Entity(...)`:
  - ✅ `cancel() { this._status = AppointmentStatus.CANCELLED }`
  - ❌ `cancel(): Appointment { return new Appointment({ ...this.props, status: 'CANCELLED' }) }`
- Mutable-typed fields (`Date`, arrays) → **defensively clone at EVERY entry/exit**: constructor,
  getter, and any mutator that receives a collection. Clone-in with a getter that returns
  `this._x` directly (or a setter that stores the caller's reference directly) is half-measures —
  the caller can still mutate internal state.
  - `Date`: `this._x = new Date(props.x.getTime())` / `return new Date(this._x.getTime())`.
  - **Array = clone the container shell, not deep-clone elements** → `return [...this._arr]`
    (shallow). This blocks `getter.push()/splice()` from mutating the internal collection
    structure; it doesn't need to protect individual elements if they are themselves
    immutable value objects.
- **The real rule is about the SHAPE returned, not "mutable or not":**

  | Returns | Handling | Why |
  |---|---|---|
  | Array (collection) | clone the shell `[...this._x]` | array is a mutable container → block add/remove |
  | `Date` | clone `new Date(...)` | `Date` is a mutable object |
  | Single child entity | return directly | one reference, no container to guard |
  | Primitive (`string`/`number`/`boolean`) | return directly | already immutable, copy-by-value |

- **Identity: the entity owns its own id — the factory generates it, never accepts `id` from the
  caller.**
  - ✅ Generate a UUIDv7 in the factory (time-ordered, good B-tree index locality — matches
    `database_standard.md`'s PK convention). The mapper persists that same id on INSERT.
  - ❌ **Forbidden: generating the id at the controller/caller** and passing it into the
    command/factory. Wrong layer (presentation deciding domain identity), and commonly uses the
    wrong version (v4 random instead of v7).
  - ❌ **Forbidden: a sentinel `id: ''`** "for the DB to fill in later" (entity↔row divergence).
  - **Client needs the id immediately?** → the **handler returns `entity.id`**, the controller
    uses that value. Idempotency uses `IdempotencyRecord` (the `X-Idempotency-Key` header), not an
    upfront id.
- **Why:** this is mainstream DDD (Evans — entities are mutable with identity/continuity; only
  Value Objects are immutable). Immutable-entity + props-bag is a debatable style choice, not a
  default "best practice" — don't label it that way.
- The mapper's `toPersistence` reads through **getters** (`appointment.id`,
  `appointment.status`) — no `toSnapshot()`/props-bag needed.

## 1. Factory enforces invariants at creation (Intention-Revealing)

- `create()` must **not** be a pass-through that accepts a free discriminator (status/type). Split
  the factory by **variant**, baking the rule in:
  - ✅ `Appointment.createScheduled(...)` (the one door into a valid initial state) vs a
    hypothetical `Appointment.create({ status?: AppointmentStatus })` that lets a caller decide
    status freely — ❌ don't do the latter.
  - **Security-relevant invariant → prefer TYPE (compile-time) over a runtime guard** where
    possible. e.g. `type ManageableStatus = Exclude<AppointmentStatus, 'COMPLETED'>` makes "create
    an appointment already marked COMPLETED" a compile error, not an `if` check.
- **Input validation (presence / format / length / range) does NOT belong in the factory/entity.**
  ⛔ **RULE:** all input validation is Zod's job, at **every** input boundary (HTTP, command) —
  see `zod_validation.md`. The factory does not `if (!x.trim()) throw`; it only enforces
  **structural/type** invariants + intention-revealing construction. Each entry point validates
  with Zod **before** constructing the entity → the domain **trusts** that input is already clean
  (single source of truth = Zod, not validated twice).

### Naming the factory — ONE rule: `create<Variant>`, never `createFor<UseCase>`

> The factory name describes the **entity's variant** (what is created), never the **caller's
> use-case** (what it's created for). Use-case is the application layer's concern; the entity must
> not know about it.

- **Only one creation path → plain `create()`.** Don't invent a suffix when there's no second
  variant to distinguish from (speculative generality). e.g. `Customer.create`, `Vehicle.create`.
- **Two or more creation paths → name ALL of them by variant, drop the plain `create`.** Leaving a
  plain `create` next to variant-named factories reads as an ambiguous "implicit default."
- ❌ **Forbidden: `createFor<UseCase>`** (`createForBookingForm`, `createForAdminOverride`).
  Use-case is not a variant. When a real variant exists, name it along the entity's own axis of
  variation, e.g. `Technician.createWithQualifications(...)` vs a hypothetical bare creation.
- **Test before naming `create*`:** *"Does this call produce a brand-new identity that never
  existed before?"* No (loading/reading an existing one) → that's `rehydrate`/a query, not `create`.

## 2. Validate on WRITE — TRUST on READ (the boundary)

> This is the boundary most often gotten wrong.

- Data is validated **once, at the write side**: **Zod at the input boundary** (HTTP) + **DB
  constraints** (enum / unique / FK / NOT NULL / the exclusion constraint on `Appointment`, see
  `docs/adr/0002-booking-concurrency-control.md`). The factory does **not** validate input — it
  only enforces type/structural invariants (§1).
- **READ-side (`rehydrate` / `mapper.toDomain`) must TRUST persistence — not re-validate logic.**
  - "Logically invalid" data on read is **not supposed to be possible** (write-side + DB
    constraints already guarantee it).
  - If data really is corrupt, that's an **infrastructure incident (ACID violation)**, not
    something the domain should re-check on every read.
- ❌ Wrong: `status: toAppointmentStatus(row.status)` — a throwing validator on read
  (over-engineering, runs on every read, guards against something that can't happen).
- ✅ Right: `status: row.status` (the Prisma enum type already guarantees it), or a narrowing cast
  with a comment explaining the write-side invariant it relies on.
- **The mapper's row type is the Prisma enum type**, not downcast to `string` and cast back up
  — downcasting to `string` is what creates the dangerous cast in the first place; fix the root
  (use the right type), don't add a validator on top of a wrong one.

## 3. Every entity has its own Mapper

- `infrastructure/mappers/<entity>.mapper.ts` with `toDomain` + `toPersistence`. The repository
  **delegates** to the mapper — no inline `rehydrate(...)`.

## ⚠️ Forbidden

| Wrong | Right |
|---|---|
| Props-bag `private readonly props` + `return new Entity(...)` on every change | Individual private fields + in-place mutation (`this._x = ...`) |
| `create()` pass-through accepting a free status/type, no rule | Variant-specific factories + type constraints |
| `createFor<UseCase>` | `create()` (one path) or `create<Variant>` (≥2, all named) |
| `if (status === COMPLETED) throw` for a static invariant | `Exclude<Status,'COMPLETED'>` (compile-time) |
| `if (!x.trim()) throw` / input validation inside entity/factory | Validate input in the **Zod schema** (boundary); factory only enforces type invariants |
| Generating the id at the controller/caller | Factory generates a UUIDv7; the handler returns `entity.id` if the client needs it |
| Validate-on-read inside `mapper.toDomain` / `rehydrate` | Trust persistence; narrow with a typed cast |
| Mapper row type is `string` then `as SomeEnum` | Row type is the Prisma enum, assigned directly |
| Inline `rehydrate(...)` inside the repository | A separate `<entity>.mapper.ts` |

## 4. Domain Services — classes, never a bag of exported functions

> Applies to any pure-logic module in `domain/services/` (or infrastructure-layer logic with no
> I/O of its own — see the naming-rule note below): business-hours arithmetic, resource selection,
> error-shape detection. This is a **class**, constructed with `new`, holding whatever config it
> needs as constructor state — not a file of loose `export function`s a caller imports individually.

- ⛔ **RULE: no `export function`/`export async function` at the top level of a domain-service
  file.** Group the operations under one class name instead — one door into everything that module
  knows about its concern, the same way `Appointment` is one door into the entity's behaviour.
- **State that repeats at every call site becomes constructor state**, not a repeated parameter. If
  three call sites all pass the same `BusinessHours` value into every function call, that value
  belongs in the constructor and the methods drop the parameter. This is the actual OOP gain — a
  class that only wraps functions in `static` methods with no encapsulated state delivers none of
  it, and reads as ceremony around the same functions.
- **A genuinely stateless operation (no per-instance config, works the same for any caller) may
  stay `static`** — e.g. a pure calendar/timezone conversion that takes its own explicit arguments
  and is independently unit-tested against several different inputs per test, not through one
  instance's config. Don't force statelessness into instance methods just to avoid `static`; don't
  reach for `static` just to avoid holding real per-instance state either — decide per method by
  whether repeated callers actually share one config value.
- **Domain-layer services stay framework-free**, exactly like entities: plain TypeScript,
  constructed with `new` at the call site (never `@Injectable`, never DI-registered) — the domain
  layer is lint-forbidden from importing `@nestjs/*` (`eslint.config.mjs`). An application-layer
  handler holds a domain service as a private field, the same way it would hold any other
  collaborator, and constructs any request-scoped ones (e.g. one built from per-request config)
  inside the method that needs them.
- **This applies to pure infrastructure-layer logic too**, when the module does no I/O of its own —
  e.g. detecting an error shape thrown by an ORM. It is not exempt from the class rule just because
  it lives under `infrastructure/`; hexagonal treatment (interface + swappable adapter) is for code
  that actually crosses an infrastructure boundary (a repository talking to Postgres), not for a
  pure function that happens to be co-located with one.
- **Existing test coverage decides what stays public.** If a spec independently exercises an
  internal helper across multiple different inputs (not reachable the same way through the public
  methods alone), keep it public — collapsing it to `private` to look tidier is not worth losing
  that coverage's precision. Only fold a helper into `private` when nothing outside the class
  legitimately needs to call it on its own.

Naming: `{Concern}Calculator` / `{Concern}Selector` / `{Concern}Detector` — name the class after
what it computes or decides, the same instinct as `directives/naming_conventions.md`'s other
groups. Example: `BusinessHoursCalculator`, `ResourceSelector`, `ExclusionViolationDetector`.

## 🔗 Related

- `directives/folder_structure_sop.md` — layer boundaries (lint-enforced).
- `directives/cqrs_pattern.md` — where write repositories get their transaction client.
- `directives/naming_conventions.md` § Domain Service — the naming rule for this class family.
- `.ai/memory/conventions.jsonl` — specific lessons as they're logged.
