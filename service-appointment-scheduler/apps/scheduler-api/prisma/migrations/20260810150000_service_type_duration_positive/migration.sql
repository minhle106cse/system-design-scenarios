-- ─────────────────────────────────────────────────────────────────────────
-- Make a zero- or negative-duration ServiceType unrepresentable.
--
-- Why this is a correctness fix and not a nicety: `Appointment.endAt` is
-- derived as `startAt + ServiceType.durationMinutes`. A duration of 0 produces
-- `endAt == startAt`, and `tstzrange(x, x, '[)')` is the EMPTY range. An empty
-- range overlaps nothing, so BOTH exclusion constraints added by the first
-- migration silently stop applying — unlimited appointments could be stacked
-- on the same bay and technician at the same instant, defeating the guarantee
-- ADR-0002 exists to provide.
--
-- Fixing it in the application layer alone would leave the same hole open to
-- the seed script, a data-fix script, or a future write path — the same
-- argument ADR-0002 §3 makes for putting the no-overlap rule in the database
-- rather than only in the handler.
--
-- Prisma's schema DSL cannot express a CHECK constraint, so this is raw SQL,
-- hand-written the same way the exclusion constraints were. It touches only
-- `service_types` — the `appointments` table and its two exclusion constraints
-- are deliberately untouched by this migration.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "service_types"
  ADD CONSTRAINT "service_types_duration_positive"
  CHECK ("duration_minutes" > 0);
