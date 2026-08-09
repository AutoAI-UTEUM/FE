import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiClientError } from '../../shared/api'
import type {
  SessionMessage,
  SessionsRepository,
  SessionTurnRequest,
  SessionTurnResult,
  UiAction,
} from '../sessions'
import type { ChatMessage } from './chatTypes'

export interface SessionChat {
  appendLocalMessage: (message: ChatMessage) => void
  appendMessages: (messages: SessionMessage[]) => void
  clearUiActions: () => void
  historyError: string | null
  isLoadingHistory: boolean
  isTurnPending: boolean
  messages: ChatMessage[]
  reloadHistory: () => void
  startNewConversation: () => Promise<void>
  streamNotice: string | null
  streamUiActions: UiAction[]
  submitTurn: (
    turn: SessionTurnRequest,
    onResult?: (result: SessionTurnResult) => void,
  ) => Promise<SessionTurnResult>
}

export function useSessionChat(
  repository: SessionsRepository,
  sessionId: string,
): SessionChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isTurnPending, setIsTurnPending] = useState(false)
  const [historyReloadKey, setHistoryReloadKey] = useState(0)
  const [streamNotice, setStreamNotice] = useState<string | null>(null)
  const [streamUiActions, setStreamUiActions] = useState<UiAction[]>([])
  const streamingMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    repository
      .listMessages(sessionId, controller.signal)
      .then((history) => {
        setMessages(history.map(mapSessionMessage))
        setHistoryError(null)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setHistoryError(getChatErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingHistory(false)
      })

    return () => controller.abort()
  }, [historyReloadKey, repository, sessionId])

  const appendMessages = useCallback((incoming: SessionMessage[]) => {
    if (incoming.length === 0) return
    setMessages((current) => {
      const confirmed = current.filter((message) => message.status !== 'streaming')
      const existingIds = new Set(confirmed.map((message) => message.id))
      return [
        ...confirmed,
        ...incoming
          .filter((message) => !existingIds.has(message.id))
          .map(mapSessionMessage),
      ]
    })
    streamingMessageIdRef.current = null
  }, [])

  const appendLocalMessage = useCallback((message: ChatMessage) => {
    setMessages((current) => [...current, message])
  }, [])

  const clearUiActions = useCallback(() => {
    setStreamUiActions([])
  }, [])

  const reloadHistory = useCallback(() => {
    setHistoryError(null)
    setIsLoadingHistory(true)
    setHistoryReloadKey((key) => key + 1)
  }, [])

  const submitTurn = useCallback(
    async (
      turn: SessionTurnRequest,
      onResult?: (result: SessionTurnResult) => void,
    ) => {
      setIsTurnPending(true)
      setStreamNotice('실시간 응답을 연결하는 중입니다.')
      setStreamUiActions([])
      const streamController = new AbortController()
      const streamMessageId = `stream-${turn.requestId}`
      streamingMessageIdRef.current = streamMessageId
      const streamPromise = repository
        .stream(
          sessionId,
          {
            onCompleted: () => setStreamNotice(null),
            onContentDelta: (text) => {
              setStreamNotice('답변을 실시간으로 받고 있습니다.')
              setMessages((current) => {
                const index = current.findIndex(
                  (message) => message.id === streamMessageId,
                )
                if (index < 0) {
                  return [
                    ...current,
                    {
                      content: text,
                      id: streamMessageId,
                      role: 'assistant',
                      status: 'streaming',
                    },
                  ]
                }
                return current.map((message, messageIndex) =>
                  messageIndex === index
                    ? { ...message, content: `${message.content}${text}` }
                    : message,
                )
              })
            },
            onError: (message) => setStreamNotice(message),
            onStatus: (stage) =>
              setStreamNotice(getStreamStageLabel(stage)),
            onUiAction: (action) =>
              setStreamUiActions((current) => [...current, action]),
          },
          streamController.signal,
        )
        .catch((error: unknown) => {
          if (
            !streamController.signal.aborted &&
            !(
              error instanceof ApiClientError &&
              error.code === 'REQUEST_ABORTED'
            )
          ) {
            setStreamNotice('실시간 연결 없이 일반 응답으로 계속합니다.')
          }
        })

      try {
        const result = await repository.submitTurn(sessionId, turn)
        appendMessages(result.messages)
        setStreamUiActions(result.uiActions)
        onResult?.(result)
        setStreamNotice(null)
        return result
      } catch (error) {
        // 스펙 §6: 같은 requestId 재전송은 409 — 메시지 재조회로 최신 상태 복원
        if (
          error instanceof ApiClientError &&
          error.code === 'TURN_ALREADY_PROCESSED'
        ) {
          reloadHistory()
        }
        throw error
      } finally {
        streamController.abort()
        await streamPromise
        setIsTurnPending(false)
      }
    },
    [appendMessages, reloadHistory, repository, sessionId],
  )

  const startNewConversation = useCallback(async () => {
    if (isTurnPending) return
    setIsTurnPending(true)
    try {
      await repository.startNewConversation(sessionId)
      setMessages([])
      setHistoryError(null)
      setStreamNotice(null)
      setStreamUiActions([])
      streamingMessageIdRef.current = null
    } finally {
      setIsTurnPending(false)
    }
  }, [isTurnPending, repository, sessionId])

  return {
    appendLocalMessage,
    appendMessages,
    clearUiActions,
    historyError,
    isLoadingHistory,
    isTurnPending,
    messages,
    reloadHistory,
    startNewConversation,
    streamNotice,
    streamUiActions,
    submitTurn,
  }
}

function getStreamStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    EXPLAINING: '페이지 내용을 설명하는 중입니다.',
    GENERATING: '답변을 작성하는 중입니다.',
    PLANNING: '질문을 분석하는 중입니다.',
  }
  return labels[stage] ?? stage
}

function mapSessionMessage(message: SessionMessage): ChatMessage {
  return {
    content: message.content,
    createdAt: message.createdAt,
    id: message.id,
    messageType: message.messageType,
    pageNumber: message.pageNumber,
    role: message.senderType === 'USER' ? 'user' : 'assistant',
    status: 'sent',
  }
}

export function getChatErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '채팅 요청을 처리하지 못했습니다.'
}
