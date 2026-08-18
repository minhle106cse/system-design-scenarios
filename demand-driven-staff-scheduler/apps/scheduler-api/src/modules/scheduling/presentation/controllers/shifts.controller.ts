import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { CommandBus } from '@scheduler/shared-kernel'
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { AddShiftCommand } from '../../application/commands/add-shift/add-shift.command'
import { UpdateShiftCommand } from '../../application/commands/update-shift/update-shift.command'
import { RemoveShiftCommand } from '../../application/commands/remove-shift/remove-shift.command'
import {
  createShiftSchema,
  updateShiftSchema,
  type CreateShiftInput,
  type UpdateShiftInput,
} from '../schemas/shift.schema'

/** Brief §2.4 — add/edit/remove a shift (start time + end time only). */
@Controller('schedules/:scheduleId/shifts')
export class ShiftsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a shift (brief §2.4)' })
  add(
    @Param('scheduleId') scheduleId: string,
    @Body(new ZodValidationPipe(createShiftSchema)) body: CreateShiftInput,
  ) {
    return this.commandBus.execute(
      new AddShiftCommand(scheduleId, body.label, body.startMinute, body.endMinute),
    )
  }

  @Patch(':shiftId')
  @ApiOperation({ summary: 'Edit a shift (brief §2.4)' })
  update(
    @Param('shiftId') shiftId: string,
    @Body(new ZodValidationPipe(updateShiftSchema)) body: UpdateShiftInput,
  ) {
    return this.commandBus.execute(
      new UpdateShiftCommand(shiftId, body.label, body.startMinute, body.endMinute),
    )
  }

  @Delete(':shiftId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a shift (brief §2.4) — soft delete' })
  async remove(@Param('shiftId') shiftId: string): Promise<void> {
    await this.commandBus.execute(new RemoveShiftCommand(shiftId))
  }
}
