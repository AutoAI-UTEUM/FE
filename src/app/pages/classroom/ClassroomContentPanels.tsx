import { ArrowLeft, Save, Send, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { ClassroomNotice, ClassroomNoticeInput } from '../../../features/classrooms'
import { ExamEditor } from '../../../features/exams/ExamEditor'
import { createQuestion, isExamDraftValid } from '../../../features/exams/examEditorModel'
import type { CreateExamInput, Exam, ExamsRepository } from '../../../features/exams/examsRepository'
import { getRequestErrorMessage } from '../../../shared/api'
import { Badge, Button, useToast } from '../../../shared/ui'

export function NoticeContentPanel({
  canUseWeekNumber,
  disabled,
  notice,
  onClose,
  onDelete,
  onSave,
  weekNumber,
}: {
  canUseWeekNumber: boolean
  disabled: boolean
  notice: ClassroomNotice | null
  onClose: () => void
  onDelete?: (notice: ClassroomNotice) => Promise<void>
  onSave: (input: ClassroomNoticeInput, noticeId?: string) => Promise<void>
  weekNumber: number | null
}) {
  const [title, setTitle] = useState(notice?.title ?? '')
  const [content, setContent] = useState(notice?.content ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const selectedWeek = notice ? notice.weekNumber : weekNumber
  const weeklyNoticeUnavailable = selectedWeek !== null && !canUseWeekNumber

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !content.trim() || isSubmitting || disabled || weeklyNoticeUnavailable) return
    setIsSubmitting(true)
    try {
      const input: ClassroomNoticeInput = { content: content.trim(), title: title.trim() }
      if (canUseWeekNumber) input.weekNumber = selectedWeek
      await onSave(input, notice?.id)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function remove() {
    if (!notice || !onDelete || isDeleting) return
    setIsDeleting(true)
    try {
      await onDelete(notice)
    } finally {
      setIsDeleting(false)
    }
  }

  return <form className="flex min-h-[520px] flex-col rounded-lg border border-stone-200 bg-white" onSubmit={submit}>
    <div className="flex min-h-14 items-center gap-3 border-b border-stone-200 px-5">
      <button aria-label="목록으로 돌아가기" className="flex size-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100" onClick={onClose} type="button"><ArrowLeft size={16} /></button>
      <div className="min-w-0 flex-1"><h2 className="type-section-title font-bold text-stone-950">{notice ? '공지 편집' : '공지 작성'}</h2><p className="type-caption text-stone-500">{selectedWeek === null ? '전체 공지' : `${selectedWeek}주차 공지`}</p></div>
    </div>
    {weeklyNoticeUnavailable ? <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 type-control text-amber-800" role="status">주차별 공지 API가 준비되면 저장할 수 있습니다. 전체 공지는 지금 등록할 수 있습니다.</p> : null}
    <div className="flex flex-1 flex-col gap-4 p-5">
      <label className="type-control font-semibold text-stone-700">공지 제목<input autoFocus={!notice} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 px-3.5 type-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50" disabled={disabled} maxLength={200} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
      <label className="flex flex-1 flex-col type-control font-semibold text-stone-700">본문<textarea className="mt-1.5 min-h-72 flex-1 resize-none rounded-lg border border-stone-300 px-3.5 py-3 type-body leading-6 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50" disabled={disabled} maxLength={5000} onChange={(event) => setContent(event.target.value)} value={content} /></label>
    </div>
    <div className="flex min-h-16 items-center justify-between px-5">
      {notice && onDelete ? <Button className="border-rose-200 text-rose-700 hover:bg-rose-50" disabled={disabled || isDeleting} onClick={() => void remove()} type="button" variant="secondary"><Trash2 size={14} />{isDeleting ? '삭제 중' : '삭제'}</Button> : <span />}
      <Button disabled={disabled || weeklyNoticeUnavailable || !title.trim() || !content.trim() || isSubmitting} type="submit"><Save size={14} />{isSubmitting ? '저장 중' : notice ? '변경사항 저장' : '공지 게시'}</Button>
    </div>
  </form>
}

export function ExamContentPanel({
  classroomId,
  disabled,
  exam,
  initialWeekNumber,
  onClose,
  onDeleted,
  onSaved,
  repository,
}: {
  classroomId: string
  disabled: boolean
  exam: Exam | null
  initialWeekNumber?: number
  onClose: () => void
  onDeleted: (examId: string) => void
  onSaved: (exam: Exam) => void
  repository: ExamsRepository
}) {
  const { show } = useToast()
  const [draft, setDraft] = useState<CreateExamInput>(() => exam ? examToDraft(exam) : createInitialDraft(initialWeekNumber))
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isExamDraftValid(draft) || isSubmitting || disabled) return
    setIsSubmitting(true)
    try {
      const saved = exam
        ? await repository.update(exam.id, { ...draft, title: draft.title.trim() })
        : await repository.create(classroomId, { ...draft, title: draft.title.trim() })
      onSaved(saved)
      show(exam ? '시험을 수정했습니다.' : '시험 초안을 만들었습니다.', 'success')
    } catch (error) {
      show(getRequestErrorMessage(error), 'danger')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function publish() {
    if (!exam || isSubmitting || disabled) return
    setIsSubmitting(true)
    try {
      const published = await repository.publish(exam.id)
      onSaved(published)
      show('시험을 공개했습니다.', 'success')
    } catch (error) {
      show(getRequestErrorMessage(error), 'danger')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function remove() {
    if (!exam || isSubmitting || disabled || !window.confirm(`'${exam.title}' 시험을 삭제할까요?`)) return
    setIsSubmitting(true)
    try {
      await repository.delete(exam.id)
      onDeleted(exam.id)
      show('시험을 삭제했습니다.', 'success')
    } catch (error) {
      show(getRequestErrorMessage(error), 'danger')
      setIsSubmitting(false)
    }
  }

  const editable = !exam || exam.status === 'DRAFT'

  return <form className="rounded-lg border border-stone-200 bg-white" onSubmit={save}>
    <div className="flex min-h-14 items-center gap-3 border-b border-stone-200 px-5">
      <button aria-label="목록으로 돌아가기" className="flex size-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100" onClick={onClose} type="button"><ArrowLeft size={16} /></button>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="type-section-title font-bold text-stone-950">{exam ? '시험 관리' : '시험 만들기'}</h2>{exam ? <Badge tone={exam.status === 'DRAFT' ? 'neutral' : exam.status === 'PUBLISHED' ? 'success' : 'warning'}>{exam.status === 'DRAFT' ? '초안' : exam.status === 'PUBLISHED' ? '공개' : '종료'}</Badge> : null}</div><p className="type-caption text-stone-500">{draft.weekNumber ? `${draft.weekNumber}주차 시험` : '전체 시험'}</p></div>
    </div>
    <div className="p-5">{editable ? <ExamEditor onChange={setDraft} value={draft} /> : <div className="py-16 text-center"><h3 className="type-section-title font-bold text-stone-900">{exam?.title}</h3><p className="mt-2 type-body text-stone-500">공개되거나 종료된 시험은 상세 화면에서 응시 및 제출 현황을 확인합니다.</p></div>}</div>
    <div className="flex min-h-16 items-center justify-between border-t border-stone-200 px-5">
      {exam?.status === 'DRAFT' ? <Button className="border-rose-200 text-rose-700 hover:bg-rose-50" disabled={disabled || isSubmitting} onClick={() => void remove()} type="button" variant="secondary"><Trash2 size={14} />삭제</Button> : <span />}
      <div className="flex gap-2">{editable ? <Button disabled={disabled || !isExamDraftValid(draft) || isSubmitting} type="submit"><Save size={14} />{isSubmitting ? '저장 중' : exam ? '변경사항 저장' : '초안 저장'}</Button> : null}{exam?.status === 'DRAFT' ? <Button disabled={disabled || !isExamDraftValid(draft) || isSubmitting} onClick={() => void publish()} type="button"><Send size={14} />시험 공개</Button> : null}</div>
    </div>
  </form>
}

function createInitialDraft(weekNumber?: number): CreateExamInput {
  return { allowRetake: false, description: '', questions: [createQuestion('SHORT')], title: '', weekNumber }
}

function examToDraft(exam: Exam): CreateExamInput {
  return {
    allowRetake: exam.allowRetake,
    description: exam.description,
    questions: exam.questions,
    title: exam.title,
    weekNumber: exam.weekNumber,
  }
}
