import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth'
import { GuardianOperationPanel } from '../../features/guardian/GuardianOperationPanel'
import { isGuardianPending, isGuardianWorkflowReady, type GuardianRelationship, type GuardianStatus, type GuardianView } from '../../features/guardian/guardianContract'
import { clearGuardianLinkToken, readGuardianLinkToken } from '../../features/guardian/guardianLinkToken'
import { createGuardianOperation, getPublicGuardianView } from '../../features/guardian/guardianWorkflowRepository'
import { guardianWorkflowError, useGuardianOperation } from '../../features/guardian/useGuardianOperation'
import { Button, PageContainer, PageHeader } from '../../shared/ui'
import { routes } from '../routes'
import { GuardianRequestStatus } from './GuardianRequestPage'

export function GuardianConsentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { apiRequest } = useAuth()
  const tokenRef = useRef(readGuardianLinkToken())
  const [hasToken, setHasToken] = useState(() => Boolean(readGuardianLinkToken()))
  const mounted = useRef(false)
  const ready = isGuardianWorkflowReady()
  const [view, setView] = useState<GuardianView | null>(null)
  const [status, setStatus] = useState<GuardianStatus | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [service, setService] = useState(false)
  const [ai, setAi] = useState(false)
  const [legal, setLegal] = useState(false)
  const [relationship, setRelationship] = useState<GuardianRelationship | ''>('')
  const active = useRef<AbortController | null>(null)
  const action = useGuardianOperation(apiRequest, (result) => {
    if ('requestId' in result) { setStatus(result); tokenRef.current = null; setHasToken(false); clearGuardianLinkToken() }
  }, () => { setView(null); tokenRef.current = null; setHasToken(false); clearGuardianLinkToken(); setService(false); setAi(false); setLegal(false); setRelationship('') })
  const clearAction = action.clear
  useLayoutEffect(() => {
    if (location.search || location.hash) {
      active.current?.abort(); active.current = null; clearAction()
      tokenRef.current = ready ? readGuardianLinkToken() : null
      queueMicrotask(() => { setHasToken(Boolean(tokenRef.current)); setView(null); setStatus(null); setError(''); setLoading(false); setService(false); setAi(false); setLegal(false); setRelationship('') })
      navigate(routes.guardianConsent, { replace: true, state: null })
    }
  }, [location.search, location.hash, navigate, ready, clearAction])
  useEffect(() => {
    mounted.current = true
    const discard = () => { tokenRef.current = null; setHasToken(false); clearGuardianLinkToken(); active.current?.abort(); active.current = null; setView(null); setStatus(null); setLoading(false); setService(false); setAi(false); setLegal(false); setRelationship('') }
    if (!ready) { tokenRef.current = null; clearGuardianLinkToken() }
    window.addEventListener('pagehide', discard)
    return () => { mounted.current = false; active.current?.abort(); active.current = null; window.removeEventListener('pagehide', discard); queueMicrotask(() => { if (!mounted.current) { tokenRef.current = null; clearGuardianLinkToken() } }) }
  }, [ready])
  async function load() {
    if (!ready || !tokenRef.current || active.current || action.operation || status) return
    const controller = new AbortController(); active.current = controller; setLoading(true); setError(''); setView(null)
    setService(false); setAi(false); setLegal(false); setRelationship('')
    try { const result = await getPublicGuardianView(tokenRef.current, controller.signal); if (!controller.signal.aborted) setView(result) }
    catch (failure) { if (!controller.signal.aborted) { setError(guardianWorkflowError(failure)); tokenRef.current = null; setHasToken(false); clearGuardianLinkToken() } }
    finally { if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setLoading(false) } }
  }
  const usable = view && view.status.currentNotice && isGuardianPending(view.status) && view.noticeUrl !== null && view.replyChannel !== null && view.requiredScopes.length === 1 && view.requiredScopes[0] === 'SERVICE' && Boolean(view.forms.consent_email?.trim()) && !/TBD|\[\[|미확정/.test(Object.values(view.forms).join(' '))
  function prepare(accepted: boolean) {
    if (!usable || !view || !tokenRef.current) return
    action.prepare(createGuardianOperation('consent', null, { token: tokenRef.current, generation: view.status.generation, revision: view.status.revision,
      noticeVersion: view.status.noticeVersion, noticeDigest: view.status.noticeDigest, accepted, declaresLegalGuardian: accepted && legal,
      relationship: accepted ? relationship : null, scopes: accepted ? ['SERVICE', ...(ai && view.optionalAiScope === 'EXTERNAL_AI' ? ['EXTERNAL_AI'] : [])] : [] }))
  }
  return <main className="mx-auto max-w-3xl p-4 sm:p-8"><PageContainer><PageHeader title="보호자 동의 의사 표시" /><div className="space-y-4">
    {!ready ? <p role="status">보호자 후속 절차를 준비하고 있습니다.</p> : <>
      <p>웹 체크는 관계 확인·이용 승인이 아닙니다. 안내 내용을 읽고 회신 양식에 성명·관계·동의 여부를 직접 작성해야 하며 담당자 확인이 필요합니다.</p>
      {!hasToken && !status ? <p role="status">유효한 새 보호자 링크가 필요합니다. query 링크는 사용할 수 없습니다.</p> : null}
      {!status ? <Button disabled={!hasToken || loading || Boolean(action.operation)} onClick={() => void load()}>현재 안내 확인</Button> : null}
      {error ? <p role="alert">{error}</p> : null}
      {view ? <GuardianRequestStatus view={status ? { ...view, status } : view} /> : null}
      {view && !status ? <>{!usable ? <p role="status">현재 고지·필수 범위·회신 창구가 충분하지 않아 제출할 수 없습니다. 새로운 안내를 요청하세요.</p> : <fieldset disabled={Boolean(action.operation)} className="space-y-3">
        <p>고지 버전: {view.status.noticeVersion} · 신청 차수: {view.status.generation} · 수정번호: {view.status.revision}</p>
        <label className="block"><input type="checkbox" checked={service} onChange={(e) => setService(e.target.checked)} /> 서비스 이용 동의 (필수)</label>
        {view.optionalAiScope === 'EXTERNAL_AI' ? <label className="block"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> 외부 AI 이용 동의 (선택)</label> : null}
        <label className="block"><input type="checkbox" checked={legal} onChange={(e) => setLegal(e.target.checked)} /> 현재 신청 대상의 법정대리인임을 선언합니다.</label>
        <label className="block">관계 <select value={relationship} onChange={(e) => setRelationship(e.target.value as GuardianRelationship | '')}><option value="">직접 선택</option><option value="PARENT">부모</option><option value="MINOR_GUARDIAN">미성년후견인</option></select></label>
        <Button disabled={!service || !legal || !relationship} onClick={() => prepare(true)}>의사 표시 제출 확인</Button>
        <Button variant="secondary" onClick={() => prepare(false)}>동의 거절 확인</Button>
      </fieldset>}</> : null}
      <GuardianOperationPanel action={action} />
      {status ? <p role="status">응답된 서버 상태: {status.state}. 소비된 링크로 다시 조회하지 않습니다. 로그인 본인의 신청 화면에서 이후 상태를 확인하세요.</p> : null}
    </>}
    <Link to={routes.guardianRequest}>본인 신청 상태</Link>
  </div></PageContainer></main>
}
