# Case Study 01 · Service Appointment Scheduler

**Booking a shared, constrained resource correctly when several people ask for it at the same
moment.**

🇬🇧 English · [🇻🇳 Tiếng Việt](CASE_STUDY.vi.md)

> This is the **door into the scenario** — written for someone learning from it, not for someone
> reviewing a spec. It answers the seven criteria groups defined in the
> [collection README](../README.md), and links out to the spec documents for detail rather than
> repeating them.
>
> | You want | Go to |
> |---|---|
> | To run it | [`RUN.md`](RUN.md) |
> | The formal system design document | [`docs/03`](docs/03_system_architecture_diagrams.md) |
> | The one decision that matters most | [`ADR-0002`](docs/adr/0002-booking-concurrency-control.md) |
> | The requirement → code → test map | [`readme.md`](readme.md) |

---

# A · Problem identity

## A.1 In one sentence

Given a customer, a vehicle, a service type, a dealership and a desired start time, confirm an
appointment **only if** a service bay and a technician *qualified for that service* are both free
for the **entire** duration — and never let two appointments hold the same bay or technician at
overlapping times, no matter how many requests arrive at once.

## A.2 Domain

Automotive retail, "Ownership" phase — the part of the customer lifecycle *after* the car is sold:
servicing, maintenance, repairs. In a dealer group this is typically the highest-margin,
highest-frequency touchpoint with the customer.

## A.3 The real-world pain

A service centre without a system runs on a **paper diary or a shared spreadsheet**, and a phone.
The service advisor takes a call, looks at today's page, sees "Bay 2, 10:00 — free", writes the
customer in. What that process cannot do:

| Failure | What actually happens |
|---|---|
| **Two advisors, one page** | Two customers are written into the same bay at the same time. Both arrive at 10:00. One of them waits an hour or is sent home. |
| **Duration ignored** | A 90-minute engine diagnostic is booked into a 30-minute gap. Everything after it slips, and the last customer of the day is turned away. |
| **Qualification ignored** | The car arrives for a transmission job; the only technician on shift is qualified for oil changes. The bay is occupied, the customer is not served. |
| **Technician double-booked across bays** | The bay is free, so the booking "looks" fine — but the one technician who can do the job is already under a different car in bay 3. |
| **No record** | A no-show cannot be distinguished from a lost booking; there is nothing to analyse, audit, or bill against. |

Each of these is a *capacity* failure that reads to the customer as incompetence, and each one is
invisible at the moment of booking — which is exactly why it needs a system rather than a more
careful advisor.

## A.4 Who has this problem

Directly:

- **Vehicle service centres and dealer groups** — the scenario as written.
- Anyone selling **time on a finite pool of skilled people and physical stations**.

The same problem, renamed:

| Industry | "Bay" becomes | "Qualified technician" becomes |
|---|---|---|
| Medical / dental clinic | Consultation or operating room | Doctor licensed for that procedure |
| Hair / beauty salon | Chair or station | Stylist trained in that treatment |
| Equipment / vehicle rental | The physical unit | Certified operator, or a licence class |
| Courts and legal | Courtroom | Judge assigned to that case type |
| Corporate facilities | Meeting room | Required equipment or an AV technician |
| Driving school | The training car | Instructor rated for that licence class |
| Veterinary practice | Exam or surgery room | Vet qualified for that species/procedure |
| Manufacturing | Machine or work cell | Operator certified on that machine |

If you can say *"we have N of these, they're booked in blocks of time, and not everyone can operate
all of them"* — this is your problem, whatever your industry calls it.

## A.5 Prevalence · ★★★★★

Rated on how often the problem appears in real products, not on how famous it is as an interview
question.

- **Every booking product ever built** contains this problem at its core. It is the reason
  Calendly, OpenTable, Booksy, Zocdoc, Cal.com, and every dealer DMS exist.
- It is also the problem that **most in-house implementations get subtly wrong**, because the
  incorrect version passes every test anyone thinks to write (see §C).
- Beyond booking: the underlying shape — *"check a condition, then write, atomically, against
  concurrent writers"* — is the same shape as seat reservation, inventory reservation, ticket
  sales, rate limiting, and unique-username registration.

Learning it once here transfers to all of those.

