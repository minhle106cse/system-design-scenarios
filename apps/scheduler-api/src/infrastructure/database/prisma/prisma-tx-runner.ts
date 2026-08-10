import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { AbstractTxRunner } from '@scheduler/shared-kernel'
import type { Prisma } from '@/generated'
import { PrismaService } from './prisma.service'
import type { SchedulerApiRepos } from './scheduler-api-repos.factory'
import { SchedulerApiRepoFactory } from './scheduler-api-repos.factory'

const TRANSACTION_TIMEOUT_MS = 10_000

/**
 * The ONLY Prisma-specific line of the Unit-of-Work runner
 * (docs/adr/0001-transaction-retry-boundary.md) — opening the interactive
 * transaction. Everything else (nesting guard, transaction logging) lives in
 * `AbstractTxRunner` (shared-kernel), shared by every service instead of
 * copy-pasted into each one. This service has exactly ONE repos shape, so
 * the factory is a plain constructor dependency — no registry, no boot-time
 * registration step.
 */
@Injectable()
export class PrismaTxRunner extends AbstractTxRunner<SchedulerApiRepos, Prisma.TransactionClient> {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(PrismaTxRunner.name) logger: PinoLogger,
    factory: SchedulerApiRepoFactory,
  ) {
    super(logger, factory)
  }

  protected beginTransaction<R>(fn: (db: Prisma.TransactionClient) => Promise<R>): Promise<R> {
    return this.prisma.client.$transaction(fn, { timeout: TRANSACTION_TIMEOUT_MS })
  }
}
