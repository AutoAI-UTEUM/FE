import { ApiClientError, type PagedResponse } from '../../shared/api'
import type {
  AuthenticatedRawRequest,
  AuthenticatedRequest,
} from '../auth'
import { consumeSseStream, type SseMessage } from './sseParser'
import type {
  LearningSession,
  LearningSessionStatus,
  PendingDiagnosisReference,
  NoteDraft,
  SessionMessage,
  SessionQuizSummary,
  SessionTurnResult,
  UiAction,
  UiActionEvent,
} from './sessionTypes'

interface UiActionDto {
  content?: string
  diagnosisId?: number | string
  durationMs?: number
  label?: string
  noEvent?: string
  type: string
  yesEvent?: string
}

interface PendingDiagnosisDto {
  diagnosisId: number | string
  prompt?: string
  quizScore?: number
  sourceQuestion?: string
}

interface SessionSummaryDto {
  currentPage: number
  materialId: number | string
  materialTitle?: string
  sessionId: number | string
  status: LearningSessionStatus
  updatedAt?: string
}

interface SessionDetailDto extends SessionSummaryDto {
  activeQuizId?: number | string | null
  pageStatus?: string
  pendingDiagnosis?: PendingDiagnosisDto | null
  uiActions?: UiActionDto[]
}

interface SessionMessageDto {
  content: string
  createdAt: string
  messageId: number | string
  messageType?: string
  pageNumber?: number
  senderType: 'AI' | 'USER'
  status?: 'COMPLETED' | 'FAILED' | 'PENDING'
}

interface CursorPage<T> {
  hasMore?: boolean
  items: T[]
  nextCursor?: string | null
}

interface SessionTurnDto {
  messages?: SessionMessageDto[]
  noteDraft?: unknown
  state?: {
    activeQuizId?: number | string | null
    currentPage?: number
    pageStatus?: string
    pendingDiagnosis?: PendingDiagnosisDto | null
  }
  uiActions?: UiActionDto[]
}

interface SessionActionDto {
  activeQuizId?: number | string | null
  currentPage?: number
  pageStatus?: string
  pendingDiagnosis?: PendingDiagnosisDto | null
  state?: SessionTurnDto['state']
  uiActions?: UiActionDto[]
}

interface SessionQuizDto {
  createdAt?: string
  maxScore?: number
  passed?: boolean
  quizId: number | string
  quizType: string
  submitted?: boolean
  score?: number
  title: string
}

interface SessionQuizListDto {
  items?: SessionQuizDto[]
  quizzes?: SessionQuizDto[]
}

export interface SessionTurnRequest {
  eventType:
    | 'DIAGNOSIS_ANSWER_SUBMITTED'
    | 'EXPLAIN_CURRENT_PAGE'
    | 'NOTE_REQUESTED'
    | 'QUIZ_TYPE_SELECTED'
    | 'USER_QUESTION'
  payload: Record<string, unknown>
  requestId: string
}

export interface SessionStreamHandlers {
  onCompleted?: (noteDraft?: NoteDraft) => void
  onContentDelta?: (text: string) => void
  onError?: (message: string) => void
  onStatus?: (message: string) => void
  onUiAction?: (action: UiAction) => void
}

export interface SessionsRepository {
  cancelTurn: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<boolean>
  complete: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<LearningSession>
  create: (
    materialId: string,
    signal?: AbortSignal,
  ) => Promise<LearningSession>
  declineQuiz: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<SessionTurnResult>
  delete: (sessionId: string, signal?: AbortSignal) => Promise<void>
  getById: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<LearningSession | null>
  list: (signal?: AbortSignal) => Promise<LearningSession[]>
  listMessages: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<SessionMessage[]>
  listQuizzes: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<SessionQuizSummary[]>
  startNewConversation: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<{ conversationId: string; startedAt: string }>
  movePage: (
    sessionId: string,
    pageNumber: number,
    signal?: AbortSignal,
  ) => Promise<{ currentPage: number; pageStatus?: string; uiActions: UiAction[] }>
  stream: (
    sessionId: string,
    handlers: SessionStreamHandlers,
    signal?: AbortSignal,
  ) => Promise<void>
  submitTurn: (
    sessionId: string,
    turn: SessionTurnRequest,
    signal?: AbortSignal,
  ) => Promise<SessionTurnResult>
}