## A.6 Aliases

You will meet this problem under: *resource-constrained scheduling* · *double-booking prevention* ·
*multi-resource reservation* · *calendar conflict detection* · *interval scheduling with resource
constraints* · *the overbooking problem* · in academia, a constrained variant of *interval graph
colouring*.

---

# B · Requirements

## B.1 Functional — quoted verbatim from the brief

The scenario implements *Scenario A: The Unified Service Scheduler* from
[`KeyloopCodingChallange.pdf`](KeyloopCodingChallange.pdf):

> 1. **Resource Constrained Booking:** Allow a user to request a service appointment for a specific
>    vehicle, service type, and dealership at a desired time.
> 2. **Real-Time Availability Check:** Before confirming, check for the availability of both a
>    ServiceBay and a qualified Technician for the entire service duration.
> 3. **Confirmed Appointment Record:** Upon success, create a persistent Appointment record
>    associating the customer, vehicle, technician, and service bay.

Two words in requirement 2 carry almost all of the difficulty, and both are easy to skim past:

- **"qualified"** — technicians are not interchangeable. This forces a many-to-many qualification
  model and makes the availability query a filtered set, not a count.
- **"entire service duration"** — availability is about an *interval*, not an instant. A check that
  asks "is the bay free at 10:00?" is wrong; it must ask "is the bay free for all of
  10:00 – 11:30?"

## B.2 What was built

Four endpoints ([full contract](docs/06_api_contracts.md)):

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/appointments` | Book. The server picks the bay and technician — the client does not name them. |
| `GET /api/v1/availability` | Browse free slots for a dealership + service type + day. Returns **counts**, not ids. |
| `GET /api/v1/appointments/:id` | Read a booking back — this is what makes requirement 3's record observable. |
| `POST /api/v1/appointments/:id/cancel` | Cancel. A state transition, not a delete; frees the window immediately. |

## B.3 Non-functional requirements — and what was honestly not measured

| Property | Position taken | Honest status |
|---|---|---|
| **Correctness under concurrency** | The single non-negotiable. Enforced in the database. | **Proven** by a test that dispatches two real simultaneous bookings ([`test:integration`](docs/08_testing_and_qa_strategy.md)) |
| **Consistency** | Strong. One Postgres instance, one transaction per booking, no eventual consistency anywhere. | By construction |
| **Latency** | Booking is a handful of indexed queries plus one insert, inside one transaction. | A histogram exists (`scheduler_api_availability_check_duration_seconds`); **no load test was run** — the trigger for that is stated in [ADR-0003 §4](docs/adr/0003-availability-and-selection-policy.md), and inventing a number before it fires would be theatre |
| **Scalability** | Availability reads bays/technicians per dealership (dozens) and filters in memory. Fine at this size; the raw-SQL rewrite is designed and deferred with a trigger. | Deliberately deferred, not overlooked |
| **Availability** | Single instance, no HA. | Out of scope, stated |
| **Observability** | Structured JSON logs with automatic trace correlation, Prometheus metrics, a provisioned Grafana dashboard. | Built ([docs/03 §6](docs/03_system_architecture_diagrams.md)) |
| **Idempotency** | A double-submitted booking form must not create two appointments. | Built, Postgres-backed, and **tested over real HTTP** |
| **Security / auth** | None. Anyone can book on behalf of anyone. | Explicitly out of scope — see B.5 |

## B.4 Explicit non-goals

Named so that "missing" is never confused with "deferred":

- No authentication, authorisation, or multi-tenancy — any caller can book against any dealership.
- No payments, invoicing, or pricing.
- No notifications (email/SMS) — this is the canonical trigger for adding a message broker, and
  that seam is documented rather than built.
- No frontend. The brief asks for **one** layer implemented fully; this is the backend, with the
  client stubbed by the OpenAPI spec at `/docs` and cURL examples.
- No appointment list/search endpoint — it needs pagination and an index decision, and no
  requirement asks for it.
- No rescheduling, and no `COMPLETED` write path (so one 409 branch is unreachable in practice —
  documented rather than hidden).

## B.5 Ambiguity — where the brief didn't say

The brief explicitly instructs: *"If a requirement is unclear, please make a reasonable assumption
and document it."* Sixteen were logged
([full table](docs/01_business_requirements.md#assumptions)). The ones that changed the design:

| Ambiguity | Assumption | Consequence |
|---|---|---|
| What makes a technician "qualified"? | A many-to-many `TechnicianServiceType` join table | Availability becomes a filtered query, not a count. The seed data deliberately gives technicians *different* qualifications so the rule is demonstrable. |
| Continuous time, or fixed slots? | **Continuous** intervals; duration comes from `ServiceType.durationMinutes` | Forces range types and `EXCLUDE`, instead of a simple unique index on a slot id. Harder SQL, better fit to the domain. |
| Who picks the bay and technician — client or server? | **Server**, deterministically (first free bay by label, first free technician by name) | The client cannot choose well: it would have to read availability, choose, and still lose the race. Determinism also makes demos and tests reproducible. |
| When is the dealership open? | Configuration (`BUSINESS_HOURS_*`, `BUSINESS_DAYS`, `BUSINESS_CLOSED_DATES`), one schedule for all dealerships | Avoids a migration next to the hand-written constraints. A per-dealership table is designed and deferred with a trigger. |
| Is `GET /availability` a reservation? | **No.** It takes no lock and creates nothing. | It returns *counts*, not ids — an id would read as "this one is yours", which it is not. |
| Must the vehicle belong to the customer? | Yes — enforced in the handler (422) | The ERD asserts it; the database only had the two foreign keys independently, related to nothing. |

---

# C · Why it's hard

## C.1 The check is a read, and reads don't stop writes

Here is the entire problem, in one timeline. Two customers, one free bay:

```
        Request A                          Request B
