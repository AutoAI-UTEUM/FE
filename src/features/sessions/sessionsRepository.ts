import { ApiClientError, type PagedResponse } from '../../shared/api'
import { isApiCapabilityEnabled } from '../../shared/config/capabilities'
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
  StreamQuizQuestion,
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

export interface SessionMessagePage {
  hasMore: boolean
  items: SessionMessage[]
  nextCursor?: string
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
  page?: number
  passed?: boolean
  quizId: number | string
  quizType: string
  submitted?: boolean
  score?: number
  title: string
}

interface SessionQuizListDto {
  hasNext?: unknown
  items?: SessionQuizDto[]
  page?: unknown
  quizzes?: SessionQuizDto[]
  size?: unknown
  totalElements?: unknown
  totalPages?: unknown
}

const MAX_QUIZ_HISTORY_PAGES = 100

export interface SessionTurnRequest {
  capabilities?: {
    qaQuizProposal?: true
    quizQuestionStream?: true
  }
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
  onCompleted?: (noteDraft?: NoteDraft, result?: SessionTurnResult) => void
  onContentDelta?: (text: string) => void
  onError?: (message: string) => void
  onReady?: (ready: SessionStreamReady) => void
  onQuizQuestion?: (question: StreamQuizQuestion) => void
  onStatus?: (message: string) => void
  onUiAction?: (action: UiAction) => void
}

export interface SessionStreamReady {
  connectedAt?: string
  sessionId: string
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
  listMessagePage?: (
    sessionId: string,
    cursor?: string,
    signal?: AbortSignal,
  ) => Promise<SessionMessagePage>
  listQuizzes: (
    sessionId: string,
    signal?: AbortSignal,
  ) => Promise<SessionQuizSummary[]>
  listQuizHistory: (
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
  const listMessagePage = async (
    sessionId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SessionMessagePage> => {
    const query = new URLSearchParams({ size: '50' })
    if (cursor) query.set('cursor', cursor)
    const { data } = await request<CursorPage<SessionMessageDto>>(
      `/api/sessions/${encodeURIComponent(sessionId)}/messages?${query}`,
      { signal },
    )
    return {
      hasMore: data.hasMore ?? false,
      items: data.items.map(mapMessage),
      nextCursor: data.nextCursor ?? undefined,
    }
  }

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
      // Snapshot the first page's total so concurrent inserts cannot extend this loop.
      const readPage = async (page: number) => {
        signal?.throwIfAborted()
        const { data } = await request<PagedResponse<SessionSummaryDto>>(
          `/api/sessions?page=${page}&size=20`,
          { signal },
        )
        if (!Number.isSafeInteger(data.totalPages) || data.totalPages < 0 || data.page !== page) {
          throw new ApiClientError({ code: 'INVALID_SESSION_PAGE', message: '학습 세션 목록을 불러오지 못했습니다. 다시 시도해 주세요.' })
        }
        return data
      }
      const first = await readPage(0)
      const sessions = new Map(first.items.map((session) => [String(session.sessionId), mapSession(session)]))
      for (let page = 1; page < first.totalPages; page += 1) {
        const data = await readPage(page)
        for (const session of data.items) sessions.set(String(session.sessionId), mapSession(session))
      }
      return [...sessions.values()]
    },
    async listMessages(sessionId, signal) {
      const page = await listMessagePage(sessionId, undefined, signal)
      return page.items
    },
    listMessagePage,
    async listQuizzes(sessionId, signal) {
      const { data } = await request<SessionQuizListDto>(
        `/api/sessions/${encodeURIComponent(sessionId)}/quizzes`,
        { signal },
      )
      return mapQuizzes(data.quizzes ?? data.items ?? [])
    },
    async listQuizHistory(sessionId, signal) {
      const basePath = `/api/sessions/${encodeURIComponent(sessionId)}/quizzes`
      const quizzes = new Map<string, SessionQuizSummary>()
      let expectedPage = 0
      let expectedSize: number | undefined
      let hasNext = true

      while (hasNext) {
        if (expectedPage >= MAX_QUIZ_HISTORY_PAGES) {
          throw invalidQuizHistoryPage()
        }
        signal?.throwIfAborted()
        const path = expectedPage === 0
          ? basePath
          : `${basePath}?page=${expectedPage}&size=${expectedSize}`
        const { data } = await request<SessionQuizListDto>(path, { signal })
        signal?.throwIfAborted()

        const metadata = readQuizHistoryMetadata(data, expectedPage, expectedSize)
        const pageQuizzes = metadata
          ? data.quizzes as SessionQuizDto[]
          : data.quizzes ?? data.items ?? []
        for (const quiz of mapQuizzes(pageQuizzes)) {
          if (!quizzes.has(quiz.quizId)) quizzes.set(quiz.quizId, quiz)
        }

        if (!metadata) return [...quizzes.values()]
        expectedSize ??= metadata.size
        hasNext = metadata.hasNext
        expectedPage += 1
      }

      return [...quizzes.values()]
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
        handleStreamMessage(message, handlers, sessionId),
      )
    },
    async submitTurn(sessionId, turn, signal) {
      const capabilities = getTurnCapabilities(turn)
      const { data } = await request<SessionTurnDto>(
        `/api/sessions/${encodeURIComponent(sessionId)}/turns`,
        {
          body: {
            ...(capabilities ? { capabilities } : {}),
            eventType: turn.eventType,
            payload: turn.payload,
            requestId: turn.requestId,
          },
          method: 'POST',
          signal,
        },
      )
      return mapTurnResult(data)
    },
  }
}

