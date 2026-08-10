import { Injectable } from '@nestjs/common'
import type { IRepoFactory } from '@scheduler/shared-kernel'
import { PrismaAppointmentRepository } from '@/modules/booking/infrastructure/repositories/prisma-appointment.repository'
import { PrismaServiceBayRepository } from '@/modules/booking/infrastructure/repositories/prisma-service-bay.repository'
import { PrismaTechnicianRepository } from '@/modules/booking/infrastructure/repositories/prisma-technician.repository'
import { PrismaServiceTypeRepository } from '@/modules/booking/infrastructure/repositories/prisma-service-type.repository'
import { PrismaCustomerRepository } from '@/modules/booking/infrastructure/repositories/prisma-customer.repository'
import { PrismaVehicleRepository } from '@/modules/booking/infrastructure/repositories/prisma-vehicle.repository'
import { PrismaDealershipRepository } from '@/modules/booking/infrastructure/repositories/prisma-dealership.repository'
import type { IAppointmentRepository } from '@/modules/booking/domain/repositories/appointment.repository'
import type { IServiceBayRepository } from '@/modules/booking/domain/repositories/service-bay.repository'
import type { ITechnicianRepository } from '@/modules/booking/domain/repositories/technician.repository'
import type { IServiceTypeRepository } from '@/modules/booking/domain/repositories/service-type.repository'
import type { ICustomerRepository } from '@/modules/booking/domain/repositories/customer.repository'
import type { IVehicleRepository } from '@/modules/booking/domain/repositories/vehicle.repository'
import type { IDealershipRepository } from '@/modules/booking/domain/repositories/dealership.repository'
import type { Prisma } from '@/generated'

/**
 * Write-side Unit of Work for the whole service (docs/adr/0001-transaction-retry-boundary.md).
 * One repos shape for the whole service, not one per module — see
 * shared-kernel's tx-scope.ts doc for why a per-module registry is the wrong
 * shape to reach for.
 *
 * `serviceBays`/`technicians`/`serviceTypes` are read-only inside this
 * transaction — they exist here (rather than as ordinary DI singletons)
 * because `BookAppointmentHandler`'s availability check must read them
 * transactionally-consistent, mid-flight, per `directives/cqrs_pattern.md`'s
 * "reads through the write repo, never a query-repo" rule. `GET /availability`
 * is a different reader entirely: `PrismaBookingQueryRepository` on the plain
 * client (`application/queries/booking.query-repository.ts`).
 */
export interface SchedulerApiRepos {
  readonly appointments: IAppointmentRepository
  readonly serviceBays: IServiceBayRepository
  readonly technicians: ITechnicianRepository
  readonly serviceTypes: IServiceTypeRepository
  readonly customers: ICustomerRepository
  readonly vehicles: IVehicleRepository
  readonly dealerships: IDealershipRepository
}

@Injectable()
export class SchedulerApiRepoFactory implements IRepoFactory<
  SchedulerApiRepos,
  Prisma.TransactionClient
> {
  // The transaction client is threaded straight into each repository's
  // constructor — this is the ONE place `Prisma.TransactionClient` is handed
  // out, which is what makes "a repository in here has a transaction" true by
  // construction rather than by convention (ADR-0001).
  create(tx: Prisma.TransactionClient): SchedulerApiRepos {
    return {
      appointments: new PrismaAppointmentRepository(tx),
      serviceBays: new PrismaServiceBayRepository(tx),
      technicians: new PrismaTechnicianRepository(tx),
      serviceTypes: new PrismaServiceTypeRepository(tx),
      customers: new PrismaCustomerRepository(tx),
      vehicles: new PrismaVehicleRepository(tx),
      dealerships: new PrismaDealershipRepository(tx),
    }
  }
}