t=0     read: bay 1 free 10:00–11:00
t=1                                        read: bay 1 free 10:00–11:00
t=2     (decides: book bay 1)              (decides: book bay 1)
t=3     INSERT appointment bay 1
t=4                                        INSERT appointment bay 1
                                           ← both succeed. Bay 1 is double-booked.
```

Both requests did exactly what the requirement said. Both checked availability. Both were correct
*at the moment they checked*. This is **TOCTOU** — time-of-check to time-of-use — and it is the
defining hazard of the scenario.

## C.2 Why the obvious fixes don't work

**"Wrap it in a transaction."** A transaction gives atomicity and isolation of *your own* work; at
Postgres's default `READ COMMITTED`, it does not make your read block someone else's insert. Both
transactions commit happily. Raising to `SERIALIZABLE` *would* catch it — by aborting one
transaction with a serialization failure that you must then detect and translate, which is strictly
more work than the declarative constraint, and it slows down every unrelated transaction too.

**"Check again just before the insert."** This shrinks the window; it does not close it. There is
always a gap between the last read and the write, and concurrency does not respect how close two
lines of code look in the source.

**"Lock the bay."** Now every writer must remember to take the lock — including the admin tool
written next year, and the data-fix script run at 2am. The invariant lives in a convention, and
conventions are not enforced.

This is the general lesson, and it's worth stating plainly:

> **An invariant enforced by every writer is enforced by none of them.**
> Put it where it cannot be bypassed — in the data model itself.

## C.3 The business consequence of getting it wrong

Not an abstract data-integrity issue. Two customers drive to the dealership. One of them is turned
away, or waits an hour. The service centre loses a slot it could have sold, and a customer it may
not get back. The bug is silent in the database and extremely loud in the car park.

And critically: **the broken version passes review.** The check is right there, a few lines above
the insert. It reads correctly. It only fails when two requests interleave — which no unit test with
a mocked repository can ever produce.

## C.4 Difficulty · ★★★☆☆

The *core* insight is a single constraint, and once seen it's obvious. What earns the middle rating
is that nothing about the problem tells you the insight is needed — you have to already know that
"check-then-act" is a hazard class, and know that your database has a declarative answer to it.
Around that core, the honest supporting work (DST-correct business hours, qualification filtering,
idempotency, error taxonomy) is ordinary but broad.

---

# D · The design

## D.1 Architecture

```
Client (cURL / OpenAPI-generated)
   │  REST + X-Idempotency-Key
   ▼
HTTP layer ── TraceContext → ZodValidationPipe → Controller → IdempotencyInterceptor
   ▼
