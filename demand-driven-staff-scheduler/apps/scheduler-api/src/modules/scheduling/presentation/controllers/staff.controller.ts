import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { CommandBus } from '@scheduler/shared-kernel'
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { AddStaffCommand } from '../../application/commands/add-staff/add-staff.command'
import { UpdateStaffCommand } from '../../application/commands/update-staff/update-staff.command'
import { RemoveStaffCommand } from '../../application/commands/remove-staff/remove-staff.command'
import {
  createStaffSchema,
  updateStaffSchema,
  type CreateStaffInput,
  type UpdateStaffInput,
} from '../schemas/staff.schema'

/** Brief §2.2 — add/edit/remove staff, name + max weekly hours. */
@Controller('schedules/:scheduleId/staff')
export class StaffController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a staff member (brief §2.2)' })
  add(
    @Param('scheduleId') scheduleId: string,
    @Body(new ZodValidationPipe(createStaffSchema)) body: CreateStaffInput,
  ) {
    return this.commandBus.execute(new AddStaffCommand(scheduleId, body.name, body.maxWeeklyHours))
  }

  @Patch(':staffId')
  @ApiOperation({ summary: 'Edit a staff member (brief §2.2)' })
  update(
    @Param('staffId') staffId: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
  ) {
    return this.commandBus.execute(new UpdateStaffCommand(staffId, body.name, body.maxWeeklyHours))
  }

  @Delete(':staffId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a staff member (brief §2.2) — soft delete' })
  async remove(@Param('staffId') staffId: string): Promise<void> {
    await this.commandBus.execute(new RemoveStaffCommand(staffId))
  }
}
