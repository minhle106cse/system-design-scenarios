# PLAN — Hardening pass

> **Status: executed.** Approved 2026-08-10, after the scheduler domain was complete and every gate
> was green. Authored in the session's working language (Vietnamese) and translated for the
> repository; content unchanged.

---

## Context

The previous phase finished the scheduler domain: three endpoints, 92 unit tests + 3 integration
tests, all gates green. **Scenario A was functionally complete** — all three core requirements had
working code, and all three deliverables had a home (only the video has no repo artifact, by design).

An adversarial audit of that finished work found **13 real problems**, including 3 runtime defects
and 2 deliverable gaps landing squarely on two of the four evaluation dimensions (*Technical
Execution*, *AI Engineering & Verification*).

Every finding below was reproduced independently before being accepted — none is inference:

| Finding | Evidence |
|---|---|
| The booking module contains **no clock reference at all** except `createdAt` | `grep "new Date()\|Date.now()"` → 1 hit |
| `docs/06` omits `APPOINTMENT_OUTSIDE_BUSINESS_HOURS` (422) entirely | the error table has 5 rows |
| `readme.md:32` says "two ADRs" while `readme.md:76` cites ADR-0003 | the file contradicts itself 44 lines apart |
| The showcase cURL example books a **Saturday** | `2026-08-15` → Saturday |
| `.ai/plans/` holds only `init-source.plan.md` | the largest phase has no "primary exhibit" |
| The OpenAPI spec has **no schemas whatsoever** | `nest-cli.json` has no swagger plugin, the DTOs are erased `interface`s, `nestjs-zod` is absent |
| `z.string().datetime()` **rejects** `+01:00` | executed: `Z` ACCEPT, `+01:00` REJECT |

**Intended outcome:** no path by which a well-formed client request yields a `500`, an OpenAPI spec
sufficient to generate a client, and documentation with no false sentences left in it.

## Decisions taken

| # | Decision |
|---|---|
| 1 | Do **all four tiers** (runtime defects → deliverables → doc drift → polish) |
| 2 | Validate foreign keys with **repositories and explicit 404s**, not by translating Prisma errors |
| 3 | Fix **all four** behavioural gaps in code: past bookings, zero-duration, vehicle ownership, closed days |
| 4 | **Commit the real plans** to `.ai/plans/` and amend `AGENTS.md` to say where plans live |

---

## Tier 1 — runtime defects

**1.1 Foreign-key validation.** `SchedulerApiRepos` gains `customers`, `vehicles`, `dealerships`
(same transaction-scoped pattern as the existing four). `VehicleRef` carries `customerId` so the
same read serves the ownership check. New errors: `CustomerNotFoundError`, `VehicleNotFoundError`,
`DealershipNotFoundError` (404), `VehicleNotOwnedByCustomerError` (422).

> Side effect worth recording: these reads go through the soft-delete-aware client, which closes a
> second hole — the Prisma extension filters only `find*`/`count`, **not** `create`, so a
> soft-deleted customer previously `connect`ed successfully and the booking was created silently.

**1.2 No bookings in the past.** A Zod `.refine` on the request body (the closure re-reads the clock
per parse) plus a pure `filterFutureWindows(windows, now)` used by the availability handler — `now`
is a parameter, not a global, so specs pin the clock without mocking.

**1.3 Vehicle ownership.** Compare `vehicle.customerId` against the command's `customerId`.

**1.4 Closed days.** `BUSINESS_DAYS` (ISO weekdays, default Mon–Fri) and `BUSINESS_CLOSED_DATES`
(explicit `YYYY-MM-DD` list) as configuration — consistent with ADR-0003 §2.3. Reuse
`AppointmentOutsideBusinessHoursError` with `details.reason: 'closed_day' | 'outside_hours'`, because
the client should react differently to each.

> ⚠️ This turns every `2026-08-15` fixture red (Saturday). Move them to a weekday — and fix the
> cURL examples in `docs/06` and `RUN.md`, which have the same defect.

**1.5 Zero-duration service types.** An empty `tstzrange` overlaps nothing, so **both** exclusion
constraints silently stop applying — unlimited bookings on one bay. Fix at the strongest layer: a new
migration on `service_types` (**not** `appointments`) adding `CHECK (duration_minutes > 0)`, plus a
defensive `UnreachableError` in the handler.