interface QuizHistoryMetadata {
  hasNext: boolean
  size: number
}

const QUIZ_HISTORY_METADATA_KEYS = [
  'hasNext',
  'page',
  'size',
  'totalElements',
  'totalPages',
] as const

function readQuizHistoryMetadata(
  data: SessionQuizListDto,
  expectedPage: number,
  expectedSize?: number,
): QuizHistoryMetadata | undefined {
  const metadataPresence = QUIZ_HISTORY_METADATA_KEYS.map((key) =>
    Object.prototype.hasOwnProperty.call(data, key),
  )
  if (metadataPresence.every((present) => !present)) return undefined
  if (metadataPresence.some((present) => !present)) throw invalidQuizHistoryPage()

  const { hasNext, page, size, totalElements, totalPages } = data
  const validNumbers =
    Number.isSafeInteger(page) &&
    page === expectedPage &&
    Number.isSafeInteger(size) &&
    (size as number) >= 1 &&
    (size as number) <= 100 &&
    (expectedSize === undefined || size === expectedSize) &&
    Number.isSafeInteger(totalElements) &&
    (totalElements as number) >= 0 &&
    Number.isSafeInteger(totalPages) &&
    (totalPages as number) >= 0
  if (!validNumbers || typeof hasNext !== 'boolean' || !Array.isArray(data.quizzes)) {
    throw invalidQuizHistoryPage()
  }

  const numericPage = page as number
  const numericSize = size as number
  const numericTotalElements = totalElements as number
  const numericTotalPages = totalPages as number
  const calculatedTotalPages = numericTotalElements === 0
    ? 0
    : Math.ceil(numericTotalElements / numericSize)
  const isExcessPage = numericPage >= numericTotalPages
  const expectedHasNext = numericPage + 1 < numericTotalPages
  const validBounds =
    numericTotalPages === calculatedTotalPages &&
    data.quizzes.length <= numericSize &&
    (!isExcessPage || data.quizzes.length === 0) &&
    hasNext === expectedHasNext
  if (!validBounds) throw invalidQuizHistoryPage()

  return { hasNext, size: numericSize }
}

function mapQuizzes(quizzes: SessionQuizDto[]): SessionQuizSummary[] {
  return quizzes.map((quiz) => ({
    createdAt: quiz.createdAt,
    maxScore: quiz.maxScore,
    ...(quiz.page === undefined ? {} : { page: quiz.page }),
    passed: quiz.passed,
    quizId: String(quiz.quizId),
    quizType: quiz.quizType,
    score: quiz.score,
    submitted: quiz.submitted,
    title: quiz.title,
  }))
}

function invalidQuizHistoryPage() {
  return new ApiClientError({
    code: 'INVALID_QUIZ_HISTORY_PAGE',
    message: '과거 퀴즈를 불러오지 못했습니다. 다시 시도해 주세요.',
  })
}

