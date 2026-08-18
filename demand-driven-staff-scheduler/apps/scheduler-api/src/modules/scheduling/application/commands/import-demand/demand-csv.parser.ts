import type { DemandCellInput } from '../../../domain/repositories/demand-cell.repository'

/**
 * The real quoted-field CSV parser CLAUDE.md's hard rules require — the file's day labels contain
 * a comma inside quotes (`"Fri, 07 Aug"`), which `line.split(',')` shreds. Plan §4 / this repo's
 * `sample-data/README.md`. Pure TypeScript, no dependency — this lives in `application/`, not
 * `scheduling-core` (parsing/validation is not "the algorithm", `directives/domain_modeling.md`).
 */

export interface DemandImportIssue {
  /** 1-based row number in the parsed CSV (title/blank rows count, matching a spreadsheet's view). */
  readonly row: number
  /** 1-based column number, absent when the issue is row-level (e.g. an unreadable hour label). */
  readonly column?: number
  readonly message: string
}

export interface DemandCsvParseResult {
  readonly cells: DemandCellInput[]
  readonly warnings: DemandImportIssue[]
  readonly errors: DemandImportIssue[]
}

const WEEKDAY_TOKENS: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
}
const WEEKDAY_NAMES = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/** RFC4180-lite: quoted fields, `""` escapes a literal quote, CRLF or bare LF line endings. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** `"Fri, 07 Aug"` → 5. Matched by weekday TOKEN, never by column position (assumption 8). */
function extractWeekday(cell: string): number | null {
  const match = /\b(mon|tue|wed|thu|fri|sat|sun)\b/i.exec(cell)
  const token = match?.[1] // capture group 1 always exists when `match` is non-null
  return token ? (WEEKDAY_TOKENS[token.toLowerCase()] ?? null) : null
}

/** `"7am"` → 7, `"12pm"` → 12, `"12am"` → 0, `"1pm"` → 13. */
function extractHour(cell: string): number | null {
  const match = /^(\d{1,2})\s*(am|pm)$/i.exec(cell.trim())
  if (!match?.[1] || !match[2]) return null
  const raw = parseInt(match[1], 10)
  if (raw < 1 || raw > 12) return null
  const period = match[2].toLowerCase()
  if (period === 'am') return raw === 12 ? 0 : raw
  return raw === 12 ? 12 : raw + 12
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '')
}

export function parseDemandCsv(rawText: string): DemandCsvParseResult {
  // Trap #4 — a UTF-8 BOM precedes everything; strip it before any comparison.
  const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText

  const warnings: DemandImportIssue[] = []
  const errors: DemandImportIssue[] = []

  if (text.trim() === '') {
    errors.push({ row: 1, message: 'File is empty' })
    return { cells: [], warnings, errors }
  }

  const rows = parseCsvRows(text)

  // Trap #1 — a title row (`"Aug 07, 2026 - Aug 13, 2026"`) precedes the header. Detect the
  // header as the first row whose non-first cells parse as day labels, never as "row 0/1".
  // Trap #3 — the header's first cell is empty, not "Hour"; never keyed on a literal column name.
  let headerRowIndex = -1
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (row.length >= 2 && row.slice(1).some((cell) => extractWeekday(cell) !== null)) {
      headerRowIndex = i
      break
    }
  }
  if (headerRowIndex === -1) {
    errors.push({ row: 1, message: 'No header row found (no column resolved to a day of week)' })
    return { cells: [], warnings, errors }
  }

  // Trap #2 (the real column mapping) — matched by weekday TOKEN, so reordered columns
  // (malformed corpus) are handled for free; position is never trusted.
  const header = rows[headerRowIndex] ?? []
  const columnDay = new Map<number, number>()
  const seenDays = new Set<number>()
  for (let col = 1; col < header.length; col++) {
    const day = extractWeekday(header[col] ?? '')
    if (day === null) continue
    if (seenDays.has(day)) {
      warnings.push({
        row: headerRowIndex + 1,
        column: col + 1,
        message: `Duplicate "${WEEKDAY_NAMES[day]}" column — ignored, first occurrence kept`,
      })
      continue
    }
    seenDays.add(day)
    columnDay.set(col, day)
  }
  for (let day = 1; day <= 7; day++) {
    if (!seenDays.has(day)) {
      warnings.push({
        row: headerRowIndex + 1,
        message: `Missing column for ${WEEKDAY_NAMES[day]} — that day's grid will have gaps`,
      })
    }
  }

  const cellMap = new Map<string, number>() // `${day}-${hour}` -> transactions, last write wins
  let dataRowCount = 0

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    if (isBlankRow(row)) continue

    const hourLabel = row[0] ?? ''
    const hour = extractHour(hourLabel)
    if (hour === null) {
      warnings.push({
        row: i + 1,
        column: 1,
        message: `Could not read "${hourLabel}" as an hour label (e.g. "7am") — row skipped`,
      })
      continue
    }
    dataRowCount++

    for (const [col, day] of columnDay) {
      const raw = row[col]
      if (raw === undefined || raw.trim() === '') continue // absent cell, not malformed — quietly skipped

      const trimmed = raw.trim()
      if (!/^-?\d+$/.test(trimmed)) {
        errors.push({
          row: i + 1,
          column: col + 1,
          message: `"${trimmed}" is not a whole number (${WEEKDAY_NAMES[day]} ${hourLabel})`,
        })
        continue
      }
      const transactions = parseInt(trimmed, 10)
      if (transactions < 0) {
        errors.push({
          row: i + 1,
          column: col + 1,
          message: `Transaction count cannot be negative (${WEEKDAY_NAMES[day]} ${hourLabel})`,
        })
        continue
      }

      const key = `${day}-${hour}`
      if (cellMap.has(key)) {
        warnings.push({
          row: i + 1,
          column: col + 1,
          message: `Duplicate row for ${WEEKDAY_NAMES[day]} ${hourLabel} — later value overwrites the earlier one`,
        })
      }
      cellMap.set(key, transactions)
    }
  }

  if (dataRowCount === 0) {
    warnings.push({ row: headerRowIndex + 1, message: 'Header found but no data rows follow' })
  }

  const cells: DemandCellInput[] = Array.from(cellMap.entries()).map(([key, transactions]) => {
    const [dayToken, hourToken] = key.split('-')
    return { dayOfWeek: Number(dayToken), hour: Number(hourToken), transactions }
  })

  return { cells, warnings, errors }
}
