import type { SelectHTMLAttributes } from 'react'

import { cx } from '../lib/cx'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

/** 캘린더 필터와 동일한 형태를 사용하는 공통 드롭다운입니다. */
export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cx(
        'h-11 rounded-xl border border-stone-300 bg-transparent px-4 type-control text-stone-700 outline-none transition-colors focus:border-brand-600 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400',
        className,
      )}
      {...props}
    />
  )
}