CQRS bus ──── CommandBus (log → retry → transaction → handler)   writes
              QueryBus   (no transaction)                         reads
   ▼
Domain ─────  Appointment entity · business-hours · resource-selection   (pure TS)
   ▼
Repositories  one write-repo set per transaction (Unit of Work)
   ▼
PostgreSQL ── tables + THE EXCLUSION CONSTRAINTS  ← the guarantee lives here
```

Full diagram and component roles: [`docs/03`](docs/03_system_architecture_diagrams.md).

## D.2 Data model

Nine tables. Why each one exists:

| Table | Why it's needed |
|---|---|
| `Customer`, `Vehicle` | Requirement 1's "specific vehicle"; `Vehicle.customerId` gives the ownership rule something to check |
| `Dealership` | Requirement 1's "dealership". Bays and technicians belong to exactly one |
| `ServiceType` | Carries `durationMinutes` — **this is what turns a start time into an interval** |
| `ServiceBay` | The physical constrained resource |
| `Technician` | The human constrained resource |
| `TechnicianServiceType` | The join table that makes "**qualified**" mean something checkable |
| `Appointment` | Requirement 3's record: all four associations + the interval + status |
| `IdempotencyRecord` | Makes a double-submitted form safe — in Postgres, so no Redis is needed |

Conventions: UUID primary keys (never `autoincrement`), `camelCase` in code mapped to
`snake_case` columns, soft delete via `deletedAt`. Full ERD: [`docs/04`](docs/04_database_schema.md).

## D.3 The flagship decision — a database-level exclusion constraint

Straight from the migration ([read it here](apps/scheduler-api/prisma/migrations/20260810051339_init/migration.sql)):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_service_bay_no_overlap"
  EXCLUDE USING gist (
    "service_bay_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'SCHEDULED'::"AppointmentStatus" AND "deleted_at" IS NULL);
```

…and a second, identical one keyed on `technician_id`.

Read it as a sentence: **no two rows may exist where the bay is the same (`WITH =`) *and* the time
ranges overlap (`WITH &&`)** — considering only rows that are `SCHEDULED` and not soft-deleted.

Four details worth understanding, because each one is a decision:

1. **`EXCLUDE USING gist`** — a generalisation of `UNIQUE`. `UNIQUE` rejects a row when a column is
   *equal* to an existing one; `EXCLUDE` lets you choose the operator per column. Here: equality for
   the bay, **overlap** (`&&`) for the time range. This is what a unique index cannot express.
2. **`btree_gist`** — a GiST index natively handles range overlap but not scalar equality. This
   extension adds `=` support so both terms can live in one index. Without it the constraint will
   not create.
3. **`'[)'` — half-open interval.** `end_at` is *exclusive*. An appointment ending at 11:00 and one
   starting at 11:00 do **not** overlap. This matches how a human reads "10–11" then "11–12", and
   it is tested explicitly. Get this wrong and every back-to-back booking is rejected.
4. **The partial `WHERE`** — cancelled appointments stop participating, so cancelling frees the
   window *immediately*, with no cleanup job. Soft-deleted rows drop out too, keeping the database's
   view and the application's view of "which rows exist" identical.

**Prisma cannot express this.** The migration was generated with `--create-only` and the block added
by hand, then committed. This is also why `prisma db push` is not enough for this project, and why
the init migration is treated as immutable.

## D.4 The five alternatives, and why each was rejected

From [ADR-0002 §4](docs/adr/0002-booking-concurrency-control.md) — an ADR without rejected options
isn't an ADR:

| Alternative | Why rejected |
|---|---|
| **Application check only** | Doesn't close the race (§C.1). This is the single most common way this exact bug ships — reviewed code that looks correct because the check sits right above the write. |
| **Optimistic concurrency (`version` column)** | OCC protects concurrent writes to the **same row**. The hazard here is between **two different new rows**; OCC has nothing to compare against before insert. Wrong tool for this shape of conflict. |
| **Distributed lock (Redis `SETNX`)** | Works, but adds an external dependency this project otherwise doesn't need, for a guarantee Postgres provides natively — and only protects callers that remember to take the lock. |
| **`SELECT … FOR UPDATE`** | You must lock exactly the right rows *before the conflicting row exists*. Awkward to get right, and still only protects writers who lock in the right order. |
| **Fixed slots + unique index** | Simpler SQL, but forces every duration to a multiple of the slot size and wastes capacity. Continuous ranges fit the domain better; Postgres makes the "harder" version no harder to maintain. |

