# Stretch goals: per-staff availability (H4) + roles/skills

> Status: **planned, not started.** Written in a `/plan` mode session (2026-08-18), approved for
> review by the user before execution — mirrors how `phase-3-ui-screens` was handled
> (`.ai/PROJECT_STATUS.md` § Phase 3). Do not begin implementation until the user says so.
>
> **2026-08-18, later the same day — executed, both phases done.** The user asked to continue the
> plan. Both Phase 1 (H4) and Phase 2 (roles) were built end-to-end (algorithm → API → UI → docs),
> verified against a live Postgres in a real browser, per the plan's own Verification section
> below. Left unedited above per this repo's rule against rewriting a plan after execution — see
> `.ai/PROJECT_STATUS.md` for what actually shipped and where it diverged from this plan's text
> (the golden-test supervisor pool, the `roleShortfalls`-skips-closed-days fix, minor UI-copy
> wording not specified here).

## Context

`.ai/PROJECT_STATUS.md` § Current focus item 2 names the last two things the brief asks for and this
repo has not built:

> per-staff availability or days off · roles/skills (e.g. a shift must include at least one
> supervisor) — `docs/01_business_requirements.md:53-55` (brief §8, optional stretch goals)

Everything else is done: the reversal's phases A–F and Phase 3 (all seven UI screens). These two are
the remaining scope, and both are already *anticipated* by the design rather than bolted on:

- `feasibility-gate.ts:150-151` holds an empty **H4 slot**, `ReasonCode` already carries
  `'UNAVAILABLE'` (`model/types.ts:58`), and `docs/adr/0001-*.md:61-63` pre-blesses H4 as *"a case in
  the gate and a reason code, not a new subsystem."*
- `docs/03_architecture.md:87` lists both as deferred stretch goals 3 and 4.

Intended outcome: both stretch goals built end-to-end (algorithm → API → UI → docs), verified against
a live Postgres in a real browser, with the design contradiction roles create resolved explicitly in
a new ADR rather than papered over.

---

## Design decisions (approved by the user before planning)

| # | Decision | Consequence |
|---|---|---|
| D1 | **Availability is a time window**, not a day flag: `{ day, startMinute, endMinute }`. "Day off" is a `0–1440` preset in the UI. | Reuses `shiftsOverlap`/`overlapMinutes` from `model/hour-range.ts` verbatim. Covers the brief's *"availability **or** days off"* — both halves, one model. |
| D2 | **Roles are many-to-many** (`Role` entity + `StaffRole` join + `ShiftRoleRequirement`). | A person can be Supervisor *and* Barista — which is what "roles/**skills**" means. Costs 4 tables. |
| D3 | **A role shortfall is reported, never blocking.** Auto-schedule fills role seats *first* so it never produces a supervisor-less shift while capacity exists; when it can't (or a manager removes the last supervisor), `Diagnostics.roleShortfalls` says so. | Consistent with assumption 7 and CLAUDE.md's hard rule *"never let `generateRoster`/`validateRoster` throw on a feasible-but-bad input."* Keeps `FeasibilityGate` purely per-candidate — see D5. |

Two decisions that follow from those, taken here:

**D4 — `UNAVAILABLE` gets its meaning back; add `UNKNOWN_REFERENCE`.**
`index.ts:141-144` currently *reuses* `'UNAVAILABLE'` for "this assignment names a staffId/shiftId not
in the input", with its own docstring conceding the reuse is only safe because *"H4 is otherwise
unimplemented."* That stops being true in Phase 1. Split them: new code `UNKNOWN_REFERENCE` for the
dangling-reference case, `UNAVAILABLE` for real H4. `error-copy.ts:21-32`'s switch has no `default`,
so **it will fail to compile until updated** — a tripwire, not a silent break.

**D5 — role minimums are a *seat* requirement, not a gate constraint (→ new ADR-0006).**
`FeasibilityGate.eligible(staffId, day, shift, state)` answers *"may this person take this seat?"*. It
structurally cannot answer *"is this seat legal yet?"*. Pushing a per-seat rule into it breaks three
things at once:
- `rebalancer.ts:50-54` **throws** when a replayed, previously-valid commit becomes infeasible —
  exactly what happens when removing the only supervisor invalidates their colleagues.
