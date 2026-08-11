/**
 * Business-hours arithmetic — the source of the slot grid `GET /availability`
 * returns, and the window check `POST /appointments` applies.
 *
 * Configuration, not a `DealershipOpeningHours` table: see
 * `docs/adr/0003-availability-and-selection-policy.md` §2.3. Consequence — ONE
 * schedule applies to every dealership.
 *
 * Pure TypeScript with no date library. `Intl` is a JavaScript builtin (Node 22
 * ships full ICU), so this stays inside the domain layer's "no external
 * libraries" rule while still being DST-correct — which hand-rolled offset
 * arithmetic would not be.
 *
 * A domain-service CLASS (`directives/domain_modeling.md` § Domain Services),
 * not a bag of exported functions — one door into everything this module knows
 * about business hours, constructed with the `BusinessHours` a request cares
 * about instead of threading it through every call. The three zone/calendar
 * primitives below stay `static`: each is independently and repeatedly tested
 * against several *different* zones/dates in `business-hours.spec.ts`, so they
 * are genuine standalone utilities, not per-instance state — making them
 * instance methods would force a fresh instance per zone under test for no
 * benefit.
 */

export interface BusinessHours {
  /** `HH:mm`, 24-hour, in `timeZone`. First bookable local time. */
  readonly start: string
  /** `HH:mm`. The latest local time a service may **end**, not start. */
  readonly end: string
  /** IANA zone, e.g. `Europe/London`. Validated at boot by the env schema. */
  readonly timeZone: string
  /** Step between candidate start times. Does NOT constrain duration. */
  readonly slotGranularityMinutes: number
  /** ISO weekdays the dealership opens: 1 = Monday … 7 = Sunday. */
  readonly days: readonly number[]
  /** One-off closures as `YYYY-MM-DD` local dates (public holidays, shutdowns). */
  readonly closedDates: readonly string[]
}

export interface TimeWindow {
  readonly startAt: Date
  readonly endAt: Date
}

/**
 * Why a window is not bookable, or `null` when it is.
 *
 * Two distinct reasons, because they call for different client behaviour:
 * `closed_day` means "try another date", `outside_hours` means "try another
 * time on this date". Collapsing them into one boolean forced the caller to
 * guess which advice to give.
 */
export type OutsideBusinessHoursReason = 'closed_day' | 'outside_hours'

const MS_PER_MINUTE = 60_000

export class BusinessHoursCalculator {
  constructor(private readonly hours: BusinessHours) {}

  /**
   * How far `timeZone` is ahead of UTC at a given instant, in milliseconds.
   *
   * Formats the instant into the zone's wall-clock parts, then reads those
   * parts back as if they were UTC. The difference is the offset — including
   * whatever DST rule was in force at that instant, which is precisely the
   * part that cannot be derived from a fixed offset.
   */
  private static zoneOffsetMs(instant: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(instant)

    const read = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value ?? '0')

