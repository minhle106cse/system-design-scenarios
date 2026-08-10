# Business Requirements — Scenario 01: Resource-Constrained Appointment Scheduling

> Stated as a brief, verbatim where possible, with assumptions logged separately below per this
> collection's own convention: *"If a requirement is unclear, make a reasonable assumption and
> document it in the System Design Document."*

- **Domain:** Ownership
- **Task:** Build an Appointment Scheduler application to replace manual booking systems.

## Core Requirements

1. **Resource Constrained Booking**: Allow a user to request a service appointment for a specific
   vehicle, service type, and dealership at a desired time.
2. **Real-Time Availability Check**: Before confirming, check for the availability of both a
   ServiceBay and a qualified Technician for the entire service duration.
3. **Confirmed Appointment Record**: Upon success, create a persistent Appointment record
   associating the customer, vehicle, technician, and service bay.

## Build For the Future

Whichever layer is chosen (this scenario: backend), the design and implementation should
consider scalability, performance, reliability, maintainability, and observability.

## Chosen implementation layer

**Backend.** RESTful API + persistent database (PostgreSQL via Prisma). The client layer is
stubbed via the OpenAPI spec served at `/docs` and cURL examples in
[`06_api_contracts.md`](06_api_contracts.md), per this collection's accepted approach: *"Mock
or stub the client-side layer with a simple test harness, cURL examples, or a basic API contract
(e.g., OpenAPI spec)."*

## Assumptions

Ambiguities in the brief and the reasonable assumption made for each, per this collection's
convention to document these here:

