'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addStaff,
  removeStaff,
  updateStaff,
  addUnavailability,
  removeUnavailability,
  addRole,
  updateRole,
  removeRole,
  setStaffRoles,
  ApiError,
  type StaffMember,
  type StaffUnavailability,
  type Role,
  type StaffRole,
} from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import { formatWindow, windowsForStaff, DAY_OFF_MINUTES } from '@/lib/availability'
import { DAYS_OF_WEEK, dayLabel, parseTime } from '@/lib/week'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'

/** §2.2 — add/edit/remove staff, name + max weekly hours. `frontend_standard.md` §4's mutation
 *  pattern: pending state, success via `router.refresh()`, failure via a banner, never silent. */
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
  const [name, setName] = useState('')
  const [maxWeeklyHours, setMaxWeeklyHours] = useState('40')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editHours, setEditHours] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<StaffMember | null>(null)
  const [availabilityFor, setAvailabilityFor] = useState<StaffMember | null>(null)
  const [newDay, setNewDay] = useState(1)
  const [isFullDayOff, setIsFullDayOff] = useState(true)
  const [fromTime, setFromTime] = useState('09:00')
  const [toTime, setToTime] = useState('17:00')
  const [newRoleName, setNewRoleName] = useState('')
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editRoleName, setEditRoleName] = useState('')

  const totalContractedHours = staff.reduce((sum, s) => sum + s.maxWeeklyHours, 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await addStaff(scheduleId, {
        name,
        maxWeeklyHours: Number(maxWeeklyHours),
      })
      setName('')
      setMaxWeeklyHours('40')
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  function startEdit(member: StaffMember) {
    setEditingId(member.id)
    setEditName(member.name)
    setEditHours(String(member.maxWeeklyHours))
  }

  async function saveEdit(member: StaffMember) {
    setPending(true)
    setError(null)
    try {
      await updateStaff(scheduleId, member.id, {
        name: editName,
        maxWeeklyHours: Number(editHours),
      })
      setEditingId(null)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
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

  function openAvailability(member: StaffMember) {
    setAvailabilityFor(member)
    setNewDay(1)
    setIsFullDayOff(true)
    setFromTime('09:00')
    setToTime('17:00')
  }

  async function handleAddWindow(e: React.FormEvent) {
    e.preventDefault()
    if (!availabilityFor) return
    const range = isFullDayOff
      ? DAY_OFF_MINUTES
      : { startMinute: parseTime(fromTime), endMinute: parseTime(toTime) }
    if (range.startMinute === null || range.endMinute === null) {
      setError('Enter a valid HH:mm time range.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await addUnavailability(scheduleId, availabilityFor.id, {
        dayOfWeek: newDay,
        startMinute: range.startMinute,
        endMinute: range.endMinute,
      })
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  async function handleRemoveWindow(window: StaffUnavailability) {
    setPending(true)
    setError(null)
    try {
      await removeUnavailability(scheduleId, window.staffId, window.id)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  function rolesForStaff(staffId: string): readonly Role[] {
    const roleIds = new Set(
      staffRoles.filter((sr) => sr.staffId === staffId).map((sr) => sr.roleId),
    )
    return roles.filter((r) => roleIds.has(r.id))
  }

  async function toggleStaffRole(member: StaffMember, roleId: string) {
    const current = new Set(
      staffRoles.filter((sr) => sr.staffId === member.id).map((sr) => sr.roleId),
    )
    if (current.has(roleId)) current.delete(roleId)
    else current.add(roleId)
    setPending(true)
    setError(null)
    try {
      await setStaffRoles(scheduleId, member.id, [...current])
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  async function handleAddRole(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await addRole(scheduleId, newRoleName)
      setNewRoleName('')
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  function startEditRole(role: Role) {
    setEditingRoleId(role.id)
    setEditRoleName(role.name)
  }

  async function saveRoleEdit(role: Role) {
    setPending(true)
    setError(null)
    try {
      await updateRole(scheduleId, role.id, editRoleName)
      setEditingRoleId(null)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  async function handleRemoveRole(role: Role) {
    setPending(true)
    setError(null)
    try {
      await removeRole(scheduleId, role.id)
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

      <DataTable
        columns={[
          {
            header: 'Name',
            render: (s) =>
              editingId === s.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                s.name
              ),
          },
          {
            header: 'Max weekly hours',
            render: (s) =>
              editingId === s.id ? (
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                  className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                `${s.maxWeeklyHours}h`
              ),
          },
          {
            header: 'Availability',
            render: (s) => {
              const windows = windowsForStaff(unavailability, s.id)
              return (
                <div className="flex flex-wrap items-center gap-1">
                  {windows.length === 0 ? (
                    <span className="text-xs text-slate-400">Available all week</span>
                  ) : (
                    windows.map((w) => (
                      <Badge key={w.id} tone="warn">
                        {formatWindow(w)}
                      </Badge>
                    ))
                  )}
                  <Button variant="secondary" onClick={() => openAvailability(s)}>
                    Manage
                  </Button>
                </div>
              )
            },
          },
          {
            header: 'Roles',
            render: (s) => {
              const current = new Set(rolesForStaff(s.id).map((r) => r.id))
              return roles.length === 0 ? (
                <span className="text-xs text-slate-400">No roles defined</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      disabled={pending}
                      onClick={() => toggleStaffRole(s, r.id)}
                      aria-pressed={current.has(r.id)}
                    >
                      <Badge tone={current.has(r.id) ? 'good' : 'neutral'}>{r.name}</Badge>
                    </button>
                  ))}
                </div>
              )
            },
          },
          {
            header: '',
            render: (s) =>
              editingId === s.id ? (
                <div className="flex gap-2">
                  <Button variant="primary" disabled={pending} onClick={() => saveEdit(s)}>
                    Save
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => startEdit(s)}>
                    Edit
                  </Button>
                  <Button variant="danger" onClick={() => setConfirmRemove(s)}>
                    Remove
                  </Button>
                </div>
              ),
          },
        ]}
        rows={staff}
        rowKey={(s) => s.id}
        emptyMessage="No staff yet — add the first one below."
      />

      <form
        onSubmit={handleAdd}
        className="flex items-end gap-3 rounded-md border border-slate-200 bg-white p-4"
      >
        <div className="flex-1">
          <Field
            id="staff-name"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="w-40">
          <Field
            id="staff-hours"
            label="Max weekly hours"
            type="number"
            min={0}
            max={168}
            value={maxWeeklyHours}
            onChange={(e) => setMaxWeeklyHours(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Add staff'}
        </Button>
      </form>

      {/* Roles/skills (brief §8 stretch, D2) — managed here, where they're assigned, not as an
       *  8th tab (docs/05's seven-screen nav stays stable). */}
      <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Roles</h2>
        <p className="text-xs text-slate-500">
          e.g. a shift can require at least one Supervisor — set that on the Shifts tab. A person
          can hold more than one role.
        </p>
        <ul className="space-y-1">
          {roles.map((role) => (
            <li key={role.id} className="flex items-center justify-between gap-2 text-sm">
              {editingRoleId === role.id ? (
                <input
                  value={editRoleName}
                  onChange={(e) => setEditRoleName(e.target.value)}
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                <span>{role.name}</span>
              )}
              <div className="flex gap-2">
                {editingRoleId === role.id ? (
                  <>
                    <Button disabled={pending} onClick={() => saveRoleEdit(role)}>
                      Save
                    </Button>
                    <Button variant="secondary" onClick={() => setEditingRoleId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => startEditRole(role)}>
                      Rename
                    </Button>
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() => handleRemoveRole(role)}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
          {roles.length === 0 && <li className="text-xs text-slate-400">No roles yet.</li>}
        </ul>
        <form onSubmit={handleAddRole} className="flex items-end gap-3">
          <div className="flex-1">
            <Field
              id="role-name"
              label="New role name"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Add role'}
          </Button>
        </form>
      </section>

      <Modal
        open={confirmRemove !== null}
        title="Remove staff member"
        onClose={() => setConfirmRemove(null)}
      >
        <p className="text-sm text-slate-600">
          Remove {confirmRemove?.name}? This also drops any shifts already assigned to them.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmRemove(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={confirmAndRemove}>
            Remove
          </Button>
        </div>
      </Modal>

      <Modal
        open={availabilityFor !== null}
        title={`Availability — ${availabilityFor?.name ?? ''}`}
        onClose={() => setAvailabilityFor(null)}
      >
        {availabilityFor && (
          <div className="space-y-4">
            <div className="space-y-1">
              {windowsForStaff(unavailability, availabilityFor.id).length === 0 ? (
                <p className="text-sm text-slate-500">No blocks yet — available every day.</p>
              ) : (
                windowsForStaff(unavailability, availabilityFor.id).map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
                  >
                    <span>{formatWindow(w)}</span>
                    <Button
                      variant="danger"
                      disabled={pending}
                      onClick={() => handleRemoveWindow(w)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleAddWindow} className="space-y-3 border-t border-slate-200 pt-4">
              <div>
                <label className="block text-sm font-medium text-slate-700" htmlFor="avail-day">
                  Day
                </label>
                <select
                  id="avail-day"
                  value={newDay}
                  onChange={(e) => setNewDay(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d} value={d}>
                      {dayLabel(d)}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isFullDayOff}
                  onChange={(e) => setIsFullDayOff(e.target.checked)}
                />
                Day off (unavailable the whole day)
              </label>

              {!isFullDayOff && (
                <div className="flex gap-3">
                  <Field
                    id="avail-from"
                    label="From"
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    placeholder="HH:mm"
                  />
                  <Field
                    id="avail-to"
                    label="To"
                    value={toTime}
                    onChange={(e) => setToTime(e.target.value)}
                    placeholder="HH:mm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" type="button" onClick={() => setAvailabilityFor(null)}>
                  Close
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Saving…' : 'Add block'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  )
}
