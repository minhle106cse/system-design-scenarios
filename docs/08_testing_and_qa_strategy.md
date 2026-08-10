# Testing & QA Strategy

Full QA discipline: `directives/qa_standard.md`. This document covers what's actually tested and
why, specifically for this project.

## What's tested today

| Suite | Count | Covers |
|---|---|---|
| `packages/shared-kernel` | 6 suites, 52 tests | CQRS bus (command/query/event), HTTP response envelope, Prisma transient-error classification |
| `apps/scheduler-api` unit (`npm test`) | 12 suites, 114 tests | Skeleton infra (idempotency, transient-error wrapper, HTTP interceptors, exception filter) **plus the booking domain**: `Appointment` entity (mutation, defensive cloning, `cancel()` transitions), `business-hours.ts` (DST-correct zone conversion, grid enumeration, closed days, past-slot filtering), `resource-selection.ts` (deterministic ordering), `exclusion-violation.ts` (23P01 detection, verified shape), and all three handlers against mocked repositories — including every reference-validation and business-hours refusal path |
| `apps/scheduler-api` integration (`npm run test:integration`) | 1 suite, 3 tests | The concurrency guarantee itself, against real Postgres — see below |

Run: `npm test` (root, all workspaces) or `npm run test --workspace=@scheduler/api`. The
integration suite is **not** part of `npm test`/`turbo test` — see the next section.

## The most important test in this scenario: concurrent booking

Two layers, both necessary, neither sufficient alone:

**1. The database layer** — a live SQL test against the actual Postgres exclusion constraint,
run during init (see `.ai/memory/architecture.jsonl` for the transcript): overlap rejected,
back-to-back accepted (half-open range), cancel-then-rebook accepted. Proves the guarantee is real
at the storage layer, independent of any application code.

**2. The application layer** —
`apps/scheduler-api/src/modules/booking/application/commands/book-appointment/book-appointment.handler.int-spec.ts`,
run via `npm run test:integration` (real Postgres, no mocks — a `jest.Mocked<IAppointmentRepository>`
cannot exercise a database constraint). It:

- dispatches two concurrent `BookAppointmentCommand`s for the same bay/window via a real
  `CommandBus` → real transaction → real `PrismaAppointmentRepository.save()`, and asserts **exactly
  one `Promise.allSettled` result is fulfilled**, the other rejects with
  `AppointmentSlotConflictError` whose `reason` is `service_bay_taken_concurrently` — not just "an
  error", the *specific* translation `PrismaAppointmentRepository` is responsible for;
- confirms the database itself has exactly one `SCHEDULED` row for that window, not just that the
  command results *looked* right;
- separately proves back-to-back windows (`10:00–10:30` then `10:30–11:00`) both succeed — the
  `'[)'` half-open boundary, at the application layer this time, not just in raw SQL;
- and proves cancel frees the slot for an immediate re-book, using the real `CancelAppointmentCommand`.

Mirrors the pattern already used for `IdempotencyInterceptor`'s own concurrency test
(`idempotency.interceptor.spec.ts`, `'CONCURRENCY: only ONE of two simultaneous requests ...'`).
Fixture data (one dealership, one bay, one technician, one service type, one customer/vehicle) is
created and torn down by the test itself — never `prisma/seed.ts`'s shared demo data — using
far-future dates so repeated runs never collide with each other or with manual `curl` testing.

**Why a separate Jest project, not folded into `npm test`**: `jest.integration.config.js`'s
`testRegex` matches only `*.int-spec.ts`, a suffix the main config's `*.spec.ts` regex does not
match. This keeps `npm test`/`turbo test` fast and infrastructure-free — a fresh clone with no
Docker running still gets a fully green `npm run check`/`npm test` — while the guarantee that
*needs* Postgres has an explicit, documented, one-command way to run
(`docker compose up -d && npm run db:migrate && npm run test:integration`).

## What passing tests did not catch

Worth recording, because it is the most useful thing this section can say. The domain phase shipped
with all gates green and 92 passing tests. An audit of that finished work then found:

| Defect | Why no test caught it |
|---|---|
| A non-existent `customerId` returned `500` | Every spec mocked the repositories, so no test ever supplied an id that didn't exist |
| An unknown `dealershipId` returned `409 no_free_service_bay` | There *was* a test for it — asserting the wrong behaviour, because the spec encoded the same assumption as the code |
| A booking for `2020-01-01` was accepted | No test used a past date; there was no clock reference in the entire module to test |

The lesson is not "write more tests" — it is that a test suite written alongside an implementation
inherits its blind spots. All three are now covered, but the mechanism that found them was a
deliberate adversarial pass against finished work, not the suite. See
`docs/12_ai_collaboration.md` §5.

## Fixture dates

Two rules, both learned the hard way:

- **Weekdays only.** `BUSINESS_DAYS` defaults to Mon–Fri, so a weekend fixture makes a grid
  legitimately empty and the assertion tests the wrong thing. (This repo's own cURL example booked a
  Saturday before the audit.)
- **Far-future dates for anything clock-dependent.** `CheckAvailabilityHandler` filters past slots
  using the real clock, so a near-future fixture is a time bomb — green today, red next month.
  `check-availability.handler.spec.ts` uses `2099-06-01` (a Monday) for exactly this reason. Where a
  fixed clock is needed, `filterFutureWindows(windows, now)` takes `now` as a parameter rather than
  reading a global, so a spec can pin it without mocking `Date`.

## Test organization (`directives/testing_standard.md`)

- Co-located: `*.spec.ts` sits next to the file it tests, never in a root `test/` folder.
- Mocks: `jest.Mocked<T>` cast, never a hand-rolled partial object.
- `packages/shared-kernel` is ESM, `apps/scheduler-api` is CommonJS — the Jest config bridging that
  gap is already wired in both `package.json`s; don't touch it without reading the directive first.

## Verification loop (`directives/qa_standard.md`)

1. Code the feature.
2. Write/update the test.
3. `npm test`, read the log.
4. Fail → back to 1.
5. Pass → for anything structurally complex (the booking command, the availability check), also
   exercise it live: `curl` against a running `npm run dev` instance, then confirm the row in
   Postgres directly (`docker exec scheduler-postgres psql -U root -d scheduler_db`).
6. Only then, run the After-Task Protocol (`AGENTS.md`) and report done.

## What isn't tested (deliberately)

No E2E test suite against a full HTTP stack beyond the interceptor/filter specs already using a
real `NestFactory.create()` app (see `directives/logging_standard.md` for why those specific tests
need a real app, not a mock). A dedicated `test/` E2E harness is not built at this scope — the
combination of unit tests + the interceptor-level real-app tests + the live DB constraint
verification covers the requirement ("a suite of tests that validate core business logic") without
adding a second test runner/config for a single-service repo.
