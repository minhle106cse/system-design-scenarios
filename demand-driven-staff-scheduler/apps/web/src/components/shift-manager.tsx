'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addShift,
  removeShift,
  updateShift,
  setShiftRoleRequirements,
  type Shift,
  type Role,
  type ShiftRoleRequirement,
} from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import { formatMinutes, parseTime, shiftHours } from '@/lib/week'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'

/** §2.4 — add/edit/remove shifts (start + end time only). `parseTime`/`formatMinutes` convert
 *  between the `<input type="time">` string and the wire's minutes-from-midnight. */
export function ShiftManager({
  scheduleId,
  shifts,
  roles,
  shiftRoleRequirements,
}: {
  readonly scheduleId: string
  readonly shifts: readonly Shift[]
  readonly roles: readonly Role[]
  readonly shiftRoleRequirements: readonly ShiftRoleRequirement[]
}) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [start, setStart] = useState('07:00')
  const [end, setEnd] = useState('15:00')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<Shift | null>(null)
  const [requiresFor, setRequiresFor] = useState<Shift | null>(null)
  const [draftRequirements, setDraftRequirements] = useState<Map<string, number>>(new Map())

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const startMinute = parseTime(start)
    const endMinute = parseTime(end)
    if (startMinute === null || endMinute === null) {
      setError('Enter a valid start and end time.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await addShift(scheduleId, { label, startMinute, endMinute })
      setLabel('')
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  function startEdit(shift: Shift) {
    setEditingId(shift.id)
    setEditLabel(shift.label)
    setEditStart(formatMinutes(shift.startMinute))
    setEditEnd(formatMinutes(shift.endMinute))
  }

  async function saveEdit(shift: Shift) {
    const startMinute = parseTime(editStart)
    const endMinute = parseTime(editEnd)
    if (startMinute === null || endMinute === null) {
      setError('Enter a valid start and end time.')
      return
    }
    setPending(true)
    setError(null)
    try {
      await updateShift(scheduleId, shift.id, {
        label: editLabel,
        startMinute,
        endMinute,
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
      await removeShift(scheduleId, confirmRemove.id)
      setConfirmRemove(null)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  const roleById = new Map(roles.map((r) => [r.id, r]))

  function requirementsForShift(shiftId: string): readonly ShiftRoleRequirement[] {
    return shiftRoleRequirements.filter((r) => r.shiftId === shiftId)
  }

  function openRequires(shift: Shift) {
    setRequiresFor(shift)
    setDraftRequirements(new Map(requirementsForShift(shift.id).map((r) => [r.roleId, r.minCount])))
  }

  function setDraftCount(roleId: string, minCount: number) {
    setDraftRequirements((prev) => {
      const next = new Map(prev)
      if (minCount <= 0) next.delete(roleId)
      else next.set(roleId, minCount)
      return next
    })
  }

  async function saveRequires() {
    if (!requiresFor) return
    setPending(true)
    setError(null)
    try {
      await setShiftRoleRequirements(
        scheduleId,
        requiresFor.id,
        [...draftRequirements].map(([roleId, minCount]) => ({ roleId, minCount })),
      )
      setRequiresFor(null)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}

      <DataTable
        columns={[
          {
            header: 'Label',
            render: (s) =>
              editingId === s.id ? (
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                s.label
              ),
          },
          {
            header: 'Start',
            render: (s) =>
              editingId === s.id ? (
                <input
                  type="time"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                formatMinutes(s.startMinute)
              ),
          },
          {
            header: 'End',
            render: (s) =>
              editingId === s.id ? (
                <input
                  type="time"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
              ) : (
                formatMinutes(s.endMinute)
              ),
          },
          { header: 'Length', render: (s) => `${shiftHours(s)}h` },
          {
            header: 'Requires',
            render: (s) => {
              const reqs = requirementsForShift(s.id)
              return (
                <div className="flex flex-wrap items-center gap-1">
                  {reqs.length === 0 ? (
                    <span className="text-xs text-slate-400">No role requirements</span>
                  ) : (
                    reqs.map((r) => (
                      <Badge key={r.roleId} tone="neutral">
                        {roleById.get(r.roleId)?.name ?? 'Unknown role'} × {r.minCount}
                      </Badge>
                    ))
                  )}
                  <Button variant="secondary" onClick={() => openRequires(s)}>
                    Edit
                  </Button>
                </div>
              )
            },
          },
          {
            header: '',
            render: (s) =>
              editingId === s.id ? (
                <div className="flex gap-2">
                  <Button disabled={pending} onClick={() => saveEdit(s)}>
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
        rows={shifts}
        rowKey={(s) => s.id}
        emptyMessage="No shifts yet — add one below."
      />

      <form
        onSubmit={handleAdd}
        className="flex items-end gap-3 rounded-md border border-slate-200 bg-white p-4"
      >
        <div className="flex-1">
          <Field
            id="shift-label"
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </div>
        <div>
          <Field
            id="shift-start"
            label="Start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            required
          />
        </div>
        <div>
          <Field
            id="shift-end"
            label="End"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Add shift'}
        </Button>
      </form>

      <Modal
        open={confirmRemove !== null}
        title="Remove shift"
        onClose={() => setConfirmRemove(null)}
      >
        <p className="text-sm text-slate-600">
          Remove {confirmRemove?.label}? Any roster assignments on this shift are removed too.
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
        open={requiresFor !== null}
        title={`Role requirements — ${requiresFor?.label ?? ''}`}
        onClose={() => setRequiresFor(null)}
      >
        {requiresFor && (
          <div className="space-y-3">
            {roles.length === 0 ? (
              <p className="text-sm text-slate-500">
                No roles defined yet — add one on the Staff tab first.
              </p>
            ) : (
              roles.map((role) => (
                <div key={role.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-700">{role.name}</span>
                  <input
                    type="number"
                    min={0}
                    value={draftRequirements.get(role.id) ?? 0}
                    onChange={(e) => setDraftCount(role.id, Number(e.target.value))}
                    className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                    aria-label={`Minimum ${role.name} on ${requiresFor.label}`}
                  />
                </div>
              ))
            )}
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <Button variant="secondary" onClick={() => setRequiresFor(null)}>
                Cancel
              </Button>
              <Button disabled={pending} onClick={saveRequires}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