## D.5 Other decisions worth stealing

- **The application check is kept anyway** — not for correctness, but for *good errors*. It
  distinguishes six refusal reasons (`no_service_bay_at_dealership`, `no_free_service_bay`,
  `service_bay_taken_concurrently`, …). "The shop is fully booked" and "you lost a race, retry now"
  demand opposite reactions from the client.
- **A slot conflict is never auto-retried** ([ADR-0003 §2.4](docs/adr/0003-availability-and-selection-policy.md)).
  Only transient DB errors (`P2034`) are retried. A taken slot stays taken; retrying just produces a
  slower identical failure. The error deliberately carries no `transient: true` marker.
- **Idempotency is claim-before-execute, in Postgres.** The key row is inserted *before* the handler
  runs, so a concurrent duplicate finds either a completed response (replay) or a claim in progress
  (409) — it can never reach the handler twice. No Redis.
- **Availability returns counts, not ids** — it is a projection, not a reservation.
- **Business hours are configuration, not a table** — buys the same demo at zero schema risk next to
  the hand-written constraints. The table version is designed and deferred with a trigger.

## D.6 Technology, and why

| Choice | Reason |
|---|---|
| **PostgreSQL** | The flagship guarantee *requires* range types and exclusion constraints. Not every database can express this declaratively — this is a case where the database choice is driven by a correctness requirement, not by taste. |
| **Prisma** | Type-safe queries and versioned migrations — with the understanding, made explicit here, that its DSL doesn't cover every Postgres feature, and one hand-written exception. |
| **NestJS + Fastify** | DI and modules give the CQRS wiring and the lint-enforced hexagonal boundaries a natural home; Fastify for lower overhead. |
| **CQRS + Unit of Work** | Makes the transaction boundary **structural** rather than a discipline to remember ([ADR-0001](docs/adr/0001-transaction-retry-boundary.md)) — which matters when the core requirement is a concurrency guarantee. |
| **Zod, per-route** | One validation library, applied explicitly. The OpenAPI schemas are *generated from the same schemas the API validates with*, so the published contract cannot drift from the enforced one. |
| **No Redis, no Kafka** | Neither has earned its place yet. Both seams are documented with the trigger that would bring them in. |

---

# E · Correctness

## E.1 What must be proven

One sentence: **two simultaneous bookings for the same bay and window must produce exactly one
appointment.** Everything else is ordinary; this is the property the product is *for*.

## E.2 Three test layers, each proving what the others structurally cannot

187 tests total, in three suites that enter the system at three different depths — deliberately, not
accidentally:

| Suite | Enters at | Count | Proves | Structurally **cannot** prove |
|---|---|---|---|---|
| **Unit** (`npm test`) | the class, repositories mocked | 172 | Branch logic, selection order, DST-correct business hours, every refusal path | Anything about the database — a mock cannot stand in for a constraint |
| **Integration** (`test:integration`) | the `CommandBus`, below HTTP | 3 | **The guarantee.** Two real concurrent commands → real transactions → real Postgres; exactly one wins, with the right error, and exactly one row remains | Anything about the HTTP contract |
| **E2E** (`test:e2e`) | the socket, via `app.inject()` | 12 | The published contract: status codes, error envelope, Zod rejection, idempotent replay | Concurrency (it runs sequentially, by design) |

The integration test enters *below* HTTP on purpose: nothing about controllers or serialization can
explain away its result.

## E.3 What each layer actually caught — real defects, not hypotheticals

This is the part worth reading, because it's the least flattering:

- After the domain phase passed **every gate with 92 green tests**, a deliberate adversarial audit
  still found: a mistyped id returning **500** instead of 404; an unknown dealership reported as
  `409 no_free_service_bay` — a code the contract defines as "every bay is busy"; and **no clock
  reference anywhere in the module**, so a booking for the year 2020 was accepted.
