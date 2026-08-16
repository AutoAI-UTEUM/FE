import {
  Archive,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createClassroomsRepository,
  rememberClassroomId,
  type Classroom,
  type ClassroomWeek,
} from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import {
  Button,
  EmptyState,
  useToast,
} from '../../../shared/ui'
import { classroomDetailPath, routes } from '../../routes'
import { ClassroomWorkspaceContainer } from '../classroom/ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader } from '../classroom/ClassroomWorkspaceHeader'

export function InstructorClassroomEditPage() {
  usePageTitle('강의실 설정')
  const { classroomId = '' } = useParams()
  const { apiRequest } = useAuth()
  const { show: showToast } = useToast()
  const navigate = useNavigate()
  const repository = useMemo(
    () => createClassroomsRepository(apiRequest),
    [apiRequest],
  )

  useEffect(() => {
    if (classroomId) rememberClassroomId(classroomId)
  }, [classroomId])
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [weeks, setWeeks] = useState<ClassroomWeek[]>([])
  const [weekTitles, setWeekTitles] = useState<Record<number, string>>({})
  const [inviteCode, setInviteCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [weekCount, setWeekCount] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      repository.get(classroomId),
      repository.listWeeks(classroomId),
      repository.getInviteCode(classroomId),
    ])
      .then(([nextClassroom, nextWeeks, nextInviteCode]) => {
        if (cancelled) return
        setClassroom(nextClassroom)
        setWeeks([...nextWeeks].sort((left, right) => left.weekNumber - right.weekNumber))
        setWeekTitles(Object.fromEntries(nextWeeks.map((week) => [week.weekNumber, week.title])))
        const nextWeekCount = Math.max(nextClassroom.weekCount, nextWeeks.length, 1)
        setInviteCode(nextInviteCode)
        setName(nextClassroom.name)
        setDescription(nextClassroom.description ?? '')
        setStartDate(nextClassroom.startDate)
        setWeekCount(nextWeekCount)
      })
      .catch((requestError) => {
        if (!cancelled) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [classroomId, repository])

  const weekByNumber = useMemo(
    () => new Map(weeks.map((week) => [week.weekNumber, week])),
    [weeks],
  )
  const hasInvalidWeekTitle = weeks.some((week) => !(weekTitles[week.weekNumber] ?? '').trim())

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(inviteCode)
      showToast('초대 코드를 복사했습니다.', 'success')
    } catch {
      showToast('초대 코드를 복사하지 못했습니다.', 'danger')
    }
  }

  async function regenerateInviteCode() {
    if (!window.confirm('기존 초대 코드는 더 이상 사용할 수 없습니다. 재발급할까요?')) return
    try {
      const nextInviteCode = await repository.regenerateInviteCode(classroomId)
      setInviteCode(nextInviteCode)
      showToast('새 초대 코드를 발급했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!classroom || !name.trim() || !startDate || hasInvalidWeekTitle || isSaving) return

    setIsSaving(true)
    try {
      const periodChanged = startDate !== classroom.startDate
      const nextEndDate = periodChanged
        ? getEndDate(startDate, weekCount)
        : classroom.endDate
      const classroomChanges = {
        ...(name.trim() !== classroom.name ? { name: name.trim() } : {}),
        ...(description.trim() !== (classroom.description ?? '')
          ? { description: description.trim() || null }
          : {}),
        ...(startDate !== classroom.startDate ? { startDate } : {}),
        ...(nextEndDate !== classroom.endDate ? { endDate: nextEndDate } : {}),
      }
      if (Object.keys(classroomChanges).length > 0) {
        await repository.update(classroomId, classroomChanges)
      }
      const changedWeeks = weeks.filter((week) => {
        const nextTitle = weekTitles[week.weekNumber]?.trim() ?? ''
        return nextTitle && nextTitle !== week.title
      })
      await Promise.all(changedWeeks.map((week) => repository.updateWeek(
        classroomId,
        week.weekNumber,
        { title: weekTitles[week.weekNumber].trim() },
      )))
      showToast('강의실 정보를 저장했습니다.', 'success')
      navigate(classroomDetailPath(classroom.id))
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    } finally {
      setIsSaving(false)
    }
  }

  async function completeClassroom() {
    if (!classroom || classroom.status === 'COMPLETED' || !window.confirm('강의실 운영을 종료할까요? 종료 후에는 새 자료 업로드와 학습자 추가가 불가능하며, 기존 자료와 학습 기록만 확인할 수 있습니다.')) return
    try {
      await repository.complete(classroom.id)
      showToast('강의실 운영을 종료했습니다.', 'success')
      navigate(routes.classrooms)
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  async function deleteClassroomPermanently(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!classroom || deleteConfirmation.trim() !== classroom.name || isDeleting) return
    setIsDeleting(true)
    try {
      await repository.deletePermanently(classroom.id, deleteConfirmation)
      showToast('강의실을 영구 삭제했습니다.', 'success')
      navigate(routes.classrooms, { replace: true })
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
      setIsDeleting(false)
    }
  }

  function closeDeleteDialog() {
    if (isDeleting) return
    setIsDeleteDialogOpen(false)
    setDeleteConfirmation('')
  }

  if (isLoading) {
    return (
      <ClassroomWorkspaceContainer>
        <p className="py-16 text-center type-body text-stone-500" role="status">
          강의실 정보를 불러오는 중입니다.
        </p>
      </ClassroomWorkspaceContainer>
    )
  }

  if (error || !classroom) {
    return (
      <ClassroomWorkspaceContainer>
        <EmptyState
          action={<Button onClick={() => navigate(routes.classrooms)} variant="secondary">내 강의실로 이동</Button>}
          description={error ?? '강의실 정보를 확인할 수 없습니다.'}
          title="강의실을 불러오지 못했습니다"
        />
      </ClassroomWorkspaceContainer>
    )
  }

  return (
    <ClassroomWorkspaceContainer className="xl:h-[calc(100dvh-2.5rem)] xl:min-h-0 xl:overflow-hidden">
      <ClassroomWorkspaceHeader
        actions={<><Button onClick={() => navigate(classroomDetailPath(classroom.id))} variant="secondary">되돌리기</Button><Button disabled={!name.trim() || !startDate || hasInvalidWeekTitle || isSaving} form="classroom-edit-form" type="submit">{isSaving ? '저장 중' : '변경사항 저장'}</Button></>}
        activeTab="settings"
        classroom={classroom}
      />

      <form
        className="flex flex-col gap-3 xl:min-h-0 xl:flex-1 xl:overflow-hidden"
        id="classroom-edit-form"
        onSubmit={save}
      >
        <div className="grid items-stretch gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(360px,1.08fr)_minmax(340px,0.92fr)]">
          <div className="flex min-h-0 flex-col gap-3">
            <BasicInformationSection
              description={description}
              inviteCode={inviteCode}
              name={name}
              onCopyInviteCode={() => void copyInviteCode()}
              onDescriptionChange={setDescription}
              onNameChange={setName}
              onRegenerateInviteCode={() => void regenerateInviteCode()}
              onStartDateChange={setStartDate}
              startDate={startDate}
              weekCount={weekCount}
            />

            <section className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50/30 px-4 py-2.5">
              <h2 className="type-caption font-bold text-rose-700">위험 구역</h2>
              <p className="min-w-0 flex-1 type-micro leading-5 text-stone-500">
                운영 종료는 기록을 보존합니다. 영구 삭제는 강의실 운영 데이터와 시험을 복구할 수 없게 제거합니다.
              </p>
              <Button
                disabled={classroom.status === 'COMPLETED'}
                onClick={() => void completeClassroom()}
                size="sm"
                title={classroom.status === 'COMPLETED' ? '종료된 강의실은 다시 활성화할 수 없습니다.' : undefined}
                variant="secondary"
              >
                <Archive aria-hidden="true" size={13} />강의실 종료
              </Button>
              <Button className="text-rose-700 hover:border-rose-200 hover:bg-rose-50" onClick={() => setIsDeleteDialogOpen(true)} size="sm" variant="secondary">
                <Trash2 aria-hidden="true" size={13} />강의실 삭제
              </Button>
            </section>
          </div>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white">
            <div className="flex min-h-12 items-center border-b border-stone-200 bg-stone-50 px-4">
              <h2 className="type-body font-bold text-stone-950">주차 구성</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {Array.from({ length: weekCount }, (_, index) => index + 1).map((weekNumber) => {
                const week = weekByNumber.get(weekNumber)
                return (
                  <div
                    aria-label={`${weekNumber}주차 항목`}
                    className="grid min-h-11 grid-cols-[52px_minmax(0,1fr)] items-center gap-2 border-b border-stone-100 bg-white px-4 last:border-0"
                    key={weekNumber}
                  >
                    <span className="whitespace-nowrap type-caption text-stone-500">
                      {weekNumber}주차
                    </span>
                    {week ? <input
                      aria-label={`${weekNumber}주차 이름`}
                      className="h-8 min-w-0 rounded-md border border-stone-200 px-2 type-caption font-semibold text-stone-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      maxLength={100}
                      onChange={(event) => setWeekTitles((current) => ({
                        ...current,
                        [weekNumber]: event.target.value,
                      }))}
                      value={weekTitles[weekNumber] ?? week.title}
                    /> : <span className="min-w-0 truncate type-caption text-stone-400">등록 정보 없음</span>}
                  </div>
                )
              })}
            </div>
          </section>

        </div>
      </form>
      {isDeleteDialogOpen ? (
        <div aria-labelledby="delete-classroom-title" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4" role="dialog">
          <form className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-2xl" onSubmit={deleteClassroomPermanently}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="type-dialog-title font-bold text-stone-950" id="delete-classroom-title">강의실 영구 삭제</h2>
                <p className="mt-2 type-caption leading-5 text-stone-500">강의실과 시험 등 소속 데이터가 영구 삭제됩니다. 학생 개인 학습 기록 (자료·세션·진도)은 유지됩니다.</p>
              </div>
              <button aria-label="강의실 삭제 닫기" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700" disabled={isDeleting} onClick={closeDeleteDialog} type="button"><X aria-hidden="true" size={16} /></button>
            </div>
            <label className="mt-5 block type-control font-semibold text-stone-800" htmlFor="classroom-delete-confirmation">
              확인을 위해 <strong>{classroom.name}</strong> 입력
            </label>
            <input autoComplete="off" autoFocus className="mt-1 h-11 w-full rounded-lg border border-stone-300 px-3.5 type-body outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-100" id="classroom-delete-confirmation" onChange={(event) => setDeleteConfirmation(event.target.value)} value={deleteConfirmation} />
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={isDeleting} onClick={closeDeleteDialog} variant="secondary">취소</Button>
              <Button className="bg-rose-700 text-white hover:bg-rose-800 disabled:bg-stone-300" disabled={deleteConfirmation.trim() !== classroom.name || isDeleting} type="submit">{isDeleting ? '삭제 중' : '영구 삭제'}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </ClassroomWorkspaceContainer>
  )
}

function BasicInformationSection({
  description,
  inviteCode,
  name,
  onCopyInviteCode,
  onDescriptionChange,
  onNameChange,
  onRegenerateInviteCode,
  onStartDateChange,
  startDate,
  weekCount,
}: {
  description: string
  inviteCode: string
  name: string
  onCopyInviteCode: () => void
  onDescriptionChange: (value: string) => void
  onNameChange: (value: string) => void
  onRegenerateInviteCode: () => void
  onStartDateChange: (value: string) => void
  startDate: string
  weekCount: number
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="flex min-h-12 items-center border-b border-stone-200 bg-stone-50 px-4">
        <h2 className="type-body font-bold text-stone-950">기본 정보</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <label className="block type-caption font-semibold text-stone-700">
          강의실 이름
          <input
            className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 type-body focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            onChange={(event) => onNameChange(event.target.value)}
            value={name}
          />
        </label>
        <label className="block type-caption font-semibold text-stone-700">
          설명
          <textarea
            className="mt-1 min-h-28 w-full resize-none rounded-lg border border-stone-300 p-3 type-caption font-normal leading-5 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="학습자에게 보이는 강의실 소개"
            value={description}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="type-caption font-semibold text-stone-700">
            수업 시작일
            <input
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-2 type-caption text-stone-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              onChange={(event) => onStartDateChange(event.target.value)}
              type="date"
              value={startDate}
            />
          </label>
          <div className="type-caption font-semibold text-stone-700">
            수업 종료일
            <output className="mt-1 flex h-10 items-center rounded-lg border border-stone-200 bg-stone-100 px-2 type-caption font-normal text-stone-500">
              {getEndDate(startDate, weekCount)}
            </output>
          </div>
        </div>
        <p className="type-micro leading-5 text-stone-400">시작일을 변경하면 종료일은 주차 수에 따라 다시 계산됩니다.</p>
        <div>
          <p className="type-caption font-semibold text-stone-700">강의실 코드</p>
          <div className="mt-1 flex min-h-11 items-center gap-2 rounded-lg bg-stone-50 px-3">
            <strong className="min-w-0 flex-1 truncate font-mono type-body tracking-wider text-stone-900">{inviteCode}</strong>
            <button className="h-8 rounded-md border border-stone-200 bg-white px-2.5 type-micro font-semibold text-brand-700" onClick={onCopyInviteCode} type="button">복사</button>
            <button className="h-8 rounded-md border border-stone-200 bg-white px-2.5 type-micro font-semibold text-stone-600" onClick={onRegenerateInviteCode} type="button">재발급</button>
          </div>
        </div>
      </div>
    </section>
  )
}

function getEndDate(startDate: string, weekCount: number): string {
  const date = new Date(`${startDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + weekCount * 7 - 1)
  return date.toISOString().slice(0, 10)
}
