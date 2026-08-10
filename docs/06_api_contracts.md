# API Contracts

**Live OpenAPI spec**: `GET /docs` (Swagger UI) / `GET /docs-json` (raw spec) once the app is
running — see `RUN.md`. Every endpoint below is implemented and live; the spec carries full request
and response schemas, generated from the same Zod schemas the API validates against
(`presentation/schemas/responses.schema.ts`), so it is usable to generate a client. This document is
the human-readable companion — it explains *why* the contracts have the shape they do, which a
schema cannot.

⚠️ **The dates in every example below are Mondays.** `BUSINESS_DAYS` defaults to Mon–Fri, so a
weekend example would return `422 closed_day` if a reader pasted it. (An earlier revision of this
document did exactly that.)

All responses use the standard envelope from `directives/logging_standard.md` §Shared HTTP
Utilities:

```json
// Success
{ "success": true, "data": {}, "message": "...", "meta": { "requestId": "...", "timestamp": "...", "version": "1.0.0" } }
// Error
{ "success": false, "message": "...", "error": { "code": "NOT_FOUND", "details": [] }, "meta": { "requestId": "...", "timestamp": "...", "version": "1.0.0" } }
```

Global prefix: `/api/v1` (excludes `health` and `metrics`, which stay unprefixed for
orchestrator/monitoring convention).

## Platform endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/health` | Liveness — checks DB connectivity, `200`/`503` | none |
| `GET` | `/metrics` | Prometheus scrape target | none |
| `GET` | `/docs` | Swagger UI (dev only) | none |
| `GET` | `/docs-json` | Raw OpenAPI spec | none |

## The scheduler domain

Error codes used by this domain, and the status each maps to:

| Code | Status | Raised when |
|---|---|---|
| `VALIDATION_ERROR` | `400` | Zod rejected the body / params / query string — including `startAt` in the past |
| `CUSTOMER_NOT_FOUND` | `404` | `customerId` does not exist (or is soft-deleted) |
| `VEHICLE_NOT_FOUND` | `404` | `vehicleId` does not exist (or is soft-deleted) |
| `DEALERSHIP_NOT_FOUND` | `404` | `dealershipId` does not exist (or is soft-deleted) |
| `SERVICE_TYPE_NOT_FOUND` | `404` | `serviceTypeId` does not exist — the duration cannot be resolved |
| `APPOINTMENT_NOT_FOUND` | `404` | the appointment id does not exist (or is soft-deleted) |
| `APPOINTMENT_SLOT_CONFLICT` | `409` | no free bay + qualified technician for the window, **or** a concurrent request won the race (ADR-0002). `details.reason` narrows it — see the table under `POST /appointments` |
| `APPOINTMENT_NOT_CANCELLABLE` | `409` | the appointment is already `COMPLETED` |
| `APPOINTMENT_OUTSIDE_BUSINESS_HOURS` | `422` | the derived window falls on a closed day, or outside opening times. `details.reason` is `closed_day` or `outside_hours` |
| `VEHICLE_NOT_OWNED_BY_CUSTOMER` | `422` | both ids exist, but the vehicle belongs to a different customer |

`APPOINTMENT_SLOT_CONFLICT` is **never auto-retried** — see
[ADR-0003](adr/0003-availability-and-selection-policy.md) §2.4. A taken slot stays taken; the caller
needs the 409 in order to pick another window.

> ⚠️ **`409` and `422` each have two unrelated sources on `POST /appointments`.** Always branch on
> `error.code`, never on the status alone:
>
> | Status | From the booking domain | From `IdempotencyInterceptor` |
> |---|---|---|
> | `409` | `APPOINTMENT_SLOT_CONFLICT` — the window is taken | the same `X-Idempotency-Key` is still in flight; retry shortly |
> | `422` | `APPOINTMENT_OUTSIDE_BUSINESS_HOURS` / `VEHICLE_NOT_OWNED_BY_CUSTOMER` | the same key was reused with a **different** body |

### `POST /api/v1/appointments` — book an appointment

Implements UC-1 (`docs/02_use_cases.md`).

**Headers**: `X-Idempotency-Key: <uuid>` (strongly recommended — protects against a double-submit
creating two appointments, see `directives/idempotency_strategy.md`).

