'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addStaff, removeStaff, updateStaff, ApiError, type StaffMember } from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
import { DataTable } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'

/** §2.2 — add/edit/remove staff, name + max weekly hours. `frontend_standard.md` §4's mutation
 *  pattern: pending state, success via `router.refresh()`, failure via a banner, never silent. */
export function StaffManager({
  scheduleId,
  staff,
}: {
  readonly scheduleId: string
  readonly staff: readonly StaffMember[]
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
    </div>
  )
}
