import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiClientError } from '../../shared/api'
import type {
  SessionMessage,
  NoteDraft,
  SessionsRepository,
  SessionTurnRequest,
  SessionTurnResult,
  UiAction,
} from '../sessions'
import type { ChatMessage } from './chatTypes'

export interface SessionChat {
  appendLocalMessage: (message: ChatMessage) => void
  appendMessages: (messages: SessionMessage[]) => void
  cancelTurn: () => Promise<boolean>
  clearNoteDraft: () => void
  clearUiActions: () => void
  historyError: string | null
  hasOlderMessages: boolean
  isLoadingHistory: boolean
  isLoadingOlderMessages: boolean
  loadOlderMessages: () => Promise<boolean>
  isTurnPending: boolean
  messages: ChatMessage[]
  noteDraft: NoteDraft | null
  markMessageFailed: (requestId: string) => void
  markMessageRetrying: (requestId: string) => void
  reloadHistory: () => void
  startNewConversation: () => Promise<void>
  streamNotice: string | null
  streamUiActions: UiAction[]
  submitTurn: (
    turn: SessionTurnRequest,
    onResult?: (result: SessionTurnResult) => void,
  ) => Promise<SessionTurnResult>
  waitForTurnCompletion: (
    onResult?: (result: SessionTurnResult) => void,
  ) => Promise<SessionTurnResult | undefined>
}

const TURN_IN_PROGRESS_NOTICE = 'AI가 답변 중이에요. 기존 답변이 끝날 때까지 기다려 주세요.'
const TURN_RECOVERY_POLL_INTERVAL_MS = 1_500
const STREAM_RENDER_INTERVAL_MS = 50