## Tier 2 — deliverables

**2.1 Real OpenAPI schemas** via `z.toJSONSchema()` (verified present in zod 4.4.3) — no new
dependency, Zod stays the single source of truth. Responses use the existing
`createSuccessResponseSchema()` from shared-kernel, because `ResponseInterceptor` wraps every payload
in an envelope and documenting the bare DTO would describe a body that never appears on the wire.
Compile-time assertions keep the published schema and the DTO mutually assignable.

**2.2 `docs/12_ai_collaboration.md`** — the stalest file in the repo; 7 of 12 memory entries were
unreflected. It is the primary artifact for the *AI Engineering & Verification* dimension.

**2.3 Plan evidence** — commit both real plans; amend `AGENTS.md`, whose Citation Protocol never
said where plans should live.

## Tier 3 — documentation drift

`docs/06` (4 new error codes + the missing 422, and the collision with the idempotency 422),
`docs/02` (UC-1's preconditions are factually false), `docs/01`, `docs/04`, `docs/08`, `docs/09`,
`docs/00`, `readme.md`, `SETUP.md`, three directives still saying "empty at init", three obsolete
`.gitkeep` files, `prometheus.yml`, and a self-contradictory sentence in `.ai/PROJECT_STATUS.md`.

## Tier 4 — polish

Move the success metric to `afterCommit` (it fired inside the transaction, so a failed COMMIT — or a
retried `P2034` — over-counted); one message per conflict reason; `status` typed as the domain union;
`countFree` taking `{id}` instead of a `SelectableResource` it never ordered; `z.iso.datetime({offset:
true})`; and two new reasons distinguishing permanent misconfiguration from transient contention.

---

## Verification

Full gate, then integration tests, then a smoke script where **each line is a defect that exists
today**: unknown customer `500 → 404`; unknown dealership `409 (wrong reason) → 404`; other
customer's vehicle `→ 422`; `2020-01-01` `201 → 400`; Saturday `201 → 422 closed_day`; `+07:00`
`400 → 201`; past-date availability `full grid → []`; Saturday availability `→ []`; `/docs-json`
`empty → full request and response schemas`; `duration_minutes = 0` rejected by the database; the
`booked` metric matching the real row count.

⚠️ `git diff` on `prisma/migrations/20260810051339_init/` must be **empty** — the new migration is a
separate file and ADR-0002's constraints are untouched.

## Deliberately not done (recorded as deferrals with triggers)

Per-country holiday calendars (`BUSINESS_CLOSED_DATES` is a manual list); a per-dealership
`DealershipOpeningHours` table (ADR-0003 §4's existing deferral stands); and the `COMPLETED` status,
which **has no write path at all** — meaning `AppointmentNotCancellableError` is a dead branch in
practice. Say so rather than pretend it works; the trigger is a check-in/check-out flow.

---

## References & Compliance

| Source | What it constrained |
|---|---|
| `KeyloopCodingChallange.pdf` | Re-read in full to confirm Scenario A completeness and the deliverables list — the OpenAPI gap (Tier 2.1) is a gap against Part 2's explicit wording |
| `docs/adr/0002` / `docs/adr/0003` | The constraint semantics that make a zero-length range dangerous (1.5); the no-retry decision the metric fix must not violate |
| `directives/cqrs_pattern.md` | The three new repositories follow the same tx-scoped, factory-constructed pattern; no new DI providers |
| `directives/domain_modeling.md` | `checkBusinessHours`/`isBusinessDay` stay pure domain functions; no input validation moved into the entity |
| `directives/zod_validation.md` | The future-date rule belongs in Zod at the boundary; the business-hours rule does not, because it depends on `durationMinutes` |
| `directives/database_standard.md` | Why the new CHECK is raw SQL in its own migration and why it must not touch `appointments` |
| `directives/resilience_patterns.md` §3 | The `afterCommit` metric fix; confirming the new errors carry no `transient` marker |
| `directives/testing_standard.md` | Spec structure for the new cases; the far-future fixture dates that keep clock-dependent specs from expiring |
| `AGENTS.md` | Citation Protocol (this section) and the After-Task Protocol |
