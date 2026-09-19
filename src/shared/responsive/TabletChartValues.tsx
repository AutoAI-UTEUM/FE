import { useState } from 'react'
import { useResponsiveViewport } from './ResponsiveViewportProvider'

export function TabletChartValues({ label, columns, rows }: { label: string; columns: string[]; rows: string[][] }) {
  const { isTablet } = useResponsiveViewport()
  const [open, setOpen] = useState(false)
  if (!isTablet || !rows.length) return null
  return <details className="mt-2 border-t border-stone-200" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 items-center type-caption font-semibold text-stone-700">{label} 값 보기</summary>
    {open ? <div className="max-h-64 overflow-auto" tabIndex={0} role="region" aria-label={`${label} 수치`}><table className="w-full text-left type-caption"><caption className="sr-only">{label}</caption><thead><tr>{columns.map(column => <th className="p-2" scope="col" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td className="border-t border-stone-100 p-2" key={column}>{cell}</td>)}</tr>)}</tbody></table></div> : null}
  </details>
}
