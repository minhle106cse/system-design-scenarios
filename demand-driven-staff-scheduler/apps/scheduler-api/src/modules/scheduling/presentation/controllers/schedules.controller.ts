import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { CommandBus, QueryBus } from '@scheduler/shared-kernel'
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { CreateScheduleCommand } from '../../application/commands/create-schedule/create-schedule.command'
import { UpdateScheduleCommand } from '../../application/commands/update-schedule/update-schedule.command'
import { AutoScheduleCommand } from '../../application/commands/auto-schedule/auto-schedule.command'
import { ListSchedulesQuery } from '../../application/queries/list-schedules/list-schedules.query'
import { GetScheduleQuery } from '../../application/queries/get-schedule/get-schedule.query'
import { GetSummaryQuery } from '../../application/queries/get-summary/get-summary.query'
import { GetCoverageQuery } from '../../application/queries/get-coverage/get-coverage.query'
import { SuggestNQuery } from '../../application/queries/suggest-n/suggest-n.query'
import {
  createScheduleSchema,
  type CreateScheduleInput,
  updateScheduleSchema,
  type UpdateScheduleInput,
} from '../schemas/create-schedule.schema'

/**
 * Translates HTTP into Commands/Queries and pushes them to the bus — never touches Prisma
 * directly (eslint-enforced, `directives/cqrs_pattern.md`).
 */
@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /** `GET /api/v1/schedules` — brief §2.1's "list" half of `/`. */
  @Get()
  @ApiOperation({ summary: 'List all schedules (brief §2.1)' })
  list() {
    return this.queryBus.execute(new ListSchedulesQuery())
  }

  /** `POST /api/v1/schedules` — brief §2.1. Seeds the two default shifts (brief §2.4). */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a schedule (brief §2.1)' })
  create(@Body(new ZodValidationPipe(createScheduleSchema)) body: CreateScheduleInput) {
    return this.commandBus.execute(new CreateScheduleCommand(body.name))
  }

  /** `GET /api/v1/schedules/:id` — the whole schedule: staff, shifts, demand, roster, latest run. */
  @Get(':id')
  @ApiOperation({ summary: 'Get a schedule (staff, shifts, demand, roster, latest run)' })
  get(@Param('id') id: string) {
    return this.queryBus.execute(new GetScheduleQuery(id))
  }

  /** `PATCH /api/v1/schedules/:id` — the parameter panel (`docs/05`'s Roster screen). */
  @Patch(':id')
  @ApiOperation({ summary: 'Update schedule parameters (N, min/max staff, fairness target)' })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateScheduleSchema)) body: UpdateScheduleInput,
  ) {
    return this.commandBus.execute(new UpdateScheduleCommand(id, body))
  }

  /** `GET /api/v1/schedules/:id/suggested-n` — "Suggest from data" (assumption 1). */
  @Get(':id/suggested-n')
  @ApiOperation({ summary: 'Suggest transactionsPerStaffHour from the imported demand data' })
  suggestedN(@Param('id') id: string) {
    return this.queryBus.execute(new SuggestNQuery(id))
  }

  /** `POST /api/v1/schedules/:id/auto-schedule` — brief §2.5, the heart of the exercise. */
  @Post(':id/auto-schedule')
  @HttpCode(200)
  @ApiOperation({ summary: 'Auto-schedule (brief §2.5) — generates the draft roster' })
  autoSchedule(@Param('id') id: string) {
    return this.commandBus.execute(new AutoScheduleCommand(id))
  }

  /** `GET /api/v1/schedules/:id/summary` — brief §2.6, the aggregated summary. */
  @Get(':id/summary')
  @ApiOperation({ summary: 'Get the aggregated summary (brief §2.6)' })
  summary(@Param('id') id: string) {
    return this.queryBus.execute(new GetSummaryQuery(id))
  }

  /** `GET /api/v1/schedules/:id/coverage` — brief §8 stretch, required vs scheduled per hour. */
  @Get(':id/coverage')
  @ApiOperation({
    summary: 'Get the coverage view (brief §8 stretch) — required vs scheduled per hour',
  })
  coverage(@Param('id') id: string) {
    return this.queryBus.execute(new GetCoverageQuery(id))
  }
}
