import {
  ArrowUp,
  CheckCircle2,
  Copy,
  FileText,
  ListChecks,
  NotebookPen,
  RotateCcw,
  Share2,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { cx } from '../../shared/lib/cx'
import { getRequestErrorMessage } from '../../shared/api'
import { formatDateTime, formatTime } from '../../shared/lib/format'
import { Button, MarkdownContent } from '../../shared/ui'
import type { AuthenticatedRequest } from '../auth'
import { createNotesRepository, type Note } from '../notes'
import type { SessionQuizSummary, SessionTurnResult } from '../sessions'
import type { ChatMessage } from './chatTypes'
import { getChatErrorMessage, type SessionChat } from './useSessionChat'

interface ChatPanelProps {
  chat: SessionChat
  className?: string
  /** 서버 결정·퀴즈 유형 선택을 대화 로그의 AI 메시지로 표시한다. */
  conversationAction?: ReactNode
  currentPage?: number
  /** 세션 완료처럼 대화 전체에 적용되는 명령 (채팅 헤더 우측) */
  headerAction?: ReactNode
  /** 현재 페이지 설명을 일반 QA가 아닌 학습 진행 이벤트로 요청한다. */
  onExplainCurrentPage?: (message?: string) => Promise<void> | void
  /** 다음 페이지로 이동한 뒤 해당 페이지 설명을 학습 진행 이벤트로 요청한다. */
  onExplainNextPage?: (message?: string) => Promise<void> | void
  /** 서버가 확정한 턴 상태를 세션 화면과 동기화한다. */
  onTurnCompleted?: (result: SessionTurnResult) => void
  /** 시안 빠른 칩의 "퀴즈 내줘" — 세션 화면의 유형 선택(W4)을 연다. */
  onRequestQuiz?: () => void
  /** 현재 학습 세션에서 생성된 퀴즈 기록. */
  quizzes?: SessionQuizSummary[]
  quizzesError?: string | null
  isLoadingQuizzes?: boolean
  onOpenQuiz?: (quizId: string) => void
  onReloadQuizzes?: () => void
  request?: AuthenticatedRequest
  sessionId: string
}

/** 시안 4d의 빠른 액션 칩 */
const QUICK_ACTIONS = [
  { kind: 'note', label: '노트에 저장' },
  { kind: 'quiz', label: '퀴즈 내줘' },
  { kind: 'prompt', label: '쉽게 설명해줘' },
] as const

const MAX_QUESTION_INPUT_HEIGHT = 160

function createRequestId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `question-${Date.now()}`
}