- A later audit found `GET /availability` answering **`200 {"availableSlots": []}`** for a
  dealership that doesn't exist — indistinguishable from "fully booked", while `POST` returned 404
  for the same id. The same defect class, fixed once on the write path and missed on the read path,
  because *"no results"* is also a legitimate answer and therefore hides a bug well.
- The **first test that ever went through a real socket failed immediately**: the idempotency
  response was persisted fire-and-forget, so a client retrying promptly read `null` and got
  `409 in progress` for a request that had **already succeeded**. The unit spec asserted the write
  was *called* — it was. Manual cURL passed, because a human retypes slower than the write commits.
- A `duration_minutes = 0` would have made `tstzrange(start, start)` **empty** — and an empty range
  overlaps nothing, silently disabling **both** exclusion constraints for that service type. Fixed
  with a `CHECK (duration_minutes > 0)`, at the database, because the handler is not the only writer.

## E.4 What tests cannot prove

- That the tests asked the right questions. Every defect above lived in code with green tests; the
  mechanism that found them was an adversarial pass against *finished* work, not the suite.
- Behaviour under real load — no load test was run, and the docs say so rather than implying a
  number.
- That the deployment is correct: the CI workflow is structurally reviewed and each step reproduced
  locally, but **it has never run on a runner** (there is no remote). Stated, not glossed.

---

# F · Learning value

## F.1 Concepts, and where to see each one

| Concept | Where |
|---|---|
| PostgreSQL exclusion constraints, GiST, `btree_gist` | the [init migration](apps/scheduler-api/prisma/migrations/20260810051339_init/migration.sql) |
| Range types and half-open interval semantics | same file, plus `business-hours.ts` |
| TOCTOU / check-then-act hazards | [ADR-0002](docs/adr/0002-booking-concurrency-control.md) |
| CQRS command/query separation | `shared-kernel/src/cqrs/` |
| Unit of Work as a *value*, not a flag | [ADR-0001](docs/adr/0001-transaction-retry-boundary.md) |
| Hexagonal layering, **lint-enforced** | `apps/scheduler-api/eslint.config.mjs` |
| Idempotency without Redis (claim-before-execute) | `infrastructure/http/idempotency/` |
| Retry classification — what may and may not be retried | `resilience/prisma-transient-error.ts` |
| DST-correct time handling with `Intl`, no date library | `domain/services/business-hours.ts` |
| Zod as the single source for validation **and** OpenAPI | `presentation/schemas/responses.schema.ts` |
| Structured logging with automatic trace correlation | `directives/logging_standard.md` |
| Test layering as a design decision | [`docs/08`](docs/08_testing_and_qa_strategy.md) |

## F.2 Prerequisites

**Needed:** SQL and relational modelling; basic transactions and what "concurrent requests" means;
TypeScript; REST.
**Helpful, not required:** NestJS, Prisma, CQRS, Docker. Each is explained where it appears.
**Not needed:** distributed systems, Kafka, Kubernetes — deliberately, none of it is here.

## F.3 Time

| Goal | Estimate |
|---|---|
| Understand the core idea | ~15 min (this document, §C and §D.3) |
| Read the design properly | ~1 hour (`docs/03` + ADR-0002 + ADR-0003) |
| Run it and see the guarantee hold | ~30 min (`RUN.md` → `test:integration`) |
| Rebuild it yourself from scratch | 2–4 days for the core; the surrounding rigour (observability, error taxonomy, three test layers, docs) is what turns it into a week |

## F.4 The traps — where people actually get this wrong

1. **Trusting the application check.** The most common failure. It looks correct in review.
2. **Checking an instant instead of an interval.** "Is 10:00 free?" is not "is 10:00–11:30 free?"
3. **Closed intervals.** Using `'[]'` makes back-to-back bookings collide, and you'll "fix" it by
   subtracting a minute somewhere — a bug you then carry forever.
4. **Forgetting `btree_gist`.** The constraint simply won't create, with an error that doesn't
   obviously point at an extension.
5. **Zero or negative duration.** An empty range overlaps nothing, so it silently *disables* your
   constraint. Enforce it in the database, not the handler.
6. **Auto-retrying a genuine conflict.** A taken slot stays taken; retrying wastes time and hides
   the signal the client needed.
7. **Making a mistyped id look like a capacity problem.** `404` and "we're fully booked" call for
   opposite reactions from the caller.