- Verdicts become order-dependent, breaking the permutation-determinism property
  (`index.prop-spec.ts:178-192`).
- `Violation` (`types.ts:60-65`) requires a `staffId`; "this shift lacks a supervisor" has none.

So: **no new `ReasonCode` for roles**, `validateRoster` untouched, `AddAssignmentHandler` untouched.
Roles live in `computeShiftRequirements`-adjacent seat filling + `Diagnostics`.

---

## Phase 1 — per-staff availability (H4)

### 1a. `packages/scheduling-core` (zero runtime deps — unchanged)

`src/model/types.ts`
```ts
export interface UnavailabilityWindow {
  readonly day: DayOfWeek;
  readonly startMinute: number;
  readonly endMinute: number;
}
export interface Staff {
  readonly id: StaffId;
  readonly name: string;
  readonly maxWeeklyHours: number;
  readonly unavailability?: readonly UnavailabilityWindow[]; // ← new, OPTIONAL
}
export type ReasonCode =
  | 'WOULD_EXCEED_MAX_HOURS'  // H1
  | 'OVERLAPS_EXISTING_SHIFT' // H2
  | 'ALREADY_ASSIGNED'        // H3
  | 'UNAVAILABLE'             // H4 — now real
  | 'UNKNOWN_REFERENCE';      // validateRoster only; was folded into UNAVAILABLE (D4)
```
`unavailability` **must** stay optional: `tsconfig.base.json` sets `exactOptionalPropertyTypes: true`,
and making it required breaks `staffMemberArb` plus every fixture across eight spec files. Build it
with the conditional-spread idiom already at `src/index.ts:103`.

`src/assignment/feasibility-gate.ts` — implement H4 in the existing slot, and **move it to the front**
of the precedence chain (`H4 → H3 → H2 → H1`):
```ts
// H4 — per-staff availability. Checked FIRST: H1–H3 are roster-relative facts a manager can fix by
// moving assignments around; H4 is a fact about the person that no roster edit changes, so it is the
// more actionable diagnostic. Pure function of (staff, day, shift) — reads no RosterState, so it
// cannot make a verdict depend on replay order (the invariant rebalancer.ts:50-54 relies on).
if (staff.unavailability?.some((w) => w.day === day && overlapMinutes(w, shift) > 0)) {
  return { ok: false, reason: 'UNAVAILABLE' };
}
```
Zero behavioural change for existing data (nobody has unavailability today), so the golden snapshot
stays green. Update the pinned-order docstring at `:111-115` and add a precedence case to
`feasibility-gate.spec.ts` (which already tests H3→H2→H1 at `:104-123`).

> `overlapMinutes` currently takes two `Shift`s. Widen its parameter type to a structural
> `{ startMinute, endMinute }` — no behaviour change, and it stops `UnavailabilityWindow` needing a
> fake `id`/`label`.

`src/index.ts` — `validateRoster:155-158` emits `'UNKNOWN_REFERENCE'` instead of `'UNAVAILABLE'`.
Per this repo's own rule, **annotate the old docstring, don't rewrite it**: the note at `:141-144`
predicted this collision, so leave the prediction and add the dated correction under it.

### 1b. `apps/scheduler-api`

`prisma/schema.prisma` — one new model, plus the back-relation on `StaffMember`:
```prisma
model StaffUnavailability {
  id          String @id @default(uuid())
  staffId     String @map("staff_id")
  dayOfWeek   Int    @map("day_of_week") // 1 = Monday .. 7 = Sunday
  startMinute Int    @map("start_minute")
  endMinute   Int    @map("end_minute")  // > startMinute, same rule as Shift (assumption 3)

  staff StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@map("staff_unavailability")
}
```
**No `deletedAt`** — this is a config row replaced wholesale, the same class as `DemandCell`/
`Assignment`, so `PrismaService`'s `SOFT_DELETE_MODELS` array (`prisma.service.ts:12`, manually
synced) is deliberately left alone. State that in the schema comment next to the existing one.

