import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { CommandBus } from '@scheduler/shared-kernel'
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { AddRoleCommand } from '../../application/commands/add-role/add-role.command'
import { UpdateRoleCommand } from '../../application/commands/update-role/update-role.command'
import { RemoveRoleCommand } from '../../application/commands/remove-role/remove-role.command'
import {
  createRoleSchema,
  updateRoleSchema,
  type CreateRoleInput,
  type UpdateRoleInput,
} from '../schemas/role.schema'

/** Brief §8 stretch — roles/skills, e.g. "a shift must include at least one supervisor" (D2).
 *  Per-schedule role CRUD; assigning a role to staff or requiring it on a shift are `PUT` routes
 *  on `StaffController`/`ShiftsController` instead (they're managed where they're assigned,
 *  `docs/05` — this controller stays the "define the roles that exist" half only). */
@Controller('schedules/:scheduleId/roles')
export class RolesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Add a role (brief §8 stretch, D2)' })
  add(
    @Param('scheduleId') scheduleId: string,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
  ) {
    return this.commandBus.execute(new AddRoleCommand(scheduleId, body.name))
  }

  @Patch(':roleId')
  @ApiOperation({ summary: 'Rename a role (brief §8 stretch, D2)' })
  update(
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ) {
    return this.commandBus.execute(new UpdateRoleCommand(roleId, body.name))
  }

  @Delete(':roleId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a role (brief §8 stretch, D2) — hard delete, cascades' })
  async remove(@Param('roleId') roleId: string): Promise<void> {
    await this.commandBus.execute(new RemoveRoleCommand(roleId))
  }
}
