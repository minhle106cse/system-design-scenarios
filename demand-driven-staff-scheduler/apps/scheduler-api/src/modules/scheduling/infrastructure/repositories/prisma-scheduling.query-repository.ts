import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'
import type {
  ISchedulingQueryRepository,
  ScheduleDetail,
} from '../../application/queries/scheduling.query-repository'
import type { AssignmentSource } from '../../domain/entities/assignment.entity'

@Injectable()
export class PrismaSchedulingQueryRepository implements ISchedulingQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Brief §2.1's "list" half of `/` — newest first, soft-deleted rows excluded by PrismaService's extension. */
  async findAllSchedules() {
    const rows = await this.prisma.client.schedule.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      transactionsPerStaffHour: schedule.transactionsPerStaffHour,
      minStaffWhenOpen: schedule.minStaffWhenOpen,
      maxStaffPerHour: schedule.maxStaffPerHour,
      minUtilisationTarget: schedule.minUtilisationTarget,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    }))
  }

  async findScheduleDetail(scheduleId: string): Promise<ScheduleDetail | null> {
    const schedule = await this.prisma.client.schedule.findUnique({ where: { id: scheduleId } })
    if (!schedule) return null

    const [staff, shifts, demandCells, assignments, latestRun] = await Promise.all([
      this.prisma.client.staffMember.findMany({ where: { scheduleId }, orderBy: { name: 'asc' } }),
      this.prisma.client.shift.findMany({ where: { scheduleId }, orderBy: { startMinute: 'asc' } }),
      this.prisma.client.demandCell.findMany({ where: { scheduleId } }),
      this.prisma.client.assignment.findMany({ where: { scheduleId } }),
      this.prisma.client.scheduleRun.findFirst({
        where: { scheduleId },
        orderBy: { generatedAt: 'desc' },
      }),
    ])

    return {
      schedule: {
        id: schedule.id,
        name: schedule.name,
        transactionsPerStaffHour: schedule.transactionsPerStaffHour,
        minStaffWhenOpen: schedule.minStaffWhenOpen,
        maxStaffPerHour: schedule.maxStaffPerHour,
        minUtilisationTarget: schedule.minUtilisationTarget,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt,
      },
      staff: staff.map((s) => ({
        id: s.id,
        scheduleId: s.scheduleId,
        name: s.name,
        maxWeeklyHours: s.maxWeeklyHours,
      })),
      shifts: shifts.map((s) => ({
        id: s.id,
        scheduleId: s.scheduleId,
        label: s.label,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
      })),
      demandCells: demandCells.map((c) => ({
        id: c.id,
        scheduleId: c.scheduleId,
        dayOfWeek: c.dayOfWeek,
        hour: c.hour,
        transactions: c.transactions,
      })),
      assignments: assignments.map((a) => ({
        id: a.id,
        scheduleId: a.scheduleId,
        staffId: a.staffId,
        shiftId: a.shiftId,
        dayOfWeek: a.dayOfWeek,
        source: a.source as AssignmentSource,
      })),
      latestRun: latestRun
        ? {
            id: latestRun.id,
            scheduleId: latestRun.scheduleId,
            generatedAt: latestRun.generatedAt,
            parameters: latestRun.parameters,
            diagnostics: latestRun.diagnostics,
          }
        : null,
    }
  }
}
