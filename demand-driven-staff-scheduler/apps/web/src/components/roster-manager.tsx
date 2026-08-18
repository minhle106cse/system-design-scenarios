'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addAssignment,
  autoSchedule,
  getSuggestedN,
  removeAssignment,
  updateSchedule,
  type Assignment,
  type Diagnostics,
  type Schedule,
  type ScheduleRun,
  type Shift,
  type StaffMember,
  type SuggestedN,
} from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import { buildRosterGrid, rosterGridKey } from '@/lib/grid'
import { toRosterCsv } from '@/lib/csv-export'
import { DAYS_OF_WEEK, dayLabel, formatMinutes } from '@/lib/week'
import { formatHours } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
import { Field } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface DragPayload {
  readonly assignmentId: string
  readonly staffId: string
  readonly fromDay: number
  readonly fromShiftId: string
}

/**
 * §2.5 star — parameter panel + auto-schedule + the day x shift grid + manual add/remove/drag-drop
 * + diagnostics banners + CSV export. Mutations refresh via `router.refresh()`
 * (`frontend_standard.md` §2/§4) rather than local optimistic state, matching every other screen.
 */
export function RosterManager({
  scheduleId,
  schedule,
  staff,
  shifts,
  assignments,
  latestRun,
  suggestedN,
}: {
  readonly scheduleId: string
  readonly schedule: Schedule
  readonly staff: readonly StaffMember[]
  readonly shifts: readonly Shift[]
  readonly assignments: readonly Assignment[]
  readonly latestRun: ScheduleRun | null
  readonly suggestedN: SuggestedN
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
  // `suggested` only changes on an explicit "Suggest from data" click (never auto-applied), so it's
  // fine as local state seeded from the prop. `current` must NOT be — it's `schedule`'s own field,
  // which DOES get a fresh value on every `router.refresh()`; capturing it into `useState` once
  // would go stale the moment "Save parameters" succeeds (the initial value from `useState(x)` is
  // never re-read from a later prop change, only from React unmounting/remounting the component).
  const [suggested, setSuggested] = useState(suggestedN.suggested)

  // Parameter panel
  const [n, setN] = useState(String(schedule.transactionsPerStaffHour))
  const [minStaff, setMinStaff] = useState(String(schedule.minStaffWhenOpen))
  const [maxStaff, setMaxStaff] = useState(schedule.maxStaffPerHour?.toString() ?? '')
  const [utilTarget, setUtilTarget] = useState(String(schedule.minUtilisationTarget))

  // Manual add
  const [addTarget, setAddTarget] = useState<{
    day: number
    shiftId: string
  } | null>(null)
  const [selectedStaffId, setSelectedStaffId] = useState('')

  const staffById = new Map(staff.map((s) => [s.id, s]))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const grid = buildRosterGrid(assignments)

  async function saveParameters(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
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
      setPending(false)
    }
  }

  async function refreshSuggestion() {
    setPending(true)
    setError(null)
    try {
      setSuggested((await getSuggestedN(scheduleId)).suggested)
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  async function runAutoSchedule() {
    setPending(true)
    setError(null)
    try {
      const result = await autoSchedule(scheduleId)
      setDiagnostics(result.diagnostics)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  async function handleAddAssignment() {
    if (!addTarget || !selectedStaffId) return
    setPending(true)
    setError(null)
    try {
      await addAssignment(scheduleId, {
        staffId: selectedStaffId,
        shiftId: addTarget.shiftId,
        dayOfWeek: addTarget.day,
      })
      setAddTarget(null)
      setSelectedStaffId('')
      router.refresh()
    } catch (err) {
      setError(describeApiError(err, { staffById, shiftById }))
    } finally {
      setPending(false)
    }
  }

  async function handleRemove(assignmentId: string) {
    setPending(true)
    setError(null)
    try {
      await removeAssignment(scheduleId, assignmentId)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  async function handleDrop(day: number, shiftId: string, payload: DragPayload) {
    if (payload.fromDay === day && payload.fromShiftId === shiftId) return
    setPending(true)
    setError(null)
    try {
      await addAssignment(scheduleId, {
        staffId: payload.staffId,
        shiftId,
        dayOfWeek: day,
      })
      // Only drop the source assignment once the destination is confirmed feasible - a rejected
      // add must leave the original assignment in place, never silently lose it.
      await removeAssignment(scheduleId, payload.assignmentId)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err, { staffById, shiftById }))
    } finally {
      setPending(false)
    }
  }

  const addTargetShift = addTarget ? shiftById.get(addTarget.shiftId) : undefined

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
              Save parameters
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={refreshSuggestion}
            >
              Suggest from data
            </Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Your imported data suggests N = {suggested}; this schedule currently uses N ={' '}
          {schedule.transactionsPerStaffHour}. They can legitimately differ - the suggestion is a
          data-driven estimate, not a rule to auto-apply; review before changing N above.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={runAutoSchedule}>
          {pending ? 'Working...' : 'Auto-schedule'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => downloadCsv('roster.csv', toRosterCsv(assignments, staff, shifts))}
        >
          Export CSV
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
          {diagnostics.unfilledSeats.length > 0 && (
            <Banner tone="warning">
              {diagnostics.unfilledSeats.length} seat(s) could not be filled:{' '}
              {diagnostics.unfilledSeats.slice(0, 5).map((seat, i) => (
                <span key={i}>
                  {i > 0 ? ', ' : ''}
                  {dayLabel(seat.day)} ({seat.blockedReasons.join(', ')})
                </span>
              ))}
              {diagnostics.unfilledSeats.length > 5 &&
                ` and ${diagnostics.unfilledSeats.length - 5} more`}
              .
            </Banner>
          )}
          {diagnostics.staff.some((s) => s.belowTarget) && (
            <Banner tone="info">
              {diagnostics.staff.filter((s) => s.belowTarget).length} staff member(s) are below the
              fair-share target this week - see Coverage for who.
            </Banner>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-slate-700">Roster</h2>
        <p className="text-xs text-slate-500">
          Drag a name to move it, or use +/x to add or remove an assignment.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="p-2 text-left text-slate-500">Shift</th>
                {DAYS_OF_WEEK.map((d) => (
                  <th key={d} className="p-2 text-center text-slate-500">
                    {dayLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id}>
                  <td className="whitespace-nowrap border p-2 align-top text-slate-600">
                    {shift.label}
                    <div className="text-[10px] text-slate-400">
                      {formatMinutes(shift.startMinute)}-{formatMinutes(shift.endMinute)}
                    </div>
                  </td>
                  {DAYS_OF_WEEK.map((d) => {
                    const cellAssignments = grid.get(rosterGridKey(d, shift.id)) ?? []
                    return (
                      <td
                        key={d}
                        className="min-w-[120px] border p-1 align-top"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const raw = e.dataTransfer.getData('application/json')
                          if (!raw) return
                          void handleDrop(d, shift.id, JSON.parse(raw) as DragPayload)
                        }}
                      >
                        <div className="space-y-1">
                          {cellAssignments.map((a) => (
                            <div
                              key={a.id}
                              draggable
                              onDragStart={(e) => {
                                const payload: DragPayload = {
                                  assignmentId: a.id,
                                  staffId: a.staffId,
                                  fromDay: d,
                                  fromShiftId: shift.id,
                                }
                                e.dataTransfer.setData('application/json', JSON.stringify(payload))
                              }}
                              className="flex cursor-move items-center justify-between gap-1 rounded bg-slate-100 px-1.5 py-0.5"
                            >
                              <span className="truncate">
                                {staffById.get(a.staffId)?.name ?? a.staffId}
                              </span>
                              <button
                                type="button"
                                aria-label="Remove"
                                disabled={pending}
                                onClick={() => handleRemove(a.id)}
                                className="text-slate-400 hover:text-red-600"
                              >
                                x
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => setAddTarget({ day: d, shiftId: shift.id })}
                            className="w-full rounded border border-dashed border-slate-300 py-0.5 text-slate-400 hover:border-slate-400 hover:text-slate-600"
                          >
                            +
                          </button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={addTarget !== null} title="Add assignment" onClose={() => setAddTarget(null)}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {addTarget && `${dayLabel(addTarget.day)} - ${addTargetShift?.label ?? ''}`}
          </p>
          <label htmlFor="staff-select" className="block text-sm font-medium text-slate-700">
            Staff member
          </label>
          <select
            id="staff-select"
            value={selectedStaffId}
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Choose...</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.maxWeeklyHours}h/week)
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddTarget(null)}>
              Cancel
            </Button>
            <Button disabled={pending || !selectedStaffId} onClick={handleAddAssignment}>
              Add
            </Button>
          </div>
        </div>
      </Modal>

      {staff.length === 0 && (
        <Banner tone="info">Add staff on the Staff tab before running auto-schedule.</Banner>
      )}
    </div>
  )
}
