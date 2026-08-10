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
