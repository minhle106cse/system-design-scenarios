import type {
  IServiceTypeRepository,
  ServiceTypeRef,
} from '../../domain/repositories/service-type.repository'
import type { Prisma } from '@/generated'

/** Transaction-scoped reader for the booking command — see `prisma-service-bay.repository.ts`'s doc. */
export class PrismaServiceTypeRepository implements IServiceTypeRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  async findById(serviceTypeId: string): Promise<ServiceTypeRef | null> {
    return this.client.serviceType.findUnique({
      where: { id: serviceTypeId },
      select: { id: true, name: true, durationMinutes: true },
    })
  }
}
