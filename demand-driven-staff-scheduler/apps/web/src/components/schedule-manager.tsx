'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  autoSchedule,
  updateSchedule,
  type Diagnostics,
  type Role,
  type Schedule,
  type ScheduleRun,
  type Shift,
  type SuggestedN,
} from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import { formatHours } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
import { Field } from '@/components/ui/field'
import { RoleDiagnosticsBanners } from '@/components/role-diagnostics-banners'
import { UnfilledSeatsBanner } from '@/components/unfilled-seats-banner'

/**
 * §2.5's parameter panel + auto-schedule trigger — split out of what used to be `RosterManager` so
 * "configure and generate" (this screen) is a separate tab from "view and hand-tune the resulting
 * grid" (`roster-manager.tsx`). The split was user-directed after noticing the old single Roster
 * tab conflated three different jobs; `Auto-schedule` stays here rather than on Roster because it
 * is tightly coupled to the parameters just above it — "adjust N, click run" is one motion, not two
 * tabs. Mutations refresh via `router.refresh()` (`frontend_standard.md` §2/§4), matching every
 * other screen.
 */
export function ScheduleManager({
  scheduleId,
  schedule,
  staffCount,
  shifts,
  roles,
  latestRun,
  suggestedN,
}: {
  readonly scheduleId: string
  readonly schedule: Schedule
  readonly staffCount: number
  readonly shifts: readonly Shift[]
  readonly roles: readonly Role[]
  readonly latestRun: ScheduleRun | null
  readonly suggestedN: SuggestedN | null
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'save' | 'auto' | null>(null)
  const pending = pendingAction !== null
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)

  const [n, setN] = useState(String(schedule.transactionsPerStaffHour))
  const [minStaff, setMinStaff] = useState(String(schedule.minStaffWhenOpen))
  const [maxStaff, setMaxStaff] = useState(schedule.maxStaffPerHour?.toString() ?? '')
  const [utilTarget, setUtilTarget] = useState(String(schedule.minUtilisationTarget))

  async function saveParameters(e: React.FormEvent) {
    e.preventDefault()
    setPendingAction('save')
    setError(null)
    try {
      await updateSchedule(scheduleId, {
        transactionsPerStaffHour: Number(n),
        minStaffWhenOpen: Number(minStaff),
        maxStaffPerHour: maxStaff === '' ? null : Number(maxStaff),
        minUtilisationTarget: Number(utilTarget),
      })
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPendingAction(null)
    }
  }

  async function runAutoSchedule() {
    setPendingAction('auto')
    setError(null)
    try {
      const result = await autoSchedule(scheduleId)
      setDiagnostics(result.diagnostics)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="space-y-6">
      {error && <Banner tone="error">{error}</Banner>}

      <div className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-medium text-slate-700">Parameters</h2>
        <form onSubmit={saveParameters} className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field
            id="param-n"
            label="Transactions per staff hour (N)"
            type="number"
            min={1}
            value={n}
            onChange={(e) => setN(e.target.value)}
          />
          <Field
            id="param-min-staff"
            label="Min staff when open"
            type="number"
            min={0}
            value={minStaff}
            onChange={(e) => setMinStaff(e.target.value)}
          />
          <Field
            id="param-max-staff"
            label="Max staff per hour (optional)"
            type="number"
            min={1}
            value={maxStaff}
            onChange={(e) => setMaxStaff(e.target.value)}
            placeholder="No cap"
          />
          <Field
            id="param-util"
            label="Fair-share target (0-1)"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={utilTarget}
            onChange={(e) => setUtilTarget(e.target.value)}
          />
          <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
            <Button type="submit" disabled={pending}>
              {pendingAction === 'save' ? 'Saving…' : 'Save parameters'}
            </Button>
          </div>
        </form>
        {/* No button here on purpose (user feedback): the suggestion is fetched once, on page load,
            and just shown — a "Suggest from data" click added no information a re-fetch of this
            page didn't already have, since the number depends only on staff/shifts/demand, never on
            what's typed into N above. Short and legible over long and pale (user feedback) — the
            math and the "never auto-applied" caveat live in `docs/01`/ADR-0003, not repeated here. */}
        <p className="mt-2 text-sm text-slate-700">
          {suggestedN === null ? (
            'No demand data yet — suggested N needs it.'
          ) : (
            <>
              Suggested N: <strong className="font-semibold text-accent-700">{suggestedN.suggested}</strong>
              {' · '}using <strong className="font-semibold">{schedule.transactionsPerStaffHour}</strong>
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={runAutoSchedule}>
          {pendingAction === 'auto' ? 'Working...' : 'Auto-schedule'}
        </Button>
        {latestRun && (
          <span className="text-xs text-slate-500">
            Last run {new Date(latestRun.generatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {diagnostics && (
        <div className="space-y-2">
          {diagnostics.structural.floorStaffHours > diagnostics.structural.contractedStaffHours && (
            <Banner tone="warning">
              Demand needs about {formatHours(diagnostics.structural.floorStaffHours)} of work this
              week, but the team is only contracted for{' '}
              {formatHours(diagnostics.structural.contractedStaffHours)}. Not every hour could be
              fully covered - see Coverage for detail, and consider adding staff or hours.
            </Banner>
          )}
          <UnfilledSeatsBanner seats={diagnostics.unfilledSeats} shifts={shifts} />
          {diagnostics.staff.some((s) => s.belowTarget) && (
            <Banner tone="info">
              {diagnostics.staff.filter((s) => s.belowTarget).length} staff member(s) are below the
              fair-share target this week - see Coverage for who.
            </Banner>
          )}
          <RoleDiagnosticsBanners diagnostics={diagnostics} roles={roles} shifts={shifts} />
        </div>
      )}

      {staffCount === 0 && (
        <Banner tone="info">Add staff on the Staff tab before running auto-schedule.</Banner>
      )}
    </div>
  )
}
