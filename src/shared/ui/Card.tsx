import type { ElementType, PropsWithChildren } from 'react'

import { cx } from '../lib/cx'

export interface CardProps {
  as?: ElementType
  className?: string
}

export function Card({
  as: Component = 'div',
  children,
  className,
}: PropsWithChildren<CardProps>) {
  return (
    <Component
      className={cx('rounded-3xl border border-stone-200 bg-white', className)}
    >
      {children}
    </Component>
  )
}
