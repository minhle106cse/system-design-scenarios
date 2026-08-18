import type { ICommand } from '@scheduler/shared-kernel'

export class RemoveAssignmentCommand implements ICommand {
  readonly name = RemoveAssignmentCommand.name

  constructor(readonly assignmentId: string) {}
}
