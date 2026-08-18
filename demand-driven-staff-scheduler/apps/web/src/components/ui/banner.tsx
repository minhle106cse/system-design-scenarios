import type { ReactNode } from 'react'

type Tone = 'success' | 'error' | 'warning' | 'info'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
}

/**
 * Success/error/warning banner — one of the ~6 primitives, and the mechanism behind
 * `frontend_standard.md` §1 rule 3 ("never fail silently"): every mutation failure, import error,
 * and uncovered-hour finding renders through this, never a `console.error`.
 */
export function Banner({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${TONE_CLASSES[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}
