import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSchedule, importDemand, ApiError } from './api-client'

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

describe('api-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('unwraps `data` on a successful envelope', async () => {
    const schedule = { id: 's1', name: 'Week of Aug 10' }
    vi.stubGlobal('fetch', mockFetch(201, { success: true, data: schedule }))

    await expect(createSchedule('Week of Aug 10')).resolves.toEqual(schedule)
  })

  it('sends JSON with a Content-Type header for a plain object body', async () => {
    const fetchMock = mockFetch(201, { success: true, data: { id: 's1' } })
    vi.stubGlobal('fetch', fetchMock)

    await createSchedule('Week of Aug 10')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ name: 'Week of Aug 10' }))
  })

  it('throws ApiError with the server-reported code/message/details on a { success: false } envelope', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(422, {
        success: false,
        message: 'Assignment violates a scheduling constraint',
        error: { code: 'ROSTER_VIOLATION', details: { violations: [] } },
      }),
    )

    await expect(createSchedule('x')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'ROSTER_VIOLATION',
      statusCode: 422,
      message: 'Assignment violates a scheduling constraint',
    })
  })

  it('throws ApiError, not a raw parse crash, when the response body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('Unexpected token < in JSON')),
      }),
    )

    await expect(createSchedule('x')).rejects.toThrow(ApiError)
  })

  it('omits the JSON Content-Type header for a FormData body (the CSV import route)', async () => {
    const fetchMock = mockFetch(200, { success: true, data: { cells: [], warnings: [], errors: [] } })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['a,b\n1,2'], 'demand.csv', { type: 'text/csv' })
    await importDemand('s1', file)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({})
    expect(init.body).toBeInstanceOf(FormData)
  })
})
