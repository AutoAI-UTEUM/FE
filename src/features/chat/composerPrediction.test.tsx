import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { COMPOSER_PREDICTION_CONTRACT, parseComposerPrediction, requestComposerPrediction, selectPredictionTarget } from './composerPrediction'
import type { SessionTurnResult } from '../sessions'
import { useComposerPrediction } from './useComposerPrediction'
import { ChatPanel } from './ChatPanel'
import type { SessionChat } from './useSessionChat'
const target = { sourceMessageId: 123, activity: 'QA' as const }
const payload = { schemaVersion: '1.0', sourceMessageId: 123, sourceTurnId: 'message-123', contextVersion: 'a'.repeat(64), suggestion: '학습률을 바꾸면 어떻게 돼?', warnings: [] }
const response = (p: unknown = payload) => new Response(`event: prediction\ndata: ${JSON.stringify(p)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
it('selects only the final saved public AI source with explicit eligible state and no evaluation actions', () => {
  const saved: SessionTurnResult = { currentPage: 1, pageStatus: 'EXPLAINED', uiActions: [], messages: [{ id: '123', content: 'answer', createdAt: '', senderType: 'AI', status: 'COMPLETED', messageType: 'QA', pageNumber: 1 }] }
  expect(selectPredictionTarget(saved, 'USER_QUESTION')).toEqual(target)
  for (const patch of [{ pageStatus: undefined }, { pageStatus: 'TEACHBACK' }, { activeQuizId: '2' }, { pendingDiagnosis: { diagnosisId: '3' } }, { currentPage: 2 }, { uiActions: [{ kind: 'BINARY_DECISION', label: 'teachback', yesEvent: 'TEACHBACK', noEvent: 'WAIT' }] }]) {
    expect(selectPredictionTarget({ ...saved, ...patch } as SessionTurnResult, 'USER_QUESTION')).toBeUndefined()
  }
  for (const patch of [{ status: 'PENDING' }, { status: 'FAILED' }, { status: undefined }, { messageType: 'TEACHBACK' }, { messageType: 'QUIZ' }, { id: 'stream-123' }, { id: '9007199254740992' }, { senderType: 'USER' }]) {
    expect(selectPredictionTarget({ ...saved, messages: [{ ...saved.messages[0], ...patch }] } as SessionTurnResult, 'USER_QUESTION')).toBeUndefined()
  }
  expect(selectPredictionTarget(saved, 'QUIZ_TYPE_SELECTED')).toBeUndefined()
  expect(selectPredictionTarget({ ...saved, messages: [...saved.messages, { ...saved.messages[0], id: '124', messageType: 'NOTE' }] }, 'USER_QUESTION')).toBeUndefined()
})
beforeEach(() => vi.stubEnv('VITE_COMPOSER_PREDICTION_READINESS', COMPOSER_PREDICTION_CONTRACT))
afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.localStorage.clear() })
it('uses the separate POST SSE endpoint and sends only the persisted source id', async () => {
  const request = vi.fn().mockResolvedValue(response()); const signal = new AbortController().signal
  expect(await requestComposerPrediction(request, 's/1', target, signal)).toEqual(payload)
  expect(request).toHaveBeenCalledWith('/api/sessions/s%2F1/composer-prediction', expect.objectContaining({ method: 'POST', signal, body: '{"sourceMessageId":123}', cache: 'no-store', headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' } }))
})
it('OFF and unsupported stages send nothing; null contexts and invalid events do not produce drafts', async () => {
  const request = vi.fn().mockResolvedValue(response()); vi.stubEnv('VITE_COMPOSER_PREDICTION_READINESS', '')
  expect(await requestComposerPrediction(request, '1', target, new AbortController().signal)).toBeNull(); expect(request).not.toHaveBeenCalled()
  vi.stubEnv('VITE_COMPOSER_PREDICTION_READINESS', COMPOSER_PREDICTION_CONTRACT)
  for (const activity of ['QUIZ', 'DIAGNOSIS', 'TEACHBACK', 'OTHER']) await requestComposerPrediction(request, '1', { ...target, activity } as typeof target, new AbortController().signal)
  expect(request).not.toHaveBeenCalled()
  request.mockResolvedValue(response({ ...payload, contextVersion: null, suggestion: null, warnings: [{ type: 'PREDICTION_UNAVAILABLE', message: 'optional failure' }] })); expect(await requestComposerPrediction(request, '1', target, new AbortController().signal)).toBeNull()
  expect(() => parseComposerPrediction({ ...payload, suggestion: 'x'.repeat(161) })).toThrow(); expect(() => parseComposerPrediction({ ...payload, sourceTurnId: 'learning-run-uuid' })).toThrow()
})
it('typing aborts and discards a late response even if the transport ignores abort; clearing input never repeats that completion', async () => {
  let resolve!: (r: Response) => void
  const request = vi.fn().mockImplementation(() => new Promise(r => { resolve = r }))
  const { result, rerender } = renderHook(({ empty }) => useComposerPrediction({ request, sessionId: '1', scope: 'user:1/page:1', target, empty, blocked: false, enabled: true }), { initialProps: { empty: true } })
  expect(request).toHaveBeenCalledTimes(1); act(() => result.current.discard()); rerender({ empty: false }); expect(request.mock.calls[0][1].signal.aborted).toBe(true)
  await act(async () => resolve(response())); rerender({ empty: true }); expect(result.current.suggestion).toBeNull(); expect(request).toHaveBeenCalledTimes(1)
})
it('page/session/context changes, evaluation, hiding, and preference OFF fence results and retain duplicate suppression', async () => {
  const request = vi.fn().mockImplementation(() => new Promise(() => {}))
  const { result, rerender } = renderHook(({ scope, blocked, enabled }) => useComposerPrediction({ request, sessionId: '1', scope, target, empty: true, blocked, enabled }), { initialProps: { scope: 'u:1/s:1/p:1', blocked: false, enabled: true } })
  rerender({ scope: 'u:1/s:1/p:2', blocked: false, enabled: true }); expect(request.mock.calls[0][1].signal.aborted).toBe(true)
  rerender({ scope: 'u:1/s:1/p:2', blocked: true, enabled: true }); expect(request.mock.calls[1][1].signal.aborted).toBe(true)
  rerender({ scope: 'u:1/s:1/p:2', blocked: false, enabled: false }); act(() => window.dispatchEvent(new Event('pagehide'))); expect(result.current.suggestion).toBeNull(); expect(request).toHaveBeenCalledTimes(2)
})
it('failure never retries, and null suggestions do not display', async () => {
  const request = vi.fn().mockRejectedValue(new Error('synthetic timeout'))
  const { result, rerender } = renderHook(() => useComposerPrediction({ request, sessionId: '1', scope: 'user/page', target, empty: true, blocked: false, enabled: true }))
  await act(async () => {}); rerender(); expect(result.current.suggestion).toBeNull(); expect(request).toHaveBeenCalledTimes(1)
  request.mockResolvedValue(response({ ...payload, suggestion: null })); expect((await requestComposerPrediction(request, '1', target, new AbortController().signal))?.suggestion).toBeNull()
})
it.each(['Tab', 'click'])('accepts by %s into an editable draft, and requires a separate explicit send', async (accept) => {
  const request = vi.fn().mockResolvedValue(response())
  const chat = { messages: [], isTurnPending: false, hasOlderMessages: false, isLoadingHistory: false, isLoadingOlderMessages: false, historyError: null, streamUiActions: [], quizQuestionPreview: [], submitTurn: vi.fn().mockResolvedValue({ messages: [], uiActions: [] }), appendLocalMessage: vi.fn(), clearNoteDraft: vi.fn() } as unknown as SessionChat
  render(<ChatPanel chat={chat} sessionId="1" textSizeOwnerId={12} predictionRequest={request} predictionTarget={target} predictionBlocked={false} />)
  await screen.findByText(payload.suggestion); const input = screen.getByLabelText('질문'); expect(input).toBeEnabled()
  if (accept === 'Tab') fireEvent.keyDown(input, { key: 'Tab' }); else fireEvent.click(screen.getByText('제안을 초안에 넣기 (Tab)'))
  expect(input).toHaveValue(payload.suggestion); expect(chat.submitTurn).not.toHaveBeenCalled(); expect(chat.appendLocalMessage).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: `${payload.suggestion} 편집` } }); fireEvent.keyDown(input, { key: 'Enter' }); await waitFor(() => expect(chat.submitTurn).toHaveBeenCalledTimes(1))
})

it('accepts only the first prediction SSE event and rejects mismatched persisted sources', async () => {
  const request = vi.fn().mockResolvedValue(new Response(`event: prediction\ndata: ${JSON.stringify(payload)}\n\nevent: prediction\ndata: ${JSON.stringify({ ...payload, suggestion: 'duplicate' })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }))
  expect((await requestComposerPrediction(request, '1', target, new AbortController().signal))?.suggestion).toBe(payload.suggestion)
  request.mockResolvedValue(response({ ...payload, sourceMessageId: 124, sourceTurnId: 'message-124' }))
  expect(await requestComposerPrediction(request, '1', target, new AbortController().signal)).toBeNull()
})

