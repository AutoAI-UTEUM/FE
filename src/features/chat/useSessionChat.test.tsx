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

  it('keeps streamed quiz questions until the persisted quiz has loaded', async () => {
    let handlers: SessionStreamHandlers | undefined
    let resolveTurn: ((result: SessionTurnResult) => void) | undefined
    const repository = createRepository({
      stream: vi.fn().mockImplementation((sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        nextHandlers.onReady?.({ sessionId })
        return resolveWhenAborted(signal)
      }),
      submitTurn: vi.fn().mockImplementation(() => new Promise<SessionTurnResult>((resolve) => {
        resolveTurn = resolve
      })),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(quizTurn('quiz-preview')) })
    await waitFor(() => expect(repository.submitTurn).toHaveBeenCalledOnce())
    act(() => handlers?.onQuizQuestion?.({
      generationId: 'generation-other',
      id: 'question-other-turn',
      kind: 'OX',
      prompt: '다른 턴의 늦은 문항',
      requestId: 'older-request',
    }))
    expect(result.current.quizQuestionPreview).toEqual([])
    act(() => handlers?.onQuizQuestion?.({
      choices: [{ id: 'a', label: '정답 후보' }],
      generationId: 'generation-current',
      id: 'question-1',
      kind: 'MCQ',
      prompt: '먼저 완성된 문항',
      requestId: 'quiz-preview',
      sequence: 1,
      totalQuestions: 3,
    }))

    expect(result.current.quizQuestionPreview).toEqual([
      expect.objectContaining({ id: 'question-1', prompt: '먼저 완성된 문항' }),
    ])

    act(() => resolveTurn?.({
      activeQuizId: 'quiz-200',
      messages: [],
      uiActions: [],
    }))
    await act(async () => { await turnPromise })

    expect(result.current.quizQuestionPreview).toEqual([
      expect.objectContaining({ id: 'question-1', prompt: '먼저 완성된 문항' }),
    ])

    act(() => result.current.clearQuizQuestionPreview())
    expect(result.current.quizQuestionPreview).toEqual([])
  })

  it('clears temporary quiz questions when the stream reports an error', async () => {
    let handlers: SessionStreamHandlers | undefined
    let resolveTurn: ((result: SessionTurnResult) => void) | undefined
    const repository = createRepository({
      stream: vi.fn().mockImplementation((sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        nextHandlers.onReady?.({ sessionId })
        return resolveWhenAborted(signal)
      }),
      submitTurn: vi.fn().mockImplementation(() => new Promise<SessionTurnResult>((resolve) => {
        resolveTurn = resolve
      })),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(quizTurn('quiz-stream-error')) })
    await waitFor(() => expect(repository.submitTurn).toHaveBeenCalledOnce())
    act(() => handlers?.onQuizQuestion?.({
      id: 'temporary-question',
      kind: 'OX',
      prompt: '임시 문항',
    }))
    expect(result.current.quizQuestionPreview).toHaveLength(1)

    act(() => handlers?.onError?.('연결이 끊겼습니다.'))
    expect(result.current.quizQuestionPreview).toEqual([])

    act(() => resolveTurn?.(emptyTurnResult()))
    await act(async () => { await turnPromise })
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

  it('does not post when the stream becomes ready and closes before the turn starts', async () => {
    const submitTurn = vi.fn()
    const repository = createRepository({
      stream: vi.fn().mockImplementation((sessionId, handlers) => {
        handlers.onReady?.({ sessionId })
        return Promise.resolve()
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(turn('ready-then-eof')) })

    await act(async () => {
      await expect(turnPromise).rejects.toMatchObject({
        code: 'STREAM_CLOSED_BEFORE_TURN',
      })
    })
    expect(submitTurn).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(false)
  })

  it('uses one final response when the stream closes mid-answer without completed', async () => {
    let handlers: SessionStreamHandlers | undefined
    let closeStream: (() => void) | undefined
    let resolveTurn: ((result: SessionTurnResult) => void) | undefined
    const finalAnswer = {
      content: '중단 뒤 저장된 최종 답변',
      createdAt: '2026-09-28T00:00:00Z',
      id: 'answer-after-eof',
      senderType: 'AI' as const,
      status: 'COMPLETED' as const,
    }
    const submitTurn = vi.fn().mockImplementation(() => new Promise<SessionTurnResult>((resolve) => {
      resolveTurn = resolve
    }))
    const repository = createRepository({
      stream: vi.fn().mockImplementation((sessionId, nextHandlers) => {
        handlers = nextHandlers
        nextHandlers.onReady?.({ sessionId })
        return new Promise<void>((resolve) => { closeStream = resolve })
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(turn('mid-eof')) })
    await waitFor(() => expect(submitTurn).toHaveBeenCalledOnce())
    act(() => handlers?.onContentDelta?.('아직 완성되지 않은 답'))
    await waitFor(() => expect(result.current.messages).toContainEqual(
      expect.objectContaining({ content: '아직 완성되지 않은 답', status: 'streaming' }),
    ))
    act(() => closeStream?.())
    await waitFor(() => expect(result.current.streamNotice).not.toBeNull())
    act(() => resolveTurn?.({ messages: [finalAnswer], uiActions: [] }))
    await act(async () => { await turnPromise })

    expect(submitTurn).toHaveBeenCalledOnce()
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'answer-after-eof', content: '중단 뒤 저장된 최종 답변' }),
    ])
    expect(result.current.isTurnPending).toBe(false)
    expect(result.current.streamNotice).toBeNull()
  })

  it('deduplicates repeated ready and completed terminal events without reposting', async () => {
    let handlers: SessionStreamHandlers | undefined
    let resolveTurn: ((result: SessionTurnResult) => void) | undefined
    const finalResult: SessionTurnResult = {
      messages: [{
        content: '중복 완료 뒤 최종 답변',
        createdAt: '2026-09-28T00:00:00Z',
        id: 'duplicate-completed-answer',
        senderType: 'AI',
        status: 'COMPLETED',
      }],
      uiActions: [],
    }
    const submitTurn = vi.fn().mockImplementation(() => new Promise<SessionTurnResult>((resolve) => {
      resolveTurn = resolve
    }))
    const repository = createRepository({
      stream: vi.fn().mockImplementation((sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        nextHandlers.onReady?.({ sessionId })
        nextHandlers.onReady?.({ sessionId })
        return resolveWhenAborted(signal)
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(turn('duplicate-terminal')) })
    await waitFor(() => expect(submitTurn).toHaveBeenCalledOnce())
    act(() => {
      handlers?.onContentDelta?.('중복 완료 전 임시 답변')
      handlers?.onCompleted?.(undefined, finalResult)
      handlers?.onCompleted?.(undefined, finalResult)
      resolveTurn?.(finalResult)
    })
    await act(async () => { await turnPromise })

    expect(submitTurn).toHaveBeenCalledOnce()
    expect(result.current.messages).toEqual([
      expect.objectContaining({
        content: '중복 완료 뒤 최종 답변',
        id: 'duplicate-completed-answer',
      }),
    ])
    expect(result.current.isTurnPending).toBe(false)
  })

  it('reconciles the posted result after the stream closes while hidden and the tab returns', async () => {
    let visibilityState: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
    let closeStream: (() => void) | undefined
    let resolveTurn: ((result: SessionTurnResult) => void) | undefined
    const submitTurn = vi.fn().mockImplementation(() => new Promise<SessionTurnResult>((resolve) => {
      resolveTurn = resolve
    }))
    const repository = createRepository({
      stream: vi.fn().mockImplementation((sessionId, nextHandlers, signal) => {
        nextHandlers.onReady?.({ sessionId })
        return new Promise<void>((resolve) => {
          closeStream = resolve
          signal.addEventListener('abort', resolve, { once: true })
        })
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(turn('hidden-round-trip')) })
    await waitFor(() => expect(submitTurn).toHaveBeenCalledOnce())
    act(() => {
      visibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      closeStream?.()
    })
    await waitFor(() => expect(result.current.streamNotice).not.toBeNull())
    act(() => {
      visibilityState = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => resolveTurn?.({
      messages: [{
        content: '복귀 후 최종 답변',
        createdAt: '2026-09-28T00:00:00Z',
        id: 'hidden-final',
        senderType: 'AI',
      }],
      uiActions: [],
    }))
    await act(async () => { await turnPromise })

    expect(submitTurn).toHaveBeenCalledOnce()
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'hidden-final', content: '복귀 후 최종 답변' }),
    ])
    expect(result.current.isTurnPending).toBe(false)
  })

  it('cancels one posted turn without removing an existing completed response', async () => {
    let handlers: SessionStreamHandlers | undefined
    const existingAnswer = {
      content: '취소 전에 저장된 답변',
      createdAt: '2026-09-27T00:00:00Z',
      id: 'existing-answer',
      senderType: 'AI' as const,
      status: 'COMPLETED' as const,
    }
    const cancelTurn = vi.fn().mockResolvedValue(true)
    const submitTurn = vi.fn().mockImplementation(
      (_sessionId, _turn, signal?: AbortSignal) => new Promise<SessionTurnResult>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new ApiClientError({
          code: 'REQUEST_ABORTED',
          message: '취소됨',
        })), { once: true })
      }),
    )
    const repository = createRepository({
      cancelTurn,
      listMessages: vi.fn().mockResolvedValue([existingAnswer]),
      stream: vi.fn().mockImplementation((sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        nextHandlers.onReady?.({ sessionId })
        return resolveWhenAborted(signal)
      }),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'existing-answer', content: '취소 전에 저장된 답변' }),
    ]))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(turn('cancel-after-post')) })
    await waitFor(() => expect(submitTurn).toHaveBeenCalledOnce())
    act(() => handlers?.onContentDelta?.('취소될 임시 답변'))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    await act(async () => {
      expect(await result.current.cancelTurn()).toBe(true)
      await turnPromise
    })

    expect(cancelTurn).toHaveBeenCalledOnce()
    expect(submitTurn).toHaveBeenCalledOnce()
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'existing-answer', content: '취소 전에 저장된 답변' }),
    ])
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

  it('does not apply a late TURN_IN_PROGRESS recovery after the session changes', async () => {
    const storedAnswer = {
      content: 'A 세션의 늦은 답변',
      createdAt: '2026-09-28T00:00:00Z',
      id: 'answer-a',
      senderType: 'AI' as const,
      status: 'COMPLETED' as const,
    }
    let resolveSessionA: ((value: ReturnType<typeof session>) => void) | undefined
    let sessionAMessageCalls = 0
    const onResult = vi.fn()
    const repository = createRepository({
      getById: vi.fn().mockImplementation((sessionId) => {
        if (sessionId !== 'A') return Promise.resolve(null)
        return new Promise((resolve) => { resolveSessionA = resolve })
      }),
      listMessages: vi.fn().mockImplementation((sessionId) => {
        if (sessionId !== 'A') return Promise.resolve([])
        sessionAMessageCalls += 1
        return Promise.resolve(sessionAMessageCalls === 1 ? [] : [storedAnswer])
      }),
      stream: readyStream(),
      submitTurn: vi.fn().mockRejectedValue(new ApiClientError({
        code: 'TURN_IN_PROGRESS',
        message: '진행 중인 턴이 있습니다.',
        status: 409,
      })),
    })
    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionChat(repository, sessionId),
      { initialProps: { sessionId: 'A' } },
    )
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let turnPromise: Promise<SessionTurnResult> | undefined
    act(() => { turnPromise = result.current.submitTurn(turn('session-a'), onResult) })
    const supersededExpectation = expect(turnPromise).rejects.toMatchObject({
      code: 'TURN_ATTEMPT_SUPERSEDED',
    })
    await waitFor(() => expect(resolveSessionA).toBeTypeOf('function'))

    rerender({ sessionId: 'B' })
    await waitFor(() => expect(result.current.isTurnPending).toBe(false))
    act(() => resolveSessionA?.(session('A')))
    await act(async () => { await supersededExpectation })

    expect(onResult).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
    expect(result.current.streamUiActions).toEqual([])
  })

  it('recovers a stored quiz without a new AI message after NETWORK_ERROR', async () => {
    const submitTurn = vi.fn().mockRejectedValue(new ApiClientError({
      code: 'NETWORK_ERROR',
      message: '응답을 확인하지 못했습니다.',
    }))
    const repository = createRepository({
      getById: vi.fn()
        .mockResolvedValueOnce(session('573'))
        .mockResolvedValueOnce(session('573', 'quiz-99')),
      listQuizzes: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([quiz('quiz-99')]),
      stream: readyStream(),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let recovered: SessionTurnResult | undefined
    await act(async () => {
      recovered = await result.current.submitTurn(quizTurn('quiz-network-error'))
    })

    expect(submitTurn).toHaveBeenCalledOnce()
    expect(recovered).toMatchObject({ activeQuizId: 'quiz-99', messages: [] })
    expect(repository.getById).toHaveBeenCalledTimes(2)
    expect(repository.listQuizzes).toHaveBeenCalledTimes(2)
  })

  it('ends TURN_IN_PROGRESS polling when a new quiz is stored without an AI message', async () => {
    const submitTurn = vi.fn().mockRejectedValue(new ApiClientError({
      code: 'TURN_IN_PROGRESS',
      message: '진행 중인 턴이 있습니다.',
      status: 409,
    }))
    const repository = createRepository({
      getById: vi.fn()
        .mockResolvedValueOnce(session('573'))
        .mockResolvedValueOnce(session('573', 'quiz-100')),
      listQuizzes: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([quiz('quiz-100')]),
      stream: readyStream(),
      submitTurn,
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let recovered: SessionTurnResult | undefined
    await act(async () => {
      recovered = await result.current.submitTurn(quizTurn('quiz-in-progress'))
    })

    expect(submitTurn).toHaveBeenCalledOnce()
    expect(recovered).toMatchObject({ activeQuizId: 'quiz-100', messages: [] })
    expect(result.current.isTurnPending).toBe(false)
  })

  it('does not treat a pre-existing active quiz as the current turn result', async () => {
    const networkError = new ApiClientError({
      code: 'NETWORK_ERROR',
      message: '응답을 확인하지 못했습니다.',
    })
    const repository = createRepository({
      getById: vi.fn().mockResolvedValue(session('573', 'quiz-existing')),
      listQuizzes: vi.fn().mockResolvedValue([quiz('quiz-existing')]),
      stream: readyStream(),
      submitTurn: vi.fn().mockRejectedValue(networkError),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    await act(async () => {
      await expect(result.current.submitTurn(quizTurn('quiz-existing'))).rejects.toBe(networkError)
    })
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

describe('useSessionChat existing-turn recovery', () => {
  it('recovers a newly saved quiz without an AI message or completed stream event', async () => {
    const onResult = vi.fn()
    const repository = createRepository({
      getById: vi.fn()
        .mockResolvedValueOnce(session('573'))
        .mockResolvedValue(session('573', 'quiz-new')),
      listQuizzes: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([quiz('quiz-new')]),
      stream: vi.fn().mockResolvedValue(undefined),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let recovered: SessionTurnResult | undefined
    await act(async () => {
      recovered = await result.current.waitForTurnCompletion(onResult)
    })

    expect(recovered).toMatchObject({
      activeQuizId: 'quiz-new',
      currentPage: 1,
      messages: [],
      pageStatus: 'QUIZ_READY',
    })
    expect(onResult).toHaveBeenCalledExactlyOnceWith(recovered)
    expect(repository.submitTurn).not.toHaveBeenCalled()
    expect(repository.getById).toHaveBeenCalledTimes(2)
    expect(repository.listQuizzes).toHaveBeenCalledTimes(2)
    expect(result.current.isTurnPending).toBe(false)
    expect(result.current.streamNotice).toBeNull()
  })

  it.each(['quiz-existing', 'quiz-other'])('does not finish for a previously saved quiz: %s', async (activeQuizId) => {
    const onResult = vi.fn()
    const repository = createRepository({
      getById: vi.fn()
        .mockResolvedValueOnce(session('573', 'quiz-existing'))
        .mockResolvedValue(session('573', activeQuizId)),
      listQuizzes: vi.fn().mockResolvedValue([
        quiz('quiz-existing'),
        quiz('quiz-other'),
      ]),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    vi.useFakeTimers()

    let waitPromise: Promise<SessionTurnResult | undefined> | undefined
    act(() => { waitPromise = result.current.waitForTurnCompletion(onResult) })
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })

    expect(repository.getById).toHaveBeenCalledTimes(4)
    expect(onResult).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(true)
    await act(async () => {
      expect(await result.current.waitForTurnCompletion(onResult)).toBeUndefined()
      expect(await result.current.cancelTurn()).toBe(true)
      expect(await waitPromise).toEqual(emptyTurnResult())
    })
    expect(repository.stream).toHaveBeenCalledOnce()
    expect(result.current.isTurnPending).toBe(false)
    expect(result.current.streamNotice).toBeNull()
  })

  it('does not treat a quiz from the supplied pre-request snapshot as newly saved', async () => {
    const onResult = vi.fn()
    const repository = createRepository({
      getById: vi.fn().mockResolvedValue(session('573', 'quiz-previous')),
      listQuizzes: vi.fn().mockResolvedValue([quiz('quiz-previous')]),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    vi.useFakeTimers()

    let waitPromise: Promise<SessionTurnResult | undefined> | undefined
    act(() => {
      waitPromise = result.current.waitForTurnCompletion(onResult, {
        quizIds: new Set(['quiz-previous']),
      })
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })

    expect(onResult).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(true)
    await act(async () => {
      await result.current.cancelTurn()
      await waitPromise
    })
    expect(result.current.isTurnPending).toBe(false)
  })

  it('requires the new active quiz to be present in the saved quiz list', async () => {
    const onResult = vi.fn()
    const repository = createRepository({
      getById: vi.fn()
        .mockResolvedValueOnce(session('573'))
        .mockResolvedValue(session('573', 'quiz-not-saved')),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    vi.useFakeTimers()

    let waitPromise: Promise<SessionTurnResult | undefined> | undefined
    act(() => { waitPromise = result.current.waitForTurnCompletion(onResult) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })

    expect(onResult).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(true)
    vi.mocked(repository.listQuizzes).mockResolvedValue([quiz('quiz-not-saved')])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500)
      await waitPromise
    })
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({
      activeQuizId: 'quiz-not-saved',
    }))
    expect(result.current.isTurnPending).toBe(false)
  })

  it('does not infer quiz completion from an incomplete baseline', async () => {
    let handlers: SessionStreamHandlers | undefined
    const onResult = vi.fn()
    const repository = createRepository({
      getById: vi.fn().mockResolvedValue(session('573', 'quiz-existing')),
      listQuizzes: vi.fn()
        .mockRejectedValueOnce(new Error('Quiz history is temporarily unavailable'))
        .mockResolvedValue([quiz('quiz-existing')]),
      stream: vi.fn().mockImplementation((_sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        return resolveWhenAborted(signal)
      }),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    vi.useFakeTimers()

    let waitPromise: Promise<SessionTurnResult | undefined> | undefined
    act(() => { waitPromise = result.current.waitForTurnCompletion(onResult) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500) })

    expect(onResult).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(true)
    await act(async () => {
      handlers?.onCompleted?.(undefined, emptyTurnResult())
      await waitPromise
    })
    expect(onResult).toHaveBeenCalledExactlyOnceWith(emptyTurnResult())
    expect(result.current.isTurnPending).toBe(false)
  })

  it('does not apply a late baseline or stream completion after cancellation', async () => {
    let resolveBaseline: ((value: ReturnType<typeof session>) => void) | undefined
    let handlers: SessionStreamHandlers | undefined
    const onResult = vi.fn()
    const repository = createRepository({
      getById: vi.fn().mockImplementation(() => new Promise((resolve) => {
        resolveBaseline = resolve
      })),
      stream: vi.fn().mockImplementation((_sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        return resolveWhenAborted(signal)
      }),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let waitPromise: Promise<SessionTurnResult | undefined> | undefined
    act(() => { waitPromise = result.current.waitForTurnCompletion(onResult) })
    await act(async () => {
      expect(await result.current.cancelTurn()).toBe(true)
      handlers?.onCompleted?.(
        { content: '취소된 노트', title: '취소된 노트' },
        { activeQuizId: 'quiz-cancelled', messages: [], uiActions: [] },
      )
      resolveBaseline?.(session('573'))
      expect(await waitPromise).toEqual(emptyTurnResult())
    })

    expect(onResult).not.toHaveBeenCalled()
    expect(repository.listMessages).toHaveBeenCalledOnce()
    expect(result.current.isTurnPending).toBe(false)
    expect(result.current.streamNotice).toBeNull()
    expect(result.current.noteDraft).toBeNull()
  })

  it('does not apply a completed stream result when waiting is cancelled before it settles', async () => {
    let handlers: SessionStreamHandlers | undefined
    const onResult = vi.fn()
    const repository = createRepository({
      stream: vi.fn().mockImplementation((_sessionId, nextHandlers, signal) => {
        handlers = nextHandlers
        return resolveWhenAborted(signal)
      }),
    })
    const { result } = renderHook(() => useSessionChat(repository, '573'))
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let waitPromise: Promise<SessionTurnResult | undefined> | undefined
    act(() => { waitPromise = result.current.waitForTurnCompletion(onResult) })
    await act(async () => {
      handlers?.onCompleted?.(undefined, {
        activeQuizId: 'quiz-cancelled',
        messages: [],
        uiActions: [],
      })
      expect(await result.current.cancelTurn()).toBe(true)
      expect(await waitPromise).toEqual(emptyTurnResult())
    })

    expect(onResult).not.toHaveBeenCalled()
    expect(result.current.isTurnPending).toBe(false)
    expect(result.current.streamNotice).toBeNull()
  })

  it('does not let late quiz recovery from a previous session settle its replacement wait', async () => {
    let resolveSessionA: ((value: ReturnType<typeof session>) => void) | undefined
    let sessionACalls = 0
    const handlers: SessionStreamHandlers[] = []
    const onOldResult = vi.fn()
    const onNewResult = vi.fn()
    const repository = createRepository({
      getById: vi.fn().mockImplementation((sessionId) => {
        if (sessionId === 'A' && ++sessionACalls > 1) {
          return new Promise((resolve) => { resolveSessionA = resolve })
        }
        return Promise.resolve(session(sessionId))
      }),
      listQuizzes: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([quiz('quiz-session-a')])
        .mockResolvedValue([]),
      stream: vi.fn().mockImplementation((_sessionId, nextHandlers, signal) => {
        handlers.push(nextHandlers)
        return resolveWhenAborted(signal)
      }),
    })
    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionChat(repository, sessionId),
      { initialProps: { sessionId: 'A' } },
    )
    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))

    let oldWaitPromise: Promise<SessionTurnResult | undefined> | undefined
    act(() => { oldWaitPromise = result.current.waitForTurnCompletion(onOldResult) })
    const supersededExpectation = expect(oldWaitPromise).rejects.toMatchObject({
      code: 'TURN_ATTEMPT_SUPERSEDED',
    })
    await waitFor(() => expect(resolveSessionA).toBeTypeOf('function'))
    rerender({ sessionId: 'B' })

    let newWaitPromise: Promise<SessionTurnResult | undefined> | undefined
    act(() => { newWaitPromise = result.current.waitForTurnCompletion(onNewResult) })
    await act(async () => {
      handlers[0]?.onCompleted?.(
        { content: 'A 세션의 노트', title: '이전 세션' },
        { activeQuizId: 'quiz-session-a', messages: [], uiActions: [] },
      )
      resolveSessionA?.(session('A', 'quiz-session-a'))
      await supersededExpectation
    })

    expect(onOldResult).not.toHaveBeenCalled()
    expect(onNewResult).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
    expect(result.current.noteDraft).toBeNull()
    expect(result.current.isTurnPending).toBe(true)
    expect(result.current.streamNotice).not.toBeNull()

    await act(async () => {
      handlers[1]?.onCompleted?.(undefined, emptyTurnResult())
      await newWaitPromise
    })
    expect(onNewResult).toHaveBeenCalledExactlyOnceWith(emptyTurnResult())
    expect(result.current.isTurnPending).toBe(false)
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
    listQuizzes: vi.fn().mockResolvedValue([]),
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

function quizTurn(requestId: string) {
  return {
    eventType: 'QUIZ_TYPE_SELECTED' as const,
    payload: { quizType: 'OX' },
    requestId,
  }
}

function quiz(quizId: string) {
  return {
    quizId,
    quizType: 'OX',
    title: 'OX 복습 퀴즈',
  }
}

function session(id: string, activeQuizId?: string) {
  return {
    activeQuizId,
    currentPage: 1,
    id,
    lastActivityAt: '2026-09-28T00:00:00Z',
    materialTitle: '테스트 자료',
    pageStatus: activeQuizId ? 'QUIZ_READY' : 'EXPLAINED',
    status: 'ACTIVE' as const,
    uiActions: [],
  }
}

function emptyTurnResult(): SessionTurnResult {
  return { messages: [], uiActions: [] }
}
