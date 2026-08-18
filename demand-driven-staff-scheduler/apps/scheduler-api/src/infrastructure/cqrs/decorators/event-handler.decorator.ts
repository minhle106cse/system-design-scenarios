import { SetMetadata } from '@nestjs/common'
import { EVENT_HANDLER_METADATA } from '@scheduler/shared-kernel'

export const EventHandler = (event: any): ClassDecorator => {
  return SetMetadata(EVENT_HANDLER_METADATA, event)
}
