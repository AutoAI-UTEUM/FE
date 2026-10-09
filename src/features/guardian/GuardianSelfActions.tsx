import { useState } from 'react'
import { Button } from '../../shared/ui'
import { useAuth } from '../auth'
import { guardianLinkMessage, isGuardianPending, type GuardianEntry, type GuardianLink, type GuardianStatus, type GuardianView } from './guardianContract'
import { createGuardianOperation } from './guardianWorkflowRepository'
import { GuardianOperationPanel } from './GuardianOperationPanel'
import { useGuardianOperation } from './useGuardianOperation'

export function GuardianSelfActions({ entry, onUpdated, onInvalidate, onPendingChange }: { entry: GuardianEntry; onUpdated: (result: GuardianView | GuardianStatus | GuardianLink) => void; onInvalidate: (message?: string) => void; onPendingChange: (pending: boolean) => void }) {
  const { apiRequest } = useAuth()
  const [acknowledged, setAcknowledged] = useState(false)
  const action = useGuardianOperation(apiRequest, (result) => { setAcknowledged(false); onUpdated(result) }, onInvalidate, onPendingChange)
  const status = entry.request?.status
  const locked = Boolean(action.operation)
  const mutation = status ? { generation: status.generation, revision: status.revision } : null
  return <section aria-label="본인 신청 처리" className="space-y-3 border-t pt-4">
    <p>보호자 확인 신청을 접수합니다. 담당자 확인이 끝날 때까지 해당 이용은 제한됩니다. 보호자 이름·연락처는 이 화면에서 미리 수집하지 않습니다.</p>
    <label className="block"><input type="checkbox" checked={acknowledged} disabled={locked} onChange={(e) => setAcknowledged(e.target.checked)} /> 신청·링크 발급·철회의 의미와 현재 차수를 확인했습니다.</label>
    {entry.teamReviewAvailable && entry.canStartRequest ? <Button disabled={!acknowledged || locked} onClick={() => action.prepare(createGuardianOperation('intake', null, { guardianContactProvidedByChild: false }))}>신청 접수 확인</Button> : null}
    {status && isGuardianPending(status) && status.currentNotice && entry.request?.replyChannel ? <Button disabled={!acknowledged || locked} onClick={() => action.prepare(createGuardianOperation('link', status.requestId, mutation!))}>안내 링크 발급 확인</Button> : null}
    {status && (isGuardianPending(status) || status.state === 'APPROVED') ? <>
      <p>철회하면 진행 중 신청 또는 이용 승인이 해제됩니다. 이메일 확인 대기 중에도 본인 철회가 가능합니다.</p>
      <Button disabled={!acknowledged || locked} onClick={() => action.prepare(createGuardianOperation('withdraw', status.requestId, mutation!))}>신청·승인 철회 확인</Button>
    </> : null}
    <p>재발급은 이전 링크와 확인 결과를 무효화하고 신청·최초 수집 기한을 연장하지 않습니다. 링크를 발급해도 메일을 보냈다는 뜻은 아닙니다.</p>
    <GuardianOperationPanel action={action} />
  </section>
}
export function GuardianIssuedLink({ link }: { link: GuardianLink }) {
  return <section aria-label="발급 응답" className="space-y-2 break-all">
    <p>{guardianLinkMessage(link)}</p><p>링크 만료: {link.expiresAt ?? '기록 없음'}</p>
    {link.url !== null ? <><p>보호자에게 전달할 링크 (발송 미실시):</p><p>{link.url}</p></> : null}
  </section>
}
