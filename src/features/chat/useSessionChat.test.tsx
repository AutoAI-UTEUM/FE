import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '../../shared/api'
import type {
  SessionStreamHandlers,
  SessionsRepository,
  SessionTurnResult,
} from '../sessions'
import { useSessionChat } from './useSessionChat'

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useSessionChat stream readiness', () => {
  it('posts once after ready for each consecutive question, even with duplicate ready events', async () => {
    const attempts: SessionStreamHandlers[] = []
    const submitTurn = vi.fn().mockResolvedValue(emptyTurnResult())
    const repository = createRepository({
      stream: vi.fn().mockImplementation((_sessionId, nextHandlers, signal) => {
        attempts.push(nextHandlers)
        return resolveWhenAborted(signal)
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => {
      turnPromise = result.current.submitTurn(turn('ready-once'))
    })

    expect(submitTurn).not.toHaveBeenCalled()
    act(() => {
      attempts[0]?.onReady?.({ sessionId: '573' })
      attempts[0]?.onReady?.({ sessionId: '573' })
    })

    await waitFor(() => expect(submitTurn).toHaveBeenCalledOnce())
    await act(async () => { await turnPromise })
    expect(submitTurn).toHaveBeenCalledOnce()

    act(() => {
      turnPromise = result.current.submitTurn(turn('ready-twice'))
    })
    expect(submitTurn).toHaveBeenCalledOnce()
    act(() => attempts[1]?.onReady?.({ sessionId: '573' }))
    await waitFor(() => expect(submitTurn).toHaveBeenCalledTimes(2))
    await act(async () => { await turnPromise })

    const events = vi.mocked(console.info).mock.calls.map((call) =>
      (call[1] as { event?: string }).event)
    expect(events).toEqual(expect.arrayContaining([
      'stream_open_start',
      'ready_received',
      'turn_post_start',
    ]))
    expect(events.indexOf('ready_received')).toBeLessThan(events.indexOf('turn_post_start'))
    expect(vi.mocked(console.info).mock.calls.every((call) => {
      const detail = call[1] as Record<string, unknown>
      return !('body' in detail) && !('payload' in detail) && !('question' in detail)
    })).toBe(true)
  })

  it('streams deltas for two consecutive questions after each new ready event', async () => {
    vi.useFakeTimers()
    const attempts: SessionStreamHandlers[] = []
    const completePosts: Array<(result: SessionTurnResult) => void> = []
    const repository = createRepository({
      stream: vi.fn().mockImplementation((_sessionId, handlers, signal) => {
        attempts.push(handlers)
        return resolveWhenAborted(signal)
      }),
      submitTurn: vi.fn().mockImplementation(() => new Promise<SessionTurnResult>((resolve) => {
        completePosts.push(resolve)
      })),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(result.current.isLoadingHistory).toBe(false)

    for (const [index, requestId] of ['delta-first', 'delta-second'].entries()) {
      let turnPromise: Promise<SessionTurnResult> | undefined
      act(() => { turnPromise = result.current.submitTurn(turn(requestId)) })
      act(() => attempts[index]?.onReady?.({ sessionId: '573' }))
      await act(async () => { await Promise.resolve() })
      act(() => attempts[index]?.onContentDelta?.(`${index + 1}번째 답변`))
      await act(async () => { await vi.advanceTimersByTimeAsync(50) })
      expect(result.current.messages).toContainEqual(
        expect.objectContaining({ content: `${index + 1}번째 답변` }),
      )
      act(() => completePosts[index]?.(emptyTurnResult()))
      await act(async () => { await turnPromise })
    }
  })

  it('does not post when the stream errors before ready and releases pending state', async () => {
    let handlers: SessionStreamHandlers | undefined
    const submitTurn = vi.fn()
    const repository = createRepository({
      stream: vi.fn().mockImplementation((_sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        return resolveWhenAborted(signal)
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => {
      turnPromise = result.current.submitTurn(turn('ready-error'))
    })
    act(() => handlers?.onError?.('AI 응답 스트림이 중단되었습니다.'))

    await act(async () => {
      await expect(turnPromise).rejects.toMatchObject({
        code: 'STREAM_ERROR_BEFORE_READY',
      })
    })
    expect(submitTurn).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(false)
  })

  it('does not post when the stream closes before ready', async () => {
    const submitTurn = vi.fn()
    const repository = createRepository({
      stream: vi.fn().mockResolvedValue(undefined),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => {
      turnPromise = result.current.submitTurn(turn('ready-eof'))
    })

    await act(async () => {
      await expect(turnPromise).rejects.toMatchObject({
        code: 'STREAM_CLOSED_BEFORE_READY',
      })
    })
    expect(submitTurn).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(false)
  })

  it('ignores callbacks from an earlier attempt when retrying the same request id', async () => {
    const attempts: SessionStreamHandlers[] = []
    const submitTurn = vi.fn().mockResolvedValue(emptyTurnResult())
    const repository = createRepository({
      stream: vi.fn().mockImplementation((_sessionId, handlers, signal) => {
        attempts.push(handlers)
        return resolveWhenAborted(signal)
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    const sameTurn = turn('same-request-id')

    let firstPromise: Promise<SessionTurnResult> | undefined
    act(() => { firstPromise = result.current.submitTurn(sameTurn) })
    act(() => attempts[0]?.onError?.('첫 연결 실패'))
    await act(async () => { await expect(firstPromise).rejects.toBeInstanceOf(Error) })

    let retryPromise: Promise<SessionTurnResult> | undefined
    act(() => { retryPromise = result.current.submitTurn(sameTurn) })
    act(() => {
      attempts[0]?.onReady?.({ sessionId: '573' })
      attempts[0]?.onContentDelta?.('이전 연결의 늦은 본문')
      attempts[0]?.onError?.('이전 연결의 늦은 오류')
    })
    expect(submitTurn).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])

    act(() => attempts[1]?.onReady?.({ sessionId: '573' }))
    await waitFor(() => expect(submitTurn).toHaveBeenCalledOnce())
    await act(async () => { await retryPromise })
    expect(submitTurn.mock.calls[0]?.[1].requestId).toBe('same-request-id')
  })

  it('recovers a stored completed answer after an interrupted turn response without reposting', async () => {
    const storedAnswer = {
      content: '저장된 최종 답변',
      createdAt: '2026-09-28T00:00:00Z',
      id: 'answer-573',
      senderType: 'AI' as const,
      status: 'COMPLETED' as const,
    }
    const submitTurn = vi.fn().mockRejectedValue(new ApiClientError({
      code: 'AI_STREAM_INTERRUPTED',
      message: 'AI 응답 스트림이 중단되었습니다.',
      status: 502,
    }))
    const repository = createRepository({
      getById: vi.fn().mockResolvedValue(null),
      listMessages: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([storedAnswer]),
      stream: readyStream(),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let recovered: SessionTurnResult | undefined
    await act(async () => {
      recovered = await result.current.submitTurn(turn('recover-502'))
    })

    expect(submitTurn).toHaveBeenCalledOnce()
    expect(recovered?.messages).toEqual([storedAnswer])
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'answer-573', content: '저장된 최종 답변' }),
    ])
  })

  it('keeps one final answer when completed is followed by stream EOF', async () => {
    let handlers: SessionStreamHandlers | undefined
    let closeStream: (() => void) | undefined
    const answer = {
      content: '정상 완료 답변',
      createdAt: '2026-09-28T00:00:00Z',
      id: 'answer-completed',
      senderType: 'AI' as const,
      status: 'COMPLETED' as const,
    }
    const turnResult = { messages: [answer], uiActions: [] }
    const repository = createRepository({
      stream: vi.fn().mockImplementation((sessionId, nextHandlers) => {
        handlers = nextHandlers
        nextHandlers.onReady?.({ sessionId })
        return new Promise<void>((resolve) => { closeStream = resolve })
      }),
      submitTurn: vi.fn().mockImplementation(async () => {
        handlers?.onCompleted?.(undefined, turnResult)
        closeStream?.()
        return turnResult
      }),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    await act(async () => {
      await result.current.submitTurn(turn('completed-eof'))
    })

    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'answer-completed', content: '정상 완료 답변' }),
    ])
    expect(result.current.isTurnPending).toBe(false)
    expect(result.current.streamNotice).toBeNull()
  })

  it('times out readiness without posting and ignores a late ready event', async () => {
    let handlers: SessionStreamHandlers | undefined
    const submitTurn = vi.fn()
    const repository = createRepository({
      stream: vi.fn().mockImplementation((_sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        return resolveWhenAborted(signal)
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    vi.useFakeTimers()

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(turn('ready-timeout')) })
    const timeoutExpectation = expect(turnPromise).rejects.toMatchObject({
      code: 'STREAM_READY_TIMEOUT',
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    await act(async () => { await timeoutExpectation })
    act(() => handlers?.onReady?.({ sessionId: '573' }))

    expect(submitTurn).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(false)
  })

  it('aborts readiness on unmount and ignores callbacks delivered afterward', async () => {
    let handlers: SessionStreamHandlers | undefined
    const submitTurn = vi.fn()
    const repository = createRepository({
      stream: vi.fn().mockImplementation((_sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        return resolveWhenAborted(signal)
      }),
      submitTurn,
    })
    const { result, unmount } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(turn('unmount-ready')) })
    const abortedExpectation = expect(turnPromise).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
    })
    unmount()
    act(() => {
      handlers?.onReady?.({ sessionId: '573' })
      handlers?.onContentDelta?.('늦게 도착한 본문')
    })

    await abortedExpectation
    expect(submitTurn).not.toHaveBeenCalled()
  })
})

function createRepository(
  overrides: Partial<SessionsRepository> = {},
): SessionsRepository {
  return {
    cancelTurn: vi.fn().mockResolvedValue(true),
    complete: vi.fn(),
    create: vi.fn(),
    declineQuiz: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn().mockResolvedValue(null),
    list: vi.fn(),
    listMessages: vi.fn().mockResolvedValue([]),
    listQuizzes: vi.fn(),
    movePage: vi.fn(),
    startNewConversation: vi.fn(),
    stream: readyStream(),
    submitTurn: vi.fn().mockResolvedValue(emptyTurnResult()),
    ...overrides,
  }
}

function readyStream() {
  return vi.fn().mockImplementation((sessionId, handlers, signal) => {
    handlers.onReady?.({ sessionId })
    return resolveWhenAborted(signal)
  })
}

function resolveWhenAborted(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) resolve()
    else signal?.addEventListener('abort', () => resolve(), { once: true })
  })
}

function turn(requestId: string) {
  return {
    eventType: 'USER_QUESTION' as const,
    payload: { message: '후속 질문' },
    requestId,
  }
}

function emptyTurnResult(): SessionTurnResult {
  return { messages: [], uiActions: [] }
}
