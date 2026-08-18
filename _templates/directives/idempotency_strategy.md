<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: whether this is built or ⏸ not-needed — state WHICH, and why, at the top. The mechanism itself is not scenario-specific.
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# SOP: Idempotency Strategy

> Ported from `../service-appointment-scheduler/directives/idempotency_strategy.md` (itself trimmed
> from Cortex's Kafka-consumer-dedup version).
>
> ⏸ **NOT BUILT HERE, and — unlike most deferrals — not currently needed**, because every mutation
> in this API is already idempotent *by construction*: `POST .../auto-schedule` is a full replace
> (a full replace), and the import endpoint upserts on a natural key.
> Running either twice yields the same state, so a double-submitted form cannot
> double-apply. There is no `IdempotencyRecord` table, no interceptor, no cleanup cron.
> `resilience_patterns.md` §1 states the same conclusion from the resilience side.
>
> **Kept rather than deleted** because the mechanism below is the one to build the moment the
> trigger fires — see *Tripwire*. Read it as the design that is already decided, not as a
> description of code in this repo.

## The mechanism: claim-before-execute (the shape to build, if the tripwire fires)

`IdempotencyInterceptor` implements the pattern from Hohpe & Woolf's Idempotent Receiver, backed
by an `IdempotencyRecord` table (see `database_standard.md`,
the scenario's transaction/retry-boundary ADR — numbered 0001 in scenario 01, 0005 in scenario 02):

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
globally — it should protect the specific mutation that must not double-apply, not every request.
In this repo that would be whichever *new* append-shaped route triggers the need; it must **not**
be bolted onto auto-schedule or demand-import, which don't need it.

`IdempotencyCleanupService` (`@Cron('0 3 * * *')`) purges expired records nightly — without it the
table grows unbounded, since Postgres doesn't expire rows on its own (unlike a Kafka topic's
retention).

## Why claim-in-DB, not a distributed lock

A scenario with one database and no Redis — `INSERT ... ON CONFLICT`-style
claiming is atomic by construction: the claim and the eventual response live in the same
transactional store as the effect it's protecting, with no external lock service to add, configure,
or fail independently.

## Tripwire — build this if:

- **An append-only mutation appears.** The current "no idempotency needed" argument rests entirely
  on every write being a replace or an upsert. A route that *appends* (an audit log, a
  notification send, a second roster kept alongside the first rather than replacing it) breaks
  that argument the day it ships.
- A mutation's side effect reaches an external system (payment, SMS/email confirmation) that
  isn't itself idempotent. The DB-level claim only protects writes to *this* database.
- A message consumer is added — at that point, port back Cortex's Kafka-consumer dedup patterns
  (`natural-key` for upsert-shaped effects, `dedup-constraint` for append-shaped effects) from
  `../../distributed-social-platform/directives/idempotency_strategy.md`, since a consumer needs
  its own idempotency discipline, separate from this HTTP-layer mechanism.

## 🔗 Related

- `resilience_patterns.md` §1 — the same conclusion from the resilience side, with the same trigger
- the scenario's transaction/retry-boundary ADR — the boundary an
  `IdempotencyInterceptor` would write within
