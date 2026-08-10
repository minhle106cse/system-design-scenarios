import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

// PrismaTxRunner (and the TX_RUNNER binding) live in PrismaTxRunnerModule,
// not here: the runner needs SchedulerApiRepoFactory injected at
// construction — that factory spans every module. PrismaModule stays
// generic infra: the plain client only, usable by any read-side repository.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
