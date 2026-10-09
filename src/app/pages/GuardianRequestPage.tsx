import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth'
import { isGuardianTeamReady, isGuardianWorkflowReady, type GuardianEntry, type GuardianLink, type GuardianState, type GuardianStatus, type GuardianView } from '../../features/guardian/guardianContract'
import { GuardianIssuedLink, GuardianSelfActions } from '../../features/guardian/GuardianSelfActions'
import { getGuardianEntry } from '../../features/guardian/guardianRepository'
import { ApiClientError } from '../../shared/api'
import { Button, PageContainer, PageHeader } from '../../shared/ui'
import { routes } from '../routes'

const stateMessages: Record<GuardianState, string> = {
  AWAITING_CONSENT: '보호자 안내 및 의사 표시를 기다리고 있습니다.',
  DECLARED: '의사 표시가 접수되었습니다. 명시적 회신 또는 전화 확인과 담당자 검토가 필요합니다.',
  REVIEW_PENDING: '담당자가 확인 자료를 검토하고 있습니다.',
  NEEDS_INFORMATION: '안내된 항목만 보완해 주세요. 불필요한 개인정보나 신분증 원본을 보내지 마세요.',
  APPROVED: '서버의 담당자 검토 상태: 승인. 실제 유효한 이용 범위는 아래 승인 상태를 확인해 주세요.',
  REJECTED: '신청이 반려되었습니다. 안내된 사유와 문의 창구를 확인해 주세요.',
  REVOKED: '신청 또는 승인이 철회되었습니다.',
  EXPIRED: '신청 또는 승인의 유효기간이 지났습니다.',
  WITHDRAWN: '계정 탈퇴에 따라 신청이 종료되었습니다.',
}
function utc(value: string | null): string { return value === null ? '기록 없음' : `${value} (UTC)` }
function channel(value: GuardianView['replyChannel']): string {
  return value === 'EMAIL_REPLY' ? '이메일 회신' : value === 'PHONE_CALLBACK' ? '전화 확인' : '현재 회신 창구 없음'
}
function scopeName(value: GuardianView['requiredScopes'][number]): string {
  return value === 'SERVICE' ? '서비스 이용' : '외부 AI 이용'
}
export function GuardianRequestStatus({ view }: { view: GuardianView }) {
  const s = view.status
  return <section aria-label="현재 보호자 신청" className="space-y-3">
    <p>{stateMessages[s.state]}</p>
    <dl className="space-y-2 break-words">
      <dt>신청 번호 / 차수 / 수정번호</dt><dd>{s.requestId} / {s.generation} / {s.revision}</dd>
      <dt>서비스 이용 승인</dt><dd>{s.serviceApproved ? '승인됨' : '유효한 승인 없음'}</dd>
      <dt>외부 AI 이용 승인</dt><dd>{s.externalAiApproved ? '승인됨' : '유효한 승인 없음'}</dd>
      <dt>신청 만료</dt><dd>{utc(s.requestExpiresAt)}</dd>
      <dt>연락처 정리 기한</dt><dd>{utc(s.contactEraseDueAt)}</dd>
      <dt>웹 의사 표시 시각</dt><dd>{utc(s.webDeclaredAt)}</dd>
      <dt>명시적 회신·전화 확인 시각</dt><dd>{utc(s.explicitResponseAt)}</dd>
      <dt>승인 유효기한</dt><dd>{utc(s.approvedUntil)}</dd>
      <dt>서버 사유 코드</dt><dd>{s.reason ?? '기록 없음'}</dd>
    </dl>
    {!s.currentNotice ? <p role="status">안내 설정이 변경되었습니다. 이전 안내로 진행할 수 없습니다. 현재 신청 상태를 다시 확인해 주세요.</p>
      : <><p>회신 방법: {channel(view.replyChannel)}</p>
        <p>필수 범위: {view.requiredScopes.map(scopeName).join(', ') || '표시할 범위 없음'} · 선택 범위: {view.optionalAiScope ? scopeName(view.optionalAiScope) : '없음'}</p>
        {Object.entries(view.forms).map(([key, text]) => <p key={key} className="whitespace-pre-wrap break-words">{text}</p>)}</>}
    <p>보호자 승인 표시가 다른 이메일 확인·역할·이용 조건을 대신하지 않습니다.</p>
  </section>
}

