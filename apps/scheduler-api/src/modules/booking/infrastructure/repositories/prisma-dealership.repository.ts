import type {
  DealershipRef,
  IDealershipRepository,
} from '../../domain/repositories/dealership.repository'
import type { Prisma } from '@/generated'

/** Transaction-scoped reader for the booking command — see `prisma-service-bay.repository.ts`'s doc. */
export class PrismaDealershipRepository implements IDealershipRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  async findById(dealershipId: string): Promise<DealershipRef | null> {
    return this.client.dealership.findUnique({
      where: { id: dealershipId },
      select: { id: true },
    })
  }
}
