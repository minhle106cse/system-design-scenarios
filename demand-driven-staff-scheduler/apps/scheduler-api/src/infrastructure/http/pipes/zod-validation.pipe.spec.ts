import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'
import { ZodValidationPipe } from './zod-validation.pipe'

// These tests exist because the pipe and GlobalExceptionFilter are coupled by
// three untyped string keys (`code`, `message`, `errors`). Nothing in the type
// system connects them, so a rename on either side is silent — that is exactly
// the bug these assertions were written to lock down.
describe('ZodValidationPipe', () => {
  const schema = z.object({
    startAt: z.string(),
    count: z.number().int().positive(),
  })

  it('returns the parsed value when the input is valid', () => {
    const pipe = new ZodValidationPipe(schema)

    expect(pipe.transform({ startAt: '2026-08-15T10:00:00Z', count: 2 })).toEqual({
      startAt: '2026-08-15T10:00:00Z',
      count: 2,
    })
  })

  it('returns the COERCED value, not the raw input', () => {
    const pipe = new ZodValidationPipe(z.object({ count: z.coerce.number() }))

    // Query-string values arrive as strings; the handler must receive a number.
    expect(pipe.transform({ count: '30' })).toEqual({ count: 30 })
  })

  it('throws BadRequestException on invalid input', () => {
    const pipe = new ZodValidationPipe(schema)

    expect(() => pipe.transform({ startAt: 1, count: -1 })).toThrow(BadRequestException)
  })

  it('uses the response keys GlobalExceptionFilter actually reads', () => {
    const pipe = new ZodValidationPipe(schema)

    let response: unknown
    try {
      pipe.transform({ startAt: 1, count: -1 })
    } catch (error) {
      response = (error as BadRequestException).getResponse()
    }

    // `code` (not `errorCode`) is what the filter looks for to override the
    // status-derived default, and `message` is what it puts in the body.
    expect(response).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
    })
  })

  it('reports the offending fields under `errors`', () => {
    const pipe = new ZodValidationPipe(schema)

    let response: { errors?: Record<string, string[]> } = {}
    try {
      pipe.transform({ startAt: 1, count: -1 })
    } catch (error) {
      response = (error as BadRequestException).getResponse() as typeof response
    }

    // The filter copies `errors` into the body's `error.details`, so a client
    // can tell WHICH field failed, not just that something did.
    expect(Object.keys(response.errors ?? {}).sort()).toEqual(['count', 'startAt'])
  })
})
