import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import type { DemandCell } from '../../../domain/entities/demand-cell.entity'
import { parseDemandCsv, type DemandImportIssue } from './demand-csv.parser'
import { ImportDemandCommand } from './import-demand.command'

export interface ImportDemandResult {
  readonly cells: DemandCell[]
  readonly warnings: DemandImportIssue[]
  readonly errors: DemandImportIssue[]
}

/**
 * Brief §2.3 — CSV demand upload. Contract: `{ cells, warnings, errors }`, never a bare 500
 * (business-requirements.md #9). A re-import is a replacement, upsert on
 * `(scheduleId, dayOfWeek, hour)` (assumption 10) — only the rows the parser accepted as valid
 * are written; malformed rows are reported in `errors` and left out of the write entirely.
 */
@Injectable()
@CommandHandler(ImportDemandCommand)
export class ImportDemandHandler implements ITransactionalCommandHandler<
  ImportDemandCommand,
  ImportDemandResult,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: ImportDemandCommand, tx: SchedulerApiRepos): Promise<ImportDemandResult> {
    const schedule = await tx.schedules.findById(command.scheduleId)
    if (!schedule) throw new ScheduleNotFoundError(command.scheduleId)

    const { cells, warnings, errors } = parseDemandCsv(command.rawCsv)

    if (cells.length > 0) {
      await tx.demandCells.upsertMany(command.scheduleId, cells)
    }

    // Return the canonical persisted grid, not just the rows this import touched — a client
    // redrawing the heatmap needs the whole week, and a partial import leaves untouched cells in
    // place (assumption 10 upserts, it does not clear the rest of the grid).
    const persisted = await tx.demandCells.listByScheduleId(command.scheduleId)
    return { cells: persisted, warnings, errors }
  }
}
