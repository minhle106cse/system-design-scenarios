import type {
  ITechnicianRepository,
  TechnicianRef,
} from '../../domain/repositories/technician.repository'
import type { Prisma } from '@/generated'

/** Transaction-scoped reader for the booking command — see `prisma-service-bay.repository.ts`'s doc. */
export class PrismaTechnicianRepository implements ITechnicianRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  async findQualifiedByDealership(
    dealershipId: string,
    serviceTypeId: string,
  ): Promise<TechnicianRef[]> {
    return this.client.technician.findMany({
      where: { dealershipId, qualifications: { some: { serviceTypeId } } },
      select: { id: true, name: true },
    })
  }

  async findById(technicianId: string): Promise<TechnicianRef | null> {
    return this.client.technician.findUnique({
      where: { id: technicianId },
      select: { id: true, name: true },
    })
  }
}
