'use client'

import type { InputHTMLAttributes, ReactNode } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  readonly label: string
  readonly error?: string | null
  readonly hint?: ReactNode
}

/** Label + input + inline error — one of the ~6 primitives (`frontend_standard.md` §2). */
export function Field({ label, error, hint, id, className = '', ...rest }: Props) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none ${
          error ? 'border-red-300 focus:border-red-500' : 'border-slate-300 focus:border-slate-500'
        } ${className}`}
        {...rest}
      />
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
