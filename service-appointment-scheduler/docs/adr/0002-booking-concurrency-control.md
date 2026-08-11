# ADR-0002 — Booking Concurrency Control: Database-Level Exclusion Constraint

- **Status:** Accepted.
- **Decided by:** the project owner, drafted with AI assistance — see
  `docs/12_ai_collaboration.md` for the collaboration process behind this ADR specifically.
- **Scope:** the `Appointment` table and everything that writes to it.

---

## 1. Context

This scenario's core requirement:

> **Real-Time Availability Check**: Before confirming, check for the availability of both a
> ServiceBay and a qualified Technician for the entire service duration.

Read literally, this is a check-then-act: read existing appointments for the requested bay and
technician over the requested time window, confirm nothing overlaps, then write the new
appointment. That sequence has a well-known race: two requests for the same bay and an
overlapping time window, both reading "no conflict" before either has written, both proceed to
write — a double-booking, exactly the failure mode the requirement exists to prevent.

The likelihood is real, not theoretical, for this domain specifically: a booking UI commonly
retries a timed-out submit, and a popular slot (the first appointment of the day, right after a
service reminder notification) is exactly the kind of moment where two customers or one customer's
duplicate tab land on the same window at once.

## 2. Decision

**Enforce the no-overlap guarantee at the database layer**, via a Postgres exclusion constraint on
`Appointment`, in addition to (not instead of) an application-level availability check.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_service_bay_no_overlap"
  EXCLUDE USING gist (
    "service_bay_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'SCHEDULED'::"AppointmentStatus" AND "deleted_at" IS NULL);

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_technician_no_overlap"
  EXCLUDE USING gist (
    "technician_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" = 'SCHEDULED'::"AppointmentStatus" AND "deleted_at" IS NULL);
```

Two constraints — one scoped to `service_bay_id`, one to `technician_id` — because both resources
must be simultaneously available; either one being double-booked is a violation.

### How it works

- `EXCLUDE USING gist` is Postgres's generalization of a unique constraint: instead of "no two rows
  may have equal values," it enforces "no two rows may have values that both compare equal *on one
  term* AND overlap *on another*." Here: same bay (`=`) AND overlapping time range (`&&`).
- `tstzrange(start_at, end_at, '[)')` — a half-open range. `[)` means `start_at` is inclusive,
  `end_at` is exclusive, matching how a human reads "10:00–11:00" and "11:00–12:00" as *not*
  overlapping (back-to-back bookings are legal).
- The `WHERE` clause scopes the constraint to `status = 'SCHEDULED' AND deleted_at IS NULL` — a
  cancelled or soft-deleted appointment's slot is immediately available again, without needing to
  delete the row (soft-delete convention, `database_standard.md`) or touch the constraint.
- `btree_gist` is required because `service_bay_id`/`technician_id` are `TEXT` columns — a plain
  GiST index has no operator class for `=` on scalar types; `btree_gist` adds one so the equality
  term can sit alongside the range-overlap term in the same index.

### Verified live, during init (not just read as documentation)

Three scenarios tested directly against Postgres before this ADR was written down as final:

1. **Overlap, same bay + technician** (10:00–11:00 then 10:30–11:30) → rejected:
   `ERROR: conflicting key value violates exclusion constraint "appointments_service_bay_no_overlap"`.
2. **Back-to-back, no overlap** (10:00–11:00 then 11:00–12:00, same bay + technician) → accepted.
3. **Cancel then rebook the same slot** (cancel the first booking, insert a new one in its old
   window) → accepted — the `WHERE status = 'SCHEDULED'` scope excludes the cancelled row from the
   constraint.

See `.ai/memory/architecture.jsonl` for the full record of this verification.

## 3. Why the database, not only the application

An application-level check (read availability, then write) is necessary but **not sufficient** —
it narrows the race window but cannot close it, because "check" and "act" are two separate
statements no matter how close together they're written, and concurrent requests can interleave
between them. Only a single atomic operation — or a constraint the storage layer itself enforces —
can make the guarantee unconditional.

The application-level check is still worth keeping, for a different reason: it lets the API return
a clear, specific error (`409 Conflict` with a helpful message and, once available, alternative
slots) instead of surfacing a raw Postgres constraint-violation error to the client. The database
constraint is the **backstop that cannot be bypassed by a bug in that check**; the application
check is the **UX layer** that makes the common case (no conflict) fast and the conflict case
(rare, but must be correct) legible to the caller.

## 4. Alternatives considered and rejected

| Alternative | Why rejected |
|---|---|
| **Application-level check only** (read-then-write, no DB constraint) | Doesn't close the race — see §3. This is the single most common way this exact bug ships: reviewed code that "looks correct" because the check is right there above the write, missing that concurrency doesn't respect source-code proximity. |
| **Optimistic concurrency (a `version` column, retry on conflict)** | OCC protects concurrent writes to the **same row** (two updates to one appointment). The double-booking hazard here is between **two different, new rows** — OCC has no mechanism to compare a new row against existing ones before insert. Wrong tool for this shape of conflict. |
| **Application-level distributed lock (Redis `SETNX` on a `bay:{id}:{slot}` key)** | Works, but adds an external dependency (Redis) this repo otherwise has no need for (see `.ai/plans/init-source.plan.md` §8.3 — idempotency is already Postgres-backed, avoiding Redis on purpose), for a guarantee Postgres already provides natively. Also only protects callers that remember to take the lock — a second write path (an admin tool, a data-fix script) that doesn't know about the lock reintroduces the race; the DB constraint protects every writer unconditionally, including ones not yet written. |
| **`SELECT ... FOR UPDATE` row locking on the bay/technician's existing appointments, inside the write transaction** | Requires locking the exact right set of rows before the new row exists — awkward to get right (what do you lock when there's no conflicting row yet?), and still only protects writers that take the lock in the right order. Doesn't generalize as cleanly as a declarative constraint. |
| **Slot-based scheduling (discrete fixed slots, e.g. every 30 minutes, unique constraint on `(bay_id, slot_id)`)** | Would work and is simpler SQL (a plain unique index, no `btree_gist`), but forces every service type's duration to be a multiple of the slot size and wastes capacity when a service is shorter than a slot. Continuous time ranges match the domain better (a 90-minute engine diagnostic doesn't need to round to slot boundaries) and Postgres's native range-exclusion support makes the "harder" SQL not actually harder to maintain. |

## 5. Consequences

**Gained:**
- The core guarantee (business requirement 2) holds regardless of application-code correctness,
  regardless of how many write paths exist, and regardless of future bugs in the availability
  check.
- No new infrastructure dependency (works with the Postgres already required for everything else).
- The constraint is declarative and self-documenting at the schema level — reading the migration
  tells you the guarantee exists, unlike a lock discipline that lives only in application code and
  convention.

**Accepted trade-offs:**
- Prisma's schema DSL cannot express `EXCLUDE USING gist` — the constraint is raw SQL, hand-added
  to the first migration after `prisma migrate dev --create-only` generated the table shape. Any
  future schema change to `Appointment` must be made carefully around this block (see the
  migration file's own comment) — a naive `prisma db push` or a migration regenerated without
  preserving this block would silently drop the guarantee.
- A conflicting insert surfaces as a Postgres error (`23P01`), not a domain-level exception, at the
  point it's thrown. The command handler must catch and translate it into a domain error (e.g.
  `AppointmentSlotConflictError`) for a clean API response — this coupling between the DB error
  code and the command handler is a real seam to get right when the booking command is written.
- `btree_gist` is a Postgres extension — trivial to enable (`CREATE EXTENSION IF NOT EXISTS`,
  already in the migration) but worth knowing it's there if this schema is ever ported to a
  managed Postgres offering that restricts extensions.

## 6. Relationship to ADR-0001

The application-level availability check and the eventual booking command run inside the
Unit-of-Work / retry boundary ADR-0001 establishes: the check-then-write sequence happens inside
one transaction (`SchedulerApiRepos`, via `PrismaTxRunner`), and a conflict raised by this
exclusion constraint is exactly the kind of transient, retry-eligible failure
`resilience_patterns.md` §3 describes — though note the constraint violation's Postgres code is
not `P2034`, so retrying it automatically requires deciding whether double-booking conflicts
should auto-retry (probably not — a real conflict should surface to the caller to pick another
slot, not silently retry against the same occupied window) versus being retried only for
lock/deadlock-shaped transient errors. This distinction should be made explicit in the booking
command handler's own documentation once it's written, not assumed from this ADR.