New vertical slice, mirroring Staff's exactly (`prisma-staff-member.repository.ts` is the template —
local `<Noun>Row` type, module-private `toDomain`, `Prisma.TransactionClient` ctor, not `@Injectable`):
- `domain/entities/staff-unavailability.entity.ts`, `domain/repositories/staff-unavailability.repository.ts`
- `infrastructure/repositories/prisma-staff-unavailability.repository.ts`
- **`infrastructure/database/prisma/scheduler-api-repos.factory.ts`** — add `unavailability` to
  `SchedulerApiRepos` *and* to `create()`. Missing either is a silent DI hole.
- `application/commands/add-unavailability/`, `remove-unavailability/`
- `presentation/schemas/unavailability.schema.ts` — reuse `shift.schema.ts:5-19`'s
  `timeRangeRefinement` for `endMinute > startMinute`
- `StaffController` gains `POST :staffId/unavailability` (201) and
  `DELETE :staffId/unavailability/:windowId` (204)
- `common/errors/scheduling.error.ts` — `UnavailabilityWindowNotFoundError` (404)

`application/queries/scheduling.query-repository.ts` — `ScheduleDetail` gains
`unavailability: readonly StaffUnavailability[]`; add a sixth parallel `findMany` in
`prisma-scheduling.query-repository.ts` (`where: { staff: { scheduleId } }`). Fields are hand-mapped
there, so a new column is invisible to the API until added.

`application/shared/build-scheduling-input.ts` — **change the signature to a single options object**
before adding anything; it is about to take seven arguments across both phases:
```ts
buildSchedulingInput({ schedule, staff, shifts, demandCells, unavailability, staffRoles, shiftRoleRequirements })
```
Four call sites: `auto-schedule.handler.ts:37`, `add-assignment.handler.ts:41`,
`get-coverage.handler.ts:51`, `suggest-n.handler.ts:34`.

`prisma/seed.ts` — give two of the twelve staff a day off so the demo shows H4 firing.

### 1c. `apps/web`

- `api-client.ts` — `StaffUnavailability` type, `ScheduleDetail.unavailability`, `addUnavailability`/
  `removeUnavailability`, and the hand-duplicated `ReasonCode` union at `:148-149` gains
  `UNKNOWN_REFERENCE`.
- `error-copy.ts` — the exhaustive switch gains `UNKNOWN_REFERENCE`; `UNAVAILABLE`'s copy becomes
  specific ("Alice has Tuesday off — clear the block or pick someone else"), per
  `frontend_standard.md` §1 rule 1.
- `staff-manager.tsx` — an "Availability" column showing day-off chips, and a `Modal` editor with a
  **"Day off" preset** (writes `0–1440`) beside the from/to inputs. Existing mutation pattern:
  pending → `router.refresh()` → `Banner` on failure.
- New `src/lib/availability.ts` + spec — window→label formatting and day-off detection (the
  no-jsdom convention: non-trivial logic goes to `lib/` and is unit-tested there,
  `docs/08_testing_strategy.md`).

---

## Phase 2 — roles / skills

### 2a. `packages/scheduling-core`

`src/model/types.ts`
```ts
export type RoleId = string;
export interface RoleRequirement { readonly roleId: RoleId; readonly minCount: number; }

export interface Staff { /* … */ readonly roles?: readonly RoleId[]; }
export interface Shift { /* … */ readonly roleRequirements?: readonly RoleRequirement[]; }

export interface RoleShortfall {
  readonly day: DayOfWeek;
  readonly shiftId: ShiftId;
  readonly roleId: RoleId;
  readonly required: number;
  readonly assigned: number;
}
export interface Diagnostics { /* … */ readonly roleShortfalls: readonly RoleShortfall[]; }
```
`Diagnostics` gains a **required** field, but `golden.spec.ts` only snapshots four named keys
(`roster-assignments`, `structural-verdict`, `staff-diagnostics`, `summary-report`) — the existing
snapshot stays green. Add new `it(...)` blocks with their own keys rather than mutating those four.