it('rejects malformed context, multi-line suggestions, and non-object warnings', () => {
  expect(() => parseComposerPrediction({ ...payload, contextVersion: 'local-page-1' })).toThrow()
  expect(() => parseComposerPrediction({ ...payload, suggestion: 'first\nsecond' })).toThrow()
  expect(() => parseComposerPrediction({ ...payload, warnings: ['PREDICTION_UNAVAILABLE'] })).toThrow()
})

it('blocks a newly completed source throughout IME composition, including an empty composing input', async () => {
  const request = vi.fn().mockResolvedValue(response())
  const chat = { messages: [], isTurnPending: false, hasOlderMessages: false, isLoadingHistory: false, isLoadingOlderMessages: false, historyError: null, streamUiActions: [], quizQuestionPreview: [] } as unknown as SessionChat
  const { rerender } = render(<ChatPanel chat={chat} sessionId="1" predictionRequest={request} predictionBlocked={false} />)
  fireEvent.compositionStart(screen.getByLabelText('질문'))
  rerender(<ChatPanel chat={chat} sessionId="1" predictionRequest={request} predictionBlocked={false} predictionTarget={target} />)
  expect(request).not.toHaveBeenCalled()
  fireEvent.compositionEnd(screen.getByLabelText('질문'))
  await screen.findByText(payload.suggestion)
  expect(request).toHaveBeenCalledTimes(1)
  fireEvent.compositionStart(screen.getByLabelText('질문'))
  expect(screen.queryByText(payload.suggestion)).not.toBeInTheDocument()
})

it('rejects unsuccessful HTTP responses even when their body claims to be SSE', async () => {
  const request = vi.fn().mockResolvedValue(new Response(`event: prediction\ndata: ${JSON.stringify(payload)}\n\n`, { status: 500, headers: { 'Content-Type': 'text/event-stream' } }))
  await expect(requestComposerPrediction(request, '1', target, new AbortController().signal)).rejects.toThrow('Prediction SSE required')
})
