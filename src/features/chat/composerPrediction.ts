import type { AuthenticatedRawRequest } from '../auth'
import { consumeSseStream } from '../sessions/sseParser'
import type { SessionTurnRequest, SessionTurnResult, UiAction } from '../sessions'

/** Intentionally absent from deployment configuration. Requires a current server context contract. */
export const COMPOSER_PREDICTION_CONTRACT = 'spring-composer-prediction-sse-v1'
export const isComposerPredictionReady = () => import.meta.env.VITE_COMPOSER_PREDICTION_READINESS === COMPOSER_PREDICTION_CONTRACT
export interface PredictionTarget {
  sourceMessageId: number
  activity: 'EXPLAIN' | 'QA'
}

export function isPredictionActionSafe(action: UiAction): boolean {
  return action.kind === 'BINARY_DECISION'
    && ['MOVE_NEXT_PAGE', 'COMPLETE_SESSION', 'NOTE_REQUESTED'].includes(action.yesEvent)
    && action.noEvent === 'WAIT'
}

/** Only an acknowledged turn POST may nominate a source; never history or stream completion. */
export function selectPredictionTarget(result: SessionTurnResult, event: SessionTurnRequest['eventType']): PredictionTarget | undefined {
  if (!['EXPLAIN_CURRENT_PAGE', 'USER_QUESTION'].includes(event)
    || result.predictionUnsafe || result.pageStatus !== 'EXPLAINED' || result.activeQuizId || result.pendingDiagnosis
    || !result.uiActions.every(isPredictionActionSafe)) return undefined
  const message = result.messages.at(-1)
  if (!message || message.senderType !== 'AI' || message.status !== 'COMPLETED'
    || !message.content.trim() || message.pageNumber !== result.currentPage
    || !Number.isSafeInteger(result.currentPage) || (result.currentPage ?? 0) <= 0
    || !/^[1-9]\d*$/.test(message.id)) return undefined
  const sourceMessageId = Number(message.id)
  if (!Number.isSafeInteger(sourceMessageId)) return undefined
  if (message.messageType === 'EXPLANATION') return { sourceMessageId, activity: 'EXPLAIN' }
  if (message.messageType === 'QA') return { sourceMessageId, activity: 'QA' }
  return undefined
}
export interface ComposerPrediction {
  schemaVersion: '1.0'; sourceMessageId: number; sourceTurnId: string; contextVersion: string | null
  suggestion: string | null; warnings: { type: 'PREDICTION_UNAVAILABLE'; message: string }[]
}
export function parseComposerPrediction(value: unknown): ComposerPrediction {
  if (!value || typeof value !== 'object') throw new Error('Invalid prediction')
  const v = value as ComposerPrediction
  if (v.schemaVersion !== '1.0' || !Number.isSafeInteger(v.sourceMessageId) || v.sourceMessageId <= 0 || v.sourceTurnId !== `message-${v.sourceMessageId}` || (v.contextVersion !== null && (typeof v.contextVersion !== 'string' || !/^[a-f0-9]{64}$/.test(v.contextVersion))) || (v.suggestion !== null && (typeof v.suggestion !== 'string' || !v.suggestion.trim() || /[\r\n]/.test(v.suggestion) || [...v.suggestion].length > 160)) || !Array.isArray(v.warnings) || !v.warnings.every(w => w && typeof w === 'object' && w.type === 'PREDICTION_UNAVAILABLE' && typeof w.message === 'string')) throw new Error('Invalid prediction')
  return { schemaVersion: v.schemaVersion, sourceMessageId: v.sourceMessageId, sourceTurnId: v.sourceTurnId, contextVersion: v.contextVersion, suggestion: v.suggestion, warnings: v.warnings }
}
export async function requestComposerPrediction(request: AuthenticatedRawRequest, sessionId: string, target: PredictionTarget, signal: AbortSignal): Promise<ComposerPrediction | null> {
  if (!isComposerPredictionReady() || signal.aborted || !Number.isSafeInteger(target.sourceMessageId) || target.sourceMessageId <= 0 || !['EXPLAIN', 'QA'].includes(target.activity)) return null
  const response = await request(`/api/sessions/${encodeURIComponent(sessionId)}/composer-prediction`, {
    method: 'POST', body: JSON.stringify({ sourceMessageId: target.sourceMessageId }), headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' }, signal, cache: 'no-store',
  })
  if (!response.ok || !response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) throw new Error('Prediction SSE required')
  let result: ComposerPrediction | null = null
  let received = false
  await consumeSseStream(response.body, event => {
    if (signal.aborted || event.event !== 'prediction' || received) return
    received = true
    const value = parseComposerPrediction(JSON.parse(event.data))
    if (value.sourceMessageId === target.sourceMessageId && value.contextVersion !== null) result = value
  })
  return signal.aborted ? null : result
}
