import { useContext, type ComponentProps } from 'react'

import { cx } from '../../../shared/lib/cx'
import { PageContainer } from '../../../shared/ui'
import { ClassroomWorkspaceShellContext } from './ClassroomWorkspaceShellContext'

export function ClassroomWorkspaceContainer({
  className,
  ...props
}: ComponentProps<typeof PageContainer>) {
  const workspaceShell = useContext(ClassroomWorkspaceShellContext)

  if (workspaceShell) {
    return (
      <div
        className={cx(
          'flex min-h-0 min-w-0 w-full flex-1 flex-col gap-4',
          className,
        )}
        {...props}
      />
    )
  }

  return (
    <PageContainer
      className={cx(
        'flex flex-col gap-4 space-y-0 lg:min-h-[calc(100dvh-2.5rem)]',
        className,
      )}
      {...props}
    />
  )
}
