import { Module } from '@nestjs/common'
import { SchedulesController } from './presentation/controllers/schedules.controller'
import { StaffController } from './presentation/controllers/staff.controller'
import { ShiftsController } from './presentation/controllers/shifts.controller'
import { DemandController } from './presentation/controllers/demand.controller'
import { RosterController } from './presentation/controllers/roster.controller'
import { CreateScheduleHandler } from './application/commands/create-schedule/create-schedule.handler'
import { AddStaffHandler } from './application/commands/add-staff/add-staff.handler'
import { UpdateStaffHandler } from './application/commands/update-staff/update-staff.handler'
import { RemoveStaffHandler } from './application/commands/remove-staff/remove-staff.handler'
import { AddShiftHandler } from './application/commands/add-shift/add-shift.handler'
import { UpdateShiftHandler } from './application/commands/update-shift/update-shift.handler'
import { RemoveShiftHandler } from './application/commands/remove-shift/remove-shift.handler'
import { ImportDemandHandler } from './application/commands/import-demand/import-demand.handler'
import { AddAssignmentHandler } from './application/commands/add-assignment/add-assignment.handler'
import { RemoveAssignmentHandler } from './application/commands/remove-assignment/remove-assignment.handler'
import { AutoScheduleHandler } from './application/commands/auto-schedule/auto-schedule.handler'
import { GetScheduleHandler } from './application/queries/get-schedule/get-schedule.handler'
import { GetSummaryHandler } from './application/queries/get-summary/get-summary.handler'
import { GetCoverageHandler } from './application/queries/get-coverage/get-coverage.handler'
import { PrismaSchedulingQueryRepository } from './infrastructure/repositories/prisma-scheduling.query-repository'
import { SCHEDULING_QUERY_REPOSITORY } from './application/queries/scheduling.query-repository'

/**
 * The scheduling domain module — mapped from `../service-appointment-scheduler`'s `BookingModule`
 * shape (backend-architecture-reversal.plan.md §3). Deliberately has no domain SERVICE layer the
 * way `booking`'s does — this domain's business logic already lives in the framework-free
 * `@scheduler/scheduling-core` package (ADR-0004); handlers here call into it directly rather than
 * re-deriving rules NestJS-side.
 *
 * Write-side handlers (`*Handler implements ITransactionalCommandHandler`) are discovered by
 * `CqrsModule`'s `@CommandHandler`/`@QueryHandler` decorators — nothing here registers them by
 * hand. Query-side reads through `ISchedulingQueryRepository` on the plain Prisma client
 * (`directives/cqrs_pattern.md` §2), bound below.
 *
 * Phase D (backend-architecture-reversal.plan.md §7) is now fully built — every write and read
 * surface tracked in PROJECT_STATUS.md is live.
 */
@Module({
  controllers: [
    SchedulesController,
    StaffController,
    ShiftsController,
    DemandController,
    RosterController,
  ],
  providers: [
    CreateScheduleHandler,
    AddStaffHandler,
    UpdateStaffHandler,
    RemoveStaffHandler,
    AddShiftHandler,
    UpdateShiftHandler,
    RemoveShiftHandler,
    ImportDemandHandler,
    AddAssignmentHandler,
    RemoveAssignmentHandler,
    AutoScheduleHandler,
    GetScheduleHandler,
    GetSummaryHandler,
    GetCoverageHandler,
    { provide: SCHEDULING_QUERY_REPOSITORY, useClass: PrismaSchedulingQueryRepository },
  ],
})
export class SchedulingModule {}
