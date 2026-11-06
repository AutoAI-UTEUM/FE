import { useEffect, useRef, useState } from 'react'
import { ChevronRight, FileText } from 'lucide-react'
import { apiRequest } from '../../shared/api'
import { Button } from '../../shared/ui'
import { type PolicyDocument, type useSignupContract } from './useSignupContract'

export function SignupContractFields({ contract }: {
  contract: ReturnType<typeof useSignupContract>
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
  return <fieldset className="min-w-0 space-y-3">
    <legend className="mb-3 type-caption font-semibold text-stone-800">정책 동의</legend>
    {contract.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 type-caption text-red-700">{contract.error}</p> : null}
    {contract.policyNotReady ? <div role="status" className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4 type-caption leading-relaxed text-stone-600">
      <p>서버에서 가입 정책을 준비 중입니다. 정책 목록만으로 가입 가능 여부를 판단하지 않습니다.</p>
      {contract.retryUsed ? <p>이번 화면의 재확인을 사용했습니다. 나중에 다시 방문해 주세요.</p>
        : <Button variant="secondary" size="sm" disabled={contract.loading} onClick={() => void contract.retryPolicyLookup()}>현재 정책 한 번 다시 확인</Button>}
    </div> : contract.documents === null ? <Button variant="secondary" size="sm" disabled={contract.loading} onClick={() => void contract.reload()}>현재 정책 다시 조회</Button> : null}
    {contract.documents?.map((document) => <div key={`${document.type}:${document.version}`} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <button type="button" aria-label={`${document.title} 전문 보기`} className="flex min-h-14 w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600" onClick={() => void showDocument(document)}>
        <FileText aria-hidden="true" size={18} className="shrink-0 text-stone-500" />
        <span className="min-w-0 flex-1 break-words type-caption font-medium leading-relaxed text-stone-800">{document.title}</span>
        <span className="shrink-0 type-micro text-stone-500">전문 보기</span>
        <ChevronRight aria-hidden="true" size={15} className="shrink-0 text-stone-400" />
      </button>
      {document.requiresConsent ? <label className="flex min-h-11 cursor-pointer items-start gap-2.5 border-t border-stone-100 bg-stone-50 px-3.5 py-3 type-caption leading-relaxed text-stone-700">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-700" checked={contract.consents.some((choice) => choice.type === document.type && choice.version === document.version)}
          onChange={(event) => contract.setConsents((current) => event.target.checked
            ? [...current.filter((choice) => choice.type !== document.type), { type: document.type, version: document.version }]
            : current.filter((choice) => choice.type !== document.type))} />
        <span className="min-w-0 break-words">{document.title} 동의 (필수)</span>
      </label> : <p className="border-t border-stone-100 bg-stone-50 px-3.5 py-2.5 type-micro leading-relaxed text-stone-500">열람 안내 · 별도 가입 동의 대상이 아닙니다.</p>}
    </div>)}
    {content !== null ? <div className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-2">
        <p className="type-caption font-semibold text-stone-700">정책 전문</p>
        <Button variant="ghost" size="sm" aria-label="정책 전문 닫기" onClick={() => { detailRef.current?.abort(); setContent(null) }}>닫기</Button>
      </div>
      <div className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-4 type-caption leading-relaxed text-stone-600" aria-label="정책 전문" tabIndex={0}>{content}</div>
    </div> : null}
  </fieldset>
}
