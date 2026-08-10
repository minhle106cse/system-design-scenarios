# Testing & QA Strategy

Full QA discipline: `directives/qa_standard.md`. This document covers what's actually tested and
why, specifically for this project.

## What's tested today (post-init, pre-domain)

| Suite | Count | Covers |
|---|---|---|
| `packages/shared-kernel` | 6 suites, 52 tests | CQRS bus (command/query/event), HTTP response envelope, Prisma transient-error classification |
| `apps/scheduler-api` | 4 suites, 16 tests | `IdempotencyInterceptor` (including the concurrency test below), the Prisma transient-error wrapper, `HttpLoggingInterceptor` (real status/level, not the finalize() bug), `GlobalExceptionFilter` (real stack traces, no duplicate logging) |

Run: `npm test` (root, all workspaces) or `npm run test --workspace=@scheduler/api`.

## The most important test in this submission: concurrent booking

Not a unit test with a mock — a **live database test**, run against the actual Postgres exclusion
constraint during init (see `.ai/memory/architecture.jsonl` for the transcript):

```sql
-- 1. First booking: 10:00–11:00, bay b1, tech t1 → succeeds
-- 2. Overlapping booking: 10:30–11:30, same bay + tech → REJECTED
--    ERROR: conflicting key value violates exclusion constraint "appointments_service_bay_no_overlap"
-- 3. Back-to-back booking: 11:00–12:00 (starts exactly when #1 ends) → succeeds (half-open range)
-- 4. Cancel #1, then a new booking in its freed slot → succeeds
```

Once the scheduler domain's command handler exists, this same guarantee needs an **application-level**
test too — two concurrent `BookAppointmentCommand` dispatches for the same bay/window, asserting
exactly one succeeds and the other receives `AppointmentSlotConflictError`, mirroring the pattern
already used for `IdempotencyInterceptor`'s own concurrency test
(`idempotency.interceptor.spec.ts`, `'CONCURRENCY: only ONE of two simultaneous requests ...'`).
Both layers matter: the DB test proves the guarantee is real; the application test proves the
handler translates a raw Postgres error into a clean domain error instead of leaking a `500`.

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
