import { makePrismaTransientErrorHelpers, isMarkedTransient } from './prisma-transient-error.js'

const knownRequestError = (code: string) =>
  Object.assign(new Error('mock'), { code, clientVersion: 'test' })

describe('makePrismaTransientErrorHelpers', () => {
  const { isTransient, recordObservation } = makePrismaTransientErrorHelpers({
    metricPrefix: `test_${Math.random().toString(36).slice(2)}`,
  })

  describe('isTransient', () => {
    it('returns true for P2034 (deadlock/write-conflict) — safe to retry', () => {
      expect(isTransient(knownRequestError('P2034'))).toBe(true)
    })

    it('returns false for P2028 (connection/pool issue) — do NOT retry, see resilience_patterns.md §3', () => {
      expect(isTransient(knownRequestError('P2028'))).toBe(false)
    })

    it('returns false for other known Prisma errors (e.g. P2002 unique constraint)', () => {
      expect(isTransient(knownRequestError('P2002'))).toBe(false)
    })

    it('returns false for errors that are not PrismaClientKnownRequestError', () => {
      expect(isTransient(new Error('boom'))).toBe(false)
    })

    it('returns true for a domain error declaring transient:true (e.g. a concurrency error)', () => {
      expect(isTransient({ transient: true })).toBe(true)
    })
  })

  describe('recordObservation', () => {
    it('does NOT throw when recording P2034/P2028/a plain error/another Prisma error', () => {
      expect(() => recordObservation(knownRequestError('P2034'), true)).not.toThrow()
      expect(() => recordObservation(knownRequestError('P2028'), false)).not.toThrow()
      expect(() => recordObservation(knownRequestError('P2002'), false)).not.toThrow()
      expect(() => recordObservation(new Error('boom'), false)).not.toThrow()
    })
  })
})

describe('isMarkedTransient', () => {
  it('returns true when the error declares transient: true', () => {
    expect(isMarkedTransient({ transient: true })).toBe(true)
  })

  it('returns false for a plain error or null/undefined', () => {
    expect(isMarkedTransient(new Error('boom'))).toBe(false)
    expect(isMarkedTransient(null)).toBe(false)
    expect(isMarkedTransient(undefined)).toBe(false)
  })
})
