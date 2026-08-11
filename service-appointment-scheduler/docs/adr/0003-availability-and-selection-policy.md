# ADR-0003 — Availability Computation, Resource Selection, and Conflict Retry Policy

- **Status:** Accepted.
- **Decided by:** the project owner, drafted with AI assistance — see `docs/12_ai_collaboration.md`.
- **Scope:** `modules/booking` — the availability query, the booking command's resource selection,
  and how a constraint violation from ADR-0002 is classified for retry.
- **Builds on:** [ADR-0001](0001-transaction-retry-boundary.md) (Unit of Work + retry boundary),
  [ADR-0002](0002-booking-concurrency-control.md) (the exclusion constraint).

---

## 1. Context

ADR-0002 settled the *guarantee* — no two `SCHEDULED` appointments may hold the same bay or the same
technician over overlapping time. It deliberately did not settle the *mechanics* of getting there,
and left one question open in writing (§6): whether a constraint violation should be auto-retried.

Four questions were unanswered anywhere in `docs/` or `directives/` before this ADR, and each one
changes the shape of the code:

1. **How is availability computed?** Requirement 2 says "check the availability of both a ServiceBay
   and a qualified Technician for the entire service duration" — but not by what query.
2. **Who picks the bay and the technician?** `docs/02_use_cases.md` UC-1 step 4 forwarded the
   question to `docs/06_api_contracts.md`, which never answered it. The request body in 06 carries no
   `serviceBayId`/`technicianId`, which *implies* server-side selection without ever saying so.
3. **Where does the slot grid in `GET /availability` come from?** The example response in 06 shows
   30-minute boundaries, but the ERD has no opening-hours concept at all — the grid had no source.
4. **Is a booking conflict retried?** ADR-0002 §6 explicitly deferred this decision to "the booking
   command handler's own documentation once it's written."

## 2. Decision

### 2.1 Availability is computed with a half-open overlap predicate, expressed in Prisma

The application-level check uses the same interval semantics as the database constraint:

```ts
// "an appointment that overlaps [windowStart, windowEnd)"
{ status: 'SCHEDULED', startAt: { lt: windowEnd }, endAt: { gt: windowStart } }
```

This is exactly equivalent to the constraint's `tstzrange(start_at, end_at, '[)') && tstzrange(...)`.
Two intervals `[a,b)` and `[c,d)` overlap iff `a < d ∧ c < b` — back-to-back windows
(`10:00–11:00`, `11:00–12:00`) do not overlap, in the application check and in the database, by the
same arithmetic rather than by two independent implementations that happen to agree.

> **This equivalence is load-bearing.** If the application check and the constraint disagreed on
> boundary handling, the API would either reject bookings the database would accept (lost capacity,
> invisible) or promise slots the database rejects (409s the availability endpoint said were free).
> Any change to one must change the other — noted in `docs/04_database_schema.md`.

The check runs as three reads inside the booking transaction:

1. candidate bays — every non-deleted `ServiceBay` at the dealership;
2. candidate technicians — every non-deleted `Technician` at the dealership **with a
   `TechnicianServiceType` row for the requested service type** (this join *is* the "qualified"
   condition of requirement 2);
3. the busy set — `serviceBayId`/`technicianId` of every `SCHEDULED` appointment overlapping the
   window.

Set-subtraction happens in memory. Per `directives/cqrs_pattern.md`, these reads go through the
**write-side repository inside the transaction**, never a query-repository — a command that reads to
decide must read the source of truth.

The `deletedAt IS NULL` half of each filter is injected by the soft-delete Prisma extension in
`prisma.service.ts`; it is never written by hand (`directives/database_standard.md`).

### 2.2 The server selects the resources; selection is deterministic

The client asks for *a booking*, not for *bay 2 with Jordan*. The API takes customer, vehicle,
dealership, service type and desired start; the server picks the first free bay ordered by `label`
and the first free qualified technician ordered by `name`.

Deterministic ordering, not randomised or load-balanced:

- a demo, a cURL walkthrough and an integration test all produce the same assignment, so the
  behaviour is reproducible and assertable;
- collisions between two concurrent requests are **not** the tie-break's problem to avoid — ADR-0002's
  constraint is what makes concurrency correct, and deliberately routing both requests at the same
  bay is the honest configuration in which to prove that.

Load-spreading is a capacity-utilisation optimisation, not a correctness property; it is listed in
`docs/03_system_architecture_diagrams.md § Deferred scope` with its trigger.

### 2.3 Business hours come from configuration, not from a table

`GET /availability` needs a bounded day to enumerate. Four environment keys define it:

| Key | Default | Meaning |
|---|---|---|
| `BUSINESS_HOURS_START` | `08:00` | first bookable local time |
| `BUSINESS_HOURS_END` | `18:00` | last local time a service may **end** |
| `BUSINESS_TIMEZONE` | `UTC` | IANA zone the two times above are expressed in |
| `SLOT_GRANULARITY_MINUTES` | `30` | step between candidate start times |

Candidate starts step by the granularity from open to close; a candidate is kept only if
`start + ServiceType.durationMinutes <= close`. Duration still comes from the service type, so the
grid controls *where a service may start*, never *how long it lasts* — the continuous-time assumption
in `docs/01_business_requirements.md` is unchanged.

Local-time-to-instant conversion is DST-correct via `Intl.DateTimeFormat` (Node 22 ships full ICU);
no date library is added.

**This applies one schedule to every dealership.** That is a documented simplification, recorded in
`docs/01_business_requirements.md § Assumptions`, and its trigger for becoming a table is in
`§ Deferred scope`.

### 2.4 A slot conflict is NOT retried — this settles ADR-0002 §6

`AppointmentSlotConflictError` is a plain `ApplicationError` with `statusCode = 409`. It carries no
`transient: true` marker, so `CommandBus`'s retry wrapper — which retries only Prisma `P2034` or an
explicitly marked transient error (`resilience_patterns.md` §3) — will not touch it.

Retrying it would be actively wrong. A `23P01` from these constraints means *someone else now holds
this exact window*. That is not a transient condition that clears on a backoff; it is a stable new
fact about the world. Three retries against the same occupied window produce three guaranteed
failures, delay the 409 the caller needs in order to pick another slot, and burn a connection from
the pool while doing it — the retry-storm shape `resilience_patterns.md` §3 exists to prevent.

Deadlock and serialization failures (`P2034`) keep retrying as before. The distinction is:
**retry what will plausibly succeed unchanged; surface what will not.**

### 2.5 The translation from `23P01` happens in infrastructure, not in the handler

`apps/scheduler-api/eslint.config.mjs` forbids `modules/*/application/**` from importing Prisma. That
is not an obstacle to work around — it puts the seam in the right place:
`PrismaAppointmentRepository.save()` catches the Postgres exclusion violation and throws
`AppointmentSlotConflictError`. The handler only ever sees domain errors, and the Prisma coupling
ADR-0002 §5 flagged as "a real seam to get right" is confined to one method of one infrastructure
class.

### 2.6 Availability is a projection, not a reservation

`GET /availability` takes no lock and creates no record. A slot it reports free can be taken before
the caller books it. This is stated in `docs/02_use_cases.md` UC-2 and repeated in the endpoint
documentation, because a client author who assumes otherwise will write a booking flow that treats
409 as an unexpected error rather than as the normal, expected outcome of a race it was always
exposed to.

Consequently the response reports **counts** of free bays and technicians per slot, not their ids.
Returning ids invites exactly the misreading above ("I was given bay 2, therefore bay 2 is mine") and
leaks internal resource identity for no client benefit, since the client cannot pin its choice
anyway (§2.2).