`src/assignment/assigner.ts` — a third pass, run **before** `fairnessPass`:
```ts
export function rolePass(input, requirements, gate, state): void
```
For each seat (`enumerateSeats`, unchanged order), for each `shift.roleRequirements`, fill to
`minCount` restricted to staff holding that role, lowest utilisation first. Refactor
`pickCandidate`/`fillSeatTo`'s trailing `belowUtilisation?: number` into an options object
`{ belowUtilisation?, withRole? }` — both are module-private, so the call-site churn is contained.

*Why first:* a role minimum is the narrowest constraint (fewest eligible candidates). Most-constrained
-first is the only order under which "no supervisor available" means genuine lack of capacity rather
than an artefact of fill order. Role-holders committed here already count toward `state.countOn`, so
the floor/target passes see them and do not double-fill. Trade-off to state in ADR-0006: a supervisor
can be pushed above `U_min` before fairness runs; `rebalance` recovers part of that.

`src/index.ts` — `generateRoster` becomes `rolePass → fairnessPass → coveragePass → rebalance`.

`src/assignment/rebalancer.ts` — `coverageDidNotFall` (`:33-40`) compares per-seat **counts** only, so
a swap can preserve headcount while destroying role coverage. Add a sibling
`roleCoverageDidNotFall(before, after, staffRoles)` and require it alongside the existing two
acceptance conditions. Build the `Map<StaffId, Set<RoleId>>` once from `input.staff`.

`src/reporting/diagnostics.ts` — `roleShortfalls(input, requirements, state)`, looping `requirements`
the same way `unfilledSeats:74-80` already does (skip `floor === 0 && target === 0`, so a closed day
reports nothing). Wire into `buildDiagnostics`.

`validateRoster` stays unchanged (D5) — add a one-line docstring note saying why, so the next reader
does not "fix" the omission.

### 2b. `apps/scheduler-api`

Three new models (uuid PK + `@@unique` throughout — matching `DemandCell`/`Assignment`, *not* a
composite PK, so the repo's one-shape-for-every-model convention holds):
```prisma
model Role {
  id         String @id @default(uuid())
  scheduleId String @map("schedule_id")
  name       String
  schedule          Schedule               @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  staff             StaffRole[]
  shiftRequirements ShiftRoleRequirement[]
  @@unique([scheduleId, name])
  @@map("roles")
}
model StaffRole {
  id      String @id @default(uuid())
  staffId String @map("staff_id")
  roleId  String @map("role_id")
  staff StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)
  role  Role        @relation(fields: [roleId],  references: [id], onDelete: Cascade)
  @@unique([staffId, roleId])
  @@map("staff_roles")
}
model ShiftRoleRequirement {
  id       String @id @default(uuid())
  shiftId  String @map("shift_id")
  roleId   String @map("role_id")
  minCount Int    @map("min_count")
  shift Shift @relation(fields: [shiftId], references: [id], onDelete: Cascade)
  role  Role  @relation(fields: [roleId],  references: [id], onDelete: Cascade)
  @@unique([shiftId, roleId])
  @@map("shift_role_requirements")
}
```

Repos (+ three more `SchedulerApiRepos` factory entries): `IRoleRepository`,
`IStaffRoleRepository`, `IShiftRoleRequirementRepository`.

Commands: `add-role`, `update-role`, `remove-role`, `set-staff-roles`, `set-shift-role-requirements`.
The last two are **replace-the-whole-set** operations, matching the precedent assumptions 10/11 set
(`importDemand` upserts, `autoSchedule` `replaceAll`) rather than inventing add/remove-one semantics
for a set-shaped resource.

Routes — new `RolesController` (`schedules/:scheduleId/roles`), plus two `PUT`s on the existing
controllers:

| Method | Path | Code |
|---|---|---|
| `POST` | `/schedules/:scheduleId/roles` | 201 |
| `PATCH` | `/schedules/:scheduleId/roles/:roleId` | 200 |
| `DELETE` | `/schedules/:scheduleId/roles/:roleId` | 204 |
| `PUT` | `/schedules/:scheduleId/staff/:staffId/roles` | 200 |
| `PUT` | `/schedules/:scheduleId/shifts/:shiftId/role-requirements` | 200 |

Errors: `RoleNotFoundError` (404), `DuplicateRoleNameError` (409 — `@@unique([scheduleId, name])`
would otherwise surface as a raw P2002).

`ScheduleDetail` gains `roles`, `staffRoles`, `shiftRoleRequirements` (three more parallel
`findMany`s); `buildSchedulingInput` folds them into `Staff.roles` / `Shift.roleRequirements`.

`remove-assignment.handler.ts:8` — its docstring says *"removing an assignment can only relax the
roster's state, never violate it."* Under D3 the **behaviour** stays right (still no gate replay, still
204) but the **claim** is now too strong: a removal can degrade role coverage. Annotate it and point
at `Diagnostics.roleShortfalls`; do not add a block.

