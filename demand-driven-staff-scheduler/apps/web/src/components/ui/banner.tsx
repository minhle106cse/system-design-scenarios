import type { ReactNode } from 'react'

type Tone = 'success' | 'error' | 'warning' | 'info'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-accent-200 bg-accent-50 text-accent-900',
}

const TONE_ICON: Record<Tone, string> = {
  success: '✓',
  error: '!',
  warning: '!',
  info: 'i',
}

const TONE_ICON_CLASSES: Record<Tone, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-accent-100 text-accent-700',
}

/**
 * Success/error/warning banner — one of the ~6 primitives, and the mechanism behind
 * `frontend_standard.md` §1 rule 3 ("never fail silently"): every mutation failure, import error,
 * and uncovered-hour finding renders through this, never a `console.error`.
 */
export function Banner({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${TONE_CLASSES[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${TONE_ICON_CLASSES[tone]}`}
      >
        {TONE_ICON[tone]}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
