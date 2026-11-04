import type { AuthenticatedRawRequest } from '../auth'
import { consumeSseStream } from '../sessions/sseParser'

/** Intentionally absent from deployment configuration. Requires a current server context contract. */
export const COMPOSER_PREDICTION_CONTRACT = 'spring-composer-prediction-sse-v1'
export const isComposerPredictionReady = () => import.meta.env.VITE_COMPOSER_PREDICTION_READINESS === COMPOSER_PREDICTION_CONTRACT
export interface PredictionTarget {
  sourceMessageId: number
  /** The current server-generated version, obtained independently of the prediction response. */
  contextVersion: string
  activity: 'EXPLAIN' | 'QA'
}
export interface ComposerPrediction {
  schemaVersion: '1.0'; sourceMessageId: number; sourceTurnId: string; contextVersion: string | null
  suggestion: string | null; warnings: string[]
}
export function parseComposerPrediction(value: unknown): ComposerPrediction {
  if (!value || typeof value !== 'object') throw new Error('Invalid prediction')
  const v = value as ComposerPrediction
  if (v.schemaVersion !== '1.0' || !Number.isSafeInteger(v.sourceMessageId) || v.sourceMessageId <= 0 || v.sourceTurnId !== `message-${v.sourceMessageId}` || (v.contextVersion !== null && (typeof v.contextVersion !== 'string' || !v.contextVersion.trim() || v.contextVersion.length > 128)) || (v.suggestion !== null && (typeof v.suggestion !== 'string' || !v.suggestion.trim() || [...v.suggestion].length > 160)) || !Array.isArray(v.warnings) || !v.warnings.every(w => typeof w === 'string')) throw new Error('Invalid prediction')
  return { schemaVersion: v.schemaVersion, sourceMessageId: v.sourceMessageId, sourceTurnId: v.sourceTurnId, contextVersion: v.contextVersion, suggestion: v.suggestion, warnings: v.warnings }
}
export async function requestComposerPrediction(request: AuthenticatedRawRequest, sessionId: string, target: PredictionTarget, signal: AbortSignal): Promise<ComposerPrediction | null> {
  if (!isComposerPredictionReady() || signal.aborted || !Number.isSafeInteger(target.sourceMessageId) || target.sourceMessageId <= 0 || !target.contextVersion.trim() || target.contextVersion.length > 128 || !['EXPLAIN', 'QA'].includes(target.activity)) return null
  const response = await request(`/api/sessions/${encodeURIComponent(sessionId)}/composer-prediction`, {
    method: 'POST', body: JSON.stringify({ sourceMessageId: target.sourceMessageId }), headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' }, signal, cache: 'no-store',
  })
  if (!response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) throw new Error('Prediction SSE required')
  let result: ComposerPrediction | null = null
  let received = false
  await consumeSseStream(response.body, event => {
    if (signal.aborted || event.event !== 'prediction' || received) return
    received = true
    const value = parseComposerPrediction(JSON.parse(event.data))
    if (value.sourceMessageId === target.sourceMessageId && value.contextVersion === target.contextVersion) result = value
  })
  return signal.aborted ? null : result
}
