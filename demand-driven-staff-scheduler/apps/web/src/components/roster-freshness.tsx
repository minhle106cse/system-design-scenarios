'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { autoSchedule } from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import type { RosterStatus } from '@/lib/staleness'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'

/**
 * Shown on Coverage and Summary, the two screens derived from the roster.
 *
 * Both are read-only views of a roster that auto-schedule produced from a snapshot of the
 * parameters. When those parameters change afterwards the figures stop describing a plan anyone
 * asked for — and, worse, they change *unevenly*: coverage recomputes `required` from `demand ÷ N`
 * on every read, so it moves the moment N is edited, while the summary's staff-hours come only
 * from the roster and do not move at all. This banner makes that state explicit and offers the one
 * action that resolves it, instead of leaving the manager to notice numbers drifting on their own.
 */
export function RosterFreshness({
  scheduleId,
  status,
}: {
  readonly scheduleId: string
  readonly status: RosterStatus
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status.kind === 'CURRENT') return null

  async function recalculate() {
    setPending(true)
    setError(null)
    try {
      await autoSchedule(scheduleId)
      router.refresh()
    } catch (err) {
      setError(describeApiError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <Banner tone="warning">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {status.kind === 'NEVER_RUN' ? (
              <>
                <p className="font-medium">Auto-schedule hasn&apos;t been run yet.</p>
                <p className="mt-0.5">
                  These figures describe an empty roster. Generate one to see real coverage.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  These figures are based on a roster generated before you changed{' '}
                  {status.changed.join(', ')}.
                </p>
                <p className="mt-0.5">
                  Nothing has been re-planned — the numbers below still describe the roster you
                  currently have. Recalculate to bring it in line with the new parameters.
                </p>
              </>
            )}
          </div>
          <Button onClick={() => void recalculate()} disabled={pending} className="shrink-0">
            {pending ? 'Recalculating…' : 'Recalculate roster'}
          </Button>
        </div>
      </Banner>
      {error && <Banner tone="error">{error}</Banner>}
    </div>
  )
}
