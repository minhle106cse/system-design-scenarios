# Overview

**Demand-Driven Staff Scheduler** — scenario 02 of a system-design-scenarios collection. A store
manager plans a weekly staff schedule from historical transaction demand.

## The problem, in one paragraph

Given a week's hourly transaction counts, a roster of staff with weekly-hours caps, and a set of
shifts, produce a **draft weekly schedule**: busier hours get more staff, nobody exceeds their
contracted maximum, and nobody sits at zero hours while others are maxed out. Trade-offs are
expected — demand can exceed capacity or vice versa — and every shortfall must be surfaced to the
manager, never hidden. Full requirement: `01_business_requirements.md`, quoting
[`SWE_Take-Home_Staff_Scheduling_System.pdf`](../SWE_Take-Home_Staff_Scheduling_System.pdf).

## The one structural decision

The three hard constraints (weekly-hours cap, no same-day overlap, no double-assignment) cannot be
pushed into the database the way scenario 01 pushed its anti-double-booking guarantee into a
PostgreSQL exclusion constraint — one is an aggregate over rows, which no row-level constraint can
see. So the guarantee lives in the algorithm instead: a single `FeasibilityGate` is the only way an
assignment can enter a roster, and property-based testing proves the invariant holds across
generated inputs rather than a hand-picked example. Full argument: `../.ai/plans/init-source.plan.md`
§0.1, `adr/0001-constraint-enforcement-strategy.md`.

## Shape of the system

Two apps. **`apps/scheduler-api`** — NestJS + Fastify, CQRS + Hexagonal, PostgreSQL via Prisma
(Docker) — owns all persistence and calls into the zero-dependency algorithm package
(`packages/scheduling-core`). **`apps/web`** — Next.js 15 — is UI only, owns no database, and
reaches the API over HTTP. `03_architecture.md` has the diagram and the reasoning; the earlier
single-app/SQLite shape was reversed on the user's instruction
(`../.ai/plans/backend-architecture-reversal.plan.md` §0).

## What's deliberately not built

See `03_architecture.md § Deferred scope` — every omission has a stated trigger, not just "not
done yet".
