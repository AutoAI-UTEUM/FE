import { DevelopmentUpdatesPanel } from '../../features/updates'
import { getRoleLabel, useAuth } from '../../features/auth'
import { usePageTitle } from '../../shared/lib/usePageTitle'

export function UpdatesPage() {
  usePageTitle('업데이트')
  const { user } = useAuth()

  return (
    <div className="h-full min-h-0 lg:h-[calc(100dvh-2.5rem)]">
      <DevelopmentUpdatesPanel pathRoot={getRoleLabel(user?.role)} />
    </div>
  )
}