8. **Not being able to read the record back.** Requirement 3 says "persistent record"; without a
   read endpoint it's persistent and invisible.
9. **Assuming green tests mean correct.** Every defect in §E.3 lived alongside passing tests.

## F.5 Interview relevance

Directly reusable when asked to design: a **restaurant / hotel / flight reservation** system, a
**ticketing** system, a **doctor's appointment** app, a **meeting-room booker**, a **parking**
system — or asked the underlying question directly: *"how do you prevent double-booking?"*

The answer that lands is not "use a transaction". It is: *"the check is a read, so it races. I'd put
the invariant in the database where it cannot be bypassed — an exclusion constraint over
(resource, time range) — and keep the application check only for producing good error messages."*
Then name the alternatives and why you rejected each ([§D.4](#d4-the-five-alternatives-and-why-each-was-rejected)).

---

# G · Evolution

## G.1 At 10× and 100×

| Scale | What breaks first | The fix, already designed |
|---|---|---|
| **10×** (hundreds of bays/technicians) | `GET /availability` fetches all bays + technicians + the day's appointments and filters in memory | Replace with one `NOT EXISTS` / `tstzrange &&` query — the GiST index the constraint already created supports it. The overlap predicate is written identically in both places, so the rewrite is mechanical ([ADR-0003 §4](docs/adr/0003-availability-and-selection-policy.md)) |
| **10×** (many dealerships, different hours) | One `BUSINESS_HOURS_*` config for everyone | A `DealershipOpeningHours` table — deferred because it costs a migration next to the hand-written constraints |
| **100×** (write contention on popular slots) | Conflict rate rises; every loser burns a transaction | Load-balanced selection instead of always filling the lowest-ordered bay. The metric that signals it already exists: `scheduler_api_booking_attempt_total{outcome="*_taken_concurrently"}` rising while other bays sit idle |
| **100×** (multi-region) | A single Postgres becomes the bottleneck, and the constraint is per-instance | Genuinely hard. Partition by dealership — resources never span one — so each shard keeps its own local guarantee. Cross-region strong consistency for this invariant is not something to hand-wave. |

## G.2 Deferred, with the trigger for each

Every one of these is a *decision*, recorded with the condition that would reverse it
([full table](docs/03_system_architecture_diagrams.md)):

| Capability | Trigger |
|---|---|
| Transactional outbox + message broker | The first requirement for async work that must survive the request — appointment confirmation notifications |
| Circuit breaker | The first synchronous call to something this service doesn't own (a DMS, a payment gateway) |
| Rate limiting | Public-facing deployment, or observed abuse |
| RBAC / multi-tenancy | A real multi-dealership deployment where one group must not see another's data |
| Appointment list/search | A real client screen listing a customer's appointments |
| Raw-SQL availability | Hundreds of resources per dealership, or the endpoint entering a latency budget |

The point of the list is that **each capability was understood and sequenced, not omitted**.
Shipping unused infrastructure would imitate enterprise architecture; naming the trigger
demonstrates knowing when each piece becomes necessary.

## G.3 Extending the scenario yourself

Good exercises, roughly in order of difficulty:

1. **Rescheduling** — move an appointment. Note it's an update against the same constraint; think
   about what happens to the old window.
2. **A `COMPLETED` write path** — a check-in/check-out flow. This makes an unreachable 409 branch
   reachable.
3. **Buffer time between appointments** — 15 minutes to clean the bay. Where does that belong: the
   range, or the duration?
4. **Technician shifts** — a technician is only available 08:00–16:00, not all business hours. What
   does that do to the availability query?
5. **Overbooking policy** — deliberately allow N% over capacity, as airlines do. Which of your
   guarantees do you have to give up, and can the constraint still help?

---

## Where to go next

| | |
|---|---|
| **Run it** | [`RUN.md`](RUN.md) |
| **The system design document** | [`docs/03_system_architecture_diagrams.md`](docs/03_system_architecture_diagrams.md) |
| **The flagship decision, in full** | [`docs/adr/0002-booking-concurrency-control.md`](docs/adr/0002-booking-concurrency-control.md) |
| **How the AI-assisted build was directed and verified** | [`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md) |
| **Back to the collection** | [`../README.md`](../README.md) |
