import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { CommandBus } from '@scheduler/shared-kernel'
import type { DayOfWeek } from '@scheduler/scheduling-core'
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { AddAssignmentCommand } from '../../application/commands/add-assignment/add-assignment.command'
import { RemoveAssignmentCommand } from '../../application/commands/remove-assignment/remove-assignment.command'
import { createAssignmentSchema, type CreateAssignmentInput } from '../schemas/assignment.schema'

/** Manual roster editing (brief's stretch goal) — one assignment at a time, through the same `FeasibilityGate` auto-schedule uses. */
@Controller('schedules/:scheduleId/roster')
export class RosterController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('assignments')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Add one manual assignment — 422 with Violation[] if the gate refuses it',
  })
  add(
    @Param('scheduleId') scheduleId: string,
    @Body(new ZodValidationPipe(createAssignmentSchema)) body: CreateAssignmentInput,
  ) {
    return this.commandBus.execute(
      new AddAssignmentCommand(scheduleId, body.staffId, body.shiftId, body.dayOfWeek as DayOfWeek),
    )
  }

  @Delete('assignments/:assignmentId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove one assignment' })
  async remove(@Param('assignmentId') assignmentId: string): Promise<void> {
    await this.commandBus.execute(new RemoveAssignmentCommand(assignmentId))
  }
}
