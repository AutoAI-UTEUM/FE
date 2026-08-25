import { ArrowLeft, Pencil, Save, Send, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { ClassroomNotice, ClassroomNoticeInput } from '../../../features/classrooms'
import { ExamEditor } from '../../../features/exams/ExamEditor'
import { createQuestion, isExamDraftValid } from '../../../features/exams/examEditorModel'
import type { CreateExamInput, Exam, ExamsRepository } from '../../../features/exams/examsRepository'
import { getRequestErrorMessage } from '../../../shared/api'
import { formatDateTime } from '../../../shared/lib/format'
import { Badge, Button, MarkdownContent, MarkdownEditor, useToast } from '../../../shared/ui'

export function NoticeDetailPanel({
  canEdit,
  notice,
  onClose,
  onEdit,
}: {
  canEdit: boolean
  notice: ClassroomNotice
  onClose: () => void
  onEdit: () => void
}) {
  const statusDate = notice.published
    ? notice.publishedAt
    : notice.publishAt

  return (
    <article className="flex min-h-[520px] flex-col rounded-lg border border-stone-200 bg-white">
      <div className="flex min-h-14 items-center gap-3 border-b border-stone-200 px-5">
        <button
          aria-label="목록으로 돌아가기"
          className="flex size-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-section-title font-bold text-stone-950">공지</h2>
            <Badge tone={notice.published ? 'success' : 'warning'}>
              {notice.published ? '게시됨' : '예약'}
            </Badge>
          </div>
          <p className="type-caption text-stone-500">
            {notice.weekNumber === null ? '전체 공지' : `${notice.weekNumber}주차 공지`}
          </p>
        </div>
        {canEdit ? (
          <Button onClick={onEdit} size="sm" variant="secondary">
            <Pencil size={14} />
            편집하기
          </Button>
        ) : null}
      </div>

      <div className="flex-1 px-5 py-6 sm:px-7">
        <div className="border-b border-stone-100 pb-5">
          <h1 className="type-page-title font-bold text-stone-950">{notice.title}</h1>
          {statusDate ? (
            <p className="mt-2 type-caption text-stone-400">
              {notice.published ? '게시' : '예약'} {formatDateTime(statusDate)}
            </p>
          ) : null}
        </div>
        <MarkdownContent className="pt-6 text-stone-800" content={notice.content} />
      </div>
    </article>
  )
}

export function NoticeContentPanel({
  disabled,
  notice,
  onClose,
  onDelete,
  onSave,
  weekNumber,
}: {
  disabled: boolean
  notice: ClassroomNotice | null
  onClose: () => void
  onDelete?: (notice: ClassroomNotice) => Promise<void>
  onSave: (input: ClassroomNoticeInput, noticeId?: string) => Promise<void>
  weekNumber: number | null
}) {
  const [title, setTitle] = useState(notice?.title ?? '')
  const [content, setContent] = useState(notice?.content ?? '')
  const [isScheduled, setIsScheduled] = useState(Boolean(notice && !notice.published && notice.publishAt))
  const [publishAt, setPublishAt] = useState(toDateTimeLocal(notice?.publishAt))
  const [minimumPublishAt] = useState(() => toDateTimeLocal(new Date().toISOString()))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const selectedWeek = notice ? notice.weekNumber : weekNumber
  const scheduledAt = publishAt ? new Date(publishAt) : null
  const hasValidSchedule = !isScheduled || Boolean(scheduledAt && !Number.isNaN(scheduledAt.getTime()) && publishAt > minimumPublishAt)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !content.trim() || isSubmitting || disabled || !hasValidSchedule) return
    setIsSubmitting(true)
    try {
      const input: ClassroomNoticeInput = {
        content: content.trim(),
        publishAt: isScheduled && scheduledAt ? scheduledAt.toISOString() : null,
        title: title.trim(),
        weekNumber: selectedWeek,
      }
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
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="type-section-title font-bold text-stone-950">{notice ? '공지 편집' : '공지 작성'}</h2>{notice ? <Badge tone={notice.published ? 'success' : 'warning'}>{notice.published ? '게시됨' : '예약'}</Badge> : null}</div><p className="type-caption text-stone-500">{selectedWeek === null ? '전체 공지' : `${selectedWeek}주차 공지`}</p></div>
    </div>
    <div className="flex flex-1 flex-col gap-4 p-5">
      <label className="type-control font-semibold text-stone-700">공지 제목<input autoFocus={!notice} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 px-3.5 type-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50" disabled={disabled} maxLength={200} onChange={(event) => setTitle(event.target.value)} value={title} /></label>
      <div className="flex min-h-0 flex-1 flex-col type-control font-semibold text-stone-700">
        <span>본문</span>
        <MarkdownEditor ariaLabel="본문" className="mt-1.5" disabled={disabled} maxLength={5000} onChange={setContent} value={content} />
      </div>
      <fieldset>
        <legend className="type-control font-semibold text-stone-700">게시 방식</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <button aria-pressed={!isScheduled} className={`h-10 rounded-lg border type-control font-semibold ${!isScheduled ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`} disabled={disabled} onClick={() => setIsScheduled(false)} type="button">즉시 게시</button>
          <button aria-pressed={isScheduled} className={`h-10 rounded-lg border type-control font-semibold ${isScheduled ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`} disabled={disabled} onClick={() => setIsScheduled(true)} type="button">예약 게시</button>
        </div>
        {isScheduled ? <label className="mt-3 block type-control font-semibold text-stone-700">예약 공개 시각<input className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 px-3.5 type-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50" disabled={disabled} min={minimumPublishAt} onChange={(event) => setPublishAt(event.target.value)} type="datetime-local" value={publishAt} /></label> : null}
        {isScheduled && !hasValidSchedule ? <p className="mt-1.5 type-caption font-medium text-rose-700" role="alert">현재보다 이후의 예약 시각을 선택하세요.</p> : null}
      </fieldset>
    </div>
    <div className="flex min-h-16 items-center justify-between px-5">
      {notice && onDelete ? <Button className="border-rose-200 text-rose-700 hover:bg-rose-50" disabled={disabled || isDeleting} onClick={() => void remove()} type="button" variant="secondary"><Trash2 size={14} />{isDeleting ? '삭제 중' : '삭제'}</Button> : <span />}
      <Button disabled={disabled || !hasValidSchedule || !title.trim() || !content.trim() || isSubmitting} type="submit"><Save size={14} />{isSubmitting ? '저장 중' : notice ? '변경사항 저장' : isScheduled ? '예약 등록' : '공지 게시'}</Button>
    </div>
  </form>
}

function toDateTimeLocal(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
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

  return <form className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white" onSubmit={save}>
    <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-stone-200 px-5">
      <button aria-label="목록으로 돌아가기" className="flex size-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100" onClick={onClose} type="button"><ArrowLeft size={16} /></button>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="type-section-title font-bold text-stone-950">{exam ? '시험 관리' : '시험 만들기'}</h2>{exam ? <Badge tone={exam.status === 'DRAFT' ? 'neutral' : exam.status === 'PUBLISHED' ? 'success' : 'warning'}>{exam.status === 'DRAFT' ? '초안' : exam.status === 'PUBLISHED' ? '공개' : '종료'}</Badge> : null}</div>{exam && draft.weekNumber ? <p className="type-caption text-stone-500">{draft.weekNumber}주차 시험</p> : null}</div>
    </div>
    <div aria-label="시험 편집 영역" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [scrollbar-gutter:stable]" role="region" tabIndex={0}>{editable ? <ExamEditor onChange={setDraft} value={draft} /> : <div className="py-16 text-center"><h3 className="type-section-title font-bold text-stone-900">{exam?.title}</h3><p className="mt-2 type-body text-stone-500">공개되거나 종료된 시험은 상세 화면에서 응시 및 제출 현황을 확인합니다.</p></div>}</div>
    <div className="flex min-h-16 shrink-0 items-center justify-between border-t border-stone-200 px-5">
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
