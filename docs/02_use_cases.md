# Use Cases

## UC-1: Book an appointment

**Actor:** Customer (via a booking client, or a service advisor on their behalf).

**Preconditions:** The customer, vehicle, dealership, and service type already exist. The request
creates **nothing but the appointment** — all four ids must refer to existing, non-deleted rows, and
each is verified before any availability work happens (an unknown one is a `404`, not a `500`). The
vehicle must also belong to the customer; the database has a foreign key for each id separately and
nothing relating them, so that invariant is enforced in the handler or not at all.

**Flow:**
1. Client requests a booking: customer, vehicle, service type, dealership, desired start time.
   `startAt` must be in the future — validated at the HTTP boundary.
2. System verifies all four references exist and that the vehicle belongs to the customer, then
   resolves the service duration from `ServiceType.durationMinutes`, computing the requested window.
2b. System checks the window against opening times. A closed day (weekend or a configured holiday)
   and a window outside `BUSINESS_HOURS_START`…`END` are both `422`, distinguished by
   `details.reason` — "pick another date" and "pick another time" are different instructions.
3. System checks: is there a service bay at this dealership free for the entire window? Is there
   a technician at this dealership, qualified for this service type, free for the entire window?
   Both reads happen **inside the booking transaction**, through the write-side repository — a
   command that reads in order to decide must read the source of truth
   (`directives/cqrs_pattern.md`).
4. If both are available, the **system** selects the bay and the technician — the client does not
   specify them. Selection is deterministic: first free bay by `label`, first free qualified
   technician by `name` (ADR-0003 §2.2). The `Appointment` record is then created.
5. If unavailable, or if a concurrent request already claimed the slot, the system returns
   `409 APPOINTMENT_SLOT_CONFLICT` — never a silent partial success. The conflict is **not
   retried**: a taken slot stays taken, so the caller needs the 409 in order to choose another
   window (ADR-0003 §2.4).

**Postconditions (success):** A persistent `Appointment` record exists, associating customer,
vehicle, technician, service bay, dealership, service type, and time window. The bay and
technician are unavailable for that window until the appointment is cancelled.

**Concurrency requirement:** two simultaneous requests for the same bay/technician and an
overlapping window must never both succeed — exactly one must win. See ADR-0002.

## UC-2: Check availability

**Actor:** Customer or booking client, before committing to a booking.

**Flow:**
1. Client requests availability for a dealership, a service type, and a **date**.
2. System enumerates candidate start times across the configured business hours
   (`BUSINESS_HOURS_START`…`BUSINESS_HOURS_END`, stepping by `SLOT_GRANULARITY_MINUTES`), keeping
   only those where `start + ServiceType.durationMinutes` still fits before closing.
3. For each candidate window, the system counts how many bays and how many **qualified**
   technicians are free, and returns the slots where both counts are ≥ 1 — **as counts, not ids**
   (ADR-0003 §2.6). No record is created.

**Errors:** an unknown `dealershipId` or `serviceTypeId` is a `404`, not an empty slot list. "No
slots" must mean "nothing is free", never "your id was wrong" — the two call for opposite reactions
from the client, and the write path already answered `404` for the same ids.

**Note:** because this is a read with no lock, a slot reported "available" here can still lose the
race to another request by the time UC-1 actually runs — the exclusion constraint is what makes
UC-1 itself correct regardless of what UC-2 last reported. UC-2 is a UX convenience (avoid
obviously-doomed booking attempts), not a reservation. This is why it returns counts rather than
specific bay/technician ids: an id reads as "this one is reserved for me," which it is not.

## UC-3: Cancel an appointment

**Actor:** Customer or dealership staff.

**Flow:**
1. Client requests cancellation of an existing appointment.
2. System transitions `Appointment.status` to `CANCELLED`.
3. The bay and technician immediately become available again for that window (verified: the
   database exclusion constraint is scoped to `status = 'SCHEDULED' AND deleted_at IS NULL`, so a cancelled row no longer
   participates in it).

**Edge cases** (ADR-0003 / `01_business_requirements.md § Assumptions`):

| Current state | Result |
|---|---|
| `SCHEDULED` | `200` — transitions to `CANCELLED` |
| already `CANCELLED` | `200` — no-op, returns the unchanged appointment. Cancel is the operation most likely to be retried over a flaky connection, so retrying it must be safe |
| `COMPLETED` | `409 APPOINTMENT_NOT_CANCELLABLE` — cancelling a service that has already been performed is a real business error, not a no-op |
| id not found | `404 APPOINTMENT_NOT_FOUND` |

**Postconditions:** The appointment record still exists (soft state transition, not deleted) —
preserves history for audit/no-show tracking, per `database_standard.md`'s soft-delete convention
applied to booking status specifically (see the Assumptions table in `01_business_requirements.md`).

## UC-4: Read an appointment back

**Actor:** Customer or booking client after UC-1, or dealership staff looking one up.

**Flow:**
1. Client requests an appointment by id.
2. System returns the record with its bay and technician resolved to display fields — the same body
   UC-1 returned when it created it.

**Note:** this is what makes requirement 3's *"persistent Appointment record"* observable to a
client. Without it the record exists in the database and in the response to the one request that
created it, and nowhere anybody can look afterwards. Numbered after UC-3 rather than inserted before
it because the UC numbers are cited from code comments and from `docs/06`; renumbering an existing
use case to make the list read chronologically would invalidate every one of those references.

A `CANCELLED` appointment is returned normally, with its status: UC-3 transitions the record, it
does not remove it, so hiding a cancelled one behind a `404` would make cancel look like a delete.

**Edge cases:** unknown id → `404 APPOINTMENT_NOT_FOUND`; malformed id → `400 VALIDATION_ERROR`.

**Deliberately not built:** a list/filter form (`GET /appointments?customerId=…`). It needs
pagination and an index decision, and no requirement in the brief asks for it — trigger recorded in
`03_system_architecture_diagrams.md § Deferred scope`.
