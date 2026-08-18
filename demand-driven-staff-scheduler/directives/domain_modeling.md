# SOP: Domain Modeling

> Read before adding or changing a type in `packages/scheduling-core/src/model/`, a domain entity
> in `apps/scheduler-api/src/modules/scheduling/domain/entities/`, or the Prisma schema in
> `apps/scheduler-api/prisma/schema.prisma`.
>
> Rewritten from `../service-appointment-scheduler/directives/domain_modeling.md` and trimmed of
> its entity-factory / mapper / mutable-`_fields` material: that file models a domain with a real
> state machine (`Appointment.cancel()`), and **this one has none** — §2 explains why plain
> interfaces are the right shape here and where the class rules still apply if that changes.

## 1. `scheduling-core` — plain data, arithmetic-only value objects

Plan §2.1: zero runtime dependencies, plain data in, plain data out. Consequences for modeling:

- Every type in `model/types.ts` is a `readonly` interface — no class, no method, no hidden state.
  A `Staff`, a `Shift`, a `Roster` is exactly its fields.
- The **one** exception is `FeasibilityGate`/`RosterState` (`assignment/feasibility-gate.ts`) —
  deliberately the single place mutation is allowed (plan §7.4). Do not add a second mutable class
  anywhere else in this package; if something else feels like it needs to hold state, it is
  probably a pure function over a snapshot instead.
- Arithmetic helpers (`hour-range.ts`) are free functions over value objects, never methods —
  `overlapMinutes(shift, hour)`, not `shift.overlapMinutes(hour)`. Keeps every type serializable and
  keeps the package trivially testable with `fast-check` (no constructor to satisfy, just object
  literals).
- **No input validation lives here.** `scheduling-core` trusts its input completely — see
  `zod_validation.md` §4. If a function needs a precondition (`endMinute > startMinute`), it may
  assert it and throw, but it must never *sanitize* — sanitizing here would let malformed data past
  Zod at the boundary and hide the bug one layer further from where it happened.

## 2. `apps/scheduler-api` — a domain entity is a plain interface, not a Prisma row

- Every entity under `domain/entities/` (`Schedule`, `StaffMember`, `Shift`, `DemandCell`,
  `Assignment`, `ScheduleRun`) is a hand-written `readonly` interface, **not** the Prisma-generated
  row type re-exported. The eslint boundary rule (`domain/**` may not import `@prisma/client` or
  `@/generated`) is satisfied by a plain interface exactly as well as by a class — see
  `schedule.entity.ts`'s own docstring for why this domain uses plain interfaces, not stateful
  classes with behaviour methods, the way `../service-appointment-scheduler`'s `Appointment` entity
  does: that entity earns its class shape from a real state machine
  (`SCHEDULED → CANCELLED`); nothing in this domain has that. The one real state transformation —
  demand + staff + shifts → a roster — is `generateRoster`, and it lives in the framework-free
  `scheduling-core` package (ADR-0004), not here. A domain entity's whole job in this module is to
  be a typed, Prisma-free shape the application layer can pass around.
- A **repository** (`infrastructure/repositories/prisma-{entity}.repository.ts`,
  `directives/naming_conventions.md` §4) is the only code that imports `@prisma/client` outside
  `infrastructure/database/prisma/`. A command/query handler never calls `prisma.*` or even
  `PrismaService` directly — it calls a repository method through the injected `SchedulerApiRepos`
  shape. This is what makes `validateRoster`'s replay honest (assumption 12): the manual-edit path
  (`AddAssignmentHandler`) and the auto-schedule path (`AutoScheduleHandler`) both go through
  `tx.assignments`, so there is exactly one way an assignment reaches the database.
- The Prisma row → domain entity conversion (e.g. a `staffMember` row → `StaffMember`) happens in a
  small `toDomain()` function private to each `Prisma{Entity}Repository` — never a class, never
  exposed outside the repository file. `scheduling-core` never imports `@prisma/client`
  (lint-enforced, plan §2.1), so this conversion can only happen on the `apps/scheduler-api` side of
  that boundary; a second conversion (entity → `scheduling-core`'s own `Staff`/`Shift`/etc. shape)
  happens one layer further in, in `application/shared/build-scheduling-input.ts` — two conversions,
  two different boundaries, not one function trying to do both.
- **No domain SERVICE layer**, unlike `../service-appointment-scheduler`'s `booking` module
  (`BusinessHoursCalculator`, `ResourceSelector`). This domain's business logic already lives in
  `scheduling-core`; command/query handlers call into it directly
  (`generateRoster`/`validateRoster`/`summarise`) rather than re-deriving rules NestJS-side — see
  `scheduling.module.ts`'s docstring for the full argument. If a genuine domain-service-shaped
  concern ever appears here (something that isn't `scheduling-core`'s job and isn't simple
  orchestration either), name it per `../service-appointment-scheduler/directives/domain_modeling.md`
  §4's `{Concern}Calculator`/`{Concern}Selector`/`{Concern}Detector` rule — don't invent a new
  suffix convention for one class.

## 3. IDs

- Prisma: `@id @default(uuid())` — never `autoincrement()`. Consistent with treating a schedule as
  potentially shared/exported later (stretch goal 5, CSV export) even though multi-user itself is
  out of scope (assumption 14).
- `scheduling-core`: `StaffId`/`ShiftId` are branded as plain `string` type aliases (`model/types.ts`)
  — no UUID validation inside the package (that's Zod's job at the boundary, §1 above).

## ⚠️ How to apply this file

- Rules here apply to NEW code. If `scheduling-core` ever grows a second mutable class outside
  `FeasibilityGate`/`RosterState`, that is a signal to re-read plan §0.1 before adding it — the whole
  argument for property-based proof depends on there being exactly one gate.
- If `apps/scheduler-api`'s `scheduling` module ever grows a second bounded context (a genuinely
  separate domain, not another entity in this one), re-read
  `../service-appointment-scheduler/directives/domain_modeling.md` in full rather than stretching
  this file's two-entity-family model to fit — that file's entity-factory/mapper pattern for a
  richer domain is the one this file intentionally simplified away, not one that no longer applies
  to this repo at all.
