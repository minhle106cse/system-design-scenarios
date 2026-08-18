// Schedules list + create (brief §2.1). The list half needs a `GET /schedules` route that
// apps/scheduler-api doesn't have yet (Phase D built per-schedule reads only — `GET /schedules/:id`
// — never a collection endpoint); adding one is Phase 3 UI-screen work, not Phase E's job (reducing
// apps/web, not growing apps/scheduler-api). The create half is real, not a mock — see
// src/components/create-schedule-form.tsx.
import { CreateScheduleForm } from '@/components/create-schedule-form'

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Demand-Driven Staff Scheduler</h1>
      <p className="mt-2 text-slate-600">
        Plan weekly staff schedules from historical transaction demand.
      </p>
      <p className="mt-8 rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        The staff/demand/shift/roster/summary/coverage screens (plan §3.1) land in Phase 3 — the
        backend they call (`apps/scheduler-api`) is fully built and verified against a real
        Postgres (`.ai/PROJECT_STATUS.md`). This page proves the wiring: creating a schedule below
        calls the real API, not a mock.
      </p>
      <CreateScheduleForm />
    </main>
  )
}
