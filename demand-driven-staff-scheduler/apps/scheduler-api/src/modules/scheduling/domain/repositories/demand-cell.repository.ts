import type { DemandCell } from '../entities/demand-cell.entity'

export interface DemandCellInput {
  readonly dayOfWeek: number
  readonly hour: number
  readonly transactions: number
}

export interface IDemandCellRepository {
  listByScheduleId(scheduleId: string): Promise<DemandCell[]>
  /** Upsert on (scheduleId, dayOfWeek, hour) — a re-import replaces, never appends (assumption 10). */
  upsertMany(scheduleId: string, cells: readonly DemandCellInput[]): Promise<void>
}
