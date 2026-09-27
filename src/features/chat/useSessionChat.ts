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
const STREAM_READY_TIMEOUT_MS = 10_000

interface ActiveTurnAttempt {
  cancellationRequested: boolean
  id: number
  pollController: AbortController | null
  requestId: string
  streamController: AbortController
  turnController: AbortController | null
}

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
  const attemptSequenceRef = useRef(0)
  const activeAttemptRef = useRef<ActiveTurnAttempt | null>(null)

  const updateMessages = useCallback((updater: (current: ChatMessage[]) => ChatMessage[]) => {
    setMessages((current) => {
      const next = updater(current)
      messagesRef.current = next
      return next
    })
  }, [])

  useEffect(() => () => {
    const attempt = activeAttemptRef.current
    activeAttemptRef.current = null
    attemptSequenceRef.current += 1
    if (attempt && !attempt.streamController.signal.aborted) {
      logSessionStreamEvent('stream_abort', attempt, sessionId, 'session_change_or_unmount')
    }
    attempt?.pollController?.abort()
    attempt?.streamController.abort()
    attempt?.turnController?.abort()
    isTurnPendingRef.current = false
  }, [sessionId])

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
      setIsTurnPending(true)
      setStreamNotice('실시간 응답을 연결하는 중입니다.')
      setStreamUiActions([])
      const attempt: ActiveTurnAttempt = {
        cancellationRequested: false,
        id: ++attemptSequenceRef.current,
        pollController: null,
        requestId: turn.requestId,
        streamController: new AbortController(),
        turnController: null,
      }
      activeAttemptRef.current = attempt
      const isCurrentAttempt = () => activeAttemptRef.current === attempt
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
      let streamEnded = false
      let terminalReceived = false
      let turnPostStarted = false
      let readySettled = false
      let resolveReady: (() => void) | undefined
      let rejectReady: ((error: unknown) => void) | undefined
      const streamCompleted = new Promise<void>((resolve) => {
        resolveStreamCompleted = resolve
      })
      const streamReady = new Promise<void>((resolve, reject) => {
        resolveReady = resolve
        rejectReady = reject
      })
      const readyTimeoutId = window.setTimeout(() => {
        if (readySettled || !isCurrentAttempt()) return
        readySettled = true
        logSessionStreamEvent('stream_abort', attempt, sessionId, 'ready_timeout')
        rejectReady?.(new ApiClientError({
          code: 'STREAM_READY_TIMEOUT',
          message: '실시간 응답 연결을 준비하지 못했습니다. 다시 시도해 주세요.',
        }))
        attempt.streamController.abort()
      }, STREAM_READY_TIMEOUT_MS)
      const settleReady = (error?: unknown) => {
        if (readySettled) return
        readySettled = true
        window.clearTimeout(readyTimeoutId)
        if (error) rejectReady?.(error)
        else resolveReady?.()
      }
      attempt.streamController.signal.addEventListener('abort', () => {
        settleReady(new ApiClientError({
          code: 'REQUEST_ABORTED',
          message: '실시간 응답 연결이 취소되었습니다.',
        }))
      }, { once: true })
      const flushStreamContent = () => {
        if (streamRenderTimer !== null) clearTimeout(streamRenderTimer)
        streamRenderTimer = null
        if (
          !acceptsStreamContent ||
          !isCurrentAttempt() ||
          pendingStreamContent.length === 0
        ) return
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
        if (!acceptsStreamContent || !isCurrentAttempt()) return
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
      logSessionStreamEvent('stream_open_start', attempt, sessionId)
      const streamPromise = repository
        .stream(
          sessionId,
          {
            onCompleted: (draft, result) => {
              if (!isCurrentAttempt()) return
              terminalReceived = true
              flushStreamContent()
              completedNoteDraft = draft
              completedStreamResult = result
              logSessionStreamEvent('terminal', attempt, sessionId, 'completed')
              setStreamNotice(null)
              if (draft) setNoteDraft(draft)
              resolveStreamCompleted?.()
            },
            onContentDelta: (text) => {
              if (!isCurrentAttempt()) return
              setStreamNotice('답변을 실시간으로 받고 있습니다.')
              queueStreamContent(text)
            },
            onError: (message) => {
              if (!isCurrentAttempt()) return
              if (!readySettled) {
                logSessionStreamEvent('terminal', attempt, sessionId, 'error_before_ready')
                settleReady(new ApiClientError({
                  code: 'STREAM_ERROR_BEFORE_READY',
                  message,
                }))
                attempt.streamController.abort()
                return
              }
              setStreamNotice(message)
            },
            onReady: () => {
              if (!isCurrentAttempt() || readySettled) return
              logSessionStreamEvent('ready_received', attempt, sessionId)
              settleReady()
            },
            onStatus: (stage) => {
              if (isCurrentAttempt()) setStreamNotice(getStreamStageLabel(stage))
            },
            onUiAction: (action) => {
              if (!isCurrentAttempt()) return
              recoveredUiActions.push(action)
              setStreamUiActions((current) => [...current, action])
            },
          },
          attempt.streamController.signal,
        )
        .then(() => {
          streamEnded = true
          if (!readySettled) {
            logSessionStreamEvent('terminal', attempt, sessionId, 'eof_before_ready')
            settleReady(new ApiClientError({
              code: 'STREAM_CLOSED_BEFORE_READY',
              message: '실시간 응답 연결이 준비되기 전에 종료되었습니다. 다시 시도해 주세요.',
            }))
          } else if (
            isCurrentAttempt() &&
            turnPostStarted &&
            !terminalReceived &&
            !attempt.streamController.signal.aborted
          ) {
            logSessionStreamEvent('terminal', attempt, sessionId, 'eof_before_completed')
            setStreamNotice('실시간 연결이 중단되어 처리 결과를 확인하고 있습니다.')
          }
        })
        .catch((error: unknown) => {
          streamEnded = true
          if (!readySettled) settleReady(toStreamReadyError(error))
          if (
            isCurrentAttempt() &&
            !attempt.streamController.signal.aborted &&
            !(
              error instanceof ApiClientError &&
              error.code === 'REQUEST_ABORTED'
            )
          ) {
            logSessionStreamEvent('terminal', attempt, sessionId, 'stream_error')
            setStreamNotice('실시간 연결이 중단되어 처리 결과를 확인하고 있습니다.')
          }
        })

      try {
        await streamReady
        await Promise.resolve()
        if (!isCurrentAttempt()) {
          throw new ApiClientError({
            code: 'REQUEST_ABORTED',
            message: '이전 실시간 연결 시도가 종료되었습니다.',
          })
        }
        if (streamEnded && !terminalReceived) {
          throw new ApiClientError({
            code: 'STREAM_CLOSED_BEFORE_TURN',
            message: '실시간 응답 연결이 종료되었습니다. 다시 시도해 주세요.',
          })
        }

        attempt.turnController = new AbortController()
        turnPostStarted = true
        logSessionStreamEvent('turn_post_start', attempt, sessionId)
        const result = await repository.submitTurn(
          sessionId,
          turn,
          attempt.turnController.signal,
        )
        if (!isCurrentAttempt()) return result
        stopStreamContentUpdates()
        appendMessages(result.messages)
        setStreamUiActions(result.uiActions)
        if (result.noteDraft) setNoteDraft(result.noteDraft)
        onResult?.(result)
        setStreamNotice(null)
        return result
      } catch (error) {
        if (
          attempt.cancellationRequested
          && error instanceof ApiClientError
          && error.code === 'REQUEST_ABORTED'
        ) {
          if (isCurrentAttempt()) {
            updateMessages((current) => current.filter(
              (message) => message.id !== streamMessageId,
            ))
            setStreamNotice(null)
          }
          return {
            messages: [],
            uiActions: [],
          }
        }
        if (isTurnInProgressError(error)) {
          if (!isCurrentAttempt()) throw error
          // 거부된 중복 질문은 실패/재시도 대상으로 남기지 않는다.
          updateMessages((current) => current.filter(
            (message) => message.requestId !== turn.requestId,
          ))
          setStreamNotice(TURN_IN_PROGRESS_NOTICE)

          const pollController = new AbortController()
          attempt.pollController = pollController
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

        if (
          turnPostStarted &&
          (isTurnAlreadyProcessedError(error) || shouldRecoverTurnFailure(error))
        ) {
          const recovered = await recoverCompletedTurnAfterFailure(
            repository,
            sessionId,
            knownMessageIds,
          )
          if (recovered && isCurrentAttempt()) {
            appendMessages(recovered.messages)
            setStreamUiActions(recovered.uiActions)
            if (recovered.noteDraft) setNoteDraft(recovered.noteDraft)
            onResult?.(recovered)
            setStreamNotice(null)
            return recovered
          }
          if (isTurnAlreadyProcessedError(error) && isCurrentAttempt()) {
            reloadHistory()
          }
        }
        throw error
      } finally {
        window.clearTimeout(readyTimeoutId)
        stopStreamContentUpdates()
        attempt.pollController?.abort()
        attempt.turnController?.abort()
        if (!attempt.streamController.signal.aborted) {
          logSessionStreamEvent(
            'stream_abort',
            attempt,
            sessionId,
            terminalReceived ? 'terminal_cleanup' : 'turn_settled_cleanup',
          )
          attempt.streamController.abort()
        }
        await streamPromise
        if (isCurrentAttempt()) {
          activeAttemptRef.current = null
          streamingMessageIdRef.current = null
          isTurnPendingRef.current = false
          setIsTurnPending(false)
        }
      }
    },
    [appendMessages, reloadHistory, repository, sessionId, updateMessages],
  )

  const cancelTurn = useCallback(async () => {
    if (!isTurnPendingRef.current) return false
    const attempt = activeAttemptRef.current
    if (!attempt) return false
    setStreamNotice('답변 생성을 중단하는 중입니다.')
    try {
      if (!attempt.turnController) {
        attempt.cancellationRequested = true
        logSessionStreamEvent('stream_abort', attempt, sessionId, 'user_cancel_before_post')
        attempt.streamController.abort()
        return true
      }
      const cancelled = await repository.cancelTurn(sessionId)
      if (!cancelled) {
        if (activeAttemptRef.current === attempt) {
          setStreamNotice('서버에서 이미 답변을 마무리하고 있습니다.')
        }
        return false
      }
      if (activeAttemptRef.current !== attempt) return false
      attempt.cancellationRequested = true
      logSessionStreamEvent('stream_abort', attempt, sessionId, 'user_cancel')
      attempt.pollController?.abort()
      attempt.streamController.abort()
      attempt.turnController.abort()
      const streamingMessageId = streamingMessageIdRef.current
      if (streamingMessageId) {
        updateMessages((current) => current.filter((message) => message.id !== streamingMessageId))
      }
      streamingMessageIdRef.current = null
      return true
    } catch (error) {
      if (activeAttemptRef.current === attempt) {
        setStreamNotice(TURN_IN_PROGRESS_NOTICE)
      }
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
    setIsTurnPending(true)
    setStreamNotice(TURN_IN_PROGRESS_NOTICE)

    const knownMessageIds = new Set(messagesRef.current
      .filter((message) => message.role === 'assistant' && message.status === 'sent')
      .map((message) => message.id))
    const attempt: ActiveTurnAttempt = {
      cancellationRequested: false,
      id: ++attemptSequenceRef.current,
      pollController: new AbortController(),
      requestId: 'turn-recovery',
      streamController: new AbortController(),
      turnController: null,
    }
    activeAttemptRef.current = attempt
    const isCurrentAttempt = () => activeAttemptRef.current === attempt
    let resolveStreamCompleted: (() => void) | undefined
    let completedStreamResult: SessionTurnResult | undefined
    const streamCompleted = new Promise<void>((resolve) => {
      resolveStreamCompleted = resolve
    })
    logSessionStreamEvent('stream_open_start', attempt, sessionId, 'turn_recovery')
    const streamPromise = repository.stream(sessionId, {
      onCompleted: (draft, result) => {
        if (!isCurrentAttempt()) return
        if (draft) setNoteDraft(draft)
        completedStreamResult = result
        logSessionStreamEvent('terminal', attempt, sessionId, 'completed')
        resolveStreamCompleted?.()
      },
      onError: () => {
        if (isCurrentAttempt()) setStreamNotice(TURN_IN_PROGRESS_NOTICE)
      },
      onReady: () => {
        if (isCurrentAttempt()) {
          logSessionStreamEvent('ready_received', attempt, sessionId, 'turn_recovery')
        }
      },
      onStatus: () => {
        if (isCurrentAttempt()) setStreamNotice(TURN_IN_PROGRESS_NOTICE)
      },
    }, attempt.streamController.signal).catch(() => undefined)
    const recoveredHistoryPromise = pollForCompletedTurn(
      repository,
      sessionId,
      knownMessageIds,
      attempt.pollController!.signal,
    )

    try {
      const recoverySource = await Promise.race([
        streamCompleted.then(() => 'stream' as const),
        recoveredHistoryPromise.then(() => 'poll' as const),
      ])
      attempt.pollController?.abort()
      const result = recoverySource === 'stream' && completedStreamResult
        ? completedStreamResult
        : await recoverTurnResult(
            repository,
            sessionId,
            recoverySource === 'poll'
              ? recoveredHistoryPromise
              : repository.listMessages(sessionId),
          )
      if (isCurrentAttempt()) {
        appendMessages(result.messages)
        setStreamUiActions(result.uiActions)
        onResult?.(result)
      }
      return result
    } finally {
      attempt.pollController?.abort()
      if (!attempt.streamController.signal.aborted) {
        logSessionStreamEvent('stream_abort', attempt, sessionId, 'turn_recovery_settled')
        attempt.streamController.abort()
      }
      await streamPromise
      if (isCurrentAttempt()) {
        activeAttemptRef.current = null
        setStreamNotice(null)
        isTurnPendingRef.current = false
        setIsTurnPending(false)
      }
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

function isTurnAlreadyProcessedError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError
    && error.code === 'TURN_ALREADY_PROCESSED'
}

function shouldRecoverTurnFailure(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false
  return error.code === 'AI_STREAM_INTERRUPTED'
    || error.code === 'NETWORK_ERROR'
    || (typeof error.status === 'number' && error.status >= 500)
}

async function recoverCompletedTurnAfterFailure(
  repository: SessionsRepository,
  sessionId: string,
  knownMessageIds: ReadonlySet<string>,
): Promise<SessionTurnResult | undefined> {
  try {
    const history = await repository.listMessages(sessionId)
    const hasNewCompletedAnswer = history.some((message) =>
      message.senderType === 'AI'
      && message.status !== 'FAILED'
      && message.status !== 'PENDING'
      && !knownMessageIds.has(message.id))
    if (!hasNewCompletedAnswer) return undefined
    return recoverTurnResult(
      repository,
      sessionId,
      Promise.resolve(history),
    )
  } catch {
    return undefined
  }
}

function toStreamReadyError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error
  return new ApiClientError({
    cause: error,
    code: 'STREAM_READY_FAILED',
    message: '실시간 응답 연결을 준비하지 못했습니다. 다시 시도해 주세요.',
  })
}

function logSessionStreamEvent(
  event: 'ready_received' | 'stream_abort' | 'stream_open_start' | 'terminal' | 'turn_post_start',
  attempt: ActiveTurnAttempt,
  sessionId: string,
  reason?: string,
): void {
  console.info('[session-stream]', {
    attemptId: attempt.id,
    event,
    reason,
    requestId: attempt.requestId,
    sessionId,
    timestamp: new Date().toISOString(),
  })
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
