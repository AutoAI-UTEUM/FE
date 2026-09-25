import type { HTMLAttributes } from 'react'

import { cx } from '../lib/cx'

export type PageToolbarProps = HTMLAttributes<HTMLDivElement>

/**
 * 페이지 제목과 메인 콘텐츠 사이에 놓이는 필터·정렬 컨트롤 행.
 * 헤더 액션과 폼 내부 입력 컨트롤에는 사용하지 않는다.
 */
export function PageToolbar({ className, ...props }: PageToolbarProps) {
  return (
    <div
      className={cx(
        'flex min-h-11 shrink-0 flex-wrap items-center gap-2',
        className,
      )}
      data-page-toolbar="filters"
      {...props}
    />
  )
}
