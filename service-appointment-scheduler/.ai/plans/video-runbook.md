# Video runbook — 5–10 minutes

> The one deliverable with no code artifact (`KeyloopCodingChallange.pdf`, *Deliverables &
> Submission* §3). This is a runbook, not a script to read aloud: the sequence to execute, the
> numbers to have on screen, and the honest answers to the two questions the brief asks that cannot
> be improvised.
>
> **Prerequisite, and the reason `init-source.plan.md` §10 has a fresh-clone check at all: the demo
> must run from a clean clone.** Do the setup below *before* recording, then record against a
> database that already has seed data.

## Setup (before the camera is on)

```bash
docker compose up -d          # postgres · prometheus · grafana
npm run db:migrate && npm run db:seed
npm run dev                   # leave running on :4002
```

Keep `npm run db:seed`'s output — it prints the customer / vehicle / dealership / service-type ids
every cURL below needs. Have four things open: the terminal, `readme.md`, `/docs`, and Grafana.

## Segment 1 — Intro and scenario (~45s)

Who you are, and: *Scenario A, The Unified Service Scheduler — backend layer, the option the brief
offers to implement one side fully and stub the other.* Show `readme.md`'s § *The problem this
solves*: the three core requirements quoted verbatim, each mapped to an endpoint, a handler, and the
test that proves it. That table is the whole orientation; do not narrate the repo tree.

## Segment 2 — Design walkthrough (~2.5 min)

Open `docs/03_system_architecture_diagrams.md` §1, then make exactly three points:

1. **The one hard requirement.** Requirement 2 is not CRUD: the availability check has to be correct
   under *concurrent* requests. The application-level check is a read, so it is a TOCTOU race by
   construction — it is kept because it produces useful, specific refusals, not because it is what
   makes booking correct.
2. **Where correctness actually lives** — ADR-0002. Show the migration:
   `EXCLUDE USING gist (service_bay_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
   WHERE status = 'SCHEDULED' AND deleted_at IS NULL`, twice: bay and technician. An overlapping
   booking is *unrepresentable*, whatever the application believed a moment earlier. Say the `'[)'`
   part out loud — half-open is why 10:00–10:30 and 10:30–11:00 are not a conflict.
3. **What was deliberately not built** — `docs/03 § Deferred scope`, one line: every row names a
   capability, the trigger that would bring it in, and where the seam is. Outbox, circuit breaker,
   rate limiting, a second service. This is the answer to "why is there no Kafka here".

If time is short, cut point 3 to a single sentence — never points 1 and 2.

## Segment 3 — AI collaboration (1–2 min, the brief asks for this explicitly)

Three claims, each with an artifact on screen:

| Claim | Show |
|---|---|
| Direction came before code | `.ai/plans/` — four plans, each with a *References & Compliance* section naming the directives that constrained it. `init-source.plan.md` was written before a single file was copied |
| Plans are not retouched after execution | `booking-domain.plan.md`'s warning not to guess the shape of Prisma's exclusion error — then its annotation that the guess was **wrong** (`P2039`, with the Postgres error nested at `meta.driverAdapterError.cause`, found by provoking a real violation). A plan showing only correct predictions is not evidence of verification |
| The guarantee does not depend on the AI reasoning correctly | The DB constraint, the lint-enforced layer boundaries, and 187 tests. If the AI got the availability logic wrong, the database still refuses the write |

## Segment 4 — Live demo (~2 min)

Run in this order, narrating one sentence each:

```bash
# 1. What is free on a Monday?
curl "http://localhost:4002/api/v1/availability?dealershipId=<id>&serviceTypeId=<id>&date=<monday>"

# 2. Book it. Note the request does NOT name a bay or technician — the server selects.
curl -X POST http://localhost:4002/api/v1/appointments \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{"customerId":"<id>","vehicleId":"<id>","dealershipId":"<id>","serviceTypeId":"<id>","startAt":"<monday>T10:00:00Z"}'

# 3. Read it back — the persistent record from requirement 3.
curl http://localhost:4002/api/v1/appointments/<id>

# 4. Same idempotency key, same body → the SAME appointment, not a second one.
#    (Re-run step 2 verbatim with the key you used.)

# 5. Cancel, then read back again: still there, now CANCELLED. A state transition, not a delete.
curl -X POST http://localhost:4002/api/v1/appointments/<id>/cancel
curl http://localhost:4002/api/v1/appointments/<id>
```

Then the part worth the most:

```bash
npm run test:integration --workspace=@scheduler/api
```

Two `BookAppointmentCommand`s dispatched simultaneously at the same slot; exactly one wins, the
loser fails with `service_bay_taken_concurrently`, and the database holds exactly one `SCHEDULED`
row. Finish on Grafana: `scheduler_api_booking_attempt_total{outcome}` — a nonzero
`*_taken_concurrently` rate is the guarantee visibly working, not an error budget being spent.

## Segment 5 — Learned and challenged (~1 min)

Pick two of these three. They are real, they are logged in `.ai/memory/gotchas.jsonl`, and each has
a point beyond the anecdote:

1. **Green gates do not mean the tests asked the right questions.** The domain phase passed 92 tests
   and three working endpoints; a pass whose explicit job was to attack that finished work found a
   `500` on a mistyped id, a `409` whose documented meaning was wrong, and **no clock reference
   anywhere in the module** — a booking for 2020 was accepted.
2. **The bug that only a real socket could find.** `IdempotencyInterceptor` persisted its response
   fire-and-forget, so a prompt retry got `409 in progress` for a request that had already
   succeeded. The unit spec asserted the write was *called* — it was. Manual cURL passed, because a
   human retypes slower than the write commits. The first test that went through the real HTTP
   pipeline failed immediately.
3. **Do not guess an error's shape — provoke it.** The plan predicted how Prisma would surface a
   `23P01`; both candidate guesses were wrong. Forcing a real violation against live Postgres and
   logging the object is what produced the working code.

Honest closing line: what is deliberately unfinished — no `COMPLETED` write path, so one 409 branch
is unreachable in practice, and it is documented as such rather than hidden.

## Do not

- Read the architecture diagram aloud box by box.
- Show the folder tree. The requirement→code table replaces it.
- Claim the application-level availability check prevents double booking. It does not; the
  constraint does, and saying so precisely is the strongest thing in the whole recording.
