import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionsRepository, SessionTurnResult } from '../sessions'
import { useSessionChat } from './useSessionChat'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useSessionChat streaming performance', () => {
  it('batches rapid deltas into one message update without losing content', async () => {
    let resolveTurn: ((result: SessionTurnResult) => void) | undefined
    const deltas = Array.from({ length: 100 }, (_, index) => `${index},`)
    const repository = createRepository({
      stream: vi.fn().mockImplementation((_sessionId, handlers, signal) => {
        deltas.forEach((delta) => handlers.onContentDelta?.(delta))
        return new Promise<void>((resolve) => {
          if (signal?.aborted) resolve()
          else signal?.addEventListener('abort', () => resolve(), { once: true })
        })
      }),
      submitTurn: vi.fn().mockImplementation(() => new Promise<SessionTurnResult>((resolve) => {
        resolveTurn = resolve
      })),
    })
    let previousMessages: unknown
    let messageChangeCount = 0
    const { result } = renderHook(() => {
      const chat = useSessionChat(repository, 'long-session')
      if (chat.messages !== previousMessages) {
        previousMessages = chat.messages
        messageChangeCount += 1
      }
      return chat
    })

    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false))
    vi.useFakeTimers()
    const initialMessageChangeCount = messageChangeCount
    let turnPromise: Promise<SessionTurnResult> | undefined

    act(() => {
      turnPromise = result.current.submitTurn({
        eventType: 'USER_QUESTION',
        payload: { includeCurrentPage: true, message: '긴 세션 질문' },
        requestId: 'request-long-session',
      })
    })

    expect(result.current.messages).toHaveLength(0)
    expect(messageChangeCount).toBe(initialMessageChangeCount)

    act(() => vi.advanceTimersByTime(50))

    expect(messageChangeCount).toBe(initialMessageChangeCount + 1)
    expect(result.current.messages).toEqual([
      expect.objectContaining({
        content: deltas.join(''),
        role: 'assistant',
        status: 'streaming',
      }),
    ])

    await act(async () => {
      resolveTurn?.({
        messages: [{
          content: '완료된 답변',
          createdAt: '2026-09-19T00:00:00Z',
          id: 'completed-answer',
          senderType: 'AI',
        }],
        uiActions: [],
      })
      await turnPromise
    })

    expect(result.current.messages).toEqual([
      expect.objectContaining({ content: '완료된 답변', status: 'sent' }),
    ])
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
    getById: vi.fn(),
    list: vi.fn(),
    listMessages: vi.fn().mockResolvedValue([]),
    listQuizzes: vi.fn(),
    movePage: vi.fn(),
    startNewConversation: vi.fn(),
    stream: vi.fn().mockResolvedValue(undefined),
    submitTurn: vi.fn(),
    ...overrides,
  }
}
