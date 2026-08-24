import {
  ArrowUp,
  Bot,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import { ApiClientError, getRequestErrorMessage } from '../../shared/api'
import { cx } from '../../shared/lib/cx'
import { MarkdownContent } from '../../shared/ui'
import type { AuthenticatedRequest } from '../auth'
import {
  createDocumentChatRepository,
  type DocumentChatHistoryMessage,
  type DocumentChatMode,
  type DocumentChatWarning,
} from './documentChatRepository'

interface DocumentChatPanelProps {
  className?: string
  materialId: string
  mode: DocumentChatMode
  request: AuthenticatedRequest
}

interface DisplayMessage {
  content: string
  id: string
  role: 'assistant' | 'user'
  status: 'failed' | 'sent'
}

const MAX_QUESTION_LENGTH = 2000
const MAX_INPUT_HEIGHT = 144

export function DocumentChatPanel({
  className,
  materialId,
  mode,
  request,
}: DocumentChatPanelProps) {
  const repository = useMemo(() => createDocumentChatRepository(request), [request])
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [question, setQuestion] = useState('')
  const [warnings, setWarnings] = useState<DocumentChatWarning[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const requestLockRef = useRef(false)
  const copy = getDocumentChatCopy(mode)

  useEffect(() => () => controllerRef.current?.abort(), [])

  useLayoutEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [isPending, messages.length])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`
    input.style.overflowY = input.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden'
  }, [question])

  async function sendQuestion(text: string, retryMessageId?: string) {
    const trimmedQuestion = text.trim()
    if (!trimmedQuestion || trimmedQuestion.length > MAX_QUESTION_LENGTH) return
    if (requestLockRef.current || isPending) return

    requestLockRef.current = true
    setIsPending(true)
    setError(null)
    setWarnings([])

    const userMessageId = retryMessageId ?? createMessageId('user')
    const history = toApiHistory(messages, retryMessageId)
    if (retryMessageId) {
      setMessages((current) => current.map((message) => (
        message.id === retryMessageId ? { ...message, status: 'sent' } : message
      )))
    } else {
      setMessages((current) => [...current, {
        content: trimmedQuestion,
        id: userMessageId,
        role: 'user',
        status: 'sent',
      }])
      setQuestion('')
    }

    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const response = await repository.ask(
        materialId,
        mode,
        trimmedQuestion,
        history,
        controller.signal,
      )
      setMessages((current) => [...current, {
        content: response.answer,
        id: createMessageId('assistant'),
        role: 'assistant',
        status: 'sent',
      }])
      setWarnings(response.warnings)
    } catch (requestError) {
      if (controller.signal.aborted) return
      setMessages((current) => current.map((message) => (
        message.id === userMessageId ? { ...message, status: 'failed' } : message
      )))
      setError(getDocumentChatErrorMessage(requestError, mode))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      requestLockRef.current = false
      setIsPending(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendQuestion(question)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void sendQuestion(question)
  }

  return (
    <section
      aria-label={copy.ariaLabel}
      className={cx(
        'flex h-full min-h-[420px] min-w-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white',
        className,
      )}
    >
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-stone-200 px-4">
        <Bot aria-hidden="true" className="text-brand-700" size={17} />
        <div className="min-w-0">
          <h2 className="type-control font-bold text-stone-900">{copy.title}</h2>
          <p className="truncate type-micro text-stone-400">{copy.description}</p>
        </div>
      </header>

      <div
        aria-live="polite"
        className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 py-4"
        ref={logRef}
        role="log"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-60 flex-col items-center justify-center px-5 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <Bot aria-hidden="true" size={20} />
            </span>
            <h3 className="mt-3 type-section-title font-bold text-stone-900">{copy.emptyTitle}</h3>
            <p className="mt-1 max-w-xs type-control leading-5 text-stone-500">{copy.emptyDescription}</p>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            className={message.role === 'user' ? 'flex flex-col items-end gap-1' : 'flex flex-col items-start gap-1'}
            key={message.id}
          >
            <article
              className={message.role === 'user'
                ? 'max-w-[88%] rounded-xl rounded-br-[4px] bg-stone-900 px-3.5 py-2.5 text-white'
                : 'max-w-[94%] rounded-xl rounded-bl-[4px] bg-stone-100 px-3.5 py-2.5 text-stone-900'}
            >
              {message.role === 'assistant'
                ? <MarkdownContent content={message.content} typography="chat" />
                : <p className="whitespace-pre-wrap type-chat-body">{message.content}</p>}
            </article>
            {message.status === 'failed' ? (
              <button
                className="inline-flex items-center gap-1 type-caption font-semibold text-rose-700 hover:text-rose-800"
                disabled={isPending}
                onClick={() => void sendQuestion(message.content, message.id)}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={12} />
                다시 시도
              </button>
            ) : null}
          </div>
        ))}

        {isPending ? (
          <div className="mr-auto flex max-w-[90%] items-center gap-2 rounded-xl rounded-bl-[4px] bg-stone-100 px-3.5 py-2.5" role="status">
            <LoaderCircle aria-hidden="true" className="animate-spin text-brand-600" size={15} />
            <p className="type-chat-body text-stone-500">답변을 준비하고 있습니다…</p>
          </div>
        ) : null}

        {warnings.map((warning, index) => (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 type-caption text-amber-800" key={`${warning.type}-${index}`} role="status">
            <TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
            {warning.message}
          </p>
        ))}
      </div>

      <form className="shrink-0 border-t border-stone-100 p-3" onSubmit={handleSubmit}>
        <div className={cx(
          'flex items-end gap-2 rounded-xl border bg-stone-50 p-2 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100',
          error ? 'border-rose-400' : 'border-stone-200',
        )}>
          <label className="sr-only" htmlFor={`document-chat-${mode}-${materialId}`}>{copy.inputLabel}</label>
          <textarea
            aria-describedby={`document-chat-count-${mode}-${materialId}`}
            aria-invalid={error ? true : undefined}
            className="min-h-8 max-h-36 flex-1 resize-none bg-transparent px-1.5 py-1.5 type-chat-body text-stone-950 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed"
            disabled={isPending}
            id={`document-chat-${mode}-${materialId}`}
            maxLength={MAX_QUESTION_LENGTH}
            onChange={(event) => {
              setQuestion(event.target.value)
              setError(null)
            }}
            onKeyDown={handleKeyDown}
            placeholder={copy.placeholder}
            ref={inputRef}
            rows={1}
            value={question}
          />
          <button
            aria-label={isPending ? '응답 대기 중' : copy.sendLabel}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={isPending || question.trim().length === 0}
            type="submit"
          >
            <ArrowUp aria-hidden="true" size={16} />
          </button>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-3">
          <p className="type-caption font-medium text-rose-700" role={error ? 'alert' : undefined}>{error}</p>
          <span className="shrink-0 type-micro tabular-nums text-stone-400" id={`document-chat-count-${mode}-${materialId}`}>
            {question.length}/{MAX_QUESTION_LENGTH}
          </span>
        </div>
      </form>
    </section>
  )
}

function toApiHistory(
  messages: DisplayMessage[],
  retryMessageId?: string,
): DocumentChatHistoryMessage[] {
  return messages
    .filter((message) => message.status === 'sent' && message.id !== retryMessageId)
    .map((message): DocumentChatHistoryMessage => ({
      content: message.content,
      role: message.role === 'user' ? 'USER' : 'ASSISTANT',
    }))
    .slice(-50)
}

function getDocumentChatErrorMessage(error: unknown, mode: DocumentChatMode): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'MATERIAL_PROCESSING') return '자료 처리가 끝난 뒤 질문할 수 있어요.'
    if (error.code === 'MATERIAL_PROCESSING_FAILED') return '자료 처리를 완료하지 못해 지금은 질문할 수 없어요.'
    if (error.code === 'QUIZ_NOT_FOUND' && mode === 'quiz') return '복습할 제출 퀴즈를 찾을 수 없어요.'
  }
  return getRequestErrorMessage(error, '답변을 불러오지 못했습니다.')
}

function getDocumentChatCopy(mode: DocumentChatMode) {
  if (mode === 'quiz') {
    return {
      ariaLabel: '퀴즈 복습 챗',
      description: '내가 제출한 답안과 해설 기준',
      emptyDescription: '틀린 이유나 정답에 도달하는 과정을 질문해 보세요.',
      emptyTitle: '퀴즈를 복습해 보세요',
      inputLabel: '퀴즈 복습 질문',
      placeholder: '퀴즈 결과에 대해 질문…',
      sendLabel: '퀴즈 복습 질문 보내기',
      title: '퀴즈 복습',
    }
  }
  return {
    ariaLabel: '자료 질문 챗',
    description: '자료 전체 내용 기준',
    emptyDescription: '현재 페이지를 넘어 자료 전체의 개념과 흐름을 질문할 수 있어요.',
    emptyTitle: '자료에 대해 질문해 보세요',
    inputLabel: '자료 질문',
    placeholder: '자료 전체에 대해 질문…',
    sendLabel: '자료 질문 보내기',
    title: '자료 질문',
  }
}

function createMessageId(role: DisplayMessage['role']): string {
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${role}-${suffix}`
}
