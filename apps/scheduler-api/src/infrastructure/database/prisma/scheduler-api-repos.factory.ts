import { Injectable } from '@nestjs/common'
import type { IRepoFactory } from '@scheduler/shared-kernel'
import type { Prisma } from '@/generated'

/**
 * Write-side Unit of Work for the whole service (docs/adr/0001-transaction-retry-boundary.md).
 * One repos shape for the whole service, not one per module — see
 * shared-kernel's tx-scope.ts doc for why a per-module registry is the wrong
 * shape to reach for.
 *
 * Empty at init — no business logic yet (.ai/plans/init-source.plan.md §8, "No business logic
 * during init"). Once the scheduler domain exists, its write repositories
 * (e.g. `appointments: IAppointmentRepository`) are added here, and
 * `SchedulerApiRepoFactory.create()` constructs them from the open
 * transaction client — never from a bare PrismaService — which is what makes
 * "a write repository has a transaction" true by construction rather than by
 * convention (ADR-0001).
 */
// Deliberately empty at init (.ai/plans/init-source.plan.md §8); repo fields are added here as
// the scheduler domain's write repositories are written, same shape as
// Cortex's CoreApiRepos.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SchedulerApiRepos {}

@Injectable()
export class SchedulerApiRepoFactory implements IRepoFactory<
  SchedulerApiRepos,
  Prisma.TransactionClient
> {
  // `tx` is unused only because there are no repos to construct yet; every
  // real repo added here will take it as a constructor arg, exactly like
  // PrismaKnowledgeItemRepository(tx) does in Cortex's core-api-repos.factory.ts.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  create(tx: Prisma.TransactionClient): SchedulerApiRepos {
    return {}
  }
}
