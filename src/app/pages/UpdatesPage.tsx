import { DevelopmentUpdatesPanel } from '../../features/updates'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { PageContainer } from '../../shared/ui'

export function UpdatesPage() {
  usePageTitle('업데이트')

  return (
    <PageContainer className="lg:flex lg:h-[calc(100dvh-2.5rem)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:space-y-0">
      <DevelopmentUpdatesPanel />
    </PageContainer>
  )
}
