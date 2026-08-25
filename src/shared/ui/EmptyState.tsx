import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  action?: ReactNode
  description: string
  title: string
}

export function EmptyState({ action, description, title }: EmptyStateProps) {
  return (
    <section className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white px-5 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
        <Inbox aria-hidden="true" size={19} />
      </span>
      <h2 className="mt-4 type-dialog-title font-bold text-stone-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl type-body leading-6 text-stone-600">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  )
}
