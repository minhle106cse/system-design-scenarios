import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseDemandCsv } from './demand-csv.parser'

describe('parseDemandCsv — the real file', () => {
  // `process.cwd()` is `apps/scheduler-api` under `jest` (package.json's `test` script), so the
  // repo-root `sample-data/` is two levels up — not counted from `__dirname`, which would need to
  // track this file's own nesting depth every time it moves.
  const csvPath = resolve(
    process.cwd(),
    '../../sample-data/report_Transaction_20260807_20260813.csv',
  )
  const realCsv = readFileSync(csvPath, 'utf-8')

  it('parses 112 cells totalling 3,058 transactions (sample-data/README.md)', () => {
    const result = parseDemandCsv(realCsv)

    expect(result.errors).toEqual([])
    expect(result.cells).toHaveLength(112)
    expect(result.cells.reduce((sum, c) => sum + c.transactions, 0)).toBe(3058)
  })

  it('finds the busiest cell — 64, 1pm Friday (dayOfWeek 5, hour 13)', () => {
    const result = parseDemandCsv(realCsv)
    const busiest = result.cells.find((c) => c.dayOfWeek === 5 && c.hour === 13)
    expect(busiest?.transactions).toBe(64)
  })

  it('reads Friday..Thursday columns into dayOfWeek 1..7, never by position', () => {
    const result = parseDemandCsv(realCsv)
    const days = new Set(result.cells.map((c) => c.dayOfWeek))
    expect(days).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]))
  })
})

describe('parseDemandCsv — malformed corpus (plan §4 / business requirements #9)', () => {
  it('never throws — an empty file is a located error, not an exception', () => {
    expect(() => parseDemandCsv('')).not.toThrow()
    const result = parseDemandCsv('')
    expect(result.errors).toEqual([{ row: 1, message: 'File is empty' }])
    expect(result.cells).toEqual([])
  })

  it('accepts a header-only file — warns, returns no cells, never throws', () => {
    const result = parseDemandCsv('Hour,Fri,Sat,Sun,Mon,Tue,Wed,Thu\n')
    expect(result.errors).toEqual([])
    expect(result.cells).toEqual([])
    expect(result.warnings.some((w) => w.message.includes('no data rows'))).toBe(true)
  })

  it("accepts the brief's idealised Hour,Fri,Sat,… layout, not only the real shape", () => {
    const csv = 'Hour,Fri,Sat,Sun,Mon,Tue,Wed,Thu\n7am,10,20,30,40,50,60,70\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.cells).toHaveLength(7)
    expect(result.cells.find((c) => c.dayOfWeek === 5)?.transactions).toBe(10) // Fri
  })

  it('handles a missing day column — warning, grid gap, not an error', () => {
    const csv = ',"Fri, 07 Aug","Sat, 08 Aug"\n7am,10,20\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.cells).toHaveLength(2)
    expect(result.warnings.some((w) => w.message.includes('Missing column for'))).toBe(true)
  })

  it('locates a non-numeric cell by row/column, does not silently coerce it', () => {
    const csv = ',"Fri, 07 Aug","Sat, 08 Aug"\n7am,ten,20\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([
      { row: 2, column: 2, message: '"ten" is not a whole number (Friday 7am)' },
    ])
    // The malformed column is dropped; the well-formed one is still imported.
    expect(result.cells).toEqual([{ dayOfWeek: 6, hour: 7, transactions: 20 }])
  })

  it('reorders columns freely — matched by weekday token, never by position', () => {
    const csv = ',"Sat, 08 Aug","Fri, 07 Aug"\n7am,20,10\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.cells).toContainEqual({ dayOfWeek: 5, hour: 7, transactions: 10 })
    expect(result.cells).toContainEqual({ dayOfWeek: 6, hour: 7, transactions: 20 })
  })

  it('keeps the later value on a duplicate hour row, with a warning', () => {
    const csv = ',"Fri, 07 Aug"\n7am,10\n7am,15\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.cells).toEqual([{ dayOfWeek: 5, hour: 7, transactions: 15 }])
    expect(result.warnings.some((w) => w.message.includes('Duplicate row'))).toBe(true)
  })

  it('skips an unreadable hour label with a located warning, not a thrown error', () => {
    const csv = ',"Fri, 07 Aug"\nnotanhour,10\n7am,20\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.cells).toEqual([{ dayOfWeek: 5, hour: 7, transactions: 20 }])
    expect(result.warnings.some((w) => w.row === 2 && w.column === 1)).toBe(true)
  })

  it('tolerates CRLF line endings', () => {
    const csv = ',"Fri, 07 Aug"\r\n7am,10\r\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.cells).toEqual([{ dayOfWeek: 5, hour: 7, transactions: 10 }])
  })

  it('rejects a negative transaction count as a located error', () => {
    const csv = ',"Fri, 07 Aug"\n7am,-3\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([
      { row: 2, column: 2, message: 'Transaction count cannot be negative (Friday 7am)' },
    ])
    expect(result.cells).toEqual([])
  })

  it('strips a leading UTF-8 BOM before parsing the title row', () => {
    const csv = '﻿"Aug 07, 2026 - Aug 13, 2026"\n,"Fri, 07 Aug"\n7am,10\n'
    const result = parseDemandCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.cells).toEqual([{ dayOfWeek: 5, hour: 7, transactions: 10 }])
  })
})