The **server** selects the bay and the technician; the request does not name them (ADR-0003 §2.2).
`endAt` is derived as `startAt + ServiceType.durationMinutes`.

**Request body**:

```json
{
  "customerId": "uuid",
  "vehicleId": "uuid",
  "dealershipId": "uuid",
  "serviceTypeId": "uuid",
  "startAt": "2026-08-17T10:00:00Z"
}
```

**Response `201`**:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "SCHEDULED",
    "startAt": "2026-08-17T10:00:00Z",
    "endAt": "2026-08-17T10:30:00Z",
    "serviceBay": { "id": "uuid", "label": "Bay 1" },
    "technician": { "id": "uuid", "name": "Jordan Lee" }
  }
}
```

**Response `409`** (conflict — no bay/technician available for the window, or a concurrent request
won the race, see ADR-0002):

```json
{
  "success": false,
  "message": "Every service bay at this dealership is booked for the requested window",
  "error": { "code": "APPOINTMENT_SLOT_CONFLICT", "details": { "reason": "no_free_service_bay" } }
}
```

`details.reason` distinguishes *why* the window is unavailable, which is what a client needs in
order to say something useful to a human:

| `reason` | Meaning |
|---|---|
| `no_service_bay_at_dealership` | the dealership has no bays configured at all — permanent, no window will help |
| `no_qualified_technician_at_dealership` | no technician there is qualified for this service type — try another dealership, not another time |
| `no_free_service_bay` | every bay at the dealership is busy for that window |
| `no_free_qualified_technician` | bays are free, but every qualified technician is busy |
| `service_bay_taken_concurrently` | the availability check passed, then the DB exclusion constraint rejected the bay — another request committed first |
| `technician_taken_concurrently` | same, for the technician |

The first two are permanent misconfiguration; the middle two are capacity; the last two are a lost
race. They call for three different client behaviours, which is why they are not collapsed into one
code — and why each carries its own `message` rather than a shared sentence.

The last two are ADR-0002's constraint firing. They are the proof that the guarantee does not depend
on the application-level check having been correct.

**Idempotent replay**: re-sending the identical body with the same `X-Idempotency-Key` returns the
cached `201` response and creates nothing. A *different* body under the same key returns `422`; a
request arriving while the first is still in flight returns `409` (see
`directives/idempotency_strategy.md`).

**cURL**:

```bash
curl -X POST http://localhost:4002/api/v1/appointments \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "customerId": "<seeded-customer-id>",
    "vehicleId": "<seeded-vehicle-id>",
    "dealershipId": "<seeded-dealership-id>",
    "serviceTypeId": "<seeded-oil-change-id>",
    "startAt": "2026-08-17T10:00:00Z"
  }'
