import type { ReactNode } from 'react'

export interface PageHeaderProps {
  actions?: ReactNode
  title: string
  titleAccessory?: ReactNode
}

export function PageHeader({
  actions,
  title,
  titleAccessory,
}: PageHeaderProps) {
  return (
    <header className="flex min-h-10 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mobile-phone:gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-words type-page-title font-bold text-stone-950">
          {title}
        </h1>
        {titleAccessory}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 mobile-phone:w-full mobile-phone:[&>*]:flex-1">{actions}</div> : null}
    </header>
  )
}
