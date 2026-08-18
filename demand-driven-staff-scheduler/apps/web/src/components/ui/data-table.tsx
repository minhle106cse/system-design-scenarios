import type { ReactNode } from 'react'

export interface Column<T> {
  readonly header: string
  readonly render: (row: T) => ReactNode
  readonly className?: string
}

interface Props<T> {
  readonly columns: readonly Column<T>[]
  readonly rows: readonly T[]
  readonly rowKey: (row: T) => string
  readonly emptyMessage?: ReactNode
}

/** One of the ~6 primitives — a plain table, not a data-grid library (`frontend_standard.md` §2). */
export function DataTable<T>({ columns, rows, rowKey, emptyMessage }: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        {emptyMessage ?? 'Nothing here yet.'}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th key={col.header} className="px-3 py-2 font-medium text-slate-600">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-slate-100 last:border-0">
              {columns.map((col) => (
                <td key={col.header} className={`px-3 py-2 ${col.className ?? ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