```

### `GET /api/v1/availability` — check availability

Implements UC-2.

**Query params** — all three required:

| Param | Format | Meaning |
|---|---|---|
| `dealershipId` | uuid | which dealership's bays and technicians to consider |
| `serviceTypeId` | uuid | determines both the duration and which technicians count as qualified |
| `date` | `YYYY-MM-DD` | the local calendar day, interpreted in `BUSINESS_TIMEZONE` |

`date` is the only window form — the earlier draft of this document offered "`date` **or**
`startAt`/`endAt`" and never resolved it. One form keeps the contract unambiguous; a caller wanting a
single specific window can simply attempt the booking, since availability is not a reservation
anyway (ADR-0003 §2.6).

Candidate start times step by `SLOT_GRANULARITY_MINUTES` from `BUSINESS_HOURS_START`, and a slot is
returned only if `start + duration <= BUSINESS_HOURS_END` **and** at least one bay and one qualified
technician are free for the whole window.

Three cases return `200` with an empty `availableSlots` rather than an error, because "nothing is
free" is a valid answer and not a failure: the date is a **closed day** (`BUSINESS_DAYS` /
`BUSINESS_CLOSED_DATES`), the date is **in the past** (past slots are dropped — `POST` would reject
them anyway, so advertising them would be a promise the write path cannot keep), or the dealership is
genuinely fully booked.

An unknown `dealershipId` or `serviceTypeId` is **not** one of those cases: both return `404`, the
same codes `POST /appointments` returns for the same ids. An earlier revision validated only the
service type, so an unknown dealership produced zero candidate bays, which produced zero slots, and
the caller received `200 {"availableSlots": []}` — a typo reported as "we are fully booked", from an
endpoint whose whole job is to say what is free.

**Response `200`**:

```json
{
  "success": true,
  "data": {
    "date": "2026-08-17",
    "serviceTypeId": "uuid",
    "durationMinutes": 30,
    "availableSlots": [
      { "startAt": "2026-08-17T08:00:00.000Z", "endAt": "2026-08-17T08:30:00.000Z", "availableBays": 3, "availableTechnicians": 2 },
      { "startAt": "2026-08-17T08:30:00.000Z", "endAt": "2026-08-17T09:00:00.000Z", "availableBays": 2, "availableTechnicians": 1 }
    ]
  }
}
```

`availableBays` / `availableTechnicians` are **counts, not ids** — deliberately. See ADR-0003 §2.6:
ids read as a reservation, and the client cannot pin its choice anyway because the server selects.
The counts still tell a UI which slots are about to run out.

A dealership that **exists** but has no bays or no qualified technicians returns `200` with an empty
`availableSlots`, not an error — that is the "nothing is free" case above. A dealership that does not
exist returns `404 DEALERSHIP_NOT_FOUND`. The distinction is the point: one is a fact about capacity,
the other is a fact about the request.

**cURL**:

```bash
curl "http://localhost:4002/api/v1/availability?dealershipId=<id>&serviceTypeId=<id>&date=2026-08-17"
```

### `GET /api/v1/appointments/:id` — fetch one appointment

Reads back the record `POST /appointments` created — requirement 3's *"persistent Appointment
record"* is only observable through this endpoint.

**Response `200`**: exactly the body `POST /appointments` and `POST /appointments/:id/cancel` return.
All three routes publish the same `appointmentResponseSchema` in the OpenAPI spec, generated from one
Zod schema, so the read cannot drift from the write.

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "SCHEDULED",
    "startAt": "2026-08-17T10:00:00.000Z",
    "endAt": "2026-08-17T10:30:00.000Z",
    "serviceBay": { "id": "uuid", "label": "Bay 1" },
    "technician": { "id": "uuid", "name": "Jordan Lee" }
  }
}
```

A `CANCELLED` appointment is returned normally, with its status — cancelling transitions the record,
it does not delete it, and a client that just cancelled needs to be able to read back what it
cancelled. An unknown id returns `404 APPOINTMENT_NOT_FOUND`; a malformed one, `400`.

There is deliberately **no list endpoint** (`GET /appointments?customerId=…`) — see
`docs/03_system_architecture_diagrams.md § Deferred scope` for the trigger that would add one.

**cURL**:

```bash
curl http://localhost:4002/api/v1/appointments/<id>
```

### `POST /api/v1/appointments/:id/cancel` — cancel an appointment

Implements UC-3.

**Response `200`**: the appointment with `status: "CANCELLED"`.

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "CANCELLED",
    "startAt": "2026-08-17T10:00:00.000Z",
    "endAt": "2026-08-17T10:30:00.000Z",
    "serviceBay": { "id": "uuid", "label": "Bay 1" },
    "technician": { "id": "uuid", "name": "Jordan Lee" }
  }
}
```

Cancelling an already-`CANCELLED` appointment also returns `200` with the unchanged record — the
operation is idempotent, so a client retrying a timed-out cancel is safe. Cancelling a `COMPLETED`
appointment returns `409 APPOINTMENT_NOT_CANCELLABLE`. An unknown id returns
`404 APPOINTMENT_NOT_FOUND`.

The freed window becomes bookable again immediately: the exclusion constraint is scoped to
`status = 'SCHEDULED'`, so a cancelled row stops participating in it (ADR-0002).

**cURL**:

```bash
curl -X POST http://localhost:4002/api/v1/appointments/<id>/cancel
```

## Seed data reference

`prisma/seed.ts` creates one dealership, 3 bays, 3 technicians with differing qualifications
(Jordan: all service types; Sam: oil change + tire rotation; Priya: oil change + brake
inspection), 4 service types, and 1 customer with 1 vehicle — see `npm run db:seed`'s console
output for the actual generated IDs to use in the cURL examples above.
