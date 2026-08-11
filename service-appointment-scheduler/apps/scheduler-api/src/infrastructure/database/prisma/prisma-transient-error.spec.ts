import { Prisma } from '@/generated'
import { isPrismaTransientError } from './prisma-transient-error'

function makeKnownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('mock', { code, clientVersion: 'test' })
}

describe('isPrismaTransientError', () => {
  it('returns true for P2034 (deadlock/write-conflict) — safe to retry', () => {
    expect(isPrismaTransientError(makeKnownRequestError('P2034'))).toBe(true)
  })

  it('returns false for P2028 (connection/pool issue) — do NOT retry, see directives/resilience_patterns.md', () => {
    expect(isPrismaTransientError(makeKnownRequestError('P2028'))).toBe(false)
  })

  it('returns false for other known Prisma errors (e.g. P2002 unique constraint)', () => {
    expect(isPrismaTransientError(makeKnownRequestError('P2002'))).toBe(false)
  })

  it('returns false for errors that are not PrismaClientKnownRequestError', () => {
    expect(isPrismaTransientError(new Error('boom'))).toBe(false)
  })
})
