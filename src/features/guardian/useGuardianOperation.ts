import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClientError } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth/authContext'
import { sendGuardianOperation, type GuardianOperation } from './guardianWorkflowRepository'

export function guardianWorkflowError(failure: unknown): string {
  const status = failure instanceof ApiClientError ? failure.status : undefined
  if (status === 409) return '신청 차수·수정번호 또는 고지가 변경되었습니다. 입력을 비우고 현재 상태를 다시 조회하세요. 자동 재제출하지 않습니다.'
  if (status === 401 || status === 403) return '현재 계정에 처리 권한이 없습니다. 상세·입력값을 비웠습니다. 로그인과 지정 담당자 권한을 확인하세요.'
  if (status === 429) return '요청이 많습니다. 즉시 반복하지 말고 잠시 후 상태를 다시 확인하세요.'
  if (status === 503 && failure instanceof ApiClientError && failure.code === 'GUARDIAN_TEAM_UNAVAILABLE') return '보호자 절차가 준비되지 않았습니다. 수집·전송을 중단합니다.'
  if (status === 404) return '현재 신청을 찾을 수 없습니다. 다시 조회하세요.'
  if (status === 400) return '입력 또는 링크가 유효하지 않습니다. 최신 안내와 입력 형식을 다시 확인하세요.'
  return '응답을 확인하지 못했습니다. 서버에서 처리됐을 수 있습니다. 같은 요청만 직접 다시 확인할 수 있습니다.'
}
export function useGuardianOperation(request: AuthenticatedRequest, onSuccess: (result: Awaited<ReturnType<typeof sendGuardianOperation>>) => void, onInvalidate: (message?: string) => void, onPendingChange?: (pending: boolean) => void) {
  const [operation, setOperation] = useState<GuardianOperation | null>(null)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<GuardianOperation | null>(null)
  const active = useRef<AbortController | null>(null)
  const clear = useCallback(() => { active.current?.abort(); active.current = null; pending.current = null; setOperation(null); setBusy(false); setUncertain(false); setError(''); onPendingChange?.(false) }, [onPendingChange])
  useEffect(() => {
    window.addEventListener('pagehide', clear)
    return () => { active.current?.abort(); active.current = null; pending.current = null; onPendingChange?.(false); window.removeEventListener('pagehide', clear) }
  }, [clear, onPendingChange])
  function prepare(value: GuardianOperation) {
    if (pending.current || active.current) return
    pending.current = value; setOperation(value); setError(''); setUncertain(false); onPendingChange?.(true)
  }
  async function send() {
    const value = pending.current
    if (!value || active.current) return
    const controller = new AbortController(); active.current = controller; setBusy(true); setError('')
    try {
      const result = await sendGuardianOperation(request, value, controller.signal)
      if (controller.signal.aborted) return
      pending.current = null; setOperation(null); setUncertain(false); onPendingChange?.(false); onSuccess(result)
    } catch (failure) {
      if (controller.signal.aborted) return
      const status = failure instanceof ApiClientError ? failure.status : undefined
      // No status / malformed 2xx / 5xx may follow a committed operation. Keep
      // the identical serialized payload in memory; never invent a new retry key.
      const unavailable = failure instanceof ApiClientError && status === 503 && failure.code === 'GUARDIAN_TEAM_UNAVAILABLE'
      const retryable = status == null || (status >= 500 && !unavailable) || (status >= 200 && status < 300)
      setError(guardianWorkflowError(failure)); setUncertain(retryable)
      if (!retryable) { pending.current = null; setOperation(null); onPendingChange?.(false); onInvalidate(guardianWorkflowError(failure)) }
    } finally { if (active.current === controller) { active.current = null; setBusy(false) } }
  }
  return { operation, busy, uncertain, error, prepare, send, clear }
}
