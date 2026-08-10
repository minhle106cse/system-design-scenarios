import { randomUUID } from 'crypto'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { LightMyRequestResponse } from 'fastify'
import { createApp } from '@/app'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'
import type { AppointmentSummaryDto } from '../../application/commands/appointment-summary.dto'
import type { AvailabilityDto } from '../../application/queries/booking.dto'

/**
 * The contract `docs/06_api_contracts.md` publishes, exercised over HTTP.
 *
 * Every case below is a line that document promises a client. Before this file
 * existed each of them was verified once, by hand, with cURL, and then trusted:
 * the unit suite mocks the repositories away and the integration suite enters
 * below the controller, so nothing automated covered the Zod pipe, the
 * idempotency interceptor, `GlobalExceptionFilter`'s status mapping, or the
 * response envelope. A documented contract nothing executes is a comment.
 *
 * It earned its place immediately: the idempotency replay case below failed on
 * its first run, against code that had passed every gate and a manual cURL
 * check — the response row was persisted fire-and-forget, so a prompt retry
 * read `response: null` and got `409 in progress` for a request that had already
 * succeeded. See `IdempotencyInterceptor`'s comment on the fix.
 *
 * Uses Fastify's `inject()` rather than supertest — no listening socket, no
 * extra dependency, and `buildServer()` has already called `app.init()`.
 * `PrismaService` is imported directly for fixtures, which the presentation-layer
 * boundary rule would normally forbid; `eslint.config.mjs` exempts test files,
 * because setting up a row is not the same as a controller reaching for the ORM.
 *
 * Needs real Postgres (`docker compose up -d && npm run db:migrate`). Fixtures
 * are created and torn down here and never touch `prisma/seed.ts`'s demo data,
 * so this is safe to run against a database someone is also demoing on.
 */

/** What `ResponseInterceptor` / `GlobalExceptionFilter` actually put on the wire. */
interface Envelope<T> {
  readonly success: boolean
  readonly data: T
  readonly error: { readonly code: string; readonly details: Record<string, string> }
  readonly meta: { readonly requestId: string; readonly timestamp: string }
}

const envelope = <T>(response: LightMyRequestResponse): Envelope<T> => response.json<Envelope<T>>()

