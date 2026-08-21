import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'
import type {
  AppointmentDetail,
  BayCandidate,
  DealershipSummary,
  IBookingQueryRepository,
  OverlappingAppointment,
  ServiceTypeSummary,
  TechnicianCandidate,
} from '@/modules/booking/application/repositories/booking.query-repository'
import type { TimeWindow } from '@/modules/booking/domain/services/business-hours'

/**
 * Ordinary DI singleton on `PrismaService.client` (the plain, non-transactional,
 * soft-delete-aware client) — see `IBookingQueryRepository`'s doc for why this
 * is a separate class from the transaction-scoped booking-command readers.
 */
@Injectable()
export class PrismaBookingQueryRepository implements IBookingQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findServiceType(serviceTypeId: string): Promise<ServiceTypeSummary | null> {
    return this.prisma.client.serviceType.findUnique({
      where: { id: serviceTypeId },
      select: { id: true, durationMinutes: true },
    })
  }

  async findDealership(dealershipId: string): Promise<DealershipSummary | null> {
    return this.prisma.client.dealership.findUnique({
      where: { id: dealershipId },
      select: { id: true },
    })
  }

  async findDealershipBays(dealershipId: string): Promise<BayCandidate[]> {
    return this.prisma.client.serviceBay.findMany({
      where: { dealershipId },
      select: { id: true },
    })
  }

  async findQualifiedTechnicians(
    dealershipId: string,
    serviceTypeId: string,
  ): Promise<TechnicianCandidate[]> {
    return this.prisma.client.technician.findMany({
      where: { dealershipId, qualifications: { some: { serviceTypeId } } },
      select: { id: true },
    })
  }

  async findOverlappingAppointments(
    dealershipId: string,
    window: TimeWindow,
  ): Promise<OverlappingAppointment[]> {
    // Same half-open predicate as PrismaAppointmentRepository.findBusyResourceIds
    // — ADR-0003 §2.1's equivalence with the DB constraint applies here too.
    return this.prisma.client.appointment.findMany({
      where: {
        dealershipId,
        status: 'SCHEDULED',
        startAt: { lt: window.endAt },
        endAt: { gt: window.startAt },
      },
      select: { serviceBayId: true, technicianId: true, startAt: true, endAt: true },
    })
  }

  async findAppointmentById(appointmentId: string): Promise<AppointmentDetail | null> {
    // No `status` filter: every status is readable, including CANCELLED.
    // Soft-deleted rows are excluded by the extension on `client`, not here.
    return this.prisma.client.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        startAt: true,
        endAt: true,
        serviceBay: { select: { id: true, label: true } },
        technician: { select: { id: true, name: true } },
      },
    })
  }
}
