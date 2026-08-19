import type { ReactNode } from 'react'

type Tone = 'neutral' | 'good' | 'warn' | 'bad'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
}

/** Status pill — one of the ~6 primitives (`frontend_standard.md` §2). */
export function Badge({
  tone = 'neutral',
  children,
}: {
  readonly tone?: Tone
  readonly children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