export function ChatPanel({
  chat,
  className,
  conversationAction,
  headerAction,
  onExplainCurrentPage,
  onExplainNextPage,
  onOpenQuiz,
  onRequestQuiz,
  onReloadQuizzes,
  onTurnCompleted,
  quizzes = [],
  quizzesError = null,
  isLoadingQuizzes = false,
  request,
  sessionId,
}: ChatPanelProps) {
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'chat' | 'notes' | 'quizzes'>('chat')
  const [notes, setNotes] = useState<Note[]>([])
  const [notesError, setNotesError] = useState<string | null>(null)
  const [hiddenMessageCount, setHiddenMessageCount] = useState(0)
  const [isStartingConversation, setIsStartingConversation] = useState(false)
  const [messageActionStatus, setMessageActionStatus] = useState('')
  const logRef = useRef<HTMLDivElement | null>(null)
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null)
  const notesRepository = useMemo(
    () => request ? createNotesRepository(request) : null,
    [request],
  )

  useEffect(() => {
    if (!notesRepository) return
    let cancelled = false
    notesRepository.listForSession(sessionId).then((items) => { if (!cancelled) setNotes(items) }).catch((requestError) => {
      if (!cancelled) setNotesError(getRequestErrorMessage(requestError))
    })
    return () => { cancelled = true }
  }, [notesRepository, sessionId])

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [chat.messages.length, chat.isTurnPending, conversationAction])

  useLayoutEffect(() => {
    const input = questionInputRef.current
    if (!input) return

    input.style.height = 'auto'
    const nextHeight = Math.min(input.scrollHeight, MAX_QUESTION_INPUT_HEIGHT)
    input.style.height = `${nextHeight}px`
    input.style.overflowY = input.scrollHeight > MAX_QUESTION_INPUT_HEIGHT
      ? 'auto'
      : 'hidden'
  }, [question])

  async function sendQuestion(text: string) {
    const trimmedQuestion = text.trim()
    if (!trimmedQuestion) {
      setError('질문을 입력하세요.')
      return
    }

    if (chat.isTurnPending) return

    const requestId = createRequestId()
    const isProgressCommand = Boolean(
      (onExplainNextPage && isExplainNextPageCommand(trimmedQuestion))
      || (onExplainCurrentPage && isExplainCurrentPageCommand(trimmedQuestion)),
    )

    chat.appendLocalMessage({
      content: trimmedQuestion,
      id: `user-${requestId}`,
      requestId: isProgressCommand ? undefined : requestId,
      role: 'user',
      status: 'sent',
    })
    setQuestion('')
    setError(null)

    try {
      if (onExplainNextPage && isExplainNextPageCommand(trimmedQuestion)) {
        await onExplainNextPage(trimmedQuestion)
        return
      }
      if (onExplainCurrentPage && isExplainCurrentPageCommand(trimmedQuestion)) {
        await onExplainCurrentPage(trimmedQuestion)
        return
      }
      await chat.submitTurn(
        {
          eventType: 'USER_QUESTION',
          payload: {
            includeCurrentPage: true,
            message: trimmedQuestion,
          },
          requestId,
        },
        onTurnCompleted,
      )
    } catch (requestError) {
      if (!isProgressCommand) chat.markMessageFailed(requestId)
      setError(getChatErrorMessage(requestError))
    }
  }

  async function retryMessage(message: ChatMessage) {
    if (!message.requestId || chat.isTurnPending) return
    chat.markMessageRetrying(message.requestId)
    setError(null)
    try {
      await chat.submitTurn(
        {
          eventType: 'USER_QUESTION',
          payload: {
            includeCurrentPage: true,
            message: message.content,
          },
          requestId: message.requestId,
        },
        onTurnCompleted,
      )
    } catch (requestError) {
      chat.markMessageFailed(message.requestId)
      setError(getChatErrorMessage(requestError))
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendQuestion(question)
  }

  function handleQuestionKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return
    }
    event.preventDefault()
    void sendQuestion(question)
  }

  function handleQuickAction(kind: (typeof QUICK_ACTIONS)[number]['kind']) {
    if (kind === 'quiz') {
      onRequestQuiz?.()
      return
    }
    if (kind === 'prompt') {
      onExplainCurrentPage?.()
      return
    }

    const lastAnswer = [...visibleMessages]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (!lastAnswer) return
    void saveNote(lastAnswer.content, lastAnswer.pageNumber, lastAnswer.id)
  }

  async function saveNote(content: string, pageNumber?: number, sourceMessageId?: string) {
    if (!notesRepository) {
      setNotes((current) => [...current, { content, id: `local-${Date.now()}`, pageNumber, sourceMessageId }])
      setTab('notes')
      return
    }
    try {
      const numericMessageId = Number(sourceMessageId)
      const note = await notesRepository.createForSession(sessionId, {
        content,
        pageNumber,
        sourceMessageId: Number.isSafeInteger(numericMessageId) && numericMessageId > 0 ? numericMessageId : undefined,
      })
      setNotes((current) => [...current, note])
      setNotesError(null)
      setError(null)
      setMessageActionStatus('노트에 저장했습니다.')
      setTab('notes')
    } catch (requestError) {
      const message = getRequestErrorMessage(requestError)
      setNotesError(message)
      setError(`노트를 저장하지 못했습니다. ${message}`)
      setMessageActionStatus('노트를 저장하지 못했습니다.')
    }
  }

  async function startNewConversation() {
    if (isStartingConversation || chat.isTurnPending) return
    setIsStartingConversation(true)
    try {
      await chat.startNewConversation()
      setHiddenMessageCount(0)
      setError(null)
    } catch (requestError) {
      setError(getChatErrorMessage(requestError))
    } finally {
      setIsStartingConversation(false)
    }
  }

  async function removeNote(id: string) {
    if (!notesRepository) { setNotes((current) => current.filter((note) => note.id !== id)); return }
    try { await notesRepository.delete(id); setNotes((current) => current.filter((note) => note.id !== id)); setNotesError(null) }
    catch (requestError) { setNotesError(getRequestErrorMessage(requestError)) }
  }

  async function copyMessage(content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setMessageActionStatus('메시지를 복사했습니다.')
    } catch {
      setMessageActionStatus('메시지를 복사하지 못했습니다.')
    }
  }

  async function shareMessage(content: string) {
    try {
      if (navigator.share) {
        await navigator.share({ text: content, title: 'EduPilot 학습 대화' })
        setMessageActionStatus('메시지를 공유했습니다.')
        return
      }
      await navigator.clipboard.writeText(content)
      setMessageActionStatus('공유 기능을 지원하지 않아 메시지를 복사했습니다.')
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      setMessageActionStatus('메시지를 공유하지 못했습니다.')
    }
  }

  const visibleMessages = chat.messages.slice(hiddenMessageCount)
  const hasAssistantReply = visibleMessages.some(
    (message) => message.role === 'assistant',
  )

  return (
    <section
      className={cx(
        'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white',
        className,
      )}
    >
      <div className="flex h-13 shrink-0 items-center border-b border-stone-200 px-3">
        <div className="flex h-full min-w-0 flex-1 overflow-x-auto" role="tablist">
          <PanelTab
            isActive={tab === 'chat'}
            label="AI 채팅"
            onSelect={() => setTab('chat')}
          />
          <PanelTab
            count={quizzes.length}
            isActive={tab === 'quizzes'}
            label="내 퀴즈"
            onSelect={() => setTab('quizzes')}
          />
          <PanelTab
            count={notes.length}
            isActive={tab === 'notes'}
            label="내 노트"
            onSelect={() => setTab('notes')}
          />
        </div>
        <span className="sr-only">세션 {sessionId}</span>
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          {headerAction}
          {tab === 'chat' ? <button
            aria-label={isStartingConversation ? '새 대화 시작 중' : '대화 새로 시작'}
            className="flex items-center gap-1.5 px-2 py-1 type-caption text-stone-400 hover:text-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            disabled={isStartingConversation || chat.isTurnPending}
            onClick={() => void startNewConversation()}
            title="새 대화를 시작합니다. 이전 대화는 서버에 보관됩니다."
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} />
            <span className="hidden 2xl:inline">{isStartingConversation ? '시작 중' : '대화 새로 시작'}</span>
          </button> : null}
        </div>
      </div>

      {tab === 'quizzes' ? (
        <QuizzesPanel
          error={quizzesError}
          isLoading={isLoadingQuizzes}
          onOpen={onOpenQuiz}
          onReload={onReloadQuizzes}
          quizzes={quizzes}
        />
      ) : tab === 'notes' ? (
        <NotesPanel
          notes={notes}
          error={notesError}
          onRemove={(id) => void removeNote(id)}
        />
      ) : (
        <>
      <div
        aria-live="polite"
        className="grid min-h-0 flex-1 content-start gap-3.5 overflow-y-auto px-4 py-4"
        ref={logRef}
        role="log"
      >
        {chat.isLoadingHistory ? (
          <p className="type-body font-medium text-stone-500" role="status">
            이전 메시지를 불러오는 중입니다.
          </p>
        ) : null}

        {!chat.isLoadingHistory &&
        chat.historyError &&
        chat.messages.length === 0 ? (
          <div className="space-y-2">
            <p className="type-body font-medium text-rose-700" role="alert">
              {chat.historyError}
            </p>
            <Button
              onClick={chat.reloadHistory}
              size="sm"
              type="button"
              variant="secondary"
            >
              <RotateCcw aria-hidden="true" size={13} />
              다시 시도
            </Button>
          </div>
        ) : null}

        {visibleMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onCopy={() => void copyMessage(message.content)}
            onRetry={message.status === 'failed' && message.requestId ? () => void retryMessage(message) : undefined}
            onSaveNote={() => void saveNote(message.content, message.pageNumber, message.id)}
            onShare={() => void shareMessage(message.content)}
          />
        ))}

        <p aria-live="polite" className="sr-only">{messageActionStatus}</p>

        {chat.isTurnPending ? (
          <div
            className="mr-auto max-w-[90%] animate-pulse rounded-xl rounded-bl-[4px] bg-stone-100 px-3.5 py-2.5"
            role="status"
          >
            <p className="type-body leading-6 text-stone-500">
              {chat.streamNotice ?? '답변을 작성하는 중입니다…'}
            </p>
          </div>
        ) : null}

        {conversationAction && !chat.isTurnPending ? (
          <div className="flex flex-col items-start gap-1">
            <article
              aria-label="AI 진행 안내"
              className="max-w-[90%] rounded-xl rounded-bl-[4px] bg-stone-100 px-3.5 py-2.5 text-stone-900"
            >
              {conversationAction}
            </article>
          </div>
        ) : null}

      </div>

      {hasAssistantReply && !chat.isTurnPending ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              className="flex h-7.5 items-center rounded-full border border-stone-200 px-3 type-caption font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              key={action.kind}
              onClick={() => handleQuickAction(action.kind)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      <form className="shrink-0 p-3" onSubmit={handleSubmit}>
        <div
          className={cx(
            'flex items-end gap-2 rounded-xl border bg-stone-50 p-2',
            'focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100',
            error ? 'border-rose-400' : 'border-stone-200',
          )}
        >
          <label className="sr-only" htmlFor="chat-question">
            질문
          </label>
          <textarea
            aria-invalid={error ? true : undefined}
            className="min-h-8 max-h-40 flex-1 resize-none bg-transparent px-1.5 py-1.5 type-body text-stone-950 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed"
            disabled={chat.isTurnPending}
            id="chat-question"
            onChange={(event) => {
              setQuestion(event.target.value)
              setError(null)
            }}
            onKeyDown={handleQuestionKeyDown}
            placeholder="현재 페이지에 대해 질문…"
            ref={questionInputRef}
            rows={1}
            value={question}
          />
          <button
            aria-label={chat.isTurnPending ? '응답 대기 중' : '질문 보내기'}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={chat.isTurnPending}
            type="submit"
          >
            <ArrowUp aria-hidden="true" size={16} />
          </button>
        </div>

        {error ? (
          <p className="mt-1.5 type-caption font-medium text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
      </form>
        </>
      )}
    </section>
  )
}

