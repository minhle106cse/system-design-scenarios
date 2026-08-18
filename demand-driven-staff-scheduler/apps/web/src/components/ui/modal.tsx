'use client'

import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface Props {
  readonly open: boolean
  readonly title: string
  readonly onClose: () => void
  readonly children: ReactNode
}

/** Modal/drawer — one of the ~6 primitives (`frontend_standard.md` §2). No portal/animation
 *  library: a fixed overlay is enough at this scope. Escape key closes it. */
export function Modal({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