    const asIfUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      // Some ICU versions render midnight as hour `24` under hour12:false.
      read('hour') % 24,
      read('minute'),
      read('second'),
    )

    return asIfUtc - instant.getTime()
  }

  /**
   * `2026-08-15` + `08:00` + `Europe/London` → the UTC instant that local time
   * refers to.
   *
   * Two passes, deliberately. The first guess uses the offset in force at the
   * *naive* timestamp, which is up to an hour wrong on a DST changeover day;
   * the second re-reads the offset at the instant the first pass produced. Two
   * passes converge everywhere except inside a skipped hour, where no valid
   * instant exists and any answer is a choice — this one lands just past the
   * gap.
   */
  static zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
    const [year, month, day] = date.split('-').map(Number)
    const [hour, minute] = time.split(':').map(Number)

    const naive = Date.UTC(year, month - 1, day, hour, minute)
    const firstPass = naive - BusinessHoursCalculator.zoneOffsetMs(new Date(naive), timeZone)

    return new Date(naive - BusinessHoursCalculator.zoneOffsetMs(new Date(firstPass), timeZone))
  }

  /** The local calendar day (`YYYY-MM-DD`) an instant falls on in `timeZone`. */
  static zonedDateOf(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant)

    const read = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? ''

    return `${read('year')}-${read('month')}-${read('day')}`
  }

  /**
   * ISO weekday (1 = Monday … 7 = Sunday) of a `YYYY-MM-DD` local date.
   *
   * Reads the date as UTC midnight purely as a calendar calculation — no zone
   * conversion is wanted here. "Is 2026-08-15 a Saturday?" has the same answer
   * everywhere; only the question of *which* local date an instant falls on is
   * zone-dependent, and `zonedDateOf` already answers that separately.
   */
  static isoWeekdayOf(date: string): number {
    const [year, month, day] = date.split('-').map(Number)
    const sundayZeroBased = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    return sundayZeroBased === 0 ? 7 : sundayZeroBased
  }

  /**
   * Drops windows that have already started.
   *
   * Takes `now` as a parameter rather than calling `new Date()` so the domain
   * stays pure and a spec can pin the clock without mocking a global. The
   * cutoff is `startAt`, not `endAt` — a slot beginning in five minutes is
   * still bookable; one that began five minutes ago is not. Static because it
   * carries no `BusinessHours` dependency at all — it is a generic window
   * filter that happens to live alongside the rest of this domain's window
   * arithmetic.
   */
  static filterFutureWindows(windows: readonly TimeWindow[], now: Date): TimeWindow[] {
    return windows.filter((window) => window.startAt.getTime() > now.getTime())
  }

  /**
   * Whether the dealership opens at all on a local calendar date.
   *
   * Two independent reasons to be closed, kept separate because they change
   * for different reasons: a recurring weekly pattern (`days`) and one-off
   * calendar closures (`closedDates`). A full per-country holiday calendar is
   * deliberately out of scope — `closedDates` is a hand-maintained list, and
   * the trigger for replacing it is recorded in
   * `docs/03_system_architecture_diagrams.md § Deferred scope`.
   */
  isBusinessDay(date: string): boolean {
    if (this.hours.closedDates.includes(date)) return false
    return this.hours.days.includes(BusinessHoursCalculator.isoWeekdayOf(date))
  }

  /** The open/close instants bounding a local calendar day. */
  businessDayBounds(date: string): TimeWindow {
    return {
      startAt: BusinessHoursCalculator.zonedTimeToUtc(date, this.hours.start, this.hours.timeZone),
      endAt: BusinessHoursCalculator.zonedTimeToUtc(date, this.hours.end, this.hours.timeZone),
    }
  }

  /**
   * Every window of `durationMinutes` that starts on the granularity grid and
   * still finishes before closing time.
   *
   * The grid controls where a service may START; its length always comes from
   * `ServiceType.durationMinutes`. That is why a 90-minute service simply runs
   * out of room earlier in the day than a 30-minute one, rather than being
   * rounded up to fill slots (ADR-0002 §4 rejected slot-rounding outright).
   */
  enumerateCandidateWindows(date: string, durationMinutes: number): TimeWindow[] {
    // A non-positive step would loop forever, and a non-positive duration is
    // not a service. Both are guarded upstream (Zod for the step, the seed/DB
    // for the duration); this is the cheap backstop that keeps a bad row from
    // hanging the request thread.
    if (this.hours.slotGranularityMinutes <= 0 || durationMinutes <= 0) return []

    // Closed day → no candidates at all, which the handler surfaces as an
    // empty `availableSlots` rather than an error: "we're shut that day" is a
    // valid answer to "what's free?", not a failure.
    if (!this.isBusinessDay(date)) return []

    const { startAt: open, endAt: close } = this.businessDayBounds(date)
    const step = this.hours.slotGranularityMinutes * MS_PER_MINUTE
    const duration = durationMinutes * MS_PER_MINUTE

    const windows: TimeWindow[] = []
    for (let start = open.getTime(); start + duration <= close.getTime(); start += step) {
      windows.push({ startAt: new Date(start), endAt: new Date(start + duration) })
    }

    return windows
  }

  /**
   * Checks a window against the business day it starts on.
   *
   * Without this, `GET /availability` would advertise 08:00–18:00 Mon–Fri
   * while `POST /appointments` happily booked 03:00 on a Sunday — the two
   * endpoints describing different systems. Note it deliberately does NOT
   * require the start to sit on the granularity grid: the grid is a
   * suggestion for browsing, and refusing an 08:05 booking that no resource
   * conflicts with would reject capacity for no reason.
   */
  checkBusinessHours(window: TimeWindow): OutsideBusinessHoursReason | null {
    const localDate = BusinessHoursCalculator.zonedDateOf(window.startAt, this.hours.timeZone)

    if (!this.isBusinessDay(localDate)) return 'closed_day'

    const { startAt: open, endAt: close } = this.businessDayBounds(localDate)
    const fits =
      window.startAt.getTime() >= open.getTime() && window.endAt.getTime() <= close.getTime()

    return fits ? null : 'outside_hours'
  }
}
