import type {
  CustomerRef,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository'
import type { Prisma } from '@/generated'

/** Transaction-scoped reader for the booking command — see `prisma-service-bay.repository.ts`'s doc. */
export class PrismaCustomerRepository implements ICustomerRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  async findById(customerId: string): Promise<CustomerRef | null> {
    return this.client.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    })
  }
}
