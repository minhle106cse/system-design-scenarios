# API Contracts

**Live OpenAPI spec**: `GET /docs` (Swagger UI) / `GET /docs-json` (raw spec) once the app is
running — see `RUN.md`. This document is the human-readable companion, and states clearly which
endpoints exist **today** (the skeleton, post-init) versus **planned** (the scheduler domain, not
yet implemented — see `.ai/PROJECT_STATUS.md`).

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

## Live today (skeleton)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/health` | Liveness — checks DB connectivity, `200`/`503` | none |
| `GET` | `/metrics` | Prometheus scrape target | none |
| `GET` | `/docs` | Swagger UI (dev only) | none |
| `GET` | `/docs-json` | Raw OpenAPI spec | none |

## Planned — the scheduler domain

### `POST /api/v1/appointments` — book an appointment

Implements UC-1 (`docs/02_use_cases.md`).

**Headers**: `X-Idempotency-Key: <uuid>` (strongly recommended — protects against a double-submit
creating two appointments, see `directives/idempotency_strategy.md`).

**Request body**:

```json
{
  "customerId": "uuid",
  "vehicleId": "uuid",
  "dealershipId": "uuid",
  "serviceTypeId": "uuid",
  "startAt": "2026-08-15T10:00:00Z"
}
```

**Response `201`**:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "SCHEDULED",
    "startAt": "2026-08-15T10:00:00Z",
    "endAt": "2026-08-15T10:30:00Z",
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
  "message": "No qualified technician and service bay are both available for the requested window",
  "error": { "code": "APPOINTMENT_SLOT_CONFLICT", "details": [] }
}
```

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
    "startAt": "2026-08-15T10:00:00Z"
  }'
```

### `GET /api/v1/availability` — check availability

Implements UC-2.

**Query params**: `dealershipId`, `serviceTypeId`, `date` (or `startAt`/`endAt` for a specific
window).

**Response `200`**:

```json
{
  "success": true,
  "data": {
    "availableSlots": [
      { "startAt": "2026-08-15T09:00:00Z", "endAt": "2026-08-15T09:30:00Z" },
      { "startAt": "2026-08-15T10:00:00Z", "endAt": "2026-08-15T10:30:00Z" }
    ]
  }
}
```

**cURL**:

```bash
curl "http://localhost:4002/api/v1/availability?dealershipId=<id>&serviceTypeId=<id>&date=2026-08-15"
```

### `POST /api/v1/appointments/:id/cancel` — cancel an appointment

Implements UC-3.

**Response `200`**: the appointment with `status: "CANCELLED"`.

**cURL**:

```bash
curl -X POST http://localhost:4002/api/v1/appointments/<id>/cancel
```

## Seed data reference

`prisma/seed.ts` creates one dealership, 3 bays, 3 technicians with differing qualifications
(Jordan: all service types; Sam: oil change + tire rotation; Priya: oil change + brake
inspection), 4 service types, and 1 customer with 1 vehicle — see `npm run db:seed`'s console
output for the actual generated IDs to use in the cURL examples above.
