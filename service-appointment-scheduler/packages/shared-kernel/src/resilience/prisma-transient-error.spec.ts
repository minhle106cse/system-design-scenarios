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

    it('counts a domain error marked transient:true under code="A2001" — regression: isTransient retried it while recordObservation stayed silent (ADR-0001 §9d)', async () => {
      // Own instance, own metric prefix: prom-client's default registry throws
      // on a duplicate Counter name, so this can't reuse the describe-block's
      // shared `recordObservation` and still read back a clean count of only
      // this test's increments.
      const { register } = await import('prom-client')
      const metricPrefix = `test_marked_${Math.random().toString(36).slice(2)}`
      const helpers = makePrismaTransientErrorHelpers({ metricPrefix })
      const markedTransientError = { transient: true as const }

      // isTransient already retried this before the fix — assert it again here
      // so the two assertions stay pinned to the SAME input, not drift into
      // two predicates that quietly stop agreeing with each other.
      expect(helpers.isTransient(markedTransientError)).toBe(true)
      expect(() => helpers.recordObservation(markedTransientError, true)).not.toThrow()

      const metric = await register.getSingleMetricAsString(
        `${metricPrefix}_db_transient_error_total`,
      )
      expect(metric).toContain('code="A2001"')
      expect(metric).toContain('retried="true"')
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
