'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addAssignment,
  removeAssignment,
  type Assignment,
  type Shift,
  type StaffMember,
} from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import { buildRosterGrid, rosterGridKey } from '@/lib/grid'
import { toRosterCsv } from '@/lib/csv-export'
import { DAYS_OF_WEEK, dayLabel, formatMinutes } from '@/lib/week'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
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
 * §2.5's day x shift grid + manual add/remove/drag-drop + CSV export. Parameters and the
 * auto-schedule trigger live on the separate Schedule tab (`schedule-manager.tsx`) — this
 * component only shows and hand-tunes whatever roster is currently persisted, whether it came from
 * an auto-schedule run or from edits made here. Mutations refresh via `router.refresh()`
 * (`frontend_standard.md` §2/§4) rather than local optimistic state, matching every other screen.
 */
export function RosterManager({
  scheduleId,
  staff,
  shifts,
  assignments,
}: {
  readonly scheduleId: string
  readonly staff: readonly StaffMember[]
  readonly shifts: readonly Shift[]
  readonly assignments: readonly Assignment[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Manual add
  const [addTarget, setAddTarget] = useState<{
    day: number
    shiftId: string
  } | null>(null)
  const [selectedStaffId, setSelectedStaffId] = useState('')

  const staffById = new Map(staff.map((s) => [s.id, s]))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const grid = buildRosterGrid(assignments)

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

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => downloadCsv('roster.csv', toRosterCsv(assignments, staff, shifts))}
        >
          Export CSV
        </Button>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700">Roster</h2>
        <p className="text-xs text-slate-500">
          Drag a name to move it to another day or shift. Use <strong>Add</strong> to assign
          someone, or the <strong>x</strong> on a name to unassign them.
        </p>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Shift
                </th>
                {DAYS_OF_WEEK.map((d) => (
                  <th
                    key={d}
                    className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {dayLabel(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id}>
                  <td className="whitespace-nowrap border-t border-slate-100 px-3 py-2 align-top">
                    <div className="font-medium text-slate-900">{shift.label}</div>
                    <div className="text-xs tabular-nums text-slate-400">
                      {formatMinutes(shift.startMinute)}–{formatMinutes(shift.endMinute)}
                    </div>
                  </td>
                  {DAYS_OF_WEEK.map((d) => {
                    const cellAssignments = grid.get(rosterGridKey(d, shift.id)) ?? []
                    return (
                      <td
                        key={d}
                        className="min-w-[140px] border-l border-t border-slate-100 p-1.5 align-top"
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
                              className="group flex cursor-grab items-center justify-between gap-1 rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-800 transition-colors hover:bg-slate-200 active:cursor-grabbing"
                            >
                              <span className="truncate">
                                {staffById.get(a.staffId)?.name ?? a.staffId}
                              </span>
                              <button
                                type="button"
                                aria-label={`Unassign ${staffById.get(a.staffId)?.name ?? a.staffId}`}
                                title="Unassign"
                                disabled={pending}
                                onClick={() => handleRemove(a.id)}
                                className="shrink-0 rounded px-1 text-slate-400 transition-colors hover:bg-red-100 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => setAddTarget({ day: d, shiftId: shift.id })}
                            aria-label={`Assign someone to ${shift.label} on ${dayLabel(d)}`}
                            className="w-full rounded-md border border-dashed border-slate-300 py-1 text-xs font-medium text-slate-400 transition-colors hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
                          >
                            + Add
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
        <Banner tone="info">Add staff on the Staff tab before assigning them to shifts.</Banner>
      )}
    </div>
  )
}