`prisma/seed.ts` — seed `Supervisor` + `Barista`, give 3 of 12 staff Supervisor, and put
`minCount: 1` Supervisor on both default shifts, so the seeded demo exercises the feature.

### 2c. `apps/web`

- `api-client.ts` — `Role`, `StaffRole`, `ShiftRoleRequirement`, `RoleShortfall` types;
  `Diagnostics.roleShortfalls`; the five new methods.
- `staff-manager.tsx` — a **Roles** section (per-schedule role CRUD) plus a role-chip multi-select per
  staff row. Deliberately not an 8th tab: roles are managed where they are assigned, keeping
  `docs/05`'s seven-screen nav stable.
- `shift-manager.tsx` — a "Requires" sub-row per shift: role + min count, saved via the `PUT`.
- `roster-manager.tsx` and `coverage-view.tsx` — a `Banner tone="warning"` listing role shortfalls
  alongside the existing `unfilledSeats`/structural banners.
- New `src/lib/role-copy.ts` + spec — `describeRoleShortfall(...)` → *"Friday Morning has no
  Supervisor (needs 1). Assign one, or lower the requirement on the Shifts tab."*

---

## Docs & protocol (same task, not later — CLAUDE.md After-Task)

- **New `docs/adr/0006-role-requirements-as-seat-requirements.md`** — D5's argument, the three things
  that break if roles go into the gate, and the most-constrained-first ordering trade-off. Add to
  `docs/adr/README.md`.
- `docs/adr/0001-*.md` — H4 is real now and `UNAVAILABLE` no longer double-booked. An accepted ADR's
  body is **not** rewritten: add a dated footnote (the pattern ADR-0003 already uses).
- `docs/01_business_requirements.md` — assumptions **17–20**: availability is a window not a flag (D1);
  roles are many-to-many (D2); a role shortfall is reported not blocked (D3); a role requirement
  applies to every day the shift runs, not per-day.
- `docs/03_architecture.md:86-87` — move stretch goals 3 and 4 out of Deferred, keeping the row with a
  note (the established pattern, not a silent delete).
- `docs/04_data_model.md` (4 new models + why no `deletedAt`), `docs/06_api_contracts.md` (5 routes +
  the `ReasonCode` list at `:85`), `docs/05_ui_guidelines.md` (staff/shifts/roster/coverage),
  `docs/08_testing_strategy.md` (new property assertions).
- `directives/naming_conventions.md` §3 — the new reason codes.
- After-Task: append to `.ai/memory/architecture.jsonl` (D5) and `conventions.jsonl` (the
  options-object refactor of `buildSchedulingInput`); update `.ai/PROJECT_STATUS.md` § Current focus.

---

## Verification

Unit/property, per phase:
```bash
npm run check && npm test
```
- `feasibility-gate.spec.ts` — H4 blocks an overlapping window; a non-overlapping window on the same
  day does **not**; new `H4 → H3` precedence case.
