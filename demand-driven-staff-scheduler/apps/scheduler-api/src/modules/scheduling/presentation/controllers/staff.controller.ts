import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Put } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { CommandBus } from '@scheduler/shared-kernel'
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { AddStaffCommand } from '../../application/commands/add-staff/add-staff.command'
import { UpdateStaffCommand } from '../../application/commands/update-staff/update-staff.command'
import { RemoveStaffCommand } from '../../application/commands/remove-staff/remove-staff.command'
import { AddUnavailabilityCommand } from '../../application/commands/add-unavailability/add-unavailability.command'
import { RemoveUnavailabilityCommand } from '../../application/commands/remove-unavailability/remove-unavailability.command'
import { SetStaffRolesCommand } from '../../application/commands/set-staff-roles/set-staff-roles.command'
import {
  createStaffSchema,
  updateStaffSchema,
  type CreateStaffInput,
  type UpdateStaffInput,
} from '../schemas/staff.schema'
import {
  createUnavailabilitySchema,
  type CreateUnavailabilityInput,
} from '../schemas/unavailability.schema'
import { setStaffRolesSchema, type SetStaffRolesInput } from '../schemas/role.schema'

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

  @Post(':staffId/unavailability')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Add an availability block / day off for a staff member (brief §8 stretch, H4)',
  })
  addUnavailability(
    @Param('staffId') staffId: string,
    @Body(new ZodValidationPipe(createUnavailabilitySchema)) body: CreateUnavailabilityInput,
  ) {
    return this.commandBus.execute(
      new AddUnavailabilityCommand(staffId, body.dayOfWeek, body.startMinute, body.endMinute),
    )
  }

  @Delete(':staffId/unavailability/:windowId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove an availability block (brief §8 stretch, H4)' })
  async removeUnavailability(@Param('windowId') windowId: string): Promise<void> {
    await this.commandBus.execute(new RemoveUnavailabilityCommand(windowId))
  }

  @Put(':staffId/roles')
  @ApiOperation({ summary: "Replace this staff member's role set (brief §8 stretch, D2)" })
  setRoles(
    @Param('staffId') staffId: string,
    @Body(new ZodValidationPipe(setStaffRolesSchema)) body: SetStaffRolesInput,
  ) {
    return this.commandBus.execute(new SetStaffRolesCommand(staffId, body.roleIds))
  }
}
