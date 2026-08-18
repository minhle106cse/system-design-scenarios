/** Tailwind class tokens for status coloring — the one place a status color scale earns a named
 *  helper (`directives/frontend_standard.md` §3: extend the default palette only when a repeated
 *  pattern earns it). Neutral = slate, good = green, warn = amber, bad = red — matches the
 *  success/error banner colors `create-schedule-form.tsx` already established. */
import type { HourCoverageStatus } from './api-client'

export function coverageTone(status: HourCoverageStatus): string {
  switch (status) {
    case 'UNDERSTAFFED':
      return 'bg-red-50 text-red-800 border-red-200'
    case 'OVERSTAFFED':
      return 'bg-amber-50 text-amber-800 border-amber-200'
    case 'OK':
      return 'bg-green-50 text-green-800 border-green-200'
  }
}

/** A 0..1 intensity into a slate heat scale — `value`/`max`, `max <= 0` reads as no demand yet. */
export function demandHeatTone(value: number, max: number): string {
  if (max <= 0 || value <= 0) return 'bg-slate-50 text-slate-400'
  const ratio = value / max
  if (ratio > 0.75) return 'bg-slate-700 text-white'
  if (ratio > 0.5) return 'bg-slate-500 text-white'
  if (ratio > 0.25) return 'bg-slate-300 text-slate-900'
  return 'bg-slate-100 text-slate-700'
}
