# PLAN — Query optimization + OOP domain services

> **Status: approved for execution 2026-08-11.** User directive after a code-reading walkthrough:
> check query optimization, and stop writing domain "services" as loose exported-function modules —
> use OOP classes; infrastructure-touching code stays hexagonal (already true — repositories are
> classes behind interfaces), pure domain logic can be a domain-service class directly without a
> port/adapter split.

---

## Part 1 — Query optimization: a real, measured gap

### Finding

`findBusyResourceIds` (`PrismaAppointmentRepository`, used inside every booking transaction) and
`findOverlappingAppointments` (`PrismaBookingQueryRepository`, used by every `GET /availability`
call) both filter `Appointment` by `dealershipId + status + startAt/endAt range`. `Appointment` has
three indexes — `[serviceBayId, startAt]`, `[technicianId, startAt]`, `[customerId]` — **none led by
`dealershipId`**. Every call to either method does a full sequential scan of the entire
`appointments` table, across **every** dealership, not just the one requested.

### Measured, not assumed

Seeded 6,000 synthetic appointments across 30 dealerships (200 each) directly in Postgres, ran the
exact predicate both methods use, dropped the fixture immediately after:

| | Before (current schema) | After (`@@index([dealershipId, status, startAt])`) |
|---|---|---|
| Plan | `Seq Scan on appointments` | `Index Scan using appointments_dealership_status_start_idx` |
| Rows examined | 6000 (every dealership) | 200 (this dealership only) |
| Buffers (shared hit) | 114 | 8 |
| Execution time | 2.202 ms | 0.242 ms |

The 9–14× at 6,000 rows is not the point — the point is **what each plan scales with**. The current
plan is O(appointments across the whole system); the indexed plan is O(this dealership's
appointments). Every dealership added to the system makes the current query slower for bookings at
*every other* dealership too.

### Fix

