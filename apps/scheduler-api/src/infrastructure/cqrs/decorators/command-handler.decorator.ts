import { SetMetadata } from '@nestjs/common'
import { COMMAND_HANDLER_METADATA } from '@scheduler/shared-kernel'

export const CommandHandler = (command: any): ClassDecorator => {
  return SetMetadata(COMMAND_HANDLER_METADATA, command)
}
