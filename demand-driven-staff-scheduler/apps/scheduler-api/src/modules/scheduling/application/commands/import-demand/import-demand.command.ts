import type { ICommand } from '@scheduler/shared-kernel'

export class ImportDemandCommand implements ICommand {
  readonly name = ImportDemandCommand.name

  constructor(
    readonly scheduleId: string,
    readonly rawCsv: string,
  ) {}
}
