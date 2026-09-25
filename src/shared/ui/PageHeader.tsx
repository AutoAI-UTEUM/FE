import { useContext, type ReactNode } from 'react'

import { PageHeaderPathContext } from './PageHeaderPathContext'

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
  const pathRoot = useContext(PageHeaderPathContext)

  return (
    <header className="flex min-h-10 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mobile-phone:gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        {pathRoot ? (
          <p
            aria-hidden="true"
            className="flex items-center gap-1.5 type-caption text-stone-400"
            data-page-path="true"
          >
            <span>{pathRoot}</span>
            <span className="text-stone-300">/</span>
            <span className="font-medium text-stone-600">{title}</span>
          </p>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words type-page-title font-bold text-stone-950">
            {title}
          </h1>
          {titleAccessory}
        </div>
      </div>
      {actions ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto mobile-phone:[&>*]:flex-1">{actions}</div> : null}
    </header>
  )
}
