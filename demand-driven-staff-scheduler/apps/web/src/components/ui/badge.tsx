import type { ReactNode } from 'react'

type Tone = 'neutral' | 'good' | 'warn' | 'bad'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  good: 'bg-green-50 text-green-800 border-green-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  bad: 'bg-red-50 text-red-800 border-red-200',
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
