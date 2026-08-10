import type { IVehicleRepository, VehicleRef } from '../../domain/repositories/vehicle.repository'
import type { Prisma } from '@/generated'

/** Transaction-scoped reader for the booking command — see `prisma-service-bay.repository.ts`'s doc. */
export class PrismaVehicleRepository implements IVehicleRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  async findById(vehicleId: string): Promise<VehicleRef | null> {
    return this.client.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, customerId: true },
    })
  }
}
