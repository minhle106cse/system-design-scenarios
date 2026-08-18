import type { Prisma } from '@prisma/client'
import type {
  IDemandCellRepository,
  DemandCellInput,
} from '../../domain/repositories/demand-cell.repository'
import type { DemandCell } from '../../domain/entities/demand-cell.entity'

type DemandCellRow = {
  id: string
  scheduleId: string
  dayOfWeek: number
  hour: number
  transactions: number
}

function toDomain(row: DemandCellRow): DemandCell {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    dayOfWeek: row.dayOfWeek,
    hour: row.hour,
    transactions: row.transactions,
  }
}

export class PrismaDemandCellRepository implements IDemandCellRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async listByScheduleId(scheduleId: string): Promise<DemandCell[]> {
    const rows = await this.tx.demandCell.findMany({ where: { scheduleId } })
    return rows.map(toDomain)
  }

  async upsertMany(scheduleId: string, cells: readonly DemandCellInput[]): Promise<void> {
    // Upsert on (scheduleId, dayOfWeek, hour) — a re-import replaces, never appends (assumption
    // 10). Sequential upserts, not a batch API: Prisma has no native "upsert many" and this
    // dataset is at most 168 cells (24h x 7d) — sub-second either way.
    for (const cell of cells) {
      await this.tx.demandCell.upsert({
        where: {
          scheduleId_dayOfWeek_hour: { scheduleId, dayOfWeek: cell.dayOfWeek, hour: cell.hour },
        },
        create: {
          scheduleId,
          dayOfWeek: cell.dayOfWeek,
          hour: cell.hour,
          transactions: cell.transactions,
        },
        update: { transactions: cell.transactions },
      })
    }
  }
}