## 3. Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| **A single raw-SQL `NOT EXISTS` / `tstzrange &&` query per resource** | Would push the whole selection into one round trip and index-support it via the `btree_gist` index already present — genuinely better at scale. Rejected *for now* because it moves the overlap predicate into a raw string that neither TypeScript nor the specs can check, in exchange for saving two queries over datasets of a few dozen rows. The trigger to adopt it (hundreds of bays/technicians per dealership, or the availability endpoint appearing in latency budgets) is recorded in `§ Deferred scope`. |
| **A `DealershipOpeningHours` table (dayOfWeek, open, close, timezone)** | The realistic model, and where this goes if per-dealership hours or holiday closures are ever required. Rejected now because it costs a second migration on the `appointments`-adjacent schema, and every migration touching that area is a chance to lose the hand-written exclusion constraints ADR-0002 warns about. Configuration buys the same demo with zero schema risk, and the honest simplification is documented rather than hidden. |
| **Randomised or least-loaded tie-breaking** | Would reduce collisions between concurrent requests. Rejected because reducing collisions is not the same as being correct under them, and this scenario's whole point is the latter; a non-deterministic assignment also makes the concurrency test assert "one of two acceptable outcomes" instead of one exact outcome. Capacity balancing is deferred with a trigger, not dismissed. |
| **Client-specified bay and technician** (`serviceBayId`/`technicianId` in the request body) | Rejected: it makes the client responsible for reading availability, choosing, and handling the race — pushing the hardest part of the problem onto the caller. It also contradicts the request shape already published in `docs/06_api_contracts.md`. A future `preferredTechnicianId` **hint** (honoured if free, otherwise auto-selected) is a compatible additive change, and a better shape than a mandatory id. |
| **Materialising slots as rows and booking by `UPDATE ... WHERE slot_id = ? AND taken = false`** | The classic slot-table design. Rejected for the same reason ADR-0002 §4 rejected slot-based scheduling: it forces durations to round to slot boundaries and wastes capacity, and it requires generating and garbage-collecting slot rows forever. Continuous ranges plus an exclusion constraint need neither. |
| **Auto-retrying the slot conflict a few times before returning 409** | Rejected — see §2.4. Retrying is only defensible when the same operation might succeed on a later attempt; a taken slot stays taken. |
| **Returning the ids of free bays/technicians from `GET /availability`** | Rejected — see §2.6. It reads as a reservation, leaks internal identity, and the client has no way to act on it. |

## 4. Consequences

**Gained:**
- The overlap predicate has one definition and two enforcement points that provably agree.
- Availability, selection and the conflict path are all unit-testable without a database; only the
  concurrency guarantee itself needs real Postgres (`npm run test:integration`).
- No new dependency, no new table, no new migration — the ADR-0002 constraints are untouched.
- The 409 a caller receives is a domain error with a specific code, produced from a single seam.

**Accepted trade-offs:**
- In-memory set subtraction is O(bays + technicians + overlapping appointments) per request. Correct
  at any size, but at large resource counts it fetches rows only to discard them — the trigger for
  the SQL rewrite is written down rather than left to be rediscovered.
- One business-hours schedule for all dealerships. A dealership with different hours is
  misrepresented by `GET /availability` (though never mis-*booked* — the booking path validates the
  window against the same configuration, and the exclusion constraint is independent of it).
- Deterministic selection concentrates load on the lowest-labelled bay. Under real traffic this
  raises the conflict rate versus load-spreading; it is observable as
  `scheduler_api_booking_attempt_total{outcome="slot_conflict"}` and is the metric that should
  trigger the change.

## 5. References

- [ADR-0001](0001-transaction-retry-boundary.md) — Unit of Work, retry wraps the transaction.
- [ADR-0002](0002-booking-concurrency-control.md) — the exclusion constraint; §6 is settled here.
- `directives/cqrs_pattern.md` — commands read the source of truth, never a query-repo.
- `directives/resilience_patterns.md` §3 — what may be retried.
- `docs/01_business_requirements.md § Assumptions` — the simplifications this ADR relies on.
- `docs/03_system_architecture_diagrams.md § Deferred scope` — triggers for every deferral above.
