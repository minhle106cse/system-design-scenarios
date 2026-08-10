import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { LogContext } from '@scheduler/shared-kernel'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'

/**
 * Nightly reaper for expired idempotency keys. The IdempotencyInterceptor
 * stores each key with a 24h TTL but never deletes; without this the table
 * grows unbounded (directives/resilience_patterns.md).
 *
 * NOTE: Cortex's version of this file also registers itself with a
 * ScheduledJobRegistry (infrastructure/scheduled-jobs/) that tracks every
 * cron job's schedule/last-run/failure state for an ops dashboard. That
 * registry is not ported (.ai/plans/init-source.plan.md §8 — no scheduled-jobs infra at
 * T1/T2, this is the only cron job this service has). If a second scheduled
 * job is ever added, port the registry then rather than duplicating
 * ad-hoc tracking across jobs.
 */
@Injectable()
export class IdempotencyCleanupService {
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(IdempotencyCleanupService.name) private readonly logger: PinoLogger,
  ) {}

  @Cron('0 3 * * *') // 03:00 daily
  async purgeExpired(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      const { count } = await this.prisma.client.idempotencyRecord.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      })
      if (count > 0) {
        this.logger.info(
          { context: LogContext.IDEMPOTENCY, purged: count },
          'Purged expired idempotency records',
        )
      }
    } catch (err) {
      this.logger.error(
        { context: LogContext.IDEMPOTENCY, err },
        'Idempotency cleanup tick failed unexpectedly',
      )
    } finally {
      this.running = false
    }
  }
}
