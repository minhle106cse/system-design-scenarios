/**
 * Fetch wrapper against `apps/scheduler-api` — backend-architecture-reversal.plan.md §2's target
 * tree calls this out by name. `apps/web` owns no database and no business logic (Phase E): every
 * read and write goes through here, never `fetch` calls scattered across components
 * (`directives/frontend_standard.md` §4 — unchanged rule, just a different origin than the old
 * `apps/web/src/app/api/**` route handlers it used to hit).
 *
 * Types here are a deliberate, small duplication of `apps/scheduler-api`'s domain shapes
 * (`docs/06_api_contracts.md`) — this repo has no shared-types package between the two apps
 * (backend-architecture-reversal.plan.md §2 doesn't define one), and `scheduling-core`'s own types
 * are for the algorithm's internal `day`/`Roster` shape, not the wire format
 * (`dayOfWeek`/`Assignment` as Prisma rows return them) — importing them here would blur that line.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4102/api/v1'

/** Every non-2xx or `{ success: false }` response becomes this — callers get a typed reason,
 *  never a bare thrown string (`frontend_standard.md` §1 rule 3: a failed fetch must be a UI
 *  state a screen can render, not a swallowed exception). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface ApiEnvelope<T> {
  readonly success: boolean
  readonly data?: T
  readonly message?: string
  readonly error?: { readonly code: string; readonly details?: unknown }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
  })

  // A non-JSON body (a proxy's HTML error page, a network-level failure surfaced by the runtime)
  // must not crash the caller trying to read `.data` off `undefined` — it becomes an ApiError too.
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null

  if (!res.ok || !body?.success) {
    throw new ApiError(
      body?.error?.code ?? 'UNKNOWN_ERROR',
      body?.message ?? `Request failed with status ${res.status}`,
      res.status,
      body?.error?.details,
    )
  }
  return body.data as T
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

// ── Domain shapes — the wire format, docs/06_api_contracts.md ──────────────────────────────────

export interface Schedule {
  readonly id: string
  readonly name: string
  readonly transactionsPerStaffHour: number
  readonly minStaffWhenOpen: number
  readonly maxStaffPerHour: number | null
  readonly minUtilisationTarget: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface StaffMember {
  readonly id: string
  readonly scheduleId: string
  readonly name: string
  readonly maxWeeklyHours: number
}

export interface Shift {
  readonly id: string
  readonly scheduleId: string
  readonly label: string
  readonly startMinute: number
  readonly endMinute: number
}

export interface DemandCell {
  readonly id: string
  readonly scheduleId: string
  readonly dayOfWeek: number // 1 = Monday .. 7 = Sunday
  readonly hour: number // 0-23
  readonly transactions: number
}

export type AssignmentSource = 'AUTO' | 'MANUAL'

export interface Assignment {
  readonly id: string
  readonly scheduleId: string
  readonly staffId: string
  readonly shiftId: string
  readonly dayOfWeek: number
  readonly source: AssignmentSource
}

export interface ScheduleRun {
  readonly id: string
  readonly scheduleId: string
  readonly generatedAt: string
  readonly parameters: unknown
  readonly diagnostics: unknown
}

export interface ScheduleDetail {
  readonly schedule: Schedule
  readonly staff: readonly StaffMember[]
  readonly shifts: readonly Shift[]
  readonly demandCells: readonly DemandCell[]
  readonly assignments: readonly Assignment[]
  readonly latestRun: ScheduleRun | null
}

export type ReasonCode =
  | 'WOULD_EXCEED_MAX_HOURS'
  | 'OVERLAPS_EXISTING_SHIFT'
  | 'ALREADY_ASSIGNED'
  | 'UNAVAILABLE'

export interface Violation {
  readonly staffId: string
  readonly shiftId: string
  readonly day: number
  readonly reason: ReasonCode
}

export interface DemandImportIssue {
  readonly row: number
  readonly column?: number
  readonly message: string
}

export interface ImportDemandResult {
  readonly cells: readonly DemandCell[]
  readonly warnings: readonly DemandImportIssue[]
  readonly errors: readonly DemandImportIssue[]
}

export type HourCoverageStatus = 'UNDERSTAFFED' | 'OK' | 'OVERSTAFFED'

export interface HourDiagnostic {
  readonly day: number
  readonly hour: number
  readonly required: number
  readonly scheduled: number
  readonly status: HourCoverageStatus
}

export interface StaffDiagnostic {
  readonly staffId: string
  readonly assignedHours: number
  readonly maxWeeklyHours: number
  readonly utilisation: number
  readonly belowTarget: boolean
}

export interface UnfilledSeat {
  readonly day: number
  readonly shiftId: string
  readonly blockedReasons: readonly ReasonCode[]
}

export interface Diagnostics {
  readonly hours: readonly HourDiagnostic[]
  readonly staff: readonly StaffDiagnostic[]
  readonly unfilledSeats: readonly UnfilledSeat[]
  readonly structural: { readonly floorStaffHours: number; readonly contractedStaffHours: number }
}

export interface SummaryCell {
  readonly day: number
  readonly hour: number
  readonly transactions: number
  readonly staffHours: number
  readonly transactionsPerStaffHour: number | null
}

export interface SummaryReport {
  readonly cells: readonly SummaryCell[]
  readonly totalStaffHours: number
  readonly totalTransactions: number
  readonly transactionsPerStaffHourOverall: number | null
  readonly averageTransactionsPerStaffHour: number | null
}

// ── Schedules — brief §2.1 ──────────────────────────────────────────────────────────────────────

export function createSchedule(name: string): Promise<Schedule> {
  return request<Schedule>('/schedules', json({ name }))
}

export function getSchedule(scheduleId: string): Promise<ScheduleDetail> {
  return request<ScheduleDetail>(`/schedules/${scheduleId}`)
}

export function autoSchedule(scheduleId: string): Promise<{ roster: unknown; diagnostics: Diagnostics }> {
  return request(`/schedules/${scheduleId}/auto-schedule`, { method: 'POST' })
}

export function getSummary(scheduleId: string): Promise<SummaryReport> {
  return request<SummaryReport>(`/schedules/${scheduleId}/summary`)
}

export function getCoverage(scheduleId: string): Promise<Diagnostics> {
  return request<Diagnostics>(`/schedules/${scheduleId}/coverage`)
}

// ── Staff — brief §2.2 ───────────────────────────────────────────────────────────────────────────

export function addStaff(
  scheduleId: string,
  data: { name: string; maxWeeklyHours: number },
): Promise<StaffMember> {
  return request<StaffMember>(`/schedules/${scheduleId}/staff`, json(data))
}

export function updateStaff(
  scheduleId: string,
  staffId: string,
  data: { name?: string; maxWeeklyHours?: number },
): Promise<StaffMember> {
  return request<StaffMember>(`/schedules/${scheduleId}/staff/${staffId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function removeStaff(scheduleId: string, staffId: string): Promise<void> {
  return request<void>(`/schedules/${scheduleId}/staff/${staffId}`, { method: 'DELETE' })
}

// ── Shifts — brief §2.4 ──────────────────────────────────────────────────────────────────────────

export function addShift(
  scheduleId: string,
  data: { label: string; startMinute: number; endMinute: number },
): Promise<Shift> {
  return request<Shift>(`/schedules/${scheduleId}/shifts`, json(data))
}

export function updateShift(
  scheduleId: string,
  shiftId: string,
  data: { label?: string; startMinute?: number; endMinute?: number },
): Promise<Shift> {
  return request<Shift>(`/schedules/${scheduleId}/shifts/${shiftId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function removeShift(scheduleId: string, shiftId: string): Promise<void> {
  return request<void>(`/schedules/${scheduleId}/shifts/${shiftId}`, { method: 'DELETE' })
}

// ── Demand — brief §2.3 ──────────────────────────────────────────────────────────────────────────

/** `multipart/form-data`, not JSON — `request` skips the JSON content-type header for a `FormData` body. */
export function importDemand(scheduleId: string, file: File): Promise<ImportDemandResult> {
  const form = new FormData()
  form.set('file', file)
  return request<ImportDemandResult>(`/schedules/${scheduleId}/demand/import`, {
    method: 'POST',
    body: form,
  })
}

// ── Roster — manual editing, brief's stretch goal ───────────────────────────────────────────────

export function addAssignment(
  scheduleId: string,
  data: { staffId: string; shiftId: string; dayOfWeek: number },
): Promise<Assignment> {
  return request<Assignment>(`/schedules/${scheduleId}/roster/assignments`, json(data))
}

export function removeAssignment(scheduleId: string, assignmentId: string): Promise<void> {
  return request<void>(`/schedules/${scheduleId}/roster/assignments/${assignmentId}`, {
    method: 'DELETE',
  })
}