export function createSessionsRepository(
  request: AuthenticatedRequest,
  rawRequest?: AuthenticatedRawRequest,
): SessionsRepository {
  return {
    async cancelTurn(sessionId, signal) {
      const { data } = await request<{ cancelled: boolean }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/turns/cancel`,
        { method: 'POST', signal },
      )
      return data.cancelled
    },
    async complete(sessionId, signal) {
      const { data } = await request<SessionDetailDto>(
        `/api/sessions/${encodeURIComponent(sessionId)}/complete`,
        { method: 'POST', signal },
      )
      return mapSession(data)
    },
    async create(materialId, signal) {
      const { data } = await request<SessionDetailDto>('/api/sessions', {
        body: { materialId: toApiId(materialId) },
        method: 'POST',
        signal,
      })
      return mapSession(data)
    },
    async declineQuiz(sessionId, signal) {
      const { data } = await request<SessionActionDto>(
        `/api/sessions/${encodeURIComponent(sessionId)}/quiz-decline`,
        { method: 'POST', signal },
      )
      const state = data.state ?? data
      return {
        activeQuizId: mapNullableId(state, 'activeQuizId'),
        currentPage: state.currentPage,
        messages: [],
        pageStatus: state.pageStatus,
        pendingDiagnosis: mapNullableDiagnosis(state),
        uiActions: mapUiActions(data.uiActions),
      }
    },
    async delete(sessionId, signal) {
      await request<unknown>(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
        { method: 'DELETE', signal },
      )
    },
    async getById(sessionId, signal) {
      try {
        const { data } = await request<SessionDetailDto>(
          `/api/sessions/${encodeURIComponent(sessionId)}`,
          { signal },
        )
        return mapSession(data)
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    async list(signal) {
      const { data } = await request<PagedResponse<SessionSummaryDto>>(
        '/api/sessions?page=0&size=20',
        { signal },
      )
      return data.items.map(mapSession)
    },
    async listMessages(sessionId, signal) {
      const { data } = await request<CursorPage<SessionMessageDto>>(
        `/api/sessions/${encodeURIComponent(sessionId)}/messages?size=50`,
        { signal },
      )
      return data.items.map(mapMessage)
    },
    async listQuizzes(sessionId, signal) {
      const { data } = await request<SessionQuizListDto>(
        `/api/sessions/${encodeURIComponent(sessionId)}/quizzes`,
        { signal },
      )
      return (data.quizzes ?? data.items ?? []).map((quiz) => ({
        createdAt: quiz.createdAt,
        maxScore: quiz.maxScore,
        passed: quiz.passed,
        quizId: String(quiz.quizId),
        quizType: quiz.quizType,
        score: quiz.score,
        submitted: quiz.submitted,
        title: quiz.title,
      }))
    },
    async startNewConversation(sessionId, signal) {
      const { data } = await request<{
        conversationId: number | string
        startedAt: string
      }>(`/api/sessions/${encodeURIComponent(sessionId)}/conversations`, {
        method: 'POST',
        signal,
      })
      return {
        conversationId: String(data.conversationId),
        startedAt: data.startedAt,
      }
    },
    async movePage(sessionId, pageNumber, signal) {
      const { data } = await request<{
        currentPage: number
        pageStatus?: string
        uiActions?: UiActionDto[]
      }>(`/api/sessions/${encodeURIComponent(sessionId)}/page`, {
        body: { pageNumber },
        method: 'PATCH',
        signal,
      })
      return {
        currentPage: data.currentPage,
        pageStatus: data.pageStatus,
        uiActions: mapUiActions(data.uiActions),
      }
    },
    async stream(sessionId, handlers, signal) {
      if (!rawRequest) {
        throw new ApiClientError({
          code: 'STREAM_UNAVAILABLE',
          message: '실시간 응답 연결을 사용할 수 없습니다.',
        })
      }

      const response = await rawRequest(
        `/api/sessions/${encodeURIComponent(sessionId)}/stream`,
        {
          headers: { Accept: 'text/event-stream' },
          signal,
        },
      )
      if (!response.body) {
        throw new ApiClientError({
          code: 'STREAM_EMPTY',
          message: '실시간 응답 본문이 없습니다.',
          status: response.status,
        })
      }

      await consumeSseStream(response.body, (message) =>
        handleStreamMessage(message, handlers),
      )
    },
    async submitTurn(sessionId, turn, signal) {
      const { data } = await request<SessionTurnDto>(
        `/api/sessions/${encodeURIComponent(sessionId)}/turns`,
        {
          body: {
            eventType: turn.eventType,
            payload: turn.payload,
            requestId: turn.requestId,
          },
          method: 'POST',
          signal,
        },
      )
      return {
        activeQuizId: mapNullableId(data.state, 'activeQuizId'),
        currentPage: data.state?.currentPage,
        messages: (data.messages ?? []).map(mapMessage),
        noteDraft: mapNoteDraft(data.noteDraft),
        pageStatus: data.state?.pageStatus,
        pendingDiagnosis: mapNullableDiagnosis(data.state),
        uiActions: mapUiActions(data.uiActions),
      }
    },
  }
}

function handleStreamMessage(
  message: SseMessage,
  handlers: SessionStreamHandlers,
): void {
  const payload = parseStreamPayload(message.data)
  const eventType =
    message.event === 'message' && typeof payload.type === 'string'
      ? payload.type
      : message.event

  if (eventType === 'content_delta' && typeof payload.text === 'string') {
    handlers.onContentDelta?.(payload.text)
    return
  }

  if (eventType === 'status' && typeof payload.stage === 'string') {
    handlers.onStatus?.(payload.stage)
    return
  }

  if (
    eventType === 'thought_summary' &&
    typeof payload.text === 'string'
  ) {
    handlers.onStatus?.(payload.text)
    return
  }

  if (eventType === 'completed') {
    handlers.onCompleted?.(mapNoteDraft(payload.noteDraft))
    return
  }

  if (
    eventType === 'ui_action' &&
    typeof payload.action === 'object' &&
    payload.action !== null
  ) {
    const [action] = mapUiActions([payload.action as UiActionDto])
    if (action) handlers.onUiAction?.(action)
    return
  }

  if (eventType === 'error') {
    handlers.onError?.(
      typeof payload.message === 'string'
        ? payload.message
        : '실시간 응답이 중단되었습니다.',
    )
  }
}

function parseStreamPayload(data: string): Record<string, unknown> {
  try {
    const payload = JSON.parse(data) as unknown
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : {}
  } catch {
    return { text: data }
  }
}

function mapSession(
  session: SessionSummaryDto | SessionDetailDto,
): LearningSession {
  const detail = session as SessionDetailDto
  return {
    activeQuizId: toOptionalString(detail.activeQuizId),
    currentPage: session.currentPage,
    id: String(session.sessionId),
    lastActivityAt: session.updatedAt ?? new Date().toISOString(),
    materialId: String(session.materialId),
    materialTitle: session.materialTitle ?? '학습 자료',
    pageStatus: detail.pageStatus,
    pendingDiagnosis: mapPendingDiagnosis(detail.pendingDiagnosis),
    status: session.status,
    uiActions: mapUiActions(detail.uiActions),
  }
}

function mapMessage(message: SessionMessageDto): SessionMessage {
  return {
    ...message,
    id: String(message.messageId),
    status: message.status ?? 'COMPLETED',
  }
}

const UI_ACTION_EVENTS = [
  'COMPLETE_SESSION',
  'EXPLAIN_CURRENT_PAGE',
  'MOVE_NEXT_PAGE',
  'NOTE_REQUESTED',
  'SHOW_QUIZ_TYPE_SELECT',
  'WAIT',
] as const

function mapNoteDraft(value: unknown): NoteDraft | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const draft = value as Record<string, unknown>
  if (typeof draft.title !== 'string' || typeof draft.content !== 'string') {
    return undefined
  }
  const title = draft.title.trim().slice(0, 60)
  const content = draft.content.trim()
  return title && content ? { content, title } : undefined
}

function toUiActionEvent(value: string | undefined): UiActionEvent | undefined {
  return UI_ACTION_EVENTS.find((event) => event === value)
}

function mapUiActions(actions: UiActionDto[] | undefined): UiAction[] {
  if (!actions) return []

  return actions.flatMap((action): UiAction[] => {
    if (action.type === 'BINARY_DECISION') {
      const yesEvent = toUiActionEvent(action.yesEvent)
      const noEvent = toUiActionEvent(action.noEvent)
      if (!yesEvent || !noEvent) return []
      return [
        {
          kind: 'BINARY_DECISION',
          label: action.content ?? action.label ?? '계속 진행할까요?',
          noEvent,
          yesEvent,
        },
      ]
    }

    if (action.type === 'DIAGNOSIS_QUESTION') {
      if (action.diagnosisId === undefined || action.diagnosisId === null) {
        return []
      }
      return [
        {
          diagnosisId: String(action.diagnosisId),
          kind: 'DIAGNOSIS_QUESTION',
          label: action.content ?? action.label ?? '진단 질문에 답해 주세요.',
        },
      ]
    }

    if (action.type === 'MOVE_NEXT_PAGE') {
      return [
        {
          kind: 'MOVE_NEXT_PAGE',
          label: action.content ?? action.label ?? '다음 페이지로',
          step: 1,
        },
      ]
    }

    if (action.type === 'WAIT') {
      return [
        {
          durationMs: action.durationMs ?? 0,
          kind: 'WAIT',
          label: action.content ?? action.label ?? '현재 페이지에서 계속 학습',
        },
      ]
    }

    return []
  })
}

function mapPendingDiagnosis(
  diagnosis: PendingDiagnosisDto | null | undefined,
): PendingDiagnosisReference | undefined {
  if (!diagnosis) return undefined
  return {
    ...diagnosis,
    diagnosisId: String(diagnosis.diagnosisId),
  }
}

function toOptionalString(
  value: number | string | null | undefined,
): string | undefined {
  return value === null || value === undefined ? undefined : String(value)
}

function mapNullableId(
  state: SessionTurnDto['state'],
  key: 'activeQuizId',
): string | null | undefined {
  if (!state || !Object.prototype.hasOwnProperty.call(state, key)) return undefined
  return state[key] === null ? null : toOptionalString(state[key])
}

function mapNullableDiagnosis(
  state: SessionTurnDto['state'],
): PendingDiagnosisReference | null | undefined {
  if (!state || !Object.prototype.hasOwnProperty.call(state, 'pendingDiagnosis')) {
    return undefined
  }
  return state.pendingDiagnosis === null
    ? null
    : mapPendingDiagnosis(state.pendingDiagnosis)
}

function toApiId(value: string): number | string {
  const numericValue = Number(value)
  return Number.isSafeInteger(numericValue) ? numericValue : value
}
