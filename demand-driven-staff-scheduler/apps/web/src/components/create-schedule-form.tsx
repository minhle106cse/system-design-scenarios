'use client'

import { useState } from 'react'
import { createSchedule, ApiError, type Schedule } from '@/lib/api-client'

/**
 * Brief §2.1's "create" half of `/` — a schedule with only a `name`. Client Component: the one
 * piece of `/` with interactivity (`directives/frontend_standard.md` §2). Shows a pending state
 * and either a success confirmation or a failure banner — never a silent no-op (§1 rule 3).
 */
export function CreateScheduleForm() {
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const [created, setCreated] = useState<Schedule | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('pending')
    setError(null)
    try {
      const schedule = await createSchedule(name)
      setCreated(schedule)
      setStatus('success')
      setName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the scheduling service.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-3">
      <label htmlFor="schedule-name" className="block text-sm font-medium text-slate-700">
        New schedule name
      </label>
      <div className="flex gap-2">
        <input
          id="schedule-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Week of Aug 10"
          required
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === 'pending'}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {status === 'pending' ? 'Creating…' : 'Create schedule'}
        </button>
      </div>

      {status === 'success' && created && (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          Created &ldquo;{created.name}&rdquo; ({created.id}). Staff/shift/demand/roster screens
          land in Phase 3 — this confirms `apps/web` reaches `apps/scheduler-api` end to end.
        </p>
      )}
      {status === 'error' && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Couldn&apos;t create the schedule: {error}
        </p>
      )}
    </form>
  )
}
