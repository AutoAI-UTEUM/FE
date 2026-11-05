import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { Button } from '../../shared/ui'
import { isGuardianPending, type GuardianDetail, type GuardianRelationship } from './guardianContract'
import { GuardianOperationPanel } from './GuardianOperationPanel'
import { createGuardianOperation } from './guardianWorkflowRepository'
import { guardianWorkflowError, useGuardianOperation } from './useGuardianOperation'
import { assertPriorConsentReady, isPriorConsentReady, parsePriorConsentOptions, type PriorConsentOptions } from './priorConsentContract'

const checks = {
  subjectMatched: '대상 계정과 원본의 동의 대상을 대조했습니다.',
  responseExplicitlyConsents: '대면 확인 등 원본에 명시적인 동의가 있습니다.',
  legalGuardianDeclarationConfirmed: '법정대리인 관계와 선언을 검토했습니다.',
  guardianContactChecked: '원본의 보호자 연락처와 대상을 확인했습니다.',
  noticeAndScopesMatched: '현재 고지와 선택한 범위를 원본이 포함합니다.',
  confirmationMethodChecked: '실제 확인 수단을 확인했습니다.',
  evidenceReferenceChecked: '권한 있는 담당자가 보관 원본에 접근할 수 있습니다.',
  validityChecked: '원본 유효기한과 재사용 정책을 검토했습니다.',
  notWithdrawn: '현재 철회 기록을 조회하여 철회되지 않았음을 확인했습니다.',
}
export function PriorConsentReview(props: { detail: GuardianDetail | null; disabled: boolean; onPendingChange: (pending: boolean) => void; onInvalidate: (message?: string) => void }) {
  if (!isPriorConsentReady()) return null
  return <PriorConsentForm {...props} />
}
function PriorConsentForm({ detail, disabled, onPendingChange, onInvalidate }: Parameters<typeof PriorConsentReview>[0]) {
  const { apiRequest, user } = useAuth()
  const [options, setOptions] = useState<PriorConsentOptions | null>(null)
  const [error, setError] = useState('')
  const [target, setTarget] = useState(detail?.userId?.toString() ?? '')
  const [method, setMethod] = useState('')
  const [relationship, setRelationship] = useState<GuardianRelationship | ''>('')
  const [evidence, setEvidence] = useState('')
  const [received, setReceived] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [service, setService] = useState(false)
  const [ai, setAi] = useState(false)
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({})
  const active = useRef<AbortController | null>(null)
  const [loading, setLoading] = useState(false)
  const [inputTime, setInputTime] = useState(() => Date.now())
  function invalidate(message?: string) { setOptions(null); setReviewed({}); setEvidence(''); setReceived(''); setValidUntil(''); setTarget(''); setMethod(''); setRelationship(''); setService(false); setAi(false); onInvalidate(message) }
  const action = useGuardianOperation(apiRequest, () => invalidate('서버 승인 응답을 받았습니다. 이메일 인증·외부 AI 이용 가능 여부는 별도로 확인하세요.'), invalidate, onPendingChange)
  useEffect(() => {
    const clear = () => { active.current?.abort(); setOptions(null); setTarget(''); setMethod(''); setRelationship(''); setEvidence(''); setReceived(''); setValidUntil(''); setReviewed({}); setService(false); setAi(false); setLoading(false) }
    window.addEventListener('pagehide', clear)
    return () => { active.current?.abort(); window.removeEventListener('pagehide', clear) }
  }, [])
  async function load() {
    if (active.current || disabled || action.operation) return
    const controller = new AbortController(); active.current = controller; setLoading(true); setOptions(null); setError(''); setReviewed({}); setMethod(''); setService(false); setAi(false)
    try {
      assertPriorConsentReady()
      const { data } = await apiRequest<unknown>('/api/admin/guardian-requests/prior-consent/options', { signal: controller.signal, cache: 'no-store', referrerPolicy: 'no-referrer' })
      if (!controller.signal.aborted) setOptions(parsePriorConsentOptions(data))
    } catch (e) { if (!controller.signal.aborted) setError(guardianWorkflowError(e)) }
    finally { if (active.current === controller) { active.current = null; if (!controller.signal.aborted) setLoading(false) } }
  }
  const targetId = /^\d+$/.test(target) ? Number(target) : NaN
  const scopes = ['SERVICE', ...(ai ? ['EXTERNAL_AI'] : [])]
  const snapshotValid = !detail || (detail.userId === targetId && detail.status.generation === 1 && isGuardianPending(detail.status) && detail.status.currentNotice && detail.status.noticeVersion === options?.noticeVersion && detail.status.noticeDigest === options?.noticeDigest && (detail.status.requestExpiresAt === null || Date.parse(detail.status.requestExpiresAt) > inputTime))
  const declarationMatches = !detail?.status.webDeclaredAt || (detail.relationship === relationship && JSON.stringify([...detail.declaredScopes].sort()) === JSON.stringify([...scopes].sort()))
  const utc = (text: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text) && Number.isFinite(Date.parse(text))
  const valid = options?.available && Number.isSafeInteger(targetId) && targetId > 0 && user?.id !== undefined && targetId !== user.id && snapshotValid && declarationMatches && relationship && service && options.methods.includes(method as PriorConsentOptions['methods'][number]) && /^[A-Za-z0-9_.:-]{1,100}$/.test(evidence) && utc(received) && Date.parse(received) < inputTime && (!detail || (detail.generationStartedAt !== null && Date.parse(received) < Date.parse(detail.generationStartedAt))) && utc(validUntil) && Date.parse(validUntil) > inputTime && Object.keys(checks).every(key => reviewed[key])
  function prepare() {
    if (!valid || disabled || loading || Date.parse(validUntil) <= Date.now() || Date.parse(received) >= Date.now()) return
    const operation = createGuardianOperation('prior-consent', detail?.status.requestId ?? null, { requestId: detail?.status.requestId ?? null, generation: detail?.status.generation ?? 0, revision: detail?.status.revision ?? 0, method, relationship, scopes, evidenceReference: evidence, responseReceivedAt: received, consentValidUntil: validUntil, noticeVersion: options!.noticeVersion, noticeDigest: options!.noticeDigest, ...Object.fromEntries(Object.keys(checks).map(key => [key, reviewed[key] === true])) })
    action.prepare(Object.freeze({ ...operation, userId: targetId }))
  }
  return <section aria-label="보관 사전 동의 검토" className="space-y-3 border-t pt-4">
    <h2>보관된 대면 사전 동의 검토</h2>
    <p>실제 원본과 승인된 재사용 정책을 확인한 담당자만 처리하세요. 증빙 파일·연락처·이름은 입력하지 않습니다.</p>
    <Button disabled={disabled || loading || Boolean(action.operation)} onClick={() => void load()}>사전 동의 옵션 확인</Button>
    {error ? <p role="alert">{error}</p> : null}
    {options && !options.available ? <p role="status">사전 동의 처리를 사용할 수 없습니다.</p> : null}
    {options?.available ? <fieldset disabled={loading || (disabled && !action.operation) || Boolean(action.operation)} className="space-y-3" onChange={e => { setInputTime(Date.now()); if (e.target instanceof HTMLSelectElement || (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox')) setReviewed({}) }}>
      <p>현재 고지 {options.noticeVersion} · 원본 최대 재사용 기간 {options.maxAge}</p>
      <a href={options.noticeUrl!} target="_blank" rel="noreferrer">현재 고지 확인</a>
      <p>{detail ? `조회한 신청 ${detail.status.requestId} · 차수 ${detail.status.generation} · 수정번호 ${detail.status.revision}` : '신청이 없는 가입 계정의 첫 신청만 생성합니다. 기존 신청 여부와 대상 적격성은 서버가 다시 확인합니다.'}</p>
      <label className="block">대상 계정 ID <input value={target} disabled={Boolean(detail)} inputMode="numeric" onChange={e => setTarget(e.target.value)} /></label>
      <label className="block">원본 확인 수단 <select value={method} onChange={e => setMethod(e.target.value)}><option value="">직접 선택</option>{options.methods.map(m => <option key={m} value={m}>{m === 'IN_PERSON' ? '대면 확인' : m}</option>)}</select></label>
      <label className="block">원본의 관계 <select value={relationship} onChange={e => setRelationship(e.target.value as GuardianRelationship)}><option value="">직접 선택</option><option value="PARENT">부모</option><option value="MINOR_GUARDIAN">미성년후견인</option></select></label>
      <label className="block">보관 원본 참조 <input value={evidence} maxLength={100} onChange={e => setEvidence(e.target.value)} /></label>
      <label className="block">실제 대면 동의 확인일 (UTC ISO) <input value={received} onChange={e => setReceived(e.target.value)} /></label>
      <label className="block">원본 동의 유효기한 (UTC ISO) <input value={validUntil} onChange={e => setValidUntil(e.target.value)} /></label>
      <p>실제 확인일은 서버 검토일과 다릅니다. 최대 재사용 기간·만료·철회 여부는 서버가 다시 검증합니다.</p>
      <label className="block"><input type="checkbox" checked={service} onChange={e => { setService(e.target.checked); setReviewed({}) }} /> 사전 기록 SERVICE 동의</label>
      {options.optionalAiScope === 'EXTERNAL_AI' ? <label className="block"><input type="checkbox" checked={ai} onChange={e => { setAi(e.target.checked); setReviewed({}) }} /> 사전 기록 EXTERNAL_AI 동의</label> : null}
      {Object.entries(checks).map(([key, label]) => <label key={key} className="block"><input type="checkbox" checked={reviewed[key] === true} onChange={e => setReviewed({ ...reviewed, [key]: e.target.checked })} /> {label}</label>)}
      <Button disabled={!valid} onClick={prepare}>사전 동의 승인 최종 확인</Button>
    </fieldset> : null}
    <GuardianOperationPanel action={action} />
  </section>
}
