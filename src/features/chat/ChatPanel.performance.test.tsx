import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from './chatTypes'
import type { SessionChat } from './useSessionChat'

const { markdownRenderSpy } = vi.hoisted(() => ({
  markdownRenderSpy: vi.fn(),
}))

vi.mock('../../shared/ui/MarkdownContent', () => ({
    MarkdownContent: ({ content }: { content: string }) => {
      markdownRenderSpy(content)
      return <div>{content}</div>
    },
}))

import { ChatPanel } from './ChatPanel'

afterEach(() => {
  cleanup()
  markdownRenderSpy.mockClear()
})

describe('ChatPanel long-session rendering', () => {
  it('only rerenders the changing stream bubble when a 30-turn history is present', async () => {
    const history = createThirtyTurnHistory()
    const streamingMessage: ChatMessage = {
      content: '첫 델타',
      id: 'stream-current',
      role: 'assistant',
      status: 'streaming',
    }
    const { rerender } = render(
      <ChatPanel
        chat={createChat([...history, streamingMessage])}
        sessionId="long-session"
      />,
    )

    expect(await screen.findByText('AI 답변 30')).toBeInTheDocument()
    markdownRenderSpy.mockClear()

    rerender(
      <ChatPanel
        chat={createChat([
          ...history,
          { ...streamingMessage, content: '첫 델타와 다음 델타' },
        ])}
        sessionId="long-session"
      />,
    )

    expect(markdownRenderSpy).toHaveBeenCalledTimes(1)
    expect(markdownRenderSpy).toHaveBeenCalledWith('첫 델타와 다음 델타')
  })
})

const stableChatActions = {
  appendLocalMessage: vi.fn(),
  appendMessages: vi.fn(),
  cancelTurn: vi.fn().mockResolvedValue(true),
  clearNoteDraft: vi.fn(),
  clearUiActions: vi.fn(),
  loadOlderMessages: vi.fn().mockResolvedValue(false),
  markMessageFailed: vi.fn(),
  markMessageRetrying: vi.fn(),
  reloadHistory: vi.fn(),
  startNewConversation: vi.fn().mockResolvedValue(undefined),
  submitTurn: vi.fn(),
  waitForTurnCompletion: vi.fn(),
}

function createChat(messages: ChatMessage[]): SessionChat {
  return {
    ...stableChatActions,
    hasOlderMessages: false,
    historyError: null,
    isLoadingHistory: false,
    isLoadingOlderMessages: false,
    isTurnPending: false,
    messages,
    noteDraft: null,
    streamNotice: null,
    streamUiActions: [],
  }
}

function createThirtyTurnHistory(): ChatMessage[] {
  return Array.from({ length: 30 }, (_, index) => {
    const turn = index + 1
    return [
      {
        content: `질문 ${turn}`,
        id: `user-${turn}`,
        role: 'user' as const,
        status: 'sent' as const,
      },
      {
        content: `AI 답변 ${turn}`,
        id: `assistant-${turn}`,
        role: 'assistant' as const,
        status: 'sent' as const,
      },
    ]
  }).flat()
}
