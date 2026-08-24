import { Plus, Save, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createClassroomsRepository,
  rememberClassroomId,
  type Classroom,
  type ClassroomNotice,
  type ClassroomNoticeInput,
  type ClassroomWeek,
} from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { Button, EmptyState, MarkdownEditor, useToast } from '../../../shared/ui'
import { ClassroomWorkspaceContainer } from '../classroom/ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader } from '../classroom/ClassroomWorkspaceHeader'

interface NoticeGroup {
  label: string
  notices: ClassroomNotice[]
  weekNumber: number | null
}

export function InstructorNoticesPage() {
  usePageTitle('강의실 공지')
  const { classroomId = '' } = useParams()
  const { apiRequest } = useAuth()
  const { show: showToast } = useToast()
  const repository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [weeks, setWeeks] = useState<ClassroomWeek[]>([])
  const [notices, setNotices] = useState<ClassroomNotice[]>([])
  const [selectedNoticeId, setSelectedNoticeId] = useState<string | null>(null)
  const [newDraftVersion, setNewDraftVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [nextClassroom, nextWeeks, nextNotices] = await Promise.all([
        repository.get(classroomId),
        repository.listWeeks(classroomId),
        repository.listNotices(classroomId),
      ])
      setClassroom(nextClassroom)
      setWeeks(nextWeeks)
      setNotices(nextNotices)
      setSelectedNoticeId((current) => (
        current && nextNotices.some((notice) => notice.id === current)
          ? current
          : nextNotices[0]?.id ?? null
      ))
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [classroomId, repository])

  useEffect(() => {
    if (classroomId) rememberClassroomId(classroomId)
    const loadTimer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [classroomId, load])

  const selectedNotice = notices.find((notice) => notice.id === selectedNoticeId) ?? null
  const noticeGroups = useMemo(
    () => groupNoticesByWeek(notices),
    [notices],
  )

  function startNewNotice() {
    setSelectedNoticeId(null)
    setNewDraftVersion((version) => version + 1)
  }

  async function saveNotice(input: ClassroomNoticeInput) {
    try {
      if (selectedNotice) {
        const updated = await repository.updateNotice(classroomId, selectedNotice.id, input)
        setNotices((items) => items.map((item) => item.id === updated.id ? updated : item))
        showToast('공지를 수정했습니다.', 'success')
        return
      }

      const created = await repository.createNotice(classroomId, input)
      setNotices((items) => [created, ...items])
      setSelectedNoticeId(created.id)
      showToast('공지를 등록했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
      throw requestError
    }
  }

  async function removeNotice(notice: ClassroomNotice) {
    if (removingId || !window.confirm(`'${notice.title}' 공지를 삭제할까요? 학습자 화면에서 사라집니다.`)) return
    setRemovingId(notice.id)
    try {
      await repository.deleteNotice(classroomId, notice.id)
      const remainingNotices = notices.filter((item) => item.id !== notice.id)
      setNotices(remainingNotices)
      setSelectedNoticeId(remainingNotices[0]?.id ?? null)
      showToast('공지를 삭제했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    } finally {
      setRemovingId(null)
    }
  }

  if (isLoading) return <ClassroomWorkspaceContainer><p className="py-16 text-center type-body text-stone-500" role="status">공지를 불러오는 중입니다.</p></ClassroomWorkspaceContainer>
  if (error || !classroom) return <ClassroomWorkspaceContainer><EmptyState action={<Button onClick={() => void load()} variant="secondary">다시 시도</Button>} description={error ?? '강의실 정보를 확인할 수 없습니다.'} title="공지를 불러오지 못했습니다" /></ClassroomWorkspaceContainer>

  const isReadOnly = classroom.status === 'COMPLETED'

  return (
    <ClassroomWorkspaceContainer>
      <ClassroomWorkspaceHeader activeTab="course" classroom={classroom} />

      <section aria-label="공지 관리" className="grid min-h-[540px] overflow-hidden rounded-lg border border-stone-200 bg-white lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-stone-200 bg-stone-50/60 lg:border-r lg:border-b-0">
          <div className="flex min-h-12 items-center justify-between border-b border-stone-200 px-4">
            <h2 className="type-body font-bold text-stone-900">공지 목록</h2>
            <button aria-label="새 공지" className="flex size-8 items-center justify-center rounded-md text-stone-500 hover:bg-white hover:text-brand-700 disabled:cursor-not-allowed disabled:text-stone-300 dark:hover:bg-stone-100" disabled={isReadOnly} onClick={startNewNotice} title="새 공지" type="button"><Plus aria-hidden="true" size={16} /></button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {noticeGroups.length === 0 ? <p className="px-4 py-10 text-center type-control text-stone-400">등록된 공지가 없습니다.</p> : noticeGroups.map((group) => (
              <section aria-labelledby={`notice-group-${group.weekNumber ?? 'other'}`} className="mb-3 last:mb-0" key={group.label}>
                <h3 className="px-4 py-1.5 type-caption font-bold text-stone-400" id={`notice-group-${group.weekNumber ?? 'other'}`}>{group.label}</h3>
                <div className="space-y-1 px-2">
                  {group.notices.map((notice) => (
                    <button aria-pressed={selectedNoticeId === notice.id} className={`w-full rounded-md px-3 py-2.5 text-left ${selectedNoticeId === notice.id ? 'bg-white shadow-sm ring-1 ring-stone-200 dark:bg-stone-100' : 'hover:bg-white/80 dark:hover:bg-stone-100'}`} key={notice.id} onClick={() => setSelectedNoticeId(notice.id)} type="button">
                      <strong className="block truncate type-control text-stone-900">{notice.title}</strong>
                      <span className="mt-1 flex items-center gap-1.5 type-caption text-stone-400">
                        <span className={notice.published ? 'text-emerald-700' : 'text-amber-700'}>{notice.published ? '게시됨' : '예약'}</span>
                        <span aria-hidden="true">·</span>
                        <time dateTime={notice.published ? notice.publishedAt : notice.publishAt ?? notice.publishedAt}>{formatNoticeStatusDate(notice)}</time>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>

        <NoticeEditor
          disabled={isReadOnly}
          key={selectedNotice ? selectedNotice.id : `new-${newDraftVersion}`}
          notice={selectedNotice}
          onDelete={selectedNotice ? () => removeNotice(selectedNotice) : undefined}
          onSubmit={saveNotice}
          removing={removingId === selectedNotice?.id}
          weeks={weeks}
        />
      </section>
    </ClassroomWorkspaceContainer>
  )
}

function NoticeEditor({
  disabled,
  notice,
  onDelete,
  onSubmit,
  removing,
  weeks,
}: {
  disabled: boolean
  notice: ClassroomNotice | null
  onDelete?: () => Promise<void>
  onSubmit: (input: ClassroomNoticeInput) => Promise<void>
  removing: boolean
  weeks: ClassroomWeek[]
}) {
  const [title, setTitle] = useState(notice?.title ?? '')
  const [content, setContent] = useState(notice?.content ?? '')
  const [weekNumber, setWeekNumber] = useState<number | null>(notice?.weekNumber ?? null)
  const [publishMode, setPublishMode] = useState<'IMMEDIATE' | 'TIMED'>(notice?.publishAt ? 'TIMED' : 'IMMEDIATE')
  const [publishAt, setPublishAt] = useState(toDateTimeLocal(notice?.publishAt))
  const [isSubmitting, setIsSubmitting] = useState(false)

  const hasValidPublishAt = publishMode === 'IMMEDIATE' || Boolean(publishAt)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !content.trim() || !hasValidPublishAt || isSubmitting || disabled) return
    setIsSubmitting(true)
    try {
      await onSubmit({
        content: content.trim(),
        publishAt: publishMode === 'IMMEDIATE' ? null : new Date(publishAt).toISOString(),
        title: title.trim(),
        weekNumber,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="flex min-h-[440px] min-w-0 flex-col" onSubmit={submit}>
      <div className="flex min-h-12 items-center justify-between border-b border-stone-200 px-5">
        <h2 className="type-body font-bold text-stone-900">{notice ? '공지 편집' : '공지 작성'}</h2>
        {notice ? (
          <span className={`rounded-full px-2 py-1 type-caption font-semibold ${notice.published ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {notice.published ? '게시됨' : `${formatNoticeStatusDate(notice)} 예약`}
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
        <label className="block type-control font-semibold text-stone-700">공지 제목<input autoFocus={!notice} className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 px-3.5 type-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50" disabled={disabled} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="공지 제목을 입력하세요" value={title} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block type-control font-semibold text-stone-700">
            공지 범위
            <select className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3.5 type-body font-normal text-stone-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50" disabled={disabled} onChange={(event) => setWeekNumber(event.target.value ? Number(event.target.value) : null)} value={weekNumber ?? ''}>
              <option value="">전체 공지</option>
              {weeks.map((week) => <option key={week.id} value={week.weekNumber}>{week.weekNumber}주차 · {week.title}</option>)}
            </select>
          </label>
          <fieldset className="type-control text-stone-700" disabled={disabled}>
            <legend className="font-semibold">게시 방식</legend>
            <div className="mt-1.5 grid h-11 grid-cols-2 overflow-hidden rounded-lg border border-stone-300 bg-white p-1">
              <label className={`flex cursor-pointer items-center justify-center rounded-md type-body font-semibold ${publishMode === 'IMMEDIATE' ? 'bg-brand-50 text-brand-800' : 'text-stone-500'}`}>
                <input checked={publishMode === 'IMMEDIATE'} className="sr-only" name="notice-publish-mode" onChange={() => setPublishMode('IMMEDIATE')} type="radio" />즉시 게시
              </label>
              <label className={`flex cursor-pointer items-center justify-center rounded-md type-body font-semibold ${publishMode === 'TIMED' ? 'bg-brand-50 text-brand-800' : 'text-stone-500'}`}>
                <input checked={publishMode === 'TIMED'} className="sr-only" name="notice-publish-mode" onChange={() => setPublishMode('TIMED')} type="radio" />예약 게시
              </label>
            </div>
          </fieldset>
        </div>
        {publishMode === 'TIMED' ? (
          <label className="block type-control font-semibold text-stone-700">
            게시 시각
            <input aria-label="게시 시각" className="mt-1.5 h-11 w-full rounded-lg border border-stone-300 bg-white px-3.5 type-body font-normal text-stone-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50" disabled={disabled} onChange={(event) => setPublishAt(event.target.value)} type="datetime-local" value={publishAt} />
            <span className="mt-1.5 block type-caption font-normal text-stone-500">미래 시각은 예약 게시되며, 해당 시각이 지나면 자동으로 게시 상태가 됩니다.</span>
          </label>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col type-control font-semibold text-stone-700">
          <span>본문</span>
          <MarkdownEditor ariaLabel="본문" className="mt-1.5" disabled={disabled} maxLength={5000} onChange={setContent} placeholder="공지 내용을 입력하세요" value={content} />
        </div>
      </div>
      <div className="flex min-h-16 items-center justify-between px-5">
        {onDelete ? <Button className="border-rose-200 text-rose-700 hover:bg-rose-50" disabled={disabled || removing} onClick={() => void onDelete()} type="button" variant="secondary"><Trash2 aria-hidden="true" size={14} />{removing ? '삭제 중' : '공지 삭제'}</Button> : <span />}
        <Button disabled={disabled || !title.trim() || !content.trim() || !hasValidPublishAt || isSubmitting} type="submit"><Save aria-hidden="true" size={14} />{isSubmitting ? '저장 중' : notice ? '변경사항 저장' : publishMode === 'TIMED' ? '예약하기' : '공지 게시'}</Button>
      </div>
    </form>
  )
}

function groupNoticesByWeek(notices: ClassroomNotice[]): NoticeGroup[] {
  const grouped = new Map<number | null, ClassroomNotice[]>()

  notices.forEach((notice) => {
    const weekNumber = notice.weekNumber
    grouped.set(weekNumber, [...(grouped.get(weekNumber) ?? []), notice])
  })

  return [...grouped.entries()]
    .sort(([left], [right]) => (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER))
    .map(([weekNumber, groupedNotices]) => ({
      label: weekNumber === null ? '전체 공지' : `${weekNumber}주차`,
      notices: groupedNotices,
      weekNumber,
    }))
}

function formatNoticeStatusDate(notice: ClassroomNotice): string {
  return formatNoticeDateTime(notice.published ? notice.publishedAt : notice.publishAt ?? notice.publishedAt)
}

function formatNoticeDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'long',
  }).format(date)
}

function toDateTimeLocal(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