export function GuardianRequestPage() {
  const { apiRequest, user } = useAuth()
  const ready = isGuardianTeamReady()
  const owner = `${user?.id ?? ''}:${user?.email ?? ''}`
  const [snapshot, setSnapshot] = useState<{ owner: string; entry: GuardianEntry } | null>(null)
  const [error, setError] = useState<{ owner: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [issuedLink, setIssuedLink] = useState<{ owner: string; link: GuardianLink } | null>(null)
  const [operationLock, setOperationLock] = useState<{ owner: string; pending: boolean } | null>(null)
  const mutationLock = useRef<{ owner: string; pending: boolean } | null>(null)
  const onPendingChange = useCallback((pending: boolean) => { mutationLock.current = { owner, pending }; setOperationLock({ owner, pending }) }, [owner])
  const activeRef = useRef<AbortController | null>(null)
  const reload = useCallback(async () => {
    if (!ready || activeRef.current || (mutationLock.current?.owner === owner && mutationLock.current.pending)) return
    const controller = new AbortController()
    activeRef.current = controller
    setBusy(true)
    setSnapshot(null)
    setIssuedLink(null)
    setError(null)
    try {
      const entry = await getGuardianEntry(apiRequest, controller.signal)
      if (!controller.signal.aborted) setSnapshot({ owner, entry })
    } catch (failure) {
      if (controller.signal.aborted) return
      const code = failure instanceof ApiClientError ? failure.code : ''
      const message = code === 'GUARDIAN_TEAM_UNAVAILABLE' ? '보호자 팀 확인 절차를 준비하고 있습니다.'
        : code === 'GUARDIAN_TEAM_REQUEST_NOT_FOUND' ? '현재 조회할 신청이 없습니다. 현재 진입 상태를 다시 확인해 주세요.'
        : code === 'RATE_LIMIT_EXCEEDED' ? '요청이 많습니다. 즉시 반복하지 말고 잠시 후 직접 다시 확인해 주세요.'
        : ['ACCESS_DENIED', 'USER_INACTIVE', 'AUTH_REQUIRED'].includes(code) ? '현재 계정으로 조회할 수 없습니다. 로그인과 계정 상태를 확인해 주세요.'
        : ['GUARDIAN_STATE_CONFLICT', 'GUARDIAN_NOTICE_CHANGED', 'GUARDIAN_TEAM_CONFIGURATION_CHANGED'].includes(code) ? '신청 또는 안내 상태가 변경되었습니다. 직접 다시 확인해 주세요.'
        : '신청 상태를 불러오지 못했습니다. 잠시 후 직접 다시 확인해 주세요.'
      setError({ owner, message })
    } finally {
      if (activeRef.current === controller) { activeRef.current = null; if (!controller.signal.aborted) setBusy(false) }
    }
  }, [apiRequest, owner, ready])
  useEffect(() => {
    let active = true
    const discard = () => { activeRef.current?.abort(); activeRef.current = null; setSnapshot(null); setIssuedLink(null); setError(null); setBusy(false) }
    queueMicrotask(() => { if (active) void reload() })
    window.addEventListener('pagehide', discard)
    return () => { active = false; activeRef.current?.abort(); activeRef.current = null; window.removeEventListener('pagehide', discard) }
  }, [reload])
  const entry = snapshot?.owner === owner ? snapshot.entry : null
  function updated(result: GuardianView | GuardianStatus | GuardianLink) {
    if (!entry) return
    const view = 'forms' in result ? result : entry.request ? { ...entry.request, status: 'status' in result ? result.status : result, forms: {} } : null
    setSnapshot({ owner, entry: { ...entry, canStartRequest: false, request: view } })
    setIssuedLink('url' in result ? { owner, link: result } : null)
  }
  return <main className="mx-auto max-w-3xl p-4 sm:p-8"><PageContainer><PageHeader title="보호자 확인 신청 상태" /><div className="space-y-4">
    <p>보호자 확인 대상과 현재 신청 상태를 확인할 수 있습니다.{!isGuardianWorkflowReady() ? ' 접수와 철회 연결은 준비 중입니다.' : ''}</p>
    {!ready ? <p role="status">보호자 팀 확인 절차를 준비하고 있습니다.</p> : <>
      <Button disabled={busy || (operationLock?.owner === owner && operationLock.pending)} onClick={() => void reload()}>현재 신청 상태 다시 확인</Button>
      {busy ? <p role="status">신청 상태를 확인하는 중입니다.</p> : null}
      {error?.owner === owner ? <p role="alert">{error.message}</p> : null}
      {entry ? <>
        {entry.requirement === 'NOT_REQUIRED' ? <p>서버 판정상 보호자 신청 대상이 아닙니다. 다른 이용 조건은 별도로 확인해야 합니다.</p>
          : entry.requirement === 'BIRTHDATE_REQUIRED' ? <p>생년월일 확인·정정이 필요합니다. 계정 관리 또는 지원 창구에서 확인해 주세요.</p>
          : <p>서버 판정상 보호자 절차 대상입니다. 승인 여부는 현재 신청의 서버 상태를 따릅니다.</p>}
        {!entry.teamReviewAvailable ? <p>보호자 팀 확인 절차를 준비하고 있습니다. 이 응답의 신청 없음 표시는 과거 신청 부재를 의미하지 않습니다.</p>
          : entry.request ? <GuardianRequestStatus view={entry.request} />
          : entry.requirement === 'REQUIRED' ? <p>현재 신청 기록이 반환되지 않았습니다.</p> : null}
        {entry.canStartRequest ? <p>서버 조회 시점에는 새 신청이 가능합니다. 회신 방법: {channel(entry.replyChannel)}</p> : null}
        {isGuardianWorkflowReady() ? <GuardianSelfActions key={owner} entry={entry} onPendingChange={onPendingChange} onUpdated={updated} onInvalidate={(message) => { setSnapshot(null); setIssuedLink(null); if (message) setError({ owner, message }) }} /> : null}
      </> : null}
      {issuedLink?.owner === owner ? <GuardianIssuedLink link={issuedLink.link} /> : null}
    </>}
    <div className="flex gap-4"><Link to={routes.settings}>계정 관리</Link><Link to={routes.verifyEmail}>이메일 확인</Link></div>
  </div></PageContainer></main>
}
