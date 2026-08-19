'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addStaff,
  removeStaff,
  updateStaff,
  addUnavailability,
  removeUnavailability,
  setStaffRoles,
  type StaffMember,
  type StaffUnavailability,
  type Role,
  type StaffRole,
} from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import { formatWindow, windowsForStaff, DAY_OFF_MINUTES } from '@/lib/availability'
import { DAYS_OF_WEEK, dayLabel, formatMinutes, parseTime } from '@/lib/week'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'

/**
 * A window while it is being edited. `id` present = already persisted (so removing it needs a
 * DELETE); absent = added in this modal session and not saved yet. Holding both in one list is
 * what lets the SAME editor serve create (nothing persisted yet) and edit (some of it is).
 */
interface DraftWindow {
  readonly id?: string
  readonly dayOfWeek: number
  readonly startMinute: number
  readonly endMinute: number
}

/**
 * §2.2 — add/edit/remove staff. `frontend_standard.md` §4's mutation pattern: pending state,
 * success via `router.refresh()`, failure via a banner, never silent.
 *
 * One modal covers everything about a person — name, weekly cap, availability and roles — and it
 * is the SAME modal with the same fields whether they exist yet or not. Previously availability
 * hid behind a per-row "Manage" button and roles were chips you toggled in the table, so creating
 * someone gave you two of the four fields and the other two only became reachable afterwards.
 *
 * The cost of that unification is that create is no longer a single request: the availability and
 * role endpoints are keyed by staffId, which does not exist until the staff member does. So create
 * writes the person first, then their windows and roles. That ordering is deliberate and the
 * failure mode is reported honestly rather than hidden — see `submitEditor`.
 */