export function useSessionChat(
  repository: SessionsRepository,
  sessionId: string,
): SessionChat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyCursor, setHistoryCursor] = useState<string | undefined>()
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false)
  const [isTurnPending, setIsTurnPending] = useState(false)
  const [historyReloadKey, setHistoryReloadKey] = useState(0)
  const [streamNotice, setStreamNotice] = useState<string | null>(null)
  const [streamUiActions, setStreamUiActions] = useState<UiAction[]>([])
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null)
  const streamingMessageIdRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const isTurnPendingRef = useRef(false)
  const cancellationRequestedRef = useRef(false)
  const activePollControllerRef = useRef<AbortController | null>(null)
  const activeStreamControllerRef = useRef<AbortController | null>(null)
  const activeTurnControllerRef = useRef<AbortController | null>(null)

  const updateMessages = useCallback((updater: (current: ChatMessage[]) => ChatMessage[]) => {
    setMessages((current) => {
      const next = updater(current)
      messagesRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    loadMessagePage(repository, sessionId, undefined, controller.signal)
      .then((page) => {
        const history = page.items
        const nextMessages = history.map(mapSessionMessage)
        messagesRef.current = nextMessages
        setMessages(nextMessages)
        setHistoryCursor(page.nextCursor)
        setHasOlderMessages(page.hasMore)
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

  const loadOlderMessages = useCallback(async () => {
    if (!hasOlderMessages || !historyCursor || isLoadingOlderMessages) return false
    setIsLoadingOlderMessages(true)
    try {
      const page = await loadMessagePage(repository, sessionId, historyCursor)
      const existingIds = new Set(messagesRef.current.map((message) => message.id))
      const olderMessages = page.items
        .filter((message) => !existingIds.has(message.id))
        .map(mapSessionMessage)
      if (olderMessages.length > 0) {
        updateMessages((current) => [...olderMessages, ...current])
      }
      setHistoryCursor(page.nextCursor)
      setHasOlderMessages(page.hasMore)
      setHistoryError(null)
      return olderMessages.length > 0
    } catch (requestError) {
      setHistoryError(getChatErrorMessage(requestError))
      return false
    } finally {
      setIsLoadingOlderMessages(false)
    }
  }, [hasOlderMessages, historyCursor, isLoadingOlderMessages, repository, sessionId, updateMessages])

  const appendMessages = useCallback((incoming: SessionMessage[]) => {
    if (incoming.length === 0) return
    updateMessages((current) => {
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
  }, [updateMessages])

  const appendLocalMessage = useCallback((message: ChatMessage) => {
    updateMessages((current) => [...current, message])
  }, [updateMessages])

  const clearUiActions = useCallback(() => {
    setStreamUiActions([])
  }, [])

  const clearNoteDraft = useCallback(() => setNoteDraft(null), [])

  const reloadHistory = useCallback(() => {
    setHistoryError(null)
    setHistoryCursor(undefined)
    setHasOlderMessages(false)
    setIsLoadingHistory(true)
    setHistoryReloadKey((key) => key + 1)
  }, [])

  const markMessageFailed = useCallback((requestId: string) => {
    updateMessages((current) => current.map((message) => (
      message.requestId === requestId ? { ...message, status: 'failed' } : message
    )))
  }, [updateMessages])

  const markMessageRetrying = useCallback((requestId: string) => {
    updateMessages((current) => current.map((message) => (
      message.requestId === requestId ? { ...message, status: 'sent' } : message
    )))
  }, [updateMessages])

  const submitTurn = useCallback(
    async (
      turn: SessionTurnRequest,
      onResult?: (result: SessionTurnResult) => void,
    ) => {
      if (isTurnPendingRef.current) {
        throw new ApiClientError({
          code: 'TURN_IN_PROGRESS_LOCAL',
          message: TURN_IN_PROGRESS_NOTICE,
          status: 409,
        })
      }
      isTurnPendingRef.current = true
      cancellationRequestedRef.current = false
      setIsTurnPending(true)
      setStreamNotice('실시간 응답을 연결하는 중입니다.')
      setStreamUiActions([])
      const streamController = new AbortController()
      const turnController = new AbortController()
      activeStreamControllerRef.current = streamController
      activeTurnControllerRef.current = turnController
      const streamMessageId = `stream-${turn.requestId}`
      const knownMessageIds = new Set(messagesRef.current
        .filter((message) => message.role === 'assistant' && message.status === 'sent')
        .map((message) => message.id))
      const recoveredUiActions: UiAction[] = []
      let completedNoteDraft: NoteDraft | undefined
      let completedStreamResult: SessionTurnResult | undefined
      let resolveStreamCompleted: (() => void) | undefined
      let pendingStreamContent = ''
      let streamRenderTimer: ReturnType<typeof setTimeout> | null = null
      let acceptsStreamContent = true
      const streamCompleted = new Promise<void>((resolve) => {
        resolveStreamCompleted = resolve
      })
      const flushStreamContent = () => {
        if (streamRenderTimer !== null) clearTimeout(streamRenderTimer)
        streamRenderTimer = null
        if (!acceptsStreamContent || pendingStreamContent.length === 0) return
        const content = pendingStreamContent
        pendingStreamContent = ''
        updateMessages((current) => {
          const index = current.findIndex(
            (message) => message.id === streamMessageId,
          )
          if (index < 0) {
            return [
              ...current,
              {
                content,
                id: streamMessageId,
                role: 'assistant',
                status: 'streaming',
              },
            ]
          }
          const next = [...current]
          const message = current[index]
          next[index] = { ...message, content: `${message.content}${content}` }
          return next
        })
      }
      const queueStreamContent = (text: string) => {
        if (!acceptsStreamContent) return
        pendingStreamContent += text
        if (streamRenderTimer === null) {
          streamRenderTimer = setTimeout(flushStreamContent, STREAM_RENDER_INTERVAL_MS)
        }
      }
      const stopStreamContentUpdates = () => {
        acceptsStreamContent = false
        pendingStreamContent = ''
        if (streamRenderTimer !== null) clearTimeout(streamRenderTimer)
        streamRenderTimer = null
      }
      streamingMessageIdRef.current = streamMessageId
      const streamPromise = repository
        .stream(
          sessionId,
          {
            onCompleted: (draft, result) => {
              flushStreamContent()
              completedNoteDraft = draft
              completedStreamResult = result
              setStreamNotice(null)
              if (draft) setNoteDraft(draft)
              resolveStreamCompleted?.()
            },
            onContentDelta: (text) => {
              setStreamNotice('답변을 실시간으로 받고 있습니다.')
              queueStreamContent(text)
            },
            onError: (message) => setStreamNotice(message),
            onStatus: (stage) =>
              setStreamNotice(getStreamStageLabel(stage)),
            onUiAction: (action) => {
              recoveredUiActions.push(action)
              setStreamUiActions((current) => [...current, action])
            },
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
        const result = await repository.submitTurn(sessionId, turn, turnController.signal)
        stopStreamContentUpdates()
        appendMessages(result.messages)
        setStreamUiActions(result.uiActions)
        if (result.noteDraft) setNoteDraft(result.noteDraft)
        onResult?.(result)
        setStreamNotice(null)
        return result
      } catch (error) {
        if (
          cancellationRequestedRef.current
          && error instanceof ApiClientError
          && error.code === 'REQUEST_ABORTED'
        ) {
          updateMessages((current) => current.filter(
            (message) => message.id !== streamMessageId,
          ))
          setStreamNotice(null)
          return {
            messages: [],
            uiActions: [],
          }
        }
        if (isTurnInProgressError(error)) {
          // 거부된 중복 질문은 실패/재시도 대상으로 남기지 않는다.
          updateMessages((current) => current.filter(
            (message) => message.requestId !== turn.requestId,
          ))
          setStreamNotice(TURN_IN_PROGRESS_NOTICE)

          const pollController = new AbortController()
          activePollControllerRef.current = pollController
          const recoveredHistoryPromise = pollForCompletedTurn(
            repository,
            sessionId,
            knownMessageIds,
            pollController.signal,
          )
          const recoverySource = await Promise.race([
            streamCompleted.then(() => 'stream' as const),
            recoveredHistoryPromise.then(() => 'poll' as const),
          ])
          pollController.abort()

          const result = recoverySource === 'stream' && completedStreamResult
            ? {
                ...completedStreamResult,
                noteDraft: completedNoteDraft ?? completedStreamResult.noteDraft,
                uiActions: completedStreamResult.uiActions.length > 0
                  ? completedStreamResult.uiActions
                  : recoveredUiActions,
              }
            : await recoverTurnResult(
                repository,
                sessionId,
                recoverySource === 'poll'
                  ? recoveredHistoryPromise
                  : repository.listMessages(sessionId),
                completedNoteDraft,
                recoveredUiActions,
              )
          appendMessages(result.messages)
          setStreamUiActions(result.uiActions)
          onResult?.(result)
          setStreamNotice(null)
          return result
        }

        // 완료된 턴의 중복 requestId는 최신 메시지 복원으로 수렴한다.
        if (
          error instanceof ApiClientError &&
          error.code === 'TURN_ALREADY_PROCESSED'
        ) {
          reloadHistory()
        }
        throw error
      } finally {
        stopStreamContentUpdates()
        streamController.abort()
        await streamPromise
        if (activePollControllerRef.current) activePollControllerRef.current.abort()
        activePollControllerRef.current = null
        activeStreamControllerRef.current = null
        activeTurnControllerRef.current = null
        cancellationRequestedRef.current = false
        isTurnPendingRef.current = false
        setIsTurnPending(false)
      }
    },
    [appendMessages, reloadHistory, repository, sessionId, updateMessages],
  )

  const cancelTurn = useCallback(async () => {
    if (!isTurnPendingRef.current) return false
    setStreamNotice('답변 생성을 중단하는 중입니다.')
    try {
      const cancelled = await repository.cancelTurn(sessionId)
      if (!cancelled) {
        setStreamNotice('서버에서 이미 답변을 마무리하고 있습니다.')
        return false
      }
      cancellationRequestedRef.current = true
      activePollControllerRef.current?.abort()
      activeStreamControllerRef.current?.abort()
      activeTurnControllerRef.current?.abort()
      const streamingMessageId = streamingMessageIdRef.current
      if (streamingMessageId) {
        updateMessages((current) => current.filter((message) => message.id !== streamingMessageId))
      }
      streamingMessageIdRef.current = null
      return true
    } catch (error) {
      setStreamNotice(TURN_IN_PROGRESS_NOTICE)
      throw error
    }
  }, [repository, sessionId, updateMessages])

  const startNewConversation = useCallback(async () => {
    if (isTurnPending) return
    setIsTurnPending(true)
    try {
      await repository.startNewConversation(sessionId)
      setMessages([])
      setHistoryError(null)
      setStreamNotice(null)
      setStreamUiActions([])
      setNoteDraft(null)
      streamingMessageIdRef.current = null
    } finally {
      setIsTurnPending(false)
    }
  }, [isTurnPending, repository, sessionId])

  const waitForTurnCompletion = useCallback(async (
    onResult?: (result: SessionTurnResult) => void,
  ) => {
    if (isTurnPendingRef.current) return undefined
    isTurnPendingRef.current = true
    cancellationRequestedRef.current = false
    setIsTurnPending(true)
    setStreamNotice(TURN_IN_PROGRESS_NOTICE)

    const knownMessageIds = new Set(messagesRef.current
      .filter((message) => message.role === 'assistant' && message.status === 'sent')
      .map((message) => message.id))
    const streamController = new AbortController()
    const pollController = new AbortController()
    activeStreamControllerRef.current = streamController
    activePollControllerRef.current = pollController
    let resolveStreamCompleted: (() => void) | undefined
    let completedStreamResult: SessionTurnResult | undefined
    const streamCompleted = new Promise<void>((resolve) => {
      resolveStreamCompleted = resolve
    })
    const streamPromise = repository.stream(sessionId, {
      onCompleted: (draft, result) => {
        if (draft) setNoteDraft(draft)
        completedStreamResult = result
        resolveStreamCompleted?.()
      },
      onError: () => setStreamNotice(TURN_IN_PROGRESS_NOTICE),
      onStatus: () => setStreamNotice(TURN_IN_PROGRESS_NOTICE),
    }, streamController.signal).catch(() => undefined)
    const recoveredHistoryPromise = pollForCompletedTurn(
      repository,
      sessionId,
      knownMessageIds,
      pollController.signal,
    )

    try {
      const recoverySource = await Promise.race([
        streamCompleted.then(() => 'stream' as const),
        recoveredHistoryPromise.then(() => 'poll' as const),
      ])
      pollController.abort()
      const result = recoverySource === 'stream' && completedStreamResult
        ? completedStreamResult
        : await recoverTurnResult(
            repository,
            sessionId,
            recoverySource === 'poll'
              ? recoveredHistoryPromise
              : repository.listMessages(sessionId),
          )
      appendMessages(result.messages)
      setStreamUiActions(result.uiActions)
      onResult?.(result)
      return result
    } finally {
      pollController.abort()
      streamController.abort()
      await streamPromise
      setStreamNotice(null)
      activePollControllerRef.current = null
      activeStreamControllerRef.current = null
      cancellationRequestedRef.current = false
      isTurnPendingRef.current = false
      setIsTurnPending(false)
    }
  }, [appendMessages, repository, sessionId])

  return {
    appendLocalMessage,
    appendMessages,
    cancelTurn,
    clearNoteDraft,
    clearUiActions,
    historyError,
    hasOlderMessages,
    isLoadingHistory,
    isLoadingOlderMessages,
    loadOlderMessages,
    isTurnPending,
    markMessageFailed,
    markMessageRetrying,
    messages,
    noteDraft,
    reloadHistory,
    startNewConversation,
    streamNotice,
    streamUiActions,
    submitTurn,
    waitForTurnCompletion,
  }
}

async function recoverTurnResult(
  repository: SessionsRepository,
  sessionId: string,
  messagesPromise: Promise<SessionMessage[]>,
  noteDraft?: NoteDraft,
  fallbackUiActions: UiAction[] = [],
): Promise<SessionTurnResult> {
  const [historyResult, sessionResult] = await Promise.allSettled([
    messagesPromise,
    repository.getById(sessionId),
  ])
  const recoveredSession = sessionResult.status === 'fulfilled'
    ? sessionResult.value
    : null
  return {
    activeQuizId: recoveredSession?.activeQuizId,
    currentPage: recoveredSession?.currentPage,
    messages: historyResult.status === 'fulfilled' ? historyResult.value : [],
    noteDraft,
    pageStatus: recoveredSession?.pageStatus,
    pendingDiagnosis: recoveredSession?.pendingDiagnosis,
    uiActions: recoveredSession?.uiActions ?? fallbackUiActions,
  }
}

async function loadMessagePage(
  repository: SessionsRepository,
  sessionId: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  if (repository.listMessagePage) {
    return repository.listMessagePage(sessionId, cursor, signal)
  }
  return {
    hasMore: false,
    items: await repository.listMessages(sessionId, signal),
    nextCursor: undefined,
  }
}

function isTurnInProgressError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError
    && error.status === 409
    && error.code === 'TURN_IN_PROGRESS'
}

async function pollForCompletedTurn(
  repository: SessionsRepository,
  sessionId: string,
  knownMessageIds: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<SessionMessage[]> {
  while (!signal.aborted) {
    try {
      const history = await repository.listMessages(sessionId, signal)
      const hasNewCompletedAnswer = history.some((message) =>
        message.senderType === 'AI'
        && message.status !== 'FAILED'
        && message.status !== 'PENDING'
        && !knownMessageIds.has(message.id))
      if (hasNewCompletedAnswer) return history
    } catch (error) {
      if (signal.aborted) return []
      if (error instanceof ApiClientError && error.code === 'REQUEST_ABORTED') return []
    }
    await waitForRecoveryPoll(signal)
  }
  return []
}

function waitForRecoveryPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timeoutId = window.setTimeout(resolve, TURN_RECOVERY_POLL_INTERVAL_MS)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeoutId)
      resolve()
    }, { once: true })
  })
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
    status: message.status === 'FAILED'
      ? 'failed'
      : message.status === 'PENDING'
        ? 'streaming'
        : 'sent',
  }
}

export function getChatErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '채팅 요청을 처리하지 못했습니다.'
}
