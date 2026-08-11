import { Appointment, AppointmentStatus } from './appointment.entity'

// `uuid` is ESM-only; the app's Jest runtime is CommonJS. Mocking it here also
// makes the generated id assertable — directives/testing_standard.md §4.
jest.mock('uuid', () => ({ v7: jest.fn(() => 'mock-uuid-v7') }))

describe('Appointment', () => {
  const baseProps = {
    customerId: 'customer-1',
    vehicleId: 'vehicle-1',
    dealershipId: 'dealership-1',
    serviceTypeId: 'service-type-1',
    serviceBayId: 'bay-1',
    technicianId: 'technician-1',
    startAt: new Date('2026-08-15T10:00:00.000Z'),
    durationMinutes: 30,
  }

  describe('createScheduled', () => {
    it('always produces a SCHEDULED appointment', () => {
      expect(Appointment.createScheduled(baseProps).status).toBe(AppointmentStatus.SCHEDULED)
    })

    it('generates its own id rather than accepting one', () => {
      // The caller has no way to supply an id — the factory signature omits it.
      expect(Appointment.createScheduled(baseProps).id).toBe('mock-uuid-v7')
    })

    it('derives endAt from the service duration', () => {
      const appointment = Appointment.createScheduled({ ...baseProps, durationMinutes: 90 })

      expect(appointment.endAt.toISOString()).toBe('2026-08-15T11:30:00.000Z')
    })

    it('cannot have its window moved by mutating the Date that was passed in', () => {
      const startAt = new Date('2026-08-15T10:00:00.000Z')
      const appointment = Appointment.createScheduled({ ...baseProps, startAt })

      startAt.setUTCFullYear(2030)

      expect(appointment.startAt.toISOString()).toBe('2026-08-15T10:00:00.000Z')
    })

    it('cannot have its window moved by mutating the Date it hands back', () => {
      const appointment = Appointment.createScheduled(baseProps)

      appointment.startAt.setUTCFullYear(2030)

      expect(appointment.startAt.toISOString()).toBe('2026-08-15T10:00:00.000Z')
    })
  })

  describe('cancel', () => {
    it('transitions a SCHEDULED appointment to CANCELLED', () => {
      const appointment = Appointment.createScheduled(baseProps)

      expect(appointment.cancel()).toBe('cancelled')
      expect(appointment.status).toBe(AppointmentStatus.CANCELLED)
    })

    it('is a no-op when already CANCELLED', () => {
      const appointment = Appointment.createScheduled(baseProps)
      appointment.cancel()

      // Cancel is the operation most likely to be retried over a flaky
      // connection, so a second call must be safe, not an error.
      expect(appointment.cancel()).toBe('already_cancelled')
      expect(appointment.status).toBe(AppointmentStatus.CANCELLED)
    })

    it('refuses to cancel a COMPLETED appointment and leaves it untouched', () => {
      const appointment = Appointment.rehydrate({
        id: 'appointment-1',
        customerId: 'customer-1',
        vehicleId: 'vehicle-1',
        dealershipId: 'dealership-1',
        serviceTypeId: 'service-type-1',
        serviceBayId: 'bay-1',
        technicianId: 'technician-1',
        startAt: new Date('2026-08-15T10:00:00.000Z'),
        endAt: new Date('2026-08-15T10:30:00.000Z'),
        status: AppointmentStatus.COMPLETED,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      })

      expect(appointment.cancel()).toBe('not_cancellable')
      expect(appointment.status).toBe(AppointmentStatus.COMPLETED)
    })
  })

  describe('rehydrate', () => {
    it('restores the persisted status verbatim, without re-validating it', () => {
      const appointment = Appointment.rehydrate({
        id: 'appointment-1',
        customerId: 'customer-1',
        vehicleId: 'vehicle-1',
        dealershipId: 'dealership-1',
        serviceTypeId: 'service-type-1',
        serviceBayId: 'bay-1',
        technicianId: 'technician-1',
        startAt: new Date('2026-08-15T10:00:00.000Z'),
        endAt: new Date('2026-08-15T10:30:00.000Z'),
        status: AppointmentStatus.CANCELLED,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      })

      expect(appointment.id).toBe('appointment-1')
      expect(appointment.status).toBe(AppointmentStatus.CANCELLED)
      expect(appointment.endAt.toISOString()).toBe('2026-08-15T10:30:00.000Z')
    })
  })
})
