# SOP: Idempotency Strategy

> Trimmed heavily from Cortex's version, which is almost entirely about **Kafka consumer**
> dedup (natural-key vs dedup-constraint patterns for event handlers) — none of that applies at
> T1/T2, there is no message consumer (see `.ai/plans/init-source.plan.md` §3.3, T3 trigger). What's kept here is
> the **HTTP idempotency-key** mechanism, which IS implemented
> (`infrastructure/http/idempotency/idempotency.interceptor.ts`) and is directly relevant:
> Scenario A's booking form must not create two appointments on a double-submit.

## The mechanism: claim-before-execute

`IdempotencyInterceptor` implements the pattern from Hohpe & Woolf's Idempotent Receiver, backed
by the `IdempotencyRecord` table (see `database_standard.md`, `docs/adr/0001-transaction-retry-boundary.md`):

1. Client sends `X-Idempotency-Key: <uuid>` on a mutation (`POST`/`PATCH`/`PUT`/`DELETE`).
2. The interceptor computes `hashRequest(method, url, body)` and checks for an existing record
   with that key.
   - No record → **claim it**: `INSERT` a row with `response: null` **before** the handler runs.
     This closes the concurrent-request race a check-then-run design leaves open — two requests
     with the same key racing to `INSERT` means one wins, one gets `P2002` and is told to retry.
   - Record exists, same request hash, `response` populated → **replay** the cached response, the
     handler never runs again.
   - Record exists, same request hash, `response` still `null` → another request with this key is
     **in progress right now** → `409 Conflict`, fail fast, no polling.
   - Record exists, **different** request hash → `422` — reusing a key for a genuinely different
     request is a bug or a copy-pasted key, never a legitimate retry.
3. On handler success, the row is updated with the real response (cached for the 24h TTL).
4. On handler failure, the claim row is **deleted** so a legitimate retry with the same key isn't
   stuck behind a phantom "in progress" state.

Attach `IdempotencyInterceptor` **per-route** (`@UseInterceptors(IdempotencyInterceptor)`), never
globally — it should protect the specific mutation that must not double-apply (booking an
appointment), not every request.

`IdempotencyCleanupService` (`@Cron('0 3 * * *')`) purges expired records nightly — without it the
table grows unbounded, since Postgres doesn't expire rows on its own (unlike a Kafka topic's
retention).

## Why claim-in-DB, not a distributed lock

This repo has one database and no Redis (see `.ai/plans/init-source.plan.md` §8.3) — `INSERT ... ON CONFLICT`-style
claiming is atomic by construction: the claim and the eventual response live in the same
transactional store as the effect it's protecting, with no external lock service to add, configure,
or fail independently.

## Tripwire — revisit this if:

- A mutation's side effect reaches an external system (payment, SMS/email confirmation) that
  isn't itself idempotent. The DB-level claim only protects writes to *this* database.
- A message consumer is added (T3, `.ai/plans/init-source.plan.md` §3.3) — at that point, port back Cortex's
  Kafka-consumer dedup patterns (`natural-key` for upsert-shaped effects, `dedup-constraint` for
  append-shaped effects) from the original `idempotency_strategy.md`, since a Kafka consumer needs
  its own idempotency discipline, separate from this HTTP-layer mechanism.

## 🔗 Related

- `resilience_patterns.md` — retry + idempotency + graceful shutdown, the T1/T2 resilience surface
- `docs/adr/0001-transaction-retry-boundary.md` — the transaction/retry boundary
  `IdempotencyInterceptor` writes within
