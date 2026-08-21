import type {
  IServiceBayRepository,
  ServiceBayRef,
} from '../../domain/repositories/service-bay.repository'
import type { Prisma } from '@/generated'

/**
 * Takes the OPEN TRANSACTION client, same as `PrismaAppointmentRepository` —
 * this reader exists for `BookAppointmentHandler`'s mid-flight availability
 * check, which must see this transaction's own view of the data
 * (`directives/cqrs_pattern.md`'s "read the source of truth" rule). It is
 * built by `SchedulerApiRepoFactory.create(tx)`, never by NestJS DI.
 *
 * `GET /availability` does NOT use this class — it has no transaction and must
 * not open one. It goes through `PrismaBookingQueryRepository` instead
 * (`application/repositories/booking.query-repository.ts`), the query-side reader
 * on the plain client. Two classes, not one with an optional client, because
 * the query-side reader answers a different question (a whole day's worth of
 * candidates at once) rather than reusing this one's single-dealership shape.
 */
export class PrismaServiceBayRepository implements IServiceBayRepository {
  constructor(private readonly client: Prisma.TransactionClient) {}

  async findByDealership(dealershipId: string): Promise<ServiceBayRef[]> {
    return this.client.serviceBay.findMany({
      where: { dealershipId },
      select: { id: true, label: true },
    })
  }

  async findById(serviceBayId: string): Promise<ServiceBayRef | null> {
    return this.client.serviceBay.findUnique({
      where: { id: serviceBayId },
      select: { id: true, label: true },
    })
  }
}
