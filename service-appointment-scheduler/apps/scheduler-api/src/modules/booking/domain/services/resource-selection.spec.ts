import { countFree, selectFirstFree, type SelectableResource } from './resource-selection'

const bays: SelectableResource[] = [
  { id: 'bay-c', sortKey: 'Bay 3' },
  { id: 'bay-a', sortKey: 'Bay 1' },
  { id: 'bay-b', sortKey: 'Bay 2' },
]

describe('selectFirstFree', () => {
  it('picks the lowest-ordered candidate when everything is free', () => {
    expect(selectFirstFree(bays, new Set())?.id).toBe('bay-a')
  })

  it('is deterministic regardless of the order the candidates arrive in', () => {
    // A database has no guaranteed row order without ORDER BY. The assignment
    // must not depend on one.
    const reversed = [...bays].reverse()

    expect(selectFirstFree(reversed, new Set())?.id).toBe(selectFirstFree(bays, new Set())?.id)
  })

  it('skips busy candidates', () => {
    expect(selectFirstFree(bays, new Set(['bay-a', 'bay-b']))?.id).toBe('bay-c')
  })

  it('returns null when every candidate is busy', () => {
    expect(selectFirstFree(bays, new Set(['bay-a', 'bay-b', 'bay-c']))).toBeNull()
  })

  it('returns null when there are no candidates at all', () => {
    // A dealership with no bays, or no technician qualified for the service.
    expect(selectFirstFree([], new Set())).toBeNull()
  })

  it('breaks a tie on equal sort keys by id', () => {
    const duplicates: SelectableResource[] = [
      { id: 'bay-z', sortKey: 'Bay 1' },
      { id: 'bay-a', sortKey: 'Bay 1' },
    ]

    expect(selectFirstFree(duplicates, new Set())?.id).toBe('bay-a')
  })

  it('does not reorder the caller’s array', () => {
    const input = [...bays]

    selectFirstFree(input, new Set())

    expect(input.map((bay) => bay.id)).toEqual(['bay-c', 'bay-a', 'bay-b'])
  })
})

describe('countFree', () => {
  it('counts candidates not in the busy set', () => {
    expect(countFree(bays, new Set(['bay-b']))).toBe(2)
  })

  it('counts zero when all are busy', () => {
    expect(countFree(bays, new Set(['bay-a', 'bay-b', 'bay-c']))).toBe(0)
  })

  it('ignores busy ids that are not candidates', () => {
    // The busy set comes from a dealership-wide query; ids for resources that
    // were since soft-deleted must not push the count negative.
    expect(countFree(bays, new Set(['bay-unknown']))).toBe(3)
  })
})