describe('Booking API (e2e — real HTTP pipeline, real Postgres)', () => {
  let app: NestFastifyApplication
  let prisma: PrismaService

  let dealershipId: string
  let serviceTypeId: string
  let customerId: string
  let vehicleId: string
  let otherCustomerId: string
  let otherVehicleId: string

  // 2099-06-01 is a Monday, far beyond both the seed data and any review
  // horizon — the write path rejects the past, so a near-future fixture would
  // turn these specs into a time bomb.
  const MONDAY = '2099-06-01'
  const SATURDAY = '2099-06-06'
  const at = (time: string) => `${MONDAY}T${time}:00.000Z`

  const post = (body: Record<string, unknown>, idempotencyKey = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/appointments',
      headers: { 'content-type': 'application/json', 'x-idempotency-key': idempotencyKey },
      payload: body,
    })

  const bookingBody = (startAt: string, overrides: Record<string, unknown> = {}) => ({
    customerId,
    vehicleId,
    dealershipId,
    serviceTypeId,
    startAt,
    ...overrides,
  })

  beforeAll(async () => {
    app = await createApp()
    await app.getHttpAdapter().getInstance().ready()
    prisma = app.get(PrismaService)

    const dealership = await prisma.client.dealership.create({ data: { name: 'E2E Dealership' } })
    dealershipId = dealership.id

    await prisma.client.serviceBay.create({ data: { dealershipId, label: 'E2E Bay' } })
    const technician = await prisma.client.technician.create({
      data: { dealershipId, name: 'E2E Technician' },
    })
    const serviceType = await prisma.client.serviceType.create({
      data: { name: `E2E Service ${Date.now()}`, durationMinutes: 30 },
    })
    serviceTypeId = serviceType.id
    await prisma.client.technicianServiceType.create({
      data: { technicianId: technician.id, serviceTypeId },
    })

    const customer = await prisma.client.customer.create({
      data: { name: 'E2E Customer', email: `e2e-${Date.now()}@example.com` },
    })
    customerId = customer.id
    const vehicle = await prisma.client.vehicle.create({
      data: { customerId, vin: `E2EVIN${Date.now()}`, make: 'Test', model: 'E2E', year: 2020 },
    })
    vehicleId = vehicle.id

    // A second customer with their own car — the only way to test that the
    // ownership rule is enforced rather than assumed.
    const otherCustomer = await prisma.client.customer.create({
      data: { name: 'E2E Other Customer', email: `e2e-other-${Date.now()}@example.com` },
    })
    otherCustomerId = otherCustomer.id
    otherVehicleId = (
      await prisma.client.vehicle.create({
        data: {
          customerId: otherCustomerId,
          vin: `E2EOTHER${Date.now()}`,
          make: 'Test',
          model: 'Other',
          year: 2021,
        },
      })
    ).id
  })

  afterAll(async () => {
    // Reverse dependency order — the FKs are RESTRICT, not CASCADE
    // (directives/database_standard.md).
    //
    // IdempotencyRecord rows are deliberately left alone: their keys are random
    // per request, so there is nothing to target precisely, and clearing the
    // table would delete records belonging to whoever else is using this
    // database. They expire on their own TTL via IdempotencyCleanupService.
    await prisma.rawClient.appointment.deleteMany({ where: { dealershipId } })
    await prisma.rawClient.vehicle.deleteMany({ where: { customerId } })
    await prisma.rawClient.vehicle.deleteMany({ where: { customerId: otherCustomerId } })
    await prisma.rawClient.customer.deleteMany({
      where: { id: { in: [customerId, otherCustomerId] } },
    })
    await prisma.rawClient.technicianServiceType.deleteMany({ where: { serviceTypeId } })
    await prisma.rawClient.technician.deleteMany({ where: { dealershipId } })
    await prisma.rawClient.serviceBay.deleteMany({ where: { dealershipId } })
    await prisma.rawClient.serviceType.deleteMany({ where: { id: serviceTypeId } })
    await prisma.rawClient.dealership.deleteMany({ where: { id: dealershipId } })
    await app.close()
  })

  describe('POST /api/v1/appointments', () => {
    it('creates an appointment and wraps it in the documented success envelope', async () => {
      const response = await post(bookingBody(at('09:00')))

      expect(response.statusCode).toBe(201)
      const body = envelope<AppointmentSummaryDto>(response)
      // The envelope is what a client actually receives — ResponseInterceptor
      // wraps every payload, so a spec asserting the bare DTO would be
      // describing a body that never appears on the wire.
      expect(body).toMatchObject({
        success: true,
        data: {
          status: 'SCHEDULED',
          startAt: at('09:00'),
          endAt: at('09:30'),
          serviceBay: { label: 'E2E Bay' },
          technician: { name: 'E2E Technician' },
        },
      })
      expect(body.meta).toEqual(
        expect.objectContaining({ requestId: expect.any(String), timestamp: expect.any(String) }),
      )
    })

    it('rejects a booking in the past with 400 VALIDATION_ERROR', async () => {
      const response = await post(bookingBody('2020-01-01T10:00:00.000Z'))

      expect(response.statusCode).toBe(400)
      expect(envelope(response).error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects an unknown vehicleId with 404, not 500', async () => {
      const response = await post(bookingBody(at('10:00'), { vehicleId: randomUUID() }))

      expect(response.statusCode).toBe(404)
      expect(envelope(response).error.code).toBe('VEHICLE_NOT_FOUND')
    })

    it("rejects another customer's vehicle with 422", async () => {
      const response = await post(bookingBody(at('10:30'), { vehicleId: otherVehicleId }))

      expect(response.statusCode).toBe(422)
      expect(envelope(response).error.code).toBe('VEHICLE_NOT_OWNED_BY_CUSTOMER')
    })

    it('rejects a closed day with 422 and reason closed_day', async () => {
      const response = await post(bookingBody(`${SATURDAY}T10:00:00.000Z`))

      expect(response.statusCode).toBe(422)
      const { error } = envelope(response)
      expect(error.code).toBe('APPOINTMENT_OUTSIDE_BUSINESS_HOURS')
      // The client reacts differently to "pick another date" than to "pick
      // another time", which is the whole reason `reason` exists.
      expect(error.details.reason).toBe('closed_day')
    })

    it('replays the first response for a repeated X-Idempotency-Key instead of double-booking', async () => {
      const key = randomUUID()
      const body = bookingBody(at('11:00'))

      const first = await post(body, key)
      const second = await post(body, key)

      expect(first.statusCode).toBe(201)
      // Not 409: the first request has COMPLETED, so "already in progress" would
      // be the wrong answer and would never hand the caller the appointment id.
      expect(second.statusCode).toBe(201)
      expect(envelope<AppointmentSummaryDto>(second).data.id).toBe(
        envelope<AppointmentSummaryDto>(first).data.id,
      )

      // The DB, not just the responses: a double-submitted form must leave one
      // row, and the second request must not have consumed the slot either.
      const rows = await prisma.rawClient.appointment.findMany({
        where: { dealershipId, startAt: new Date(at('11:00')), status: 'SCHEDULED' },
      })
      expect(rows).toHaveLength(1)
    })
  })

  describe('GET /api/v1/appointments/:id', () => {
    it('reads back the record that POST created, unchanged', async () => {
      const created = await post(bookingBody(at('12:00')))
      const { id } = envelope<AppointmentSummaryDto>(created).data

      const response = await app.inject({ method: 'GET', url: `/api/v1/appointments/${id}` })

      expect(response.statusCode).toBe(200)
      expect(envelope<AppointmentSummaryDto>(response).data).toEqual(
        envelope<AppointmentSummaryDto>(created).data,
      )
    })

    it('still returns the appointment after it is cancelled, with the new status', async () => {
      const created = await post(bookingBody(at('13:00')))
      const { id } = envelope<AppointmentSummaryDto>(created).data

      const cancelled = await app.inject({
        method: 'POST',
        url: `/api/v1/appointments/${id}/cancel`,
      })
      expect(cancelled.statusCode).toBe(200)

      const response = await app.inject({ method: 'GET', url: `/api/v1/appointments/${id}` })

      expect(response.statusCode).toBe(200)
      // Cancel is a state transition, not a delete — a 404 here would make the
      // two indistinguishable to a client.
      expect(envelope<AppointmentSummaryDto>(response).data.status).toBe('CANCELLED')
    })

    it('returns 404 for an unknown id and 400 for a malformed one', async () => {
      const unknown = await app.inject({
        method: 'GET',
        url: `/api/v1/appointments/${randomUUID()}`,
      })
      expect(unknown.statusCode).toBe(404)
      expect(envelope(unknown).error.code).toBe('APPOINTMENT_NOT_FOUND')

      const malformed = await app.inject({ method: 'GET', url: '/api/v1/appointments/not-a-uuid' })
      expect(malformed.statusCode).toBe(400)
      expect(envelope(malformed).error.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('GET /api/v1/availability', () => {
    it('returns slots for a real dealership and service type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/availability?dealershipId=${dealershipId}&serviceTypeId=${serviceTypeId}&date=${MONDAY}`,
      })

      expect(response.statusCode).toBe(200)
      const { data } = envelope<AvailabilityDto>(response)
      expect(data.durationMinutes).toBe(30)
      expect(data.availableSlots.length).toBeGreaterThan(0)
    })

    it('returns 404 for an unknown dealership rather than an empty slot list', async () => {
      // The defect this pins: an unknown id used to yield zero bays, so every
      // slot was filtered out and the caller got `200 {"availableSlots": []}` —
      // the same answer a fully booked day gives, while POST returned 404 for
      // the same id.
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/availability?dealershipId=${randomUUID()}&serviceTypeId=${serviceTypeId}&date=${MONDAY}`,
      })

      expect(response.statusCode).toBe(404)
      expect(envelope(response).error.code).toBe('DEALERSHIP_NOT_FOUND')
    })

    it('returns an empty list, not an error, for a closed day', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/availability?dealershipId=${dealershipId}&serviceTypeId=${serviceTypeId}&date=${SATURDAY}`,
      })

      expect(response.statusCode).toBe(200)
      expect(envelope<AvailabilityDto>(response).data.availableSlots).toEqual([])
    })
  })
})
