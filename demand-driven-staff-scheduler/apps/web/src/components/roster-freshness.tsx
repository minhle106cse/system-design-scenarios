'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { autoSchedule } from '@/lib/api-client'
import { describeApiError } from '@/lib/error-copy'
import type { RosterStatus } from '@/lib/staleness'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'

/**
 * Shown on Roster, Coverage, and Summary — every screen whose content traces back to the persisted
 * roster auto-schedule produced from a snapshot of staff/shifts/demand/roles/parameters.
 *
 * Coverage and Summary are read-only views of that roster. When an input changes afterwards their
 * figures stop describing a plan anyone actually asked for — and, worse, they change *unevenly*:
 * coverage recomputes `required` from `demand ÷ N` on every read, so it moves the moment N is
 * edited, while the summary's staff-hours come only from the roster and do not move at all. Roster
 * itself shows the actual assignments rather than derived figures, but without this banner it gives
 * no indication those assignments predate a later edit either — added after the user pointed out
 * the inconsistency of Coverage/Summary warning while the screen holding the roster stayed silent.
 * This banner makes that state explicit everywhere and offers the one action that resolves it,
 * instead of leaving the manager to notice drift on their own.
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
                <p className="mt-0.5">There&apos;s no roster yet — run auto-schedule to generate one.</p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  This roster was generated before you changed {status.changed.join(', ')}.
                </p>
                <p className="mt-0.5">
                  Nothing has been re-planned — what&apos;s shown below still describes the roster
                  you currently have. Recalculate to bring it in line with the new parameters.
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
