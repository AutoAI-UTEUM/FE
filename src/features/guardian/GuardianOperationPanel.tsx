import { Button } from '../../shared/ui'
import type { useGuardianOperation } from './useGuardianOperation'

export function GuardianOperationPanel({ action }: { action: ReturnType<typeof useGuardianOperation> }) {
  const review = action.operation ? JSON.parse(action.operation.body) as Record<string, unknown> : null
  return <>
    {action.error ? <p role="alert">{action.error}</p> : null}
    {action.operation ? <section aria-label="최종 확인" className="space-y-3 rounded border border-stone-300 p-4">
      <p>확인할 작업: {action.operation.command} · 신청: {action.operation.requestId ?? '새 접수'}</p>
      {review ? <p>차수: {String(review.generation ?? '새 접수')} · 수정번호: {String(review.revision ?? '새 접수')} · 범위: {Array.isArray(review.scopes) ? review.scopes.join(', ') || '없음' : '해당 없음'} · 결정: {String(review.decision ?? review.accepted ?? review.reason ?? action.operation.command)}</p> : null}
      <p>전송 결과는 서버 응답으로만 확정됩니다. 응답이 없거나 화면을 닫아도 서버 처리가 취소됐다고 보장할 수 없습니다.</p>
      <Button disabled={action.busy} onClick={() => void action.send()}>{action.uncertain ? '같은 요청 다시 확인' : '확인 후 전송'}</Button>
      {!action.uncertain && !action.busy ? <Button variant="secondary" onClick={action.clear}>전송 전 취소</Button> : null}
      {action.busy ? <p role="status">서버 응답을 확인하는 중입니다.</p> : null}
    </section> : null}
  </>
}
