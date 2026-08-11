import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { CommandBus } from '@scheduler/shared-kernel'
import { createApp } from '@/app'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'
import { AppointmentSlotConflictError } from '@/common/errors/booking.error'
import { BookAppointmentCommand } from './book-appointment.command'
import { CancelAppointmentCommand } from '../cancel-appointment/cancel-appointment.command'

/**
 * The single most important test in this submission
 * (`docs/08_testing_and_qa_strategy.md`).
 *
 * `book-appointment.handler.spec.ts` proves the SELECTION logic with a mocked
 * repository — it cannot prove the concurrency guarantee, because that
 * guarantee lives in ADR-0002's Postgres exclusion constraints, which no mock
 * can stand in for. This file dispatches real `BookAppointmentCommand`s
 * through the real `CommandBus` → real transaction → real Postgres, against
 * fixture data created and torn down by the test itself (never the shared
 * `prisma/seed.ts` data, so this can run any number of times without
 * colliding with a demo database).
 *
 * Requires `docker compose up -d` + `npm run db:migrate` already done — see
 * `RUN.md`. Run with `npm run test:integration`, never `npm test`
 * (`jest.integration.config.js`'s own doc explains the separation).
 */
describe('BookAppointmentHandler (integration — real Postgres, ADR-0002)', () => {
  let app: NestFastifyApplication
  let commandBus: CommandBus
  let prisma: PrismaService
  let dealershipId: string
  let serviceTypeId: string
  let customerId: string
  let vehicleId: string

  beforeAll(async () => {
    app = await createApp()
    commandBus = app.get(CommandBus)
    prisma = app.get(PrismaService)

    // Exactly ONE bay and ONE technician — the smallest fixture that can
    // still prove the guarantee. With more than one of either, "both
    // concurrent requests raced for the SAME resource" would depend on
    // selection order instead of being forced by the fixture itself.
    const dealership = await prisma.client.dealership.create({
      data: { name: 'Integration Test Dealership' },
    })
    dealershipId = dealership.id

    await prisma.client.serviceBay.create({
      data: { dealershipId, label: 'Integration Bay' },
    })
    const technician = await prisma.client.technician.create({
      data: { dealershipId, name: 'Integration Technician' },
    })
    const serviceType = await prisma.client.serviceType.create({
      data: { name: 'Integration Service', durationMinutes: 30 },
    })
    serviceTypeId = serviceType.id
    await prisma.client.technicianServiceType.create({
      data: { technicianId: technician.id, serviceTypeId },
    })

    const customer = await prisma.client.customer.create({
      data: { name: 'Integration Customer', email: `int-test-${Date.now()}@example.com` },
    })
    customerId = customer.id
    const vehicle = await prisma.client.vehicle.create({
      data: { customerId, vin: `INTTEST${Date.now()}`, make: 'Test', model: 'Fixture', year: 2020 },
    })
    vehicleId = vehicle.id
  })

  afterAll(async () => {
    // Reverse dependency order — FKs are RESTRICT, not CASCADE
    // (directives/database_standard.md).
    await prisma.rawClient.appointment.deleteMany({ where: { dealershipId } })
    await prisma.rawClient.vehicle.deleteMany({ where: { customerId } })
    await prisma.rawClient.customer.deleteMany({ where: { id: customerId } })
    await prisma.rawClient.technicianServiceType.deleteMany({ where: { serviceTypeId } })
    await prisma.rawClient.technician.deleteMany({ where: { dealershipId } })
    await prisma.rawClient.serviceBay.deleteMany({ where: { dealershipId } })
    await prisma.rawClient.serviceType.deleteMany({ where: { id: serviceTypeId } })
    await prisma.rawClient.dealership.deleteMany({ where: { id: dealershipId } })
    await app.close()
  })

  it('lets exactly ONE of two simultaneous bookings for the same bay/window win', async () => {
    // Far-future window: never collides with `prisma/seed.ts` demo data or a
    // human poking the API on a dev machine at the same time.
    const startAt = new Date('2099-06-01T10:00:00.000Z')
    const dispatch = () =>
      commandBus.execute(
        new BookAppointmentCommand(customerId, vehicleId, dealershipId, serviceTypeId, startAt),
      )

    const results = await Promise.allSettled([dispatch(), dispatch()])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    // Not just "it failed" — it failed for the RIGHT reason: ADR-0002's
    // exclusion constraint, translated by PrismaAppointmentRepository.save(),
    // not a retry exhaustion or an unrelated error.
    const [{ reason }] = rejected as PromiseRejectedResult[]
    expect(reason).toBeInstanceOf(AppointmentSlotConflictError)
    expect((reason as AppointmentSlotConflictError).reason).toBe('service_bay_taken_concurrently')

    // The database, not just the command results, has exactly one row.
    const rows = await prisma.rawClient.appointment.findMany({
      where: { dealershipId, startAt, status: 'SCHEDULED' },
    })
    expect(rows).toHaveLength(1)
  })

  it('accepts back-to-back windows on the same bay/technician — the "[)" half-open boundary', async () => {
    const first = new Date('2099-06-02T10:00:00.000Z')
    const second = new Date('2099-06-02T10:30:00.000Z') // starts exactly when `first` ends

    const booking1 = await commandBus.execute(
      new BookAppointmentCommand(customerId, vehicleId, dealershipId, serviceTypeId, first),
    )
    const booking2 = await commandBus.execute(
      new BookAppointmentCommand(customerId, vehicleId, dealershipId, serviceTypeId, second),
    )

    expect(booking1.status).toBe('SCHEDULED')
    expect(booking2.status).toBe('SCHEDULED')
  })

  it('frees the slot on cancel — the same window can be booked again immediately', async () => {
    const startAt = new Date('2099-06-03T10:00:00.000Z')

    const booked = await commandBus.execute(
      new BookAppointmentCommand(customerId, vehicleId, dealershipId, serviceTypeId, startAt),
    )
    await commandBus.execute(new CancelAppointmentCommand(booked.id))
    const rebooked = await commandBus.execute(
      new BookAppointmentCommand(customerId, vehicleId, dealershipId, serviceTypeId, startAt),
    )

    expect(rebooked.status).toBe('SCHEDULED')
    expect(rebooked.id).not.toBe(booked.id)

    // Both rows persist — cancel is a soft state transition, not a delete
    // (docs/01_business_requirements.md § Assumptions).
    const rows = await prisma.rawClient.appointment.findMany({
      where: { dealershipId, startAt },
      orderBy: { createdAt: 'asc' },
    })
    expect(rows.map((r) => r.status)).toEqual(['CANCELLED', 'SCHEDULED'])
  })
})