| Ambiguity | Assumption made | Why |
|---|---|---|
| What makes a technician "qualified" for a service type? | A many-to-many qualification mapping (`TechnicianServiceType`) — a technician is qualified for a service type if a row exists. Not a single skill-level field. | The requirement says "a qualified Technician," implying qualification is checked, not assumed universal. A join table is the minimal structure that makes the check meaningful and demoable (see `prisma/seed.ts` — technicians deliberately have *different* qualifications). |
| Is "availability" continuous time or discrete slots (e.g. every 30 minutes)? | Continuous time ranges (`startAt`/`endAt` timestamps), duration derived from `ServiceType.durationMinutes`. | Slot-based scheduling forces every service duration to round to a slot boundary and wastes capacity for short services; continuous ranges match how a real service bay is actually booked. See ADR-0002 §4 for why this doesn't make the concurrency guarantee harder to implement. |
| What happens to a booked slot on cancellation? | An `Appointment.status` transition to `CANCELLED` (not a hard delete) immediately frees the bay/technician for that window — verified live against the database-level constraint. | The brief doesn't mention cancellation explicitly, but "resource constrained booking" implies resources must become available again; modeling status as an enum (vs. deleting the row) preserves history, which a real booking system would need for no-show tracking, audit, or analytics later. |
| Is authentication/authorization in scope? | No — no user accounts, no RBAC. Anyone with the API can book on behalf of any customer/dealership. | Not mentioned anywhere in the brief's core requirements, and this scenario's focus is the booking/concurrency problem, not access control. Explicitly deferred, not silently skipped — see `docs/03_system_architecture_diagrams.md § Deferred scope`. |
| Single dealership or multi-dealership? | Multi-dealership from the start (`Dealership` is a first-class model; bays and technicians belong to one dealership), but no tenant isolation (any caller can query/book against any dealership). | "for a specific vehicle, service type, and dealership" in requirement 1 implies more than one dealership exists to choose from. Multi-tenancy (isolating one dealership's data from another's) is a different, larger concern, deliberately not modelled — see `directives/multi_tenancy.md`'s exclusion in `.ai/plans/init-source.plan.md` §4. |
| Does the system need to prevent double-booking a *vehicle* (same vehicle, two overlapping appointments)? | Not enforced at the database layer — only the bay and technician are protected by the exclusion constraint, matching the literal wording of requirement 2 ("availability of both a ServiceBay and a qualified Technician"). | The brief's requirement 2 names exactly two resources. A vehicle double-booking is a real-world nuisance but not a resource-contention correctness bug the way bay/technician overlap is — noted here as a candidate follow-up, not built speculatively. |
| Who chooses *which* bay and *which* technician — the client or the server? | The server. The request names customer, vehicle, dealership, service type and desired start; the server picks the first free bay by `label` and the first free qualified technician by `name`. Selection is deterministic, not randomised. | The client cannot make this choice well: it would have to read availability, choose, and then handle losing the race anyway. Deterministic ordering also makes the demo, the cURL walkthrough and the concurrency test reproducible. See [ADR-0003](adr/0003-availability-and-selection-policy.md) §2.2. |
| When is the dealership open? The ERD has no opening-hours concept, but `GET /availability` has to enumerate a bounded day. | Configuration, not a table: `BUSINESS_HOURS_START` / `BUSINESS_HOURS_END` / `BUSINESS_TIMEZONE` / `SLOT_GRANULARITY_MINUTES` / `BUSINESS_DAYS` / `BUSINESS_CLOSED_DATES` (defaults `08:00`–`18:00` UTC, 30-minute steps, Mon–Fri, no holidays). **One schedule for every dealership.** | A `DealershipOpeningHours` table is the realistic model, but it costs a migration next to the hand-written exclusion constraints ADR-0002 warns must be preserved by hand. Configuration buys the same demo at zero schema risk. The grid only controls *where a service may start* — duration still comes from `ServiceType.durationMinutes`, so the continuous-time assumption above is unchanged. Trigger for promoting it to a table: `docs/03_system_architecture_diagrams.md § Deferred scope`. |
| Which days is the dealership closed? | Weekends by default (`BUSINESS_DAYS=1,2,3,4,5`) plus an explicit `BUSINESS_CLOSED_DATES` list for one-off holidays. **No per-country holiday calendar** — the list is hand-maintained. | Without this the service was open 365 days a year including Christmas, and this repo's own cURL example happened to book a Saturday. A real holiday calendar means either a dependency on a locale database or a per-region table; both are disproportionate for one dealership in one timezone, and the trigger for adding one is recorded in § Deferred scope. |
| Can an appointment be booked in the past? | No — rejected at the HTTP boundary (`400`). `GET /availability` likewise omits slots that have already started, including earlier today. | The original implementation had no clock reference anywhere in the module, so `2020-01-01` was accepted and yesterday's grid was advertised as bookable. Both endpoints must agree, or the read path promises something the write path refuses. |
| Must the vehicle belong to the customer booking it? | Yes — enforced in the handler (`422 VEHICLE_NOT_OWNED_BY_CUSTOMER`). | The ERD asserts `Customer owns Vehicle`, but the database only has the two foreign keys independently; nothing relates them, so an appointment could be created for someone else's car while every constraint passed. |
| Can a service type have a zero or negative duration? | No — a `CHECK (duration_minutes > 0)` constraint forbids the row existing. | Not cosmetic: `endAt = startAt` produces an **empty** `tstzrange`, which overlaps nothing, so both anti-double-booking exclusion constraints would silently stop applying for that service type. Enforcing it in the handler alone would leave the hole open to the seed script and any future write path — the same argument ADR-0002 §3 makes for the constraint itself. |
| Is `GET /availability` a reservation? | No. It takes no lock and creates no record — a slot it reports free can be taken before the caller books it. It reports **counts** of free bays/technicians per slot, not their ids. | Returning ids reads as "this one is mine" and leaks internal resource identity the client cannot act on anyway (the server selects — see above). ADR-0002's constraint, not this endpoint, is what makes booking correct. See ADR-0003 §2.6. |
| What happens when cancelling an appointment that is already `CANCELLED`, or already `COMPLETED`? | Already `CANCELLED` → `200`, returns the unchanged appointment (a no-op, so a client retrying a timed-out cancel is safe). Already `COMPLETED` → `409 APPOINTMENT_NOT_CANCELLABLE`. Not found → `404`. | Cancellation is the operation most likely to be retried over a flaky connection, so it should be idempotent; but "cancel a service that has already been performed" is a genuine business error, not a no-op, and hiding it behind a `200` would be a lie. |