export function StaffManager({
  scheduleId,
  staff,
  unavailability,
  roles,
  staffRoles,
}: {
  readonly scheduleId: string
  readonly staff: readonly StaffMember[]
  readonly unavailability: readonly StaffUnavailability[]
  readonly roles: readonly Role[]
  readonly staffRoles: readonly StaffRole[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** `null` = closed, `'new'` = creating, a StaffMember = editing that person. */
  const [editorFor, setEditorFor] = useState<StaffMember | 'new' | null>(null)
  const [name, setName] = useState('')
  const [maxWeeklyHours, setMaxWeeklyHours] = useState('40')
  const [windows, setWindows] = useState<readonly DraftWindow[]>([])
  const [roleIds, setRoleIds] = useState<readonly string[]>([])
  const [confirmRemove, setConfirmRemove] = useState<StaffMember | null>(null)
  // The "add a window" sub-form inside the modal.
  const [newDay, setNewDay] = useState(1)
  const [isFullDayOff, setIsFullDayOff] = useState(true)
  const [fromTime, setFromTime] = useState('09:00')
  const [toTime, setToTime] = useState('17:00')

  const totalContractedHours = staff.reduce((sum, s) => sum + s.maxWeeklyHours, 0)

  function rolesForStaff(staffId: string): readonly Role[] {
    const held = new Set(staffRoles.filter((sr) => sr.staffId === staffId).map((sr) => sr.roleId))
    return roles.filter((r) => held.has(r.id))
  }

  function resetWindowForm() {
    setNewDay(1)
    setIsFullDayOff(true)
    setFromTime('09:00')
    setToTime('17:00')
  }

  function openCreate() {
    setEditorFor('new')
    setName('')
    setMaxWeeklyHours('40')
    setWindows([])
    setRoleIds([])
    resetWindowForm()
    setError(null)
  }

  function openEdit(member: StaffMember) {
    setEditorFor(member)
    setName(member.name)
    setMaxWeeklyHours(String(member.maxWeeklyHours))
    setWindows(
      windowsForStaff(unavailability, member.id).map((w) => ({
        id: w.id,
        dayOfWeek: w.dayOfWeek,
        startMinute: w.startMinute,
        endMinute: w.endMinute,
      })),
    )
    setRoleIds(rolesForStaff(member.id).map((r) => r.id))
    resetWindowForm()
    setError(null)
  }

  function addDraftWindow() {
    const start = isFullDayOff ? DAY_OFF_MINUTES.startMinute : parseTime(fromTime)
    const end = isFullDayOff ? DAY_OFF_MINUTES.endMinute : parseTime(toTime)
    if (start === null || end === null) {
      setError('Enter both times as HH:mm.')
      return
    }
    if (end <= start) {
      setError('The end time has to be after the start time.')
      return
    }
    setError(null)
    setWindows((current) => [...current, { dayOfWeek: newDay, startMinute: start, endMinute: end }])
    resetWindowForm()
  }

  function toggleRole(roleId: string) {
    setRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    )
  }

  /**
   * One submit for both modes. Create needs three round trips because the availability and role
   * endpoints are keyed by staffId — if a later step fails the person still exists, so the banner
   * says exactly that instead of implying nothing was saved.
   */
  async function submitEditor(e: React.FormEvent) {
    e.preventDefault()
    if (!editorFor) return
    setPending(true)
    setError(null)

    const isCreate = editorFor === 'new'
    let staffId = isCreate ? null : editorFor.id

    try {
      if (isCreate) {
        const created = await addStaff(scheduleId, { name, maxWeeklyHours: Number(maxWeeklyHours) })
        staffId = created.id
      } else {
        await updateStaff(scheduleId, editorFor.id, {
          name,
          maxWeeklyHours: Number(maxWeeklyHours),
        })
      }
      if (!staffId) throw new Error('missing staff id')
      // Bind to a const: `staffId` is a `let` (create assigns it later), so TypeScript will not
      // carry the null-check narrowing into the closures below.
      const id = staffId

      // Availability: only the difference. Windows carrying an id already exist server-side.
      const original = isCreate ? [] : windowsForStaff(unavailability, id)
      const keptIds = new Set(windows.map((w) => w.id).filter(Boolean))
      await Promise.all(
        original
          .filter((w) => !keptIds.has(w.id))
          .map((w) => removeUnavailability(scheduleId, id, w.id)),
      )
      for (const w of windows.filter((w) => !w.id)) {
        await addUnavailability(scheduleId, id, {
          dayOfWeek: w.dayOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        })
      }

      // Roles are a replace-the-whole-set PUT, so this is one call either way.
      await setStaffRoles(scheduleId, id, roleIds)

      setEditorFor(null)
      router.refresh()
    } catch (err) {
      const detail = describeApiError(err)
      setError(
        isCreate && staffId
          ? `${name} was created, but saving their availability or roles failed: ${detail} — reopen them to finish.`
          : detail,
      )
      if (isCreate && staffId) router.refresh()
    } finally {
      setPending(false)
    }
  }

  async function confirmAndRemove() {
    if (!confirmRemove) return
    setPending(true)
    setError(null)
    try {
      await removeStaff(scheduleId, confirmRemove.id)
      setConfirmRemove(null)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Total contracted hours across the team:{' '}
        <span className="font-semibold text-slate-900">{totalContractedHours}h</span> — this is the
        ceiling auto-schedule has to work with.
      </p>

      {error && <Banner tone="error">{error}</Banner>}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Staff</h2>
        <Button onClick={openCreate}>Add staff</Button>
      </div>

      <DataTable
        columns={[
          {
            header: 'Name',
            render: (s) => <span className="font-medium text-slate-900">{s.name}</span>,
          },
          {
            header: 'Max weekly hours',
            render: (s) => <span className="tabular-nums text-slate-600">{s.maxWeeklyHours}h</span>,
          },
          {
            header: 'Availability',
            render: (s) => {
              const owned = windowsForStaff(unavailability, s.id)
              return owned.length === 0 ? (
                <span className="text-xs text-slate-400">Available all week</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {owned.map((w) => (
                    <Badge key={w.id} tone="warn">
                      {formatWindow(w)}
                    </Badge>
                  ))}
                </div>
              )
            },
          },
          {
            header: 'Roles',
            render: (s) => {
              const held = rolesForStaff(s.id)
              return held.length === 0 ? (
                <span className="text-xs text-slate-400">—</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {held.map((r) => (
                    <Badge key={r.id} tone="good">
                      {r.name}
                    </Badge>
                  ))}
                </div>
              )
            },
          },
          {
            header: '',
            render: (s) => (
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(s)}>
                  Edit
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmRemove(s)}>
                  Remove
                </Button>
              </div>
            ),
          },
        ]}
        rows={staff}
        rowKey={(s) => s.id}
        emptyMessage="No staff yet — use Add staff above."
      />

      <Modal
        open={editorFor !== null}
        title={editorFor === 'new' ? 'Add staff' : 'Edit staff'}
        onClose={() => setEditorFor(null)}
      >
        <form onSubmit={submitEditor} className="space-y-4">
          <Field
            id="staff-name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Field
            id="staff-hours"
            label="Max weekly hours"
            type="number"
            min={0}
            max={168}
            value={maxWeeklyHours}
            onChange={(e) => setMaxWeeklyHours(e.target.value)}
            hint="The hard cap auto-schedule will never exceed for this person."
            required
          />

          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Unavailable times</p>
              <p className="text-xs text-slate-500">
                Auto-schedule will not place them in a shift that overlaps these. Leave empty if
                they are available all week.
              </p>
            </div>

            {windows.length > 0 && (
              <ul className="space-y-1">
                {windows.map((w, i) => (
                  <li
                    key={w.id ?? `draft-${String(i)}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-slate-100 px-2 py-1 text-sm"
                  >
                    <span>
                      {dayLabel(w.dayOfWeek)}
                      {w.startMinute === DAY_OFF_MINUTES.startMinute &&
                      w.endMinute === DAY_OFF_MINUTES.endMinute
                        ? ': day off'
                        : ` ${formatMinutes(w.startMinute)}–${formatMinutes(w.endMinute)}`}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove this window"
                      className="rounded px-1 text-slate-400 transition-colors hover:bg-red-100 hover:text-red-700"
                      onClick={() => setWindows((c) => c.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">Day</span>
                <select
                  value={newDay}
                  onChange={(e) => setNewDay(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>
                      {dayLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isFullDayOff}
                  onChange={(e) => setIsFullDayOff(e.target.checked)}
                />
                Whole day
              </label>
              {!isFullDayOff && (
                <>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block font-medium text-slate-700">From</span>
                    <input
                      type="time"
                      value={fromTime}
                      onChange={(e) => setFromTime(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block font-medium text-slate-700">To</span>
                    <input
                      type="time"
                      value={toTime}
                      onChange={(e) => setToTime(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                </>
              )}
              <Button variant="secondary" size="sm" type="button" onClick={addDraftWindow}>
                Add time off
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Roles</p>
              <p className="text-xs text-slate-500">
                {roles.length === 0
                  ? 'No roles defined yet — create them on the Roles tab first.'
                  : 'Tick every role this person can cover. A shift can require one of each.'}
              </p>
            </div>
            {roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {roles.map((r) => {
                  const on = roleIds.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleRole(r.id)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors ${
                        on
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <Button variant="secondary" type="button" onClick={() => setEditorFor(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : editorFor === 'new' ? 'Add staff' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={confirmRemove !== null}
        title="Remove staff member"
        onClose={() => setConfirmRemove(null)}
      >
        <p className="text-sm text-slate-600">
          Remove <span className="font-medium text-slate-900">{confirmRemove?.name}</span>? Any
          shifts they are currently assigned to will be freed up.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmRemove(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => void confirmAndRemove()}>
            {pending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
