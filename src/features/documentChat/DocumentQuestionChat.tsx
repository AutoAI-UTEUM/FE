import { LoaderCircle, Send, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { getRequestErrorMessage } from '../../shared/api'
import { MarkdownContent } from '../../shared/ui'
import type { AuthenticatedRequest } from '../auth'
import { createDocumentChatRepository, type DocumentChatHistoryItem, type DocumentChatMode, type DocumentChatWarning } from './documentChatRepository'

interface Props { materialId: string; mode: DocumentChatMode; request: AuthenticatedRequest }

export function DocumentQuestionChat({ materialId, mode, request }: Props) {
  return (
    <DocumentQuestionChatContent
      key={`${materialId}-${mode}`}
      materialId={materialId}
      mode={mode}
      request={request}
    />
  )
}

function DocumentQuestionChatContent({ materialId, mode, request }: Props) {
  const repository = useMemo(() => createDocumentChatRepository(request), [request])
  const [messages, setMessages] = useState<DocumentChatHistoryItem[]>([])
  const [question, setQuestion] = useState('')
  const [warnings, setWarnings] = useState<DocumentChatWarning[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [isPending, messages])

  async function sendQuestion() {
    const nextQuestion = question.trim()
    if (!nextQuestion || nextQuestion.length > 2000 || isPending) return
    const history = messages.slice(-50)
    setMessages((current) => [...current, { content: nextQuestion, role: 'USER' }])
    setQuestion(''); setWarnings([]); setError(null); setIsPending(true)
    try {
      const response = await repository.ask(materialId, mode, nextQuestion, history)
      setMessages((current) => [...current, { content: response.answer, role: 'ASSISTANT' }])
      setWarnings(response.warnings)
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally { setIsPending(false) }
  }

  function submit(event: FormEvent) { event.preventDefault(); void sendQuestion() }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault(); void sendQuestion()
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-44 items-center justify-center text-center"><div>
            <h3 className="type-section-title font-bold text-stone-950">{mode === 'quiz' ? '푼 퀴즈에 대해 질문해 보세요.' : '자료에 대해 질문해 보세요.'}</h3>
            <p className="mt-2 type-body text-stone-500">{mode === 'quiz' ? '제출한 답과 해설을 바탕으로 답변합니다.' : '현재 자료의 내용을 바탕으로 답변합니다.'}</p>
          </div></div>
        ) : <div className="grid gap-4">{messages.map((message, index) => message.role === 'USER' ? (
          <div className="ml-auto max-w-[88%] rounded-xl rounded-br-[4px] bg-brand-600 px-3.5 py-2.5 type-chat-body text-white" key={index}>{message.content}</div>
        ) : (
          <div className="max-w-[92%] rounded-xl rounded-bl-[4px] bg-stone-100 px-3.5 py-2.5 text-stone-900" key={index}><MarkdownContent content={message.content} typography="chat" /></div>
        ))}</div>}
        {isPending ? <div className="mt-4 flex items-center gap-2 type-chat-body text-stone-500" role="status"><LoaderCircle className="animate-spin" size={16} />답변을 준비하고 있습니다. 자료에 따라 시간이 걸릴 수 있어요.</div> : null}
        {warnings.map((warning, index) => <p className="mt-3 flex items-start gap-2 type-caption text-amber-700" key={`${warning.type}-${index}`}><TriangleAlert className="mt-0.5 shrink-0" size={14} />{warning.message}</p>)}
        {error ? <p className="mt-3 type-caption font-medium text-rose-700" role="alert">{error}</p> : null}
        <div ref={endRef} />
      </div>
      <form className="shrink-0 border-t border-stone-200 p-3" onSubmit={submit}>
        <div className="flex items-end gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2 focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea aria-label="문서 질문" className="max-h-36 min-h-8 flex-1 resize-none bg-transparent px-1 py-1.5 type-chat-body focus:outline-none" disabled={isPending} maxLength={2000} onChange={(event) => setQuestion(event.target.value)} onKeyDown={keyDown} placeholder="궁금한 내용을 입력하세요" rows={1} value={question} />
          <button aria-label={isPending ? '응답 대기 중' : '질문 보내기'} className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white disabled:bg-stone-300" disabled={isPending || !question.trim()} type="submit">{isPending ? <LoaderCircle className="animate-spin" size={15} /> : <Send size={15} />}</button>
        </div>
        <p className="mt-1.5 text-right type-micro text-stone-400">{question.length} / 2,000</p>
      </form>
    </div>
  )
}
