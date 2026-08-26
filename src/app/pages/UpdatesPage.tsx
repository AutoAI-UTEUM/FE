import { DevelopmentUpdatesPanel } from '../../features/updates'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { PageContainer } from '../../shared/ui'

export function UpdatesPage() {
  usePageTitle('업데이트')

  return (
    <PageContainer className="max-w-5xl">
      <DevelopmentUpdatesPanel />
    </PageContainer>
  )
}
