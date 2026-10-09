import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../../shared/api'
import { type PolicyDocument, type useSignupContract } from './useSignupContract'

export function SignupContractFields({ contract, dateOfBirth, onDateChange, dateError }: {
  contract: ReturnType<typeof useSignupContract>
  dateOfBirth: string
  onDateChange: (value: string) => void
  dateError?: string
}) {
  const [content, setContent] = useState<string | null>(null)
  const detailRef = useRef<AbortController | null>(null)
  useEffect(() => () => detailRef.current?.abort(), [])
  useEffect(() => {
    if (contract.documents === null || contract.policyNotReady) {
      detailRef.current?.abort()
      queueMicrotask(() => setContent(null))
    }
  }, [contract.documents, contract.policyNotReady])
  if (!contract.enabled) return null
  async function showDocument(document: PolicyDocument) {
    detailRef.current?.abort()
    const controller = new AbortController()
    detailRef.current = controller
    setContent('정책 전문을 불러오는 중입니다.')
    try {
      const { data } = await apiRequest<{ content: string }>(`/api/policies/${encodeURIComponent(document.type)}/${encodeURIComponent(document.version)}`, { signal: controller.signal })
      if (!controller.signal.aborted) setContent(data.content)
    } catch {
      if (!controller.signal.aborted) setContent('정책 전문을 불러오지 못했습니다. 다시 열어 주세요.')
    }
  }
  return <fieldset className="space-y-3">
    <legend className="font-semibold">가입 정보 및 정책 동의</legend>
    <label className="block" htmlFor="signup-date-of-birth">생년월일</label>
    <input className="h-11 w-full rounded-lg border border-stone-300 px-3" id="signup-date-of-birth"
      type="date" value={dateOfBirth} onChange={(event) => onDateChange(event.target.value)}
      aria-invalid={Boolean(dateError)} aria-describedby={dateError ? 'signup-date-error' : undefined} />
    {dateError ? <p id="signup-date-error" role="alert">{dateError}</p> : null}
    <p>생년월일 입력은 나이 확인이나 보호자 승인을 완료하지 않습니다.</p>
    {contract.error ? <p role="alert">{contract.error}</p> : null}
    {contract.policyNotReady ? <div role="status">
      <p>서버에서 가입 정책을 준비 중입니다. 정책 목록만으로 가입 가능 여부를 판단하지 않습니다.</p>
      {contract.retryUsed ? <p>이번 화면의 재확인을 사용했습니다. 나중에 다시 방문해 주세요.</p>
        : <button type="button" disabled={contract.loading} onClick={() => void contract.retryPolicyLookup()}>현재 정책 한 번 다시 확인</button>}
    </div> : contract.documents === null ? <button type="button" disabled={contract.loading} onClick={() => void contract.reload()}>현재 정책 다시 조회</button> : null}
    {contract.documents?.map((document) => <div key={`${document.type}:${document.version}`}>
      <button type="button" className="underline" onClick={() => void showDocument(document)}>{document.title} 전문 보기</button>
      {document.requiresConsent ? <label className="mt-2 flex gap-2">
        <input type="checkbox" checked={contract.consents.some((choice) => choice.type === document.type && choice.version === document.version)}
          onChange={(event) => contract.setConsents((current) => event.target.checked
            ? [...current.filter((choice) => choice.type !== document.type), { type: document.type, version: document.version }]
            : current.filter((choice) => choice.type !== document.type))} />
        {document.title} 동의 (필수)
      </label> : <p>열람 안내 · 별도 가입 동의 대상이 아닙니다.</p>}
    </div>)}
    {content !== null ? <div className="max-h-72 overflow-auto whitespace-pre-wrap border p-3" aria-label="정책 전문">{content}</div> : null}
  </fieldset>
}