function QuizzesPanel({
  error,
  isLoading,
  onOpen,
  onReload,
  quizzes,
}: {
  error: string | null
  isLoading: boolean
  onOpen?: (quizId: string) => void
  onReload?: () => void
  quizzes: SessionQuizSummary[]
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <p className="type-body font-medium text-stone-500" role="status">내 퀴즈를 불러오는 중입니다.</p>
      </div>
    )
  }

  if (error && quizzes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="type-body font-medium text-rose-700" role="alert">{error}</p>
        {onReload ? <Button onClick={onReload} size="sm" type="button" variant="secondary"><RotateCcw size={13} />다시 시도</Button> : null}
      </div>
    )
  }

  if (quizzes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <ListChecks aria-hidden="true" className="text-stone-300" size={27} />
        <p className="type-body font-semibold text-stone-500">생성된 퀴즈가 없습니다.</p>
        <p className="type-caption text-stone-400">학습 중 퀴즈를 만들면 여기에 기록됩니다.</p>
      </div>
    )
  }

  const orderedQuizzes = [...quizzes].sort((left, right) =>
    (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
  )

  return (
    <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto px-4 py-4">
      {error ? <p className="type-caption font-medium text-rose-700" role="alert">{error}</p> : null}
      {orderedQuizzes.map((quiz) => {
        const submitted = quiz.submitted === true
        return (
          <button
            aria-label={`${quiz.title} ${submitted ? '결과 및 문제 보기' : '퀴즈 이어 풀기'}`}
            className="rounded-xl border border-stone-200 bg-white p-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-default disabled:hover:border-stone-200 disabled:hover:bg-white"
            disabled={!onOpen}
            key={quiz.quizId}
            onClick={() => onOpen?.(quiz.quizId)}
            type="button"
          >
            <div className="flex items-start gap-3">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${submitted ? quiz.passed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700' : 'bg-brand-50 text-brand-700'}`}>
                {submitted ? quiz.passed ? <CheckCircle2 aria-hidden="true" size={18} /> : <XCircle aria-hidden="true" size={18} /> : <ListChecks aria-hidden="true" size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate type-body font-bold text-stone-950" title={quiz.title}>{quiz.title}</h3>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 type-micro font-semibold text-stone-600">{getQuizKindLabel(quiz.quizType)}</span>
                </div>
                {submitted ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <strong className="type-section-title text-stone-950">{formatQuizScore(quiz)}</strong>
                    <span className={`type-caption font-bold ${quiz.passed ? 'text-emerald-700' : 'text-rose-700'}`}>{quiz.passed ? '통과' : '보완 필요'}</span>
                  </div>
                ) : <p className="mt-2 type-caption font-semibold text-amber-700">응시 전</p>}
                {quiz.createdAt ? <p className="mt-1 type-micro text-stone-400">{formatDateTime(quiz.createdAt)}</p> : null}
              </div>
            </div>
            <p className="mt-3 text-center type-caption font-semibold text-brand-700">
              {submitted ? '결과 및 문제 보기' : '퀴즈 이어 풀기'}
            </p>
          </button>
        )
      })}
    </div>
  )
}

function formatQuizScore(quiz: SessionQuizSummary): string {
  if (quiz.score === undefined) return '채점 완료'
  return quiz.maxScore === undefined ? `${quiz.score}점` : `${quiz.score} / ${quiz.maxScore}점`
}

function getQuizKindLabel(quizType: string): string {
  const labels: Record<string, string> = {
    ESSAY: '서술형',
    MCQ: '객관식',
    OX: 'OX',
    SHORT: '단답형',
  }
  return labels[quizType] ?? quizType
}

function isExplainCurrentPageCommand(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[?.!,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return /^(현재 |이 )?페이지(를|에 대해)? (쉽게 )?설명(해 ?줘|해 ?주세요|해|)$/u.test(normalized)
    || /^(쉽게 )?설명(해 ?줘|해 ?주세요)$/u.test(normalized)
}

function isExplainNextPageCommand(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[?.!,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return /다음\s*(페이지|쪽|장)(로|으로|를|을|의|에|에서)?\s*(넘어가서\s*)?(내용(을|를)?\s*)?(쉽게\s*)?(설명|해설|요약)(해\s*줘|해\s*주세요|해줘|해주세요|해)?/u.test(normalized)
    || /다음\s*(페이지|쪽|장)(로|으로)?\s*(이동|넘어가|넘겨)(해\s*줘|해\s*주세요|줘|주세요|)?/u.test(normalized)
}

function PanelTab({
  count,
  isActive,
  label,
  onSelect,
}: {
  count?: number
  isActive: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <button
      aria-selected={isActive}
      className={cx(
        'flex h-full items-center gap-1.5 border-b-2 px-2.5 type-control',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        isActive
          ? 'border-brand-600 font-semibold text-brand-700'
          : 'border-transparent font-medium text-stone-400 hover:text-stone-600',
      )}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      {label}
      {count ? (
        <span className="rounded-full bg-stone-100 px-1.5 type-micro font-semibold text-stone-500">
          {count}
        </span>
      ) : null}
    </button>
  )
}

function NotesPanel({
  notes,
  error,
  onRemove,
}: {
  notes: Note[]
  error: string | null
  onRemove: (id: string) => void
}) {
  if (notes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <NotebookPen aria-hidden="true" className="text-stone-300" size={26} />
        {error ? <p className="type-caption font-medium text-rose-700" role="alert">{error}</p> : null}
        <p className="type-body font-semibold text-stone-500">
          저장한 노트가 없습니다.
        </p>
        <p className="type-caption text-stone-400">
          AI 답변의 &lsquo;노트에 저장&rsquo;을 눌러 정리해 보세요.
        </p>
      </div>
    )
  }

  return (
    <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto px-4 py-4">
      {error ? <p className="type-caption font-medium text-rose-700" role="alert">{error}</p> : null}
      {notes.map((note) => (
        <article
          className="rounded-xl border border-stone-200 px-3.5 py-2.5"
          key={note.id}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><MarkdownContent content={note.content} /></div>
            <button
              aria-label="노트 삭제"
              className="shrink-0 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              onClick={() => onRemove(note.id)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={14} />
            </button>
          </div>
          {note.pageNumber ? (
            <p className="mt-1.5 type-caption font-semibold text-brand-700">
              {note.pageNumber}쪽
            </p>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function MessageBubble({
  message,
  onCopy,
  onRetry,
  onSaveNote,
  onShare,
}: {
  message: ChatMessage
  onCopy: () => void
  onRetry?: () => void
  onSaveNote: () => void
  onShare: () => void
}) {
  const time = message.createdAt ? formatTime(message.createdAt) : ''

  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <article className="max-w-[85%] rounded-xl rounded-br-[4px] bg-brand-600 px-3.5 py-2.5 text-white">
          <span className="sr-only">내 질문</span>
          <p className="break-words type-body leading-6">{message.content}</p>
        </article>
        <div className="flex items-center justify-end gap-1">
          {message.status === 'failed' ? <span className="mr-1 type-caption font-semibold text-rose-700">전송 실패</span> : null}
          {onRetry ? <button className="mr-1 inline-flex items-center gap-1 type-caption font-semibold text-rose-700 hover:text-rose-800" onClick={onRetry} type="button"><RotateCcw aria-hidden="true" size={12} />다시 시도</button> : null}
          {time ? <span className="type-micro text-stone-400">{time}</span> : null}
          <MessageActions messageLabel="내 질문" onCopy={onCopy} onSaveNote={onSaveNote} onShare={onShare} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 w-full flex-col items-start gap-1">
      <article className="w-full min-w-0 rounded-xl rounded-bl-[4px] bg-stone-100 px-3.5 py-2.5 text-stone-900">
        <span className="sr-only">AI 답변</span>
        <MarkdownContent content={message.content} isStreaming={message.status === 'streaming'} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {message.pageNumber ? (
            <p className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2 py-1 type-caption font-semibold text-brand-700">
              <FileText aria-hidden="true" size={12} />
              {message.pageNumber}쪽 참조
            </p>
          ) : null}
        </div>
      </article>
      <div className="flex items-center gap-1">
        {time ? <span className="type-micro text-stone-400">{time}</span> : null}
        <MessageActions messageLabel="AI 답변" onCopy={onCopy} onSaveNote={onSaveNote} onShare={onShare} />
      </div>
    </div>
  )
}

function MessageActions({
  messageLabel,
  onCopy,
  onSaveNote,
  onShare,
}: {
  messageLabel: string
  onCopy: () => void
  onSaveNote: () => void
  onShare: () => void
}) {
  const className = 'flex size-6 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 text-stone-400 hover:bg-stone-100 hover:text-brand-700 focus-visible:outline-brand-600'

  return (
    <div className="flex items-center gap-0.5">
      <button aria-label={`${messageLabel} 복사`} className={className} onClick={onCopy} title="복사" type="button"><Copy aria-hidden="true" size={12} /></button>
      <button aria-label={`${messageLabel} 공유`} className={className} onClick={onShare} title="공유" type="button"><Share2 aria-hidden="true" size={12} /></button>
      <button aria-label={`${messageLabel} 노트에 저장`} className={className} onClick={onSaveNote} title="노트에 저장" type="button"><NotebookPen aria-hidden="true" size={12} /></button>
    </div>
  )
}
