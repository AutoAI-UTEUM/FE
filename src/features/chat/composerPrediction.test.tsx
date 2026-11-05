import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { COMPOSER_PREDICTION_CONTRACT, parseComposerPrediction, requestComposerPrediction } from './composerPrediction'
import { useComposerPrediction } from './useComposerPrediction'
import { ChatPanel } from './ChatPanel'
import type { SessionChat } from './useSessionChat'
const target = { sourceMessageId: 123, activity: 'QA' as const }
const payload = { schemaVersion: '1.0', sourceMessageId: 123, sourceTurnId: 'message-123', contextVersion: 'a'.repeat(64), suggestion: '학습률을 바꾸면 어떻게 돼?', warnings: [] }
const response = (p: unknown = payload) => new Response(`event: prediction\ndata: ${JSON.stringify(p)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
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
