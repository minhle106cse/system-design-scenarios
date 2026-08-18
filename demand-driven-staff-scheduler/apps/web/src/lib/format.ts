/** Number formatting that never crashes on `null` — brief §2.6's divide-by-zero guard shows up as
 *  a typed `number | null` from the API; this is where it becomes a manager-readable string. */

export function formatRatio(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits)
}

export function formatHours(value: number, digits = 1): string {
  return `${value.toFixed(digits)}h`
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`
}
