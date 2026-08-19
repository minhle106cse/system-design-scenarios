'use client'

import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger'
type Size = 'md' | 'sm'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-accent-600 text-white shadow-sm hover:bg-accent-700 active:bg-accent-800 disabled:bg-accent-300 disabled:shadow-none',
  secondary:
    'border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50',
  danger:
    'border border-red-200 bg-white text-red-700 shadow-sm hover:border-red-300 hover:bg-red-50 active:bg-red-100 disabled:opacity-50',
}

/** `sm` exists for dense table rows, where a full-size button per row reads as clutter. */
const SIZE_CLASSES: Record<Size, string> = {
  md: 'rounded-lg px-4 py-2 text-sm',
  sm: 'rounded-md px-2.5 py-1 text-xs',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant
  readonly size?: Size
}

/** One of `directives/frontend_standard.md` §2's ~6 hand-rolled primitives. */
export function Button({ variant = 'primary', size = 'md', className = '', ...rest }: Props) {
  return (
    <button
      className={`font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}
