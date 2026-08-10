import { Global, Module } from '@nestjs/common'
import { TX_RUNNER } from '@scheduler/shared-kernel'
import { PrismaTxRunner } from './prisma-tx-runner'
import { SchedulerApiRepoFactory } from './scheduler-api-repos.factory'

/**
 * Global for the same reason PrismaModule/CqrsModule are: every module's
 * command handlers need TX_RUNNER wherever they boot, and Nest only shares a
 * provider across sibling top-level modules automatically when it's global.
 *
 * Split out of PrismaModule (generic ORM client, no domain knowledge)
 * because PrismaTxRunner needs SchedulerApiRepoFactory (spans every module's
 * repos) injected at construction — one repos factory for the whole
 * service.
 */
@Global()
@Module({
  providers: [
    SchedulerApiRepoFactory,
    PrismaTxRunner,
    { provide: TX_RUNNER, useExisting: PrismaTxRunner },
  ],
  exports: [PrismaTxRunner, TX_RUNNER],
})
export class PrismaTxRunnerModule {}
