import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../../features/auth'
import { createSessionsRepository } from '../../features/sessions'
import { getRequestErrorMessage } from '../../shared/api'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Button, ButtonLink, ErrorState, LoadingState } from '../../shared/ui'
import { routes, sessionDetailPath } from '../routes'

export function MaterialViewerRedirectPage() {
  usePageTitle('PDF 뷰어')
  const { materialId } = useParams()
  const navigate = useNavigate()
  const { apiRequest } = useAuth()
  const repository = useMemo(
    () => createSessionsRepository(apiRequest),
    [apiRequest],
  )
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!materialId) return

    const controller = new AbortController()
    repository
      .create(materialId, controller.signal)
      .then((session) => {
        if (!controller.signal.aborted) {
          navigate(sessionDetailPath(session.id), { replace: true })
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(getRequestErrorMessage(requestError))
        }
      })

    return () => controller.abort()
  }, [materialId, navigate, repository, retryKey])

  if (!materialId) {
    return (
      <ErrorState
        action={<ButtonLink to={routes.materials}>자료 목록으로</ButtonLink>}
        description="자료 식별자가 없습니다."
        title="PDF를 열 수 없습니다"
      />
    )
  }

  if (error) {
    return (
      <ErrorState
        action={
          <div className="flex gap-2">
            <Button onClick={() => { setError(null); setRetryKey((key) => key + 1) }}>다시 시도</Button>
            <ButtonLink to={routes.materials} variant="secondary">자료 목록으로</ButtonLink>
          </div>
        }
        description={error}
        title="PDF를 열 수 없습니다"
      />
    )
  }

  return <LoadingState message="PDF 뷰어를 여는 중입니다." />
}
