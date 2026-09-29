import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { ApiClientError } from '../../shared/api'
import type {
  SessionMessage,
  NoteDraft,
  SessionsRepository,
  StreamQuizQuestion,
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
  clearQuizQuestionPreview: () => void
  clearUiActions: () => void
  historyError: string | null
  hasOlderMessages: boolean
  isLoadingHistory: boolean
  isLoadingOlderMessages: boolean
  loadOlderMessages: () => Promise<boolean>
  isTurnPending: boolean
  messages: ChatMessage[]
  noteDraft: NoteDraft | null
  quizQuestionPreview: StreamQuizQuestion[]
  markMessageFailed: (requestId: string) => void
  markMessageRetrying: (requestId: string) => void
  reloadHistory: () => void
  startNewConversation: () => Promise<void>
  streamNotice: string | null
  streamUiActionSource?: SessionTurnRequest['eventType']
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

function upsertQuizQuestion(
  questions: StreamQuizQuestion[],
  incoming: StreamQuizQuestion,
): StreamQuizQuestion[] {
  const existingIndex = questions.findIndex((question) => question.id === incoming.id)
  const next = existingIndex < 0
    ? [...questions, incoming]
    : questions.map((question, index) => index === existingIndex ? incoming : question)
  return next.sort((left, right) => (
    (left.sequence ?? Number.MAX_SAFE_INTEGER)
    - (right.sequence ?? Number.MAX_SAFE_INTEGER)
  ))
}

interface ActiveTurnAttempt {
  cancellationRequested: boolean
  id: number
  pollController: AbortController | null
  requestId: string
  streamController: AbortController
  superseded: boolean
  turnController: AbortController | null
}

interface QuizRecoveryBaseline {
  activeQuizId?: string
  quizIds: ReadonlySet<string>
}

interface TurnRecoveryBaseline {
  knownMessageIds: ReadonlySet<string>
  quiz?: QuizRecoveryBaseline
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
  const [streamUiActionSource, setStreamUiActionSource] = useState<SessionTurnRequest['eventType']>()
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null)
  const [quizQuestionPreview, setQuizQuestionPreview] = useState<StreamQuizQuestion[]>([])
  const streamingMessageIdRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const isTurnPendingRef = useRef(false)
  const attemptSequenceRef = useRef(0)
  const activeAttemptRef = useRef<ActiveTurnAttempt | null>(null)
  const currentSessionIdRef = useRef(sessionId)

  useLayoutEffect(() => {
    currentSessionIdRef.current = sessionId
  }, [sessionId])

  const updateMessages = useCallback((updater: (current: ChatMessage[]) => ChatMessage[]) => {
    setMessages((current) => {
      const next = updater(current)
      messagesRef.current = next
      return next
    })
  }, [])

  useEffect(() => () => {
    const attempt = activeAttemptRef.current
    if (attempt) attempt.superseded = currentSessionIdRef.current !== sessionId
    activeAttemptRef.current = null
    attemptSequenceRef.current += 1
    if (attempt && !attempt.streamController.signal.aborted) {
      logSessionStreamEvent('stream_abort', attempt, sessionId, 'session_change_or_unmount')
    }
    attempt?.pollController?.abort()
    attempt?.streamController.abort()
    attempt?.turnController?.abort()
    isTurnPendingRef.current = false
    setIsTurnPending(false)
    setStreamNotice(null)
    setQuizQuestionPreview([])
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
    setStreamUiActionSource(undefined)
  }, [])

  const clearNoteDraft = useCallback(() => setNoteDraft(null), [])
  const clearQuizQuestionPreview = useCallback(() => {
    setQuizQuestionPreview([])
  }, [])

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
      setStreamUiActionSource(undefined)
      setQuizQuestionPreview([])
      const attempt: ActiveTurnAttempt = {
        cancellationRequested: false,
        id: ++attemptSequenceRef.current,
        pollController: null,
        requestId: turn.requestId,
        streamController: new AbortController(),
        superseded: false,
        turnController: null,
      }
      activeAttemptRef.current = attempt
      const isCurrentAttempt = () => activeAttemptRef.current === attempt
      const streamMessageId = `stream-${turn.requestId}`
      const knownMessageIds = new Set(messagesRef.current
        .filter((message) => message.role === 'assistant' && message.status === 'sent')
        .map((message) => message.id))
      const recoveryBaselinePromise = captureTurnRecoveryBaseline(
        repository,
        sessionId,
        turn,
        knownMessageIds,
        attempt.streamController.signal,
      )
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
      let quizPreviewGenerationId: string | undefined
      let recoveryBaseline: TurnRecoveryBaseline = { knownMessageIds }
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
              setQuizQuestionPreview([])
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
            onQuizQuestion: (question) => {
              if (
                !isCurrentAttempt()
                || !turnPostStarted
                || turn.eventType !== 'QUIZ_TYPE_SELECTED'
                || (question.requestId && question.requestId !== turn.requestId)
                || (
                  question.generationId
                  && quizPreviewGenerationId
                  && question.generationId !== quizPreviewGenerationId
                )
              ) return
              quizPreviewGenerationId ??= question.generationId
              setQuizQuestionPreview((current) => upsertQuizQuestion(current, question))
              setStreamNotice('완성된 문항을 미리 보여드리고 있습니다.')
            },
            onStatus: (stage) => {
              if (isCurrentAttempt()) setStreamNotice(getStreamStageLabel(stage))
            },
            onUiAction: (action) => {
              if (!isCurrentAttempt()) return
              recoveredUiActions.push(action)
              setStreamUiActions((current) => [...current, action])
              setStreamUiActionSource(turn.eventType)
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
            setQuizQuestionPreview([])
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
            setQuizQuestionPreview([])
            setStreamNotice('실시간 연결이 중단되어 처리 결과를 확인하고 있습니다.')
          }
        })

      try {
        const [, capturedRecoveryBaseline] = await Promise.all([
          streamReady,
          recoveryBaselinePromise,
        ])
        recoveryBaseline = capturedRecoveryBaseline
        await Promise.resolve()
        if (!isCurrentAttempt()) {
          throw createInactiveTurnError(attempt)
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
        if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
        stopStreamContentUpdates()
        appendMessages(result.messages)
        setStreamUiActions(result.uiActions)
        setStreamUiActionSource(result.uiActions.length > 0 ? turn.eventType : undefined)
        if (result.noteDraft) setNoteDraft(result.noteDraft)
        onResult?.(result)
        setStreamNotice(null)
        return result
      } catch (error) {
        if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
        setQuizQuestionPreview([])
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
          if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
          // 거부된 중복 질문은 실패/재시도 대상으로 남기지 않는다.
          updateMessages((current) => current.filter(
            (message) => message.requestId !== turn.requestId,
          ))
          setStreamNotice(TURN_IN_PROGRESS_NOTICE)

          const pollController = new AbortController()
          attempt.pollController = pollController
          const recoveredTurnPromise = pollForCompletedTurn(
            repository,
            sessionId,
            recoveryBaseline,
            pollController.signal,
          )
          let recoverySource: 'poll' | 'stream'
          try {
            recoverySource = await Promise.race([
              streamCompleted.then(() => 'stream' as const),
              recoveredTurnPromise.then(() => 'poll' as const),
            ])
          } catch (recoveryError) {
            if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
            if (attempt.cancellationRequested && isRequestAbortedError(recoveryError)) {
              return emptyTurnResult()
            }
            throw recoveryError
          }
          if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)

          let result: SessionTurnResult
          try {
            if (recoverySource === 'stream') {
              const recovered = completedStreamResult
                ?? await queryRecoveredTurnResult(
                  repository,
                  sessionId,
                  recoveryBaseline,
                  pollController.signal,
                )
              if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
              result = {
                ...(recovered ?? emptyTurnResult()),
                noteDraft: completedNoteDraft ?? recovered?.noteDraft,
                uiActions: recovered?.uiActions.length
                  ? recovered.uiActions
                  : recoveredUiActions,
              }
            } else {
              result = await recoveredTurnPromise
            }
          } catch (recoveryError) {
            if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
            if (attempt.cancellationRequested && isRequestAbortedError(recoveryError)) {
              return emptyTurnResult()
            }
            throw recoveryError
          }
          pollController.abort()
          if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
          appendMessages(result.messages)
          setStreamUiActions(result.uiActions)
          setStreamUiActionSource(result.uiActions.length > 0 ? turn.eventType : undefined)
          onResult?.(result)
          setStreamNotice(null)
          return result
        }

        if (
          turnPostStarted &&
          (isTurnAlreadyProcessedError(error) || shouldRecoverTurnFailure(error))
        ) {
          const recoveryController = new AbortController()
          attempt.pollController = recoveryController
          let recovered: SessionTurnResult | undefined
          try {
            recovered = await recoverCompletedTurnAfterFailure(
              repository,
              sessionId,
              recoveryBaseline,
              recoveryController.signal,
            )
          } catch (recoveryError) {
            if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
            if (attempt.cancellationRequested && isRequestAbortedError(recoveryError)) {
              return emptyTurnResult()
            }
            throw recoveryError
          }
          if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
          if (recovered) {
            appendMessages(recovered.messages)
            setStreamUiActions(recovered.uiActions)
            setStreamUiActionSource(
              recovered.uiActions.length > 0 ? turn.eventType : undefined,
            )
            if (recovered.noteDraft) setNoteDraft(recovered.noteDraft)
            onResult?.(recovered)
            setStreamNotice(null)
            return recovered
          }
          if (isTurnAlreadyProcessedError(error)) {
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
          setQuizQuestionPreview([])
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
    setQuizQuestionPreview([])
    try {
      if (!attempt.turnController) {
        attempt.cancellationRequested = true
        logSessionStreamEvent('stream_abort', attempt, sessionId, 'user_cancel_before_post')
        attempt.pollController?.abort()
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
      setStreamUiActionSource(undefined)
      setNoteDraft(null)
      setQuizQuestionPreview([])
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
      superseded: false,
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
    const recoveredTurnPromise = pollForCompletedTurn(
      repository,
      sessionId,
      { knownMessageIds },
      attempt.pollController!.signal,
    )

    try {
      const recoverySource = await Promise.race([
        streamCompleted.then(() => 'stream' as const),
        recoveredTurnPromise.then(() => 'poll' as const),
      ])
      if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
      let result: SessionTurnResult
      if (recoverySource === 'stream') {
        result = completedStreamResult
          ?? await queryRecoveredTurnResult(
            repository,
            sessionId,
            { knownMessageIds },
            attempt.pollController!.signal,
          )
          ?? emptyTurnResult()
      } else {
        result = await recoveredTurnPromise
      }
      attempt.pollController?.abort()
      if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
      appendMessages(result.messages)
      setStreamUiActions(result.uiActions)
      setStreamUiActionSource(undefined)
      onResult?.(result)
      return result
    } catch (error) {
      if (!isCurrentAttempt()) throw createInactiveTurnError(attempt)
      if (attempt.cancellationRequested && isRequestAbortedError(error)) {
        return emptyTurnResult()
      }
      throw error
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
    clearQuizQuestionPreview,
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
    quizQuestionPreview,
    reloadHistory,
    startNewConversation,
    streamNotice,
    streamUiActionSource,
    streamUiActions,
    submitTurn,
    waitForTurnCompletion,
  }
}

async function captureTurnRecoveryBaseline(
  repository: SessionsRepository,
  sessionId: string,
  turn: SessionTurnRequest,
  knownMessageIds: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<TurnRecoveryBaseline> {
  const baseline: TurnRecoveryBaseline = { knownMessageIds }
  if (turn.eventType !== 'QUIZ_TYPE_SELECTED') return baseline

  const [sessionResult, quizzesResult] = await Promise.allSettled([
    repository.getById(sessionId, signal),
    repository.listQuizzes(sessionId, signal),
  ])
  throwIfRequestAborted(signal)
  if (sessionResult.status !== 'fulfilled' || quizzesResult.status !== 'fulfilled') {
    return baseline
  }

  return {
    ...baseline,
    quiz: {
      activeQuizId: sessionResult.value?.activeQuizId,
      quizIds: new Set(quizzesResult.value.map((quiz) => quiz.quizId)),
    },
  }
}

async function queryRecoveredTurnResult(
  repository: SessionsRepository,
  sessionId: string,
  baseline: TurnRecoveryBaseline,
  signal: AbortSignal,
): Promise<SessionTurnResult | undefined> {
  const [historyResult] = await Promise.allSettled([
    repository.listMessages(sessionId, signal),
  ])
  throwIfRequestAborted(signal)

  const history = historyResult.status === 'fulfilled' ? historyResult.value : []
  const hasNewCompletedAnswer = history.some((message) =>
    message.senderType === 'AI'
    && message.status !== 'FAILED'
    && message.status !== 'PENDING'
    && !baseline.knownMessageIds.has(message.id))

  if (!baseline.quiz && !hasNewCompletedAnswer) return undefined

  const [sessionResult, quizzesResult] = await Promise.allSettled([
    repository.getById(sessionId, signal),
    baseline.quiz
      ? repository.listQuizzes(sessionId, signal)
      : Promise.resolve(undefined),
  ])
  throwIfRequestAborted(signal)

  const recoveredSession = sessionResult.status === 'fulfilled'
    ? sessionResult.value
    : null
  const recoveredQuizId = recoveredSession?.activeQuizId
  const quizzes = quizzesResult.status === 'fulfilled'
    ? quizzesResult.value
    : undefined
  const hasNewActiveQuiz = Boolean(
    baseline.quiz
    && recoveredQuizId
    && recoveredQuizId !== baseline.quiz.activeQuizId
    && !baseline.quiz.quizIds.has(recoveredQuizId)
    && quizzes?.some((quiz) => quiz.quizId === recoveredQuizId),
  )

  if (!hasNewCompletedAnswer && !hasNewActiveQuiz) return undefined
  return {
    activeQuizId: recoveredSession?.activeQuizId,
    currentPage: recoveredSession?.currentPage,
    messages: history,
    pageStatus: recoveredSession?.pageStatus,
    pendingDiagnosis: recoveredSession?.pendingDiagnosis,
    uiActions: recoveredSession?.uiActions ?? [],
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
  baseline: TurnRecoveryBaseline,
  signal: AbortSignal,
): Promise<SessionTurnResult | undefined> {
  try {
    return await queryRecoveredTurnResult(
      repository,
      sessionId,
      baseline,
      signal,
    )
  } catch (error) {
    if (signal.aborted) throw error
    return undefined
  }
}

function createSupersededTurnError(): ApiClientError {
  return new ApiClientError({
    code: 'TURN_ATTEMPT_SUPERSEDED',
    message: '세션이 변경되어 이전 요청 처리를 종료했습니다.',
  })
}

function createInactiveTurnError(attempt: ActiveTurnAttempt): ApiClientError {
  if (attempt.superseded) return createSupersededTurnError()
  return new ApiClientError({
    code: 'REQUEST_ABORTED',
    message: '요청이 취소되었습니다.',
  })
}

function emptyTurnResult(): SessionTurnResult {
  return { messages: [], uiActions: [] }
}

function isRequestAbortedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'REQUEST_ABORTED'
}

export function isSupersededTurnError(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'TURN_ATTEMPT_SUPERSEDED'
}

function throwIfRequestAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  throw new ApiClientError({
    code: 'REQUEST_ABORTED',
    message: '요청이 취소되었습니다.',
  })
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
  baseline: TurnRecoveryBaseline,
  signal: AbortSignal,
): Promise<SessionTurnResult> {
  while (!signal.aborted) {
    try {
      const recovered = await queryRecoveredTurnResult(
        repository,
        sessionId,
        baseline,
        signal,
      )
      if (recovered) return recovered
    } catch (error) {
      if (signal.aborted || isRequestAbortedError(error)) throw error
    }
    await waitForRecoveryPoll(signal)
  }
  throwIfRequestAborted(signal)
  throw new ApiClientError({
    code: 'TURN_RECOVERY_STOPPED',
    message: '진행 중인 응답 확인이 종료되었습니다.',
  })
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
