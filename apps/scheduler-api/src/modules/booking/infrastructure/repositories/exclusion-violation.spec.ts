import { detectExclusionViolation } from './exclusion-violation'

// Shape verified against a real violation on Postgres via @prisma/adapter-pg —
// see this file's sibling doc comment. Not reconstructed from documentation.
function rawDatabaseError(constraintName: string) {
  return {
    code: 'P2039',
    clientVersion: '7.9.1',
    meta: {
      modelName: 'Appointment',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          code: '23P01',
          message: `conflicting key value violates exclusion constraint "${constraintName}"`,
        },
      },
    },
  }
}

describe('detectExclusionViolation', () => {
  it('identifies the service-bay constraint', () => {
    expect(detectExclusionViolation(rawDatabaseError('appointments_service_bay_no_overlap'))).toBe(
      'service_bay',
    )
  })

  it('identifies the technician constraint', () => {
    expect(detectExclusionViolation(rawDatabaseError('appointments_technician_no_overlap'))).toBe(
      'technician',
    )
  })

  it('returns undefined for an unrelated Prisma error (e.g. P2002 unique violation)', () => {
    expect(
      detectExclusionViolation({
        code: 'P2002',
        clientVersion: '7.9.1',
        meta: { modelName: 'Customer' },
      }),
    ).toBeUndefined()
  })

  it('returns undefined for a P2039 that is not a 23P01', () => {
    expect(
      detectExclusionViolation({
        code: 'P2039',
        clientVersion: '7.9.1',
        meta: { driverAdapterError: { cause: { code: '23505', message: 'duplicate key value' } } },
      }),
    ).toBeUndefined()
  })

  it('returns undefined for a 23P01 whose constraint name matches neither known constraint', () => {
    // A third exclusion constraint added later, not yet handled — must fail
    // loudly (rethrow upstream) rather than be silently mis-attributed.
    expect(detectExclusionViolation(rawDatabaseError('some_future_constraint'))).toBeUndefined()
  })

  it('returns undefined for a non-Prisma error', () => {
    expect(detectExclusionViolation(new Error('boom'))).toBeUndefined()
    expect(detectExclusionViolation(null)).toBeUndefined()
    expect(detectExclusionViolation('a string')).toBeUndefined()
  })
})
