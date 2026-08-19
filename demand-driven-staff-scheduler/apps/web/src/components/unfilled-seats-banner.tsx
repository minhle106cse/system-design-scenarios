import type { Shift, UnfilledSeat } from '@/lib/api-client'
import { describeUnfilledSeat } from '@/lib/error-copy'
import { Banner } from '@/components/ui/banner'

const MAX_LISTED = 5

/**
 * Unfilled seats, rendered the same way on every screen that can surface them — Schedule (right
 * after a run) and Coverage (live, from the persisted roster). Factored out for the same reason
 * `role-diagnostics-banners.tsx` was: the two used to disagree with each other, and both were
 * wrong in their own way. Schedule printed the raw `ReasonCode` enum at the manager
 * (`WOULD_EXCEED_MAX_HOURS, UNAVAILABLE`), which `frontend_standard.md` §1 rule 1 forbids;
 * Coverage said only how many seats were short and told the reader to "check the Roster tab for
 * details" — a tab that has never shown them, and which by then no longer even held the
 * auto-schedule button. Neither screen needed a different tab: `Diagnostics.unfilledSeats` is
 * already in hand on both, so each states the reasons itself.
 */
export function UnfilledSeatsBanner({
  seats,
  shifts,
}: {
  readonly seats: readonly UnfilledSeat[]
  readonly shifts: readonly Shift[]
}) {
  if (seats.length === 0) return null
  const shiftById = new Map(shifts.map((s) => [s.id, s]))

  return (
    <Banner tone="warning">
      <p className="font-medium">
        {seats.length} shift-day seat(s) could not be filled by auto-schedule.
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {seats.slice(0, MAX_LISTED).map((seat, i) => (
          <li key={i}>{describeUnfilledSeat(seat, shiftById)}</li>
        ))}
      </ul>
      {seats.length > MAX_LISTED && (
        <p className="mt-1">
          …and {seats.length - MAX_LISTED} more. Adding staff, raising someone&apos;s weekly hours,
          or clearing an availability block are the three things that free a seat up.
        </p>
      )}
    </Banner>
  )
}
