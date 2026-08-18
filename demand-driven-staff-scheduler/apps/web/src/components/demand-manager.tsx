'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { importDemand, ApiError, type DemandCell, type ImportDemandResult } from '@/lib/api-client'
import { buildDemandGrid, demandGridKey, maxValue } from '@/lib/grid'
import { demandHeatTone } from '@/lib/tone'
import { DAYS_OF_WEEK, dayLabel } from '@/lib/week'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'

/**
 * §2.3 — CSV drop zone → import result (accepted / warnings / errors) → day×hour heatmap.
 * A malformed CSV comes back `HTTP 200` with `errors[]`, not a thrown error — the result banner
 * reads `result.errors.length`, not only a `catch` (see `import-demand.handler.ts`'s docstring).
 */
export function DemandManager({
  scheduleId,
  demandCells,
}: {
  readonly scheduleId: string
  readonly demandCells: readonly DemandCell[]
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<ImportDemandResult | null>(null)
  const [networkError, setNetworkError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setPending(true)
    setNetworkError(null)
    setResult(null)
    try {
      const res = await importDemand(scheduleId, file)
      setResult(res)
      router.refresh()
    } catch (err) {
      setNetworkError(
        err instanceof ApiError ? err.message : 'Could not reach the scheduling service.',
      )
    } finally {
      setPending(false)
    }
  }

  const hours = Array.from(new Set(demandCells.map((c) => c.hour))).sort((a, b) => a - b)
  const grid = buildDemandGrid(demandCells)
  const max = maxValue(demandCells.map((c) => c.transactions))

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const file = e.dataTransfer.files[0]
          if (file) void handleFile(file)
        }}
        className={`rounded-md border-2 border-dashed p-8 text-center text-sm ${
          dragOver ? 'border-slate-500 bg-slate-50' : 'border-slate-300'
        }`}
      >
        <p className="text-slate-600">Drop the weekly transaction CSV here, or</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
        <div className="mt-2">
          <Button
            variant="secondary"
            type="button"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
          >
            {pending ? 'Importing…' : 'Choose a CSV file'}
          </Button>
        </div>
      </div>

      {networkError && <Banner tone="error">{networkError}</Banner>}

      {result && (
        <div className="space-y-2">
          <Banner tone={result.errors.length > 0 ? 'warning' : 'success'}>
            Imported {result.cells.length} demand cells.
            {result.errors.length > 0 && ` ${result.errors.length} row(s) had errors.`}
            {result.warnings.length > 0 && ` ${result.warnings.length} warning(s).`}
          </Banner>
          {result.errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">Errors — these rows were skipped:</p>
              <ul className="mt-1 list-inside list-disc">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}
                    {e.column !== undefined ? `, column ${e.column}` : ''}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="font-medium">Warnings:</p>
              <ul className="mt-1 list-inside list-disc">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}
                    {w.column !== undefined ? `, column ${w.column}` : ''}: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-slate-700">Demand heatmap</h2>
        {hours.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No demand data imported yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-left text-slate-500">Hour</th>
                  {DAYS_OF_WEEK.map((d) => (
                    <th key={d} className="p-1 text-center text-slate-500">
                      {dayLabel(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map((hour) => (
                  <tr key={hour}>
                    <td className="p-1 text-slate-500">{hour}:00</td>
                    {DAYS_OF_WEEK.map((d) => {
                      const value = grid.get(demandGridKey(d, hour)) ?? 0
                      return (
                        <td key={d} className={`p-1 text-center ${demandHeatTone(value, max)}`}>
                          {value || ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