Add `@@index([dealershipId, status, startAt])` to `Appointment` in `schema.prisma`. Column order:
equality predicates first (`dealershipId`, `status`), then the one range predicate that can use
sorted index access (`startAt`); `endAt`'s `>` condition stays a post-index filter, matching the
`EXPLAIN` output above (`Filter: end_at > …`, `Rows Removed by Filter: 200` — cheap, because it only
runs against this dealership's already-narrowed rows, not the whole table).

This is a **plain btree composite index** — fully expressible in Prisma's DSL, unlike ADR-0002's
`EXCLUDE USING gist`. Generated normally via `prisma migrate dev`, in its own migration file. The
init migration (`20260810051339_init`) and the `duration_minutes` CHECK migration are both untouched
— this adds a fourth migration, it does not alter the first two.

No application code changes: both query methods already select the right predicate shape; they were
only missing the index that makes it cheap.

---

## Part 2 — Domain services: function modules → OOP classes

### Scope (verified, not guessed)

```
grep -rln "^export function\|^export async function" apps/scheduler-api/src/modules/booking
```
found exactly three non-test files:

| File | Layer | Convert? |
|---|---|---|
| `domain/services/business-hours.ts` | domain | ✅ |
| `domain/services/resource-selection.ts` | domain | ✅ |
| `infrastructure/repositories/exclusion-violation.ts` | infrastructure | ✅ — pure logic, no I/O, but lives in `infrastructure/` and is used by `PrismaAppointmentRepository`; converting it keeps the codebase from having two different styles for "pure logic module" depending on which folder it sits in |

Neither `directives/domain_modeling.md` (entities only) nor any other directive mandates
function-style domain services — there is no existing convention to override, only a gap to fill.
`directives/domain_modeling.md` gets a new section; `directives/naming_conventions.md` gets a new
naming rule, since neither currently covers this class family.

### Design constraint: domain layer stays framework-free

`eslint.config.mjs`'s domain-layer rule blocks `@nestjs/*` imports from `src/modules/*/domain/**`.
The new classes are **plain TypeScript, constructed with `new`** at their call sites — not
`@Injectable`, not DI-registered. Same pattern the domain layer already uses for
`Appointment.createScheduled(...)`.

### `BusinessHoursCalculator` (replaces `business-hours.ts`'s function exports)

Existing tests (`business-hours.spec.ts`) independently exercise `zonedTimeToUtc`, `zonedDateOf`,
and `isoWeekdayOf` across multiple *different* zone/date arguments per test, unrelated to any single
`BusinessHours` config — so those three, plus `filterFutureWindows` (takes no `hours` at all), stay
**`static`**: they're genuine utilities, not per-instance state. `isBusinessDay`, `businessDayBounds`,
`enumerateCandidateWindows`, `checkBusinessHours` become **instance methods**, reading `hours` from
the constructor instead of taking it as a repeated parameter at every call site — the actual OOP
gain, not just functions wrapped in a class.

```ts
export class BusinessHoursCalculator {
  constructor(private readonly hours: BusinessHours) {}

  static zonedTimeToUtc(date: string, time: string, timeZone: string): Date
  static zonedDateOf(instant: Date, timeZone: string): string
  static isoWeekdayOf(date: string): number
  static filterFutureWindows(windows: readonly TimeWindow[], now: Date): TimeWindow[]

  isBusinessDay(date: string): boolean
  businessDayBounds(date: string): TimeWindow
  enumerateCandidateWindows(date: string, durationMinutes: number): TimeWindow[]
  checkBusinessHours(window: TimeWindow): OutsideBusinessHoursReason | null
}
```
`BusinessHours`, `TimeWindow`, `OutsideBusinessHoursReason` stay exported interfaces/types — those
were never the "function helper" complaint; only the executable logic moves.

**Call-site change**, e.g. `book-appointment.handler.ts`:
```ts
// before
const outsideHours = checkBusinessHours(window, this.businessHours.get())
// after
const outsideHours = new BusinessHoursCalculator(this.businessHours.get()).checkBusinessHours(window)
```

### `ResourceSelector` (replaces `resource-selection.ts`)

Stateless — no config to hold — but a proper domain-service class per the same directive, not a
static-only namespace (a class with only static methods delivers none of OOP's actual benefit and is
just ceremony around the same functions). Handlers hold one instance as a field, matching how a real
service dependency is held.

```ts
export class ResourceSelector {
  selectFirstFree<T extends SelectableResource>(candidates: readonly T[], busyIds: ReadonlySet<string>): T | null
  countFree(candidates: readonly { readonly id: string }[], busyIds: ReadonlySet<string>): number
  // bySortKeyThenId stays private
}
```
Method name `selectFirstFree` is kept (not shortened to `select`) — it's ADR-0003 §2.2's own name for
the policy; renaming it would lose that link between code and decision.

### `ExclusionViolationDetector` (replaces `exclusion-violation.ts`)

```ts
export class ExclusionViolationDetector {
  detect(error: unknown): ExclusionConstraint | undefined
  // asPrismaRawDatabaseError stays private
}
```
`PrismaAppointmentRepository` holds one as a field: `private readonly exclusionViolationDetector = new ExclusionViolationDetector()`.

### Tests

All three `.spec.ts` files are rewritten to construct instances / call statics instead of importing
bare functions — **same test cases, same assertions, same edge-case coverage** (the DST-transition
dates, the tie-break, the "P2039 with a future constraint name" case). No coverage is dropped; only
the call syntax changes. `book-appointment.handler.spec.ts` and `check-availability.handler.spec.ts`
need no changes — they exercise these through the handler, which already only changes how it
constructs the collaborator, not what it asserts.

---

## Verification

1. `EXPLAIN ANALYZE` re-run after the real migration lands (not just the throwaway index), confirming
   `Index Scan` on the actual Prisma-generated index name.
2. `npx turbo run typecheck lint test format:check build` — full gate.
3. `npm run test:integration` — the concurrency guarantee must still hold; nothing about the index or
   the class conversion touches the exclusion constraints, but this is the cheapest way to prove that.
4. `git diff` on `prisma/migrations/20260810051339_init/` stays empty — unchanged from every prior plan.
5. Manual grep after: `grep -rn "^export function\|^export async function"` over the booking module
   returns nothing outside test files.

## Deliberately not done

- No change to `exclusion-violation.ts`'s detection logic, `business-hours.ts`'s arithmetic, or
  `resource-selection.ts`'s ordering — this is a structural conversion, not a logic change. Any
  behavioural difference the tests catch is a bug in the conversion, not an intended improvement.
- No repository classes touched beyond the one field addition to `PrismaAppointmentRepository` — they
  were already classes behind interfaces (hexagonal), which is what "nếu đụng hạ tầng thì hexa"
  already describes as done.
- No index added to `TechnicianServiceType`/`Technician`/`ServiceBay` — checked
  (`@@index([dealershipId])` on both, `@@index([serviceTypeId])` on the join table) and confirmed
  already adequate for `findQualifiedByDealership`/`findByDealership`'s predicates.

---

## References & Compliance

| Source | What it constrained |
|---|---|
| Live `EXPLAIN ANALYZE` against a seeded 6,000-row fixture | The query-optimization finding — measured, not assumed, per this repo's own "provoke the real error, don't guess" discipline (`docs/adr/0003` §2.5) |
| `apps/scheduler-api/prisma/schema.prisma` | Existing index shapes on `ServiceBay`/`Technician`/`TechnicianServiceType`, confirmed already adequate |
| `eslint.config.mjs` domain-layer rule | Why the new classes stay framework-free, constructed with `new`, never `@Injectable` |
| `directives/domain_modeling.md` | No existing rule on domain-service style (entities only) — a section is added, not overridden |
| `directives/naming_conventions.md` | No existing class-family entry for domain services — one is added |
| `directives/database_standard.md` | Migrations via `prisma migrate dev`, never hand-edited except where Prisma's DSL cannot express the DDL (not the case for a plain btree index) |
| `docs/adr/0002-booking-concurrency-control.md` | The two exclusion-constraint migrations that must stay untouched by this change |
| `docs/adr/0003-availability-and-selection-policy.md` §2.2 | The `selectFirstFree` name, preserved through the conversion |
| `directives/testing_standard.md` | Co-located specs; existing test cases must survive the conversion unchanged |
| `AGENTS.md` | Citation Protocol (this section); After-Task Protocol |