- `index.spec.ts:66-77` — the dangling-reference case now expects `UNKNOWN_REFERENCE`.
- `index.prop-spec.ts` — extend `staffListArb`/`shiftListArb` with unavailability and roles
  (degenerate cases: a staff member unavailable all week; a role nobody holds; `minCount` above team
  size). Assertion 1 (`validateRoster(generateRoster(input)) === []`) must stay green — that is the
  real proof H4 is enforced by construction. New assertions: no assignment ever overlaps an
  unavailability window; a reported `roleShortfall` matches a recount from the roster.
- `golden.spec.ts` — the four existing snapshot keys must be **unchanged**; new keys added for a
  with-unavailability and a with-roles run.

End-to-end, the repo's standard (live Postgres + real browser, not curl alone):
```bash
docker compose up -d && npm run db:migrate && npm run db:seed && npm run dev
```
1. Staff tab → give Alice Tuesday off → auto-schedule → **zero** Tuesday assignments for Alice.
2. Manual add of Alice to a Tuesday shift → `422 ROSTER_VIOLATION` / `UNAVAILABLE`, banner reads
   *"Alice has Tuesday off…"* — the case that proves the gate is shared by both paths.
3. Roles: create `Supervisor`, tag 3 staff, set `minCount: 1` on both shifts → auto-schedule → every
   filled seat has a supervisor; `roleShortfalls` empty.
4. Raise `minCount` to 4 (above the number of supervisors) → auto-schedule → **200 with a
   `roleShortfalls` banner**, not an error. This is D3's whole claim.
5. Delete the only supervisor from one seat → next `GET /coverage` shows that shortfall **without**
   re-running auto-schedule (the same live-recompute proof the coverage view already passes).
6. `next build` — all routes compile; `PATCH`/`PUT`/`DELETE` verified through the browser, since
   `@fastify/cors`'s `methods` list has burned this repo before and curl does not exercise CORS.

## Suggested sequencing

Phase 1 is self-contained and lands the `ReasonCode` split; Phase 2 builds on the
`buildSchedulingInput` options-object refactor Phase 1 introduces. Commit them separately.

---

## References & Compliance

Files read in full or in the relevant part before this plan was written (Citation Protocol,
`CLAUDE.md` § Citation Protocol):

- **`docs/01_business_requirements.md`** — brief §8 stretch goals (line 51-55, the two items this
  plan covers, quoted verbatim), assumption 7 (never throw on infeasible input → D3), assumption 12
  (one gate, two callers → why `validateRoster`/`AddAssignmentHandler` are untouched by D5),
  assumption 13 (weekly-hours cap is a hard constraint, contrasted with fairness being scored — the
  same hard/soft split D3 applies to roles).
- **`docs/03_architecture.md`** (§ Deferred scope, lines 86-87) — both stretch goals already named
  as deferred, H4 slot cross-referenced.
- **`docs/adr/0001-constraint-enforcement-strategy.md`** (full) — the `FeasibilityGate` argument D5
  extends; its own Consequences section (lines 61-63) is the citation for "H4 is a case in the gate,
  not a new subsystem," which this plan follows for availability and deliberately does NOT follow
  for roles (that divergence is why a new ADR-0006 is planned, not a footnote on ADR-0001).
- **`packages/scheduling-core/src/assignment/feasibility-gate.ts`** (full) — `FeasibilityGate`,
  `RosterState`, the H1-H4 precedence comment and the exact H4 placeholder (lines 150-151) this plan
  implements into.
- **`packages/scheduling-core/src/assignment/assigner.ts`** (full) — `enumerateSeats`,
  `pickCandidate`, `fillSeatTo`, `fairnessPass`, `coveragePass` — the shape `rolePass` (Phase 2) is
  designed to match.
- **`packages/scheduling-core/src/assignment/rebalancer.ts`** (full) — `withoutAssignment`'s throw
  behaviour (lines 45-54) and `coverageDidNotFall` (lines 33-40), both load-bearing for D5's argument
  and for Phase 2's `roleCoverageDidNotFall` addition.
