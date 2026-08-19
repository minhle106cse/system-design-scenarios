'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addRole, updateRole, removeRole, type Role, type StaffRole } from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { Modal } from '@/components/ui/modal'

/**
 * Roles/skills (brief §8 stretch, D2) — their own tab, ahead of Staff in the nav.
 *
 * They used to live in a section at the bottom of the Staff tab, on the argument that they belong
 * where they are assigned. In practice a role has to EXIST before it can be ticked on anybody, so
 * that ordering made defining one a scroll to the end of a long staff table and back — the tab
 * order now matches the order of the work.
 *
 * Removing a role is a plain confirm rather than an inline click: the API cascades it off every
 * staff member and every shift requirement that names it, which is not recoverable from the UI.
 */
export function RolesManager({
  scheduleId,
  roles,
  staffRoles,
}: {
  readonly scheduleId: string
  readonly roles: readonly Role[]
  readonly staffRoles: readonly StaffRole[]
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** `null` = closed, `'new'` = creating, a Role = renaming it — the same one-modal shape the
   *  Staff tab uses, so both screens behave identically. */
  const [editorFor, setEditorFor] = useState<Role | 'new' | null>(null)
  const [name, setName] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<Role | null>(null)

  const holdersOf = (roleId: string) => staffRoles.filter((sr) => sr.roleId === roleId).length

  function openCreate() {
    setEditorFor('new')
    setName('')
    setError(null)
  }

  function openRename(role: Role) {
    setEditorFor(role)
    setName(role.name)
    setError(null)
  }

  async function submitEditor(e: React.FormEvent) {
    e.preventDefault()
    if (!editorFor) return
    setPending(true)
    setError(null)
    try {
      if (editorFor === 'new') {
        await addRole(scheduleId, name)
      } else {
        await updateRole(scheduleId, editorFor.id, name)
      }
      setEditorFor(null)
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
      await removeRole(scheduleId, confirmRemove.id)
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
        A role is a skill a shift can require — e.g. every Evening shift needs at least one
        Supervisor. Define them here, tick them per person on the <strong>Staff</strong> tab, and
        set how many each shift needs on <strong>Shifts</strong>. A person can hold more than one.
      </p>

      {error && <Banner tone="error">{error}</Banner>}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Roles</h2>
        <Button onClick={openCreate}>Add role</Button>
      </div>

      <DataTable
        columns={[
          {
            header: 'Role',
            render: (r) => <span className="font-medium text-slate-900">{r.name}</span>,
          },
          {
            header: 'Held by',
            render: (r) => {
              const count = holdersOf(r.id)
              return count === 0 ? (
                <span className="text-xs text-slate-400">Nobody yet</span>
              ) : (
                <Badge tone="good">
                  {count} {count === 1 ? 'person' : 'people'}
                </Badge>
              )
            },
          },
          {
            header: '',
            render: (r) => (
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => openRename(r)}>
                  Rename
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmRemove(r)}>
                  Remove
                </Button>
              </div>
            ),
          },
        ]}
        rows={roles}
        rowKey={(r) => r.id}
        emptyMessage="No roles yet — use Add role above. Roles are optional; a schedule works fine without them."
      />

      <Modal
        open={editorFor !== null}
        title={editorFor === 'new' ? 'Add role' : 'Rename role'}
        onClose={() => setEditorFor(null)}
      >
        <form onSubmit={submitEditor} className="space-y-3">
          <Field
            id="role-name"
            label="Role name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            hint="e.g. Supervisor, Barista, Keyholder."
            required
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => setEditorFor(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : editorFor === 'new' ? 'Add role' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={confirmRemove !== null}
        title="Remove role"
        onClose={() => setConfirmRemove(null)}
      >
        <p className="text-sm text-slate-600">
          Remove <span className="font-medium text-slate-900">{confirmRemove?.name}</span>? It will
          be cleared from everyone who holds it and from any shift that requires it.
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
