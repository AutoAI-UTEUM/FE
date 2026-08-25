import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

export interface ErrorStateProps {
  action?: ReactNode
  description: string
  title: string
}

export function ErrorState({ action, description, title }: ErrorStateProps) {
  return (
    <section
      className="flex min-h-64 flex-col items-center justify-center border-y border-stone-200 py-10 text-center"
      role="alert"
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
        <CircleAlert aria-hidden="true" size={19} />
      </span>
      <h1 className="mt-4 type-dialog-title font-bold text-stone-950">{title}</h1>
      <p className="mx-auto mt-2 max-w-xl type-body leading-6 text-stone-600">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  )
}