- **`packages/scheduling-core/src/reporting/diagnostics.ts`** (full) — `unfilledSeats`'s existing
  reason-collection pattern (lines 65-90), the template `roleShortfalls` follows.
- **`packages/scheduling-core/src/index.ts`** (full) — `generateRoster`, `validateRoster` (and the
  `UNAVAILABLE`-reuse docstring at lines 141-144 that D4 corrects), the four frozen public entry
  points.
- **`apps/scheduler-api/src/modules/scheduling/domain/entities/staff-member.entity.ts`**,
  **`.../domain/repositories/staff-member.repository.ts`**,
  **`.../infrastructure/repositories/prisma-staff-member.repository.ts`**,
  **`.../application/commands/{add,update}-staff/*`**,
  **`.../presentation/controllers/staff.controller.ts`**,
  **`.../presentation/schemas/staff.schema.ts`** (all full) — the vertical-slice template every new
  entity in this plan (`StaffUnavailability`, `Role`, `StaffRole`, `ShiftRoleRequirement`) copies:
  naming, DI shape, Zod convention, HTTP status convention.
- **`apps/scheduler-api/src/modules/scheduling/scheduling.module.ts`** (full) — provider
  registration and the `SchedulerApiRepos` factory pattern new repos must be added to in two places.
- **`apps/scheduler-api/src/modules/scheduling/application/shared/build-scheduling-input.ts`**
  (full) — the adapter this plan widens into an options object, and its four current call sites.
- **`apps/scheduler-api/src/modules/scheduling/application/commands/auto-schedule/auto-schedule.handler.ts`**,
  **`.../add-assignment/add-assignment.handler.ts`**,
  **`.../remove-assignment/remove-assignment.handler.ts`**,
  **`.../queries/get-coverage/get-coverage.handler.ts`** (all full) — the four consumers of
  `buildSchedulingInput`/the gate that this plan's changes must keep correct, including
  `remove-assignment.handler.ts`'s docstring claim D3 requires annotating.
- **`apps/scheduler-api/src/common/errors/scheduling.error.ts`** (full) — domain-error convention
  (`code`/`statusCode` readonly fields, `ApplicationError` subclass) new errors follow.
- **`apps/scheduler-api/prisma/schema.prisma`** (full) — model/column/relation/soft-delete
  conventions (`@map`, `@@map`, `@default(uuid())`, `deletedAt` on exactly three models) every new
  table in this plan matches, including the deliberate choice NOT to add `deletedAt` to the new
  tables.
- **`apps/web/src/lib/api-client.ts`** (types section, lines ~130-230) — the hand-duplicated
  `ReasonCode`/`Diagnostics`/`ScheduleDetail` types this plan extends in parallel with the backend.
- **`apps/web/src/lib/error-copy.ts`** (full) — the exhaustive `switch` on `ReasonCode` (no
  `default`) that D4 relies on as a compile-time tripwire.
- **`apps/web/src/components/staff-manager.tsx`** (full) — the mutation pattern (pending →
  `router.refresh()` → `Banner`) every new UI piece in this plan reuses.
- **`AGENTS.md` / `CLAUDE.md`** — hard rules cited directly: never throw on feasible-but-bad input
  (D3), Zod only at the controller boundary, never call `prisma.*` outside a repository, never use
  `autoincrement()` PKs, zero runtime dependencies in `scheduling-core`.
- **`.ai/PROJECT_STATUS.md`** — the "Current focus" section this plan closes out, and the precedent
  for how the Phase 3 UI plan was structured, reused here (plan-first, `/plan` mode, approval before
  code).

No `directives/*.md` file was read in full beyond what's cited above via its cross-referenced
convention (e.g. `frontend_standard.md` §1 rule 1, `testing_standard.md`'s no-jsdom decision) —
those were confirmed via the parallel exploration agents' reports (staff-manager.tsx,
roster-manager.tsx, the `src/lib/*.spec.ts` layout) rather than re-read here; re-read them in full
before executing the corresponding phase if anything above turns out stale.