function handleStreamMessage(
  message: SseMessage,
  handlers: SessionStreamHandlers,
  expectedSessionId: string,
): void {
  const payload = parseStreamPayload(message.data)
  const eventType =
    message.event === 'message' && typeof payload.type === 'string'
      ? payload.type
      : message.event

  if (eventType === 'ready') {
    const readySessionId = typeof payload.sessionId === 'string'
      || typeof payload.sessionId === 'number'
      ? String(payload.sessionId)
      : undefined
    if (!readySessionId || readySessionId !== expectedSessionId) {
      throw new ApiClientError({
        code: 'STREAM_SESSION_MISMATCH',
        message: '실시간 응답 연결의 학습 세션이 일치하지 않습니다.',
      })
    }
    handlers.onReady?.({
      connectedAt: typeof payload.connectedAt === 'string'
        ? payload.connectedAt
        : undefined,
      sessionId: readySessionId,
    })
    return
  }

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

  if (eventType === 'quiz_question') {
    const question = mapStreamQuizQuestion(payload)
    if (question) handlers.onQuizQuestion?.(question)
    return
  }

  if (eventType === 'completed') {
    const result = mapCompletedTurnResult(payload)
    if (result) {
      handlers.onCompleted?.(result.noteDraft ?? mapNoteDraft(payload.noteDraft), result)
    } else {
      handlers.onCompleted?.(mapNoteDraft(payload.noteDraft))
    }
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

function getTurnCapabilities(
  turn: SessionTurnRequest,
): SessionTurnRequest['capabilities'] | undefined {
  const capabilities: NonNullable<SessionTurnRequest['capabilities']> = {
    ...turn.capabilities,
  }
  if (
    turn.eventType === 'USER_QUESTION'
    && isApiCapabilityEnabled('qa-quiz-proposal')
  ) {
    capabilities.qaQuizProposal = true
  }
  if (
    turn.eventType === 'QUIZ_TYPE_SELECTED'
    && isApiCapabilityEnabled('quiz-question-stream')
  ) {
    capabilities.quizQuestionStream = true
  }
  return Object.keys(capabilities).length > 0 ? capabilities : undefined
}

function mapStreamQuizQuestion(
  payload: Record<string, unknown>,
): StreamQuizQuestion | undefined {
  const nestedQuestion = payload.question
  const question = typeof nestedQuestion === 'object' && nestedQuestion !== null
    ? nestedQuestion as Record<string, unknown>
    : payload
  const id = firstString(question.questionId, question.id)
  const prompt = firstString(
    question.questionText,
    question.prompt,
    question.content,
  )
  const kind = normalizeStreamQuizKind(
    firstString(
      question.questionType,
      question.quizType,
      question.kind,
      payload.quizType,
    ),
  )
  if (!id || !prompt || !kind) return undefined

  const rawChoices = Array.isArray(question.choices)
    ? question.choices
    : Array.isArray(question.options)
      ? question.options
      : undefined
  const choices = rawChoices?.flatMap((rawChoice, index) => {
    if (typeof rawChoice === 'string') {
      const label = rawChoice.trim()
      return label ? [{ id: String(index + 1), label }] : []
    }
    if (typeof rawChoice !== 'object' || rawChoice === null) return []
    const choice = rawChoice as Record<string, unknown>
    const label = firstString(choice.text, choice.label, choice.content)
    if (!label) return []
    return [{
      id: firstString(choice.choiceId, choice.optionId, choice.id, choice.key)
        ?? String(index + 1),
      label,
    }]
  })
  const sequence = firstPositiveInteger(
    question.sequence,
    question.index,
    question.questionIndex,
    payload.sequence,
    payload.index,
    payload.questionIndex,
  )
  const totalQuestions = firstPositiveInteger(
    question.totalQuestions,
    payload.totalQuestions,
    payload.questionCount,
  )
  const generationId = firstString(payload.generationId, question.generationId)
  const requestId = firstString(payload.requestId, payload.turnId)

  return {
    ...(choices && choices.length > 0 ? { choices } : {}),
    ...(generationId ? { generationId } : {}),
    id,
    kind,
    prompt,
    ...(requestId ? { requestId } : {}),
    ...(sequence ? { sequence } : {}),
    ...(totalQuestions ? { totalQuestions } : {}),
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const normalized = String(value).trim()
    if (normalized) return normalized
  }
  return undefined
}

function firstPositiveInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    const normalized = typeof value === 'number' ? value : Number(value)
    if (Number.isSafeInteger(normalized) && normalized > 0) return normalized
  }
  return undefined
}

function normalizeStreamQuizKind(
  value: string | undefined,
): StreamQuizQuestion['kind'] | undefined {
  const normalized = value?.trim().toUpperCase()
  if (
    normalized === 'MCQ'
    || normalized === 'OX'
    || normalized === 'SHORT'
    || normalized === 'ESSAY'
  ) {
    return normalized
  }
  return undefined
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

function mapCompletedTurnResult(
  payload: Record<string, unknown>,
): SessionTurnResult | undefined {
  const nestedResult = payload.result
  const candidate = typeof nestedResult === 'object' && nestedResult !== null
    ? nestedResult as Record<string, unknown>
    : payload
  if (!Array.isArray(candidate.messages)) return undefined
  return mapTurnResult(candidate as unknown as SessionTurnDto)
}

function mapTurnResult(data: SessionTurnDto): SessionTurnResult {
  return {
    activeQuizId: mapNullableId(data.state, 'activeQuizId'),
    currentPage: data.state?.currentPage,
    messages: (data.messages ?? []).map(mapMessage),
    noteDraft: mapNoteDraft(data.noteDraft),
    pageStatus: data.state?.pageStatus,
    pendingDiagnosis: mapNullableDiagnosis(data.state),
    uiActions: mapUiActions(data.uiActions),
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
