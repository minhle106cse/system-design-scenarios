import type { AppointmentStatus } from '../../domain/entities/appointment.entity'

/**
 * The shape both `BookAppointmentHandler` and `CancelAppointmentHandler`
 * return — one appointment, with its bay and technician resolved to display
 * fields rather than left as bare ids, matching `docs/06_api_contracts.md`'s
 * response body for both endpoints.
 */
export interface AppointmentSummaryDto {
  readonly id: string
  /**
   * The domain union, not `string`. Widening it here silently discarded
   * exhaustiveness at the API boundary — a future handler could have returned
   * `'canceled'` and still compiled.
   */
  readonly status: AppointmentStatus
  readonly startAt: string
  readonly endAt: string
  readonly serviceBay: { readonly id: string; readonly label: string }
  readonly technician: { readonly id: string; readonly name: string }
}
