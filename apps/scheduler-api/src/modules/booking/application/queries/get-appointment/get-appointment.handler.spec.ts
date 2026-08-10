import { AppointmentNotFoundError } from '@/common/errors/booking.error'
import type { IBookingQueryRepository } from '../booking.query-repository'
import { GetAppointmentHandler } from './get-appointment.handler'
import { GetAppointmentQuery } from './get-appointment.query'

describe('GetAppointmentHandler', () => {
  let repo: jest.Mocked<IBookingQueryRepository>
  let handler: GetAppointmentHandler

  const query = new GetAppointmentQuery('appointment-1')
  const row = {
    id: 'appointment-1',
    status: 'SCHEDULED' as const,
    startAt: new Date('2099-06-01T08:00:00.000Z'),
    endAt: new Date('2099-06-01T08:30:00.000Z'),
    serviceBay: { id: 'bay-a', label: 'Bay A' },
    technician: { id: 'tech-a', name: 'Alice' },
  }

  beforeEach(() => {
    repo = {
      findServiceType: jest.fn(),
      findDealership: jest.fn(),
      findDealershipBays: jest.fn(),
      findQualifiedTechnicians: jest.fn(),
      findOverlappingAppointments: jest.fn(),
      findAppointmentById: jest.fn().mockResolvedValue(row),
    }

    handler = new GetAppointmentHandler(repo)
  })

  it('returns the appointment with its bay and technician resolved to display fields', async () => {
    const result = await handler.execute(query)

    // Exactly the shape POST /appointments returns — the three routes publish
    // one response schema, so a drift here would make that schema a lie.
    expect(result).toEqual({
      id: 'appointment-1',
      status: 'SCHEDULED',
      startAt: '2099-06-01T08:00:00.000Z',
      endAt: '2099-06-01T08:30:00.000Z',
      serviceBay: { id: 'bay-a', label: 'Bay A' },
      technician: { id: 'tech-a', name: 'Alice' },
    })
  })

  it('throws AppointmentNotFoundError when the id does not exist', async () => {
    repo.findAppointmentById.mockResolvedValue(null)

    await expect(handler.execute(query)).rejects.toThrow(AppointmentNotFoundError)
  })

  it('returns a CANCELLED appointment rather than treating it as absent', async () => {
    // Cancelling transitions status, it does not remove the record
    // (docs/01_business_requirements.md § Assumptions). A client that just
    // cancelled must be able to read back what it cancelled — hiding it behind
    // a 404 would make cancel look like a delete.
    repo.findAppointmentById.mockResolvedValue({ ...row, status: 'CANCELLED' })

    const result = await handler.execute(query)

    expect(result.status).toBe('CANCELLED')
  })

  it('does not open a transaction — it reads through the query repository', () => {
    // A query handler has no `kind` discriminator: `CommandBus` uses that field
    // to decide whether to open a transaction, and `QueryBus` never does
    // (ADR-0001). Pinning its absence keeps a later "just add kind" edit from
    // silently changing where this runs.
    expect('kind' in handler).toBe(false)
  })
})
