import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth'
import { isAdminRole } from '../../features/auth/authRoles'
import { GuardianOperationPanel } from '../../features/guardian/GuardianOperationPanel'
import { confirmationMethodFor, isGuardianPending, isGuardianWorkflowReady, type GuardianDetail, type GuardianList, type GuardianRelationship } from '../../features/guardian/guardianContract'
import { createGuardianOperation, getGuardianReviewDetail, getGuardianReviewList } from '../../features/guardian/guardianWorkflowRepository'
import { guardianWorkflowError, useGuardianOperation } from '../../features/guardian/useGuardianOperation'
import { Button, PageContainer, PageHeader } from '../../shared/ui'
import { routes } from '../routes'

export function GuardianReviewPage() {
  const { user } = useAuth()
  if (!isGuardianWorkflowReady()) return <main className="p-8"><p role="status">보호자 담당자 절차를 준비하고 있습니다.</p></main>
  if (!isAdminRole(user?.role)) return <main className="p-8"><p role="alert">현재 계정에 담당자 접근 권한이 없습니다.</p></main>
  return <GuardianReviewSession key={`${user?.id}:${user?.email}:${user?.role}`} />
}
function GuardianReviewSession() {
  const { apiRequest, user } = useAuth()
  const [list, setList] = useState<GuardianList | null>(null)
  const [detail, setDetail] = useState<GuardianDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [operationLocked, setOperationLocked] = useState(false)
  const mutationLock = useRef(false)
  const onPendingChange = useCallback((pending: boolean) => { mutationLock.current = pending; setOperationLocked(pending) }, [])
  const active = useRef<AbortController | null>(null)
  useEffect(() => {
    const discard = () => { active.current?.abort(); active.current = null; setList(null); setDetail(null); setBusy(false) }
    window.addEventListener('pagehide', discard)
    return () => { active.current?.abort(); active.current = null; window.removeEventListener('pagehide', discard) }
  }, [])
  async function load(page: number, id?: string) {
    if (active.current || mutationLock.current) return
    const controller = new AbortController(); active.current = controller; setBusy(true); setDetail(null); setError('')
    if (!id) setList(null)
    try {
      if (id) { const result = await getGuardianReviewDetail(apiRequest, id, controller.signal); if (!controller.signal.aborted) setDetail(result) }
      else { const result = await getGuardianReviewList(apiRequest, page, controller.signal); if (!controller.signal.aborted) setList(result) }
    } catch (failure) { if (!controller.signal.aborted) { setList(null); setDetail(null); setError(guardianWorkflowError(failure)) } }
    finally { if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setBusy(false) } }
  }
  return <main className="mx-auto max-w-4xl p-4 sm:p-8"><PageContainer><PageHeader title="보호자 지정 담당자 검토" /><div className="space-y-4">
    <p>관리자 역할만으로 처리할 수 없습니다. 서버가 현재 활성 계정·지정 담당자·대상과 권한을 조회와 결정 트랜잭션마다 검사합니다.</p>
    <Button disabled={busy || operationLocked} onClick={() => void load(0)}>담당자 권한·목록 확인</Button>
    {error ? <p role="alert">{error}</p> : null}
    {list ? <section aria-label="신청 목록"><p>{list.totalElements}건 · 페이지 {list.page + 1}</p>
      {list.content.map((s) => <div key={s.requestId} className="mb-2 break-all"><Button disabled={busy || operationLocked} onClick={() => void load(list.page, s.requestId)}>상세 {s.requestId}</Button><p>{s.state} · 차수 {s.generation} · 수정번호 {s.revision}</p></div>)}
      <Button disabled={busy || operationLocked || list.page === 0} onClick={() => void load(list.page - 1)}>이전 목록</Button>
      <Button disabled={busy || operationLocked || list.page + 1 >= list.totalPages} onClick={() => void load(list.page + 1)}>다음 목록</Button>
    </section> : null}
    {detail ? <GuardianReviewDetail key={`${detail.status.requestId}:${detail.status.generation}:${detail.status.revision}`} detail={detail} selfId={user?.id} onPendingChange={onPendingChange} onInvalidate={(message) => { setList(null); setDetail(null); if (message) setError(message) }} onRefresh={() => void load(list?.page ?? 0, detail.status.requestId)} /> : null}
    <Link to={routes.settings}>계정 관리</Link>
  </div></PageContainer></main>
}
const confirmationChecks = {
  requestReferenceMatched: '회신 신청번호·차수가 현재 신청과 일치함을 확인했습니다.',
  responseExplicitlyConsents: '실제 회신·통화에 명시적 동의가 있음을 확인했습니다.',
  legalGuardianDeclarationConfirmed: '법정대리인 선언을 확인했습니다.',
  noticeAndScopesMatched: '고지 버전·범위와 실제 회신이 일치함을 확인했습니다.',
  confirmationMethodChecked: '현재 확인 수단과 실제 회신 수단을 확인했습니다.',
}
const decisionChecks = {
  relationshipChecked: '승인된 운영 기준에 따라 실제 관계를 검토했습니다.',
  guardianContactChecked: '회신 연락처와 확인 대상을 검토했습니다.',
  evidenceReferenceChecked: '현재 차수의 제한된 증거 참조를 검토했습니다.',
  noticeAndScopesChecked: '현재 고지와 승인할 서비스·AI 범위를 검토했습니다.',
}
type CheckName = keyof typeof confirmationChecks | keyof typeof decisionChecks
function GuardianReviewDetail({ detail, selfId, onInvalidate, onRefresh, onPendingChange }: { detail: GuardianDetail; selfId?: number; onInvalidate: (message?: string) => void; onRefresh: () => void; onPendingChange: (pending: boolean) => void }) {
  const { apiRequest } = useAuth()
  const [checks, setChecks] = useState<Partial<Record<CheckName, boolean>>>({})
  const [relationship, setRelationship] = useState<GuardianRelationship | ''>('')
  const [service, setService] = useState(false)
  const [ai, setAi] = useState(false)
  const [evidence, setEvidence] = useState('')
  const [receivedAt, setReceivedAt] = useState('')
  const [inputTime, setInputTime] = useState(() => Date.now())
  const [policyReviewed, setPolicyReviewed] = useState(false)
  const [reason, setReason] = useState<'INCOMPLETE_RESPONSE' | 'RELATIONSHIP_UNCONFIRMED' | 'CONSENT_DECLINED' | 'OPERATOR_REVOKED'>('INCOMPLETE_RESPONSE')
  const action = useGuardianOperation(apiRequest, () => { onInvalidate(); onRefresh() }, onInvalidate, onPendingChange)
  const s = detail.status
  const pending = isGuardianPending(s)
  const method = confirmationMethodFor(detail.replyChannel)
  const current = s.currentNotice && Boolean(method) && Boolean(detail.forms.consent_email?.trim()) && !/TBD|\[\[|미확정/.test(Object.values(detail.forms).join(' '))
  const ownerKnown = selfId !== undefined && detail.userId !== null && selfId !== detail.userId
  const canProcess = ownerKnown && policyReviewed && !action.operation
  const scopes = ['SERVICE', ...(ai ? ['EXTERNAL_AI'] : [])]
  const matchesDeclaration = !s.webDeclaredAt || (relationship === detail.relationship && JSON.stringify([...detail.declaredScopes].sort()) === JSON.stringify([...scopes].sort()))
  const validTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(receivedAt) && detail.generationStartedAt !== null && Date.parse(receivedAt) >= Date.parse(detail.generationStartedAt) && Date.parse(receivedAt) <= inputTime
  function prepare(command: 'confirmation' | 'decision' | 'revoke', fields: Record<string, unknown>) {
    if (!canProcess || (command !== 'revoke' && !current)) return
    action.prepare(createGuardianOperation(command, s.requestId, { generation: s.generation, revision: s.revision, ...fields }))
  }
  function checklist(labels: Record<string, string>) { return Object.entries(labels).map(([name, label]) => <label key={name} className="block"><input type="checkbox" disabled={!current} checked={checks[name as CheckName] === true} onChange={(e) => setChecks({ ...checks, [name]: e.target.checked })} /> {label}</label>) }
  return <section aria-label="담당자 상세" className="space-y-4 border-t pt-4">
    <p className="break-all">신청 {s.requestId} · 차수 {s.generation} · 수정번호 {s.revision} · 상태 {s.state}</p>
    <p>서비스 승인: {s.serviceApproved ? '승인됨' : '유효한 승인 없음'} · 외부 AI 승인: {s.externalAiApproved ? '승인됨' : '유효한 승인 없음'}</p>
    <p>차수 시작 (UTC): {detail.generationStartedAt ?? '기록 없음'} · 웹 선언 (UTC): {s.webDeclaredAt ?? '기록 없음'}</p>
    <p>이름: {detail.guardianName ?? '기록 없음'} · 연락처: {detail.guardianContact ?? '기록 없음'} · 입력 출처: {detail.contactOrigin ?? '기록 없음'}</p>
    <p>선언 범위: {detail.declaredScopes.join(', ') || '없음'} · 관계: {detail.relationship ?? '기록 없음'}</p>
    <p>확인 수단: {detail.confirmationMethod ?? '기록 없음'} · 증거 참조: {detail.evidenceReference ?? '기록 없음'} · 명시적 확인 (UTC): {s.explicitResponseAt ?? '기록 없음'}</p>
    {!current ? <p role="status">최신 고지·확인 창구가 부족하여 회신 등록·승인·반려·보완 요청을 할 수 없습니다. 현재 차수 철회는 별도 확인 후 진행할 수 있습니다.</p> : <section aria-label="담당자 양식 미리 보기"><p>아래 전체 양식은 미리 보기이며 현재 신청 상태가 아닙니다.</p>{Object.entries(detail.forms).map(([key, text]) => <p key={key} className="whitespace-pre-wrap break-words">{text}</p>)}</section>}
    {!ownerKnown ? <p role="status">본인 신청이거나 대상·담당자 식별이 부족하므로 처리할 수 없습니다.</p> : null}
    <label className="block"><input type="checkbox" checked={policyReviewed} disabled={!ownerKnown || Boolean(action.operation)} onChange={(e) => setPolicyReviewed(e.target.checked)} /> 운영 고지·관계 확인·선택 AI·보유/파기 기준의 별도 승인을 확인했습니다.</label>
    <p>기준이 미정이면 체크하지 마세요. 이 확인은 법무/개인정보 판단이나 지정 담당자 권한을 부여하지 않습니다.</p>
    <fieldset disabled={!canProcess} className="space-y-3">
      <label className="block">관계 <select disabled={!current} value={relationship} onChange={(e) => setRelationship(e.target.value as GuardianRelationship | '')}><option value="">직접 선택</option><option value="PARENT">부모</option><option value="MINOR_GUARDIAN">미성년후견인</option></select></label>
      <label className="block"><input type="checkbox" disabled={!current} checked={service} onChange={(e) => setService(e.target.checked)} /> 확인 범위 SERVICE</label>
      {s.webDeclaredAt && detail.declaredScopes.includes('EXTERNAL_AI') ? <label className="block"><input type="checkbox" disabled={!current} checked={ai} onChange={(e) => setAi(e.target.checked)} /> 확인 범위 EXTERNAL_AI</label> : <p>선택 AI의 현재 운영 범위를 구조화된 응답으로 확인할 수 없는 경우 수동으로 추가하지 않습니다.</p>}
      <label className="block">제한된 증거 참조 <input disabled={!current} value={evidence} maxLength={100} onChange={(e) => setEvidence(e.target.value)} /></label>
      <p>회신 본문·신분증·주민번호·연락처·토큰·외부 URL을 입력하지 마세요.</p>
      <label className="block">실제 회신 수신 시각 (UTC ISO) <input disabled={!current} placeholder="YYYY-MM-DDTHH:mm:ssZ" value={receivedAt} onChange={(e) => { setReceivedAt(e.target.value); setInputTime(Date.now()) }} /></label>
      <p>등록할 수단: {method ?? '없음'}. 검토 시각으로 대신 입력하지 않습니다.</p>
      {checklist(confirmationChecks)}
      <Button disabled={!current || !pending || !service || !relationship || !matchesDeclaration || !validTime || !/^[A-Za-z0-9_.:-]{1,100}$/.test(evidence) || !Object.keys(confirmationChecks).every((key) => checks[key as CheckName])} onClick={() => prepare('confirmation', { method, relationship, scopes, evidenceReference: evidence, responseReceivedAt: receivedAt, noticeVersion: s.noticeVersion, noticeDigest: s.noticeDigest, ...Object.fromEntries(Object.keys(confirmationChecks).map((key) => [key, checks[key as CheckName] === true])) })}>명시적 회신 등록 확인</Button>
      {checklist(decisionChecks)}
      <Button disabled={!current || s.state !== 'REVIEW_PENDING' || !s.explicitResponseAt || !detail.evidenceReference || !detail.confirmationMethod || !detail.declaredScopes.includes('SERVICE') || !Object.keys(decisionChecks).every((key) => checks[key as CheckName])} onClick={() => prepare('decision', { decision: 'APPROVE', ...Object.fromEntries(Object.keys(decisionChecks).map((key) => [key, checks[key as CheckName] === true])) })}>최종 승인 확인</Button>
      <label className="block">사유 <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}><option value="INCOMPLETE_RESPONSE">응답 불충분</option><option value="RELATIONSHIP_UNCONFIRMED">관계 미확인</option><option value="CONSENT_DECLINED">동의 거절</option><option value="OPERATOR_REVOKED">담당자 철회</option></select></label>
      <Button disabled={!current || !pending || reason === 'OPERATOR_REVOKED'} onClick={() => prepare('decision', { decision: 'REJECT', reason })}>반려 확인</Button>
      <Button disabled={!current || !pending || !['INCOMPLETE_RESPONSE', 'RELATIONSHIP_UNCONFIRMED'].includes(reason)} onClick={() => prepare('decision', { decision: 'NEEDS_INFORMATION', reason })}>보완 요청 확인</Button>
      <Button disabled={(!pending && s.state !== 'APPROVED') || reason === 'INCOMPLETE_RESPONSE'} onClick={() => prepare('revoke', { reason })}>담당자 철회 확인</Button>
    </fieldset>
    <GuardianOperationPanel action={action} />
  </section>
}
