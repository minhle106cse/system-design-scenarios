# Use Cases

## UC-1: Book an appointment

**Actor:** Customer (via a booking client, or a service advisor on their behalf).

**Preconditions:** The customer, vehicle, dealership, and service type already exist (or are
created as part of the request).

**Flow:**
1. Client requests a booking: customer, vehicle, service type, dealership, desired start time.
2. System resolves the service duration from `ServiceType.durationMinutes`, computing the
   requested time window.
3. System checks: is there a service bay at this dealership free for the entire window? Is there
   a technician at this dealership, qualified for this service type, free for the entire window?
4. If both are available, the system selects one bay and one qualified, available technician (see
   `06_api_contracts.md` for whether selection is automatic or client-specified), and creates the
   `Appointment` record.
5. If unavailable, or if a concurrent request already claimed the slot, the system returns a
   conflict response — never a silent partial success.

**Postconditions (success):** A persistent `Appointment` record exists, associating customer,
vehicle, technician, service bay, dealership, service type, and time window. The bay and
technician are unavailable for that window until the appointment is cancelled.

**Concurrency requirement:** two simultaneous requests for the same bay/technician and an
overlapping window must never both succeed — exactly one must win. See ADR-0002.

## UC-2: Check availability

**Actor:** Customer or booking client, before committing to a booking.

**Flow:**
1. Client requests availability for a dealership, service type, and time window (or a date, to
   see open slots across the day).
2. System returns which bays/technicians are free for that window, without creating any record.

**Note:** because this is a read with no lock, a slot reported "available" here can still lose the
race to another request by the time UC-1 actually runs — the exclusion constraint is what makes
UC-1 itself correct regardless of what UC-2 last reported. UC-2 is a UX convenience (avoid
obviously-doomed booking attempts), not a reservation.

## UC-3: Cancel an appointment

**Actor:** Customer or dealership staff.

**Flow:**
1. Client requests cancellation of an existing appointment.
2. System transitions `Appointment.status` to `CANCELLED`.
3. The bay and technician immediately become available again for that window (verified: the
   database exclusion constraint is scoped to `status = 'SCHEDULED'`, so a cancelled row no longer
   participates in it).

**Postconditions:** The appointment record still exists (soft state transition, not deleted) —
preserves history for audit/no-show tracking, per `database_standard.md`'s soft-delete convention
applied to booking status specifically (see the Assumptions table in `01_business_requirements.md`).
