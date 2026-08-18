'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSchedule, ApiError } from '@/lib/api-client'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'

/**
 * Brief §2.1's "create" half of `/` — a schedule with only a `name`. Client Component: the one
 * piece of `/` with interactivity (`directives/frontend_standard.md` §2). Shows a pending state
 * and either a success confirmation or a failure banner — never a silent no-op (§1 rule 3).
 */
export function CreateScheduleForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('pending')
    setError(null)
    try {
      const schedule = await createSchedule(name)
      // Auto-schedule seeds the two default shifts (brief §2.4) — Staff is a sensible landing
      // screen since it's the other input a manager fills in before running auto-schedule.
      router.push(`/s/${schedule.id}/staff`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the scheduling service.')
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Field
            id="schedule-name"
            label="New schedule name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Week of Aug 10"
            required
          />
        </div>
        <div className="self-end">
          <Button type="submit" disabled={status === 'pending'}>
            {status === 'pending' ? 'Creating…' : 'Create schedule'}
          </Button>
        </div>
      </div>

      {status === 'error' && (
        <Banner tone="error">Couldn&apos;t create the schedule: {error}</Banner>
      )}
    </form>
  )
}
