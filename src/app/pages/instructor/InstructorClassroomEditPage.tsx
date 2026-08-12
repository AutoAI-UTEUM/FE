import {
  Archive,
  GripVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react'
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
  const [weekOrder, setWeekOrder] = useState<number[]>([])
  const [draggedWeek, setDraggedWeek] = useState<number | null>(null)
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
        setWeeks(nextWeeks)
        setWeekTitles(
          Object.fromEntries(
            nextWeeks.map((week) => [week.weekNumber, week.title]),
          ),
        )
        const nextWeekCount = Math.max(nextClassroom.weekCount, nextWeeks.length, 1)
        const existingOrder = [...nextWeeks]
          .sort((left, right) => left.displayOrder - right.displayOrder)
          .map((week) => week.weekNumber)
        const missingWeeks = Array.from({ length: nextWeekCount }, (_, index) => index + 1)
          .filter((weekNumber) => !existingOrder.includes(weekNumber))
        setWeekOrder([...existingOrder, ...missingWeeks])
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
  function addWeek() {
    if (weekCount >= 52) return
    const nextWeekNumber = Math.max(0, ...weekOrder) + 1
    setWeekCount((value) => value + 1)
    setWeekOrder((current) => [...current, nextWeekNumber])
  }

  function moveWeekTo(sourceWeekNumber: number, targetWeekNumber: number) {
    if (sourceWeekNumber === targetWeekNumber) return
    setWeekOrder((current) => {
      const sourceIndex = current.indexOf(sourceWeekNumber)
      const targetIndex = current.indexOf(targetWeekNumber)
      if (sourceIndex < 0 || targetIndex < 0) return current
      const next = [...current]
      const [movedWeek] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, movedWeek)
      return next
    })
  }

  function startWeekDrag(event: DragEvent<HTMLButtonElement>, weekNumber: number) {
    setDraggedWeek(weekNumber)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(weekNumber))
  }

  function enterWeekDropTarget(event: DragEvent<HTMLDivElement>, weekNumber: number) {
    if (draggedWeek === null || draggedWeek === weekNumber) return
    event.preventDefault()
    moveWeekTo(draggedWeek, weekNumber)
  }

  async function deleteWeek(weekNumber: number) {
    const week = weekByNumber.get(weekNumber)
    if (week?.materials.length) {
      showToast('자료가 등록된 주차는 삭제할 수 없습니다.', 'danger')
      return
    }
    if (!window.confirm(`${weekNumber}주차를 삭제할까요?`)) return

    if (!week) {
      setWeekOrder((current) => current.filter((item) => item !== weekNumber))
      setWeekCount((value) => Math.max(1, value - 1))
      return
    }

    try {
      await repository.deleteWeek(classroomId, weekNumber)
      const nextWeeks = await repository.listWeeks(classroomId)
      const nextWeekCount = Math.max(nextWeeks.length, 1)
      setWeeks(nextWeeks)
      setWeekCount(nextWeekCount)
      setWeekOrder(Array.from({ length: nextWeekCount }, (_, index) => index + 1))
      setWeekTitles(Object.fromEntries(nextWeeks.map((item) => [item.weekNumber, item.title])))
      showToast('주차를 삭제했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

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
    if (!classroom || !name.trim() || !startDate || isSaving) return

    const removedWeeks = weeks.filter((week) => week.weekNumber > weekCount)
    if (removedWeeks.some((week) => week.materials.length > 0)) {
      showToast('자료가 등록된 주차는 삭제할 수 없습니다. 자료를 먼저 정리해 주세요.', 'danger')
      return
    }

    setIsSaving(true)
    try {
      const periodChanged = startDate !== classroom.startDate || weekCount !== classroom.weekCount
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
      const isRangeExpanding = new Date(`${nextEndDate}T00:00:00Z`) > new Date(`${classroom.endDate}T00:00:00Z`)
      // The server validates new weeks against the current classroom date range.
      if (isRangeExpanding && Object.keys(classroomChanges).length > 0) {
        await repository.update(classroomId, classroomChanges)
      }

      for (let weekNumber = 1; weekNumber <= weekCount; weekNumber += 1) {
        const existingWeek = weekByNumber.get(weekNumber)
        const nextTitle = weekTitles[weekNumber]?.trim() || `${weekNumber}주차`
        if (!existingWeek) {
          await repository.createWeek(classroomId, {
            title: nextTitle,
            weekNumber,
          })
        } else if (existingWeek.title !== nextTitle) {
          await repository.updateWeek(classroomId, weekNumber, {
            title: nextTitle,
          })
        }
      }

      for (const week of [...removedWeeks].sort((a, b) => b.weekNumber - a.weekNumber)) {
        await repository.deleteWeek(classroomId, week.weekNumber)
      }

      if (!isRangeExpanding && Object.keys(classroomChanges).length > 0) {
        await repository.update(classroomId, classroomChanges)
      }

      const savedWeeks = await repository.listWeeks(classroomId)
      const savedWeekByNumber = new Map(savedWeeks.map((week) => [week.weekNumber, week]))
      const orderedWeekIds = weekOrder
        .map((weekNumber) => savedWeekByNumber.get(weekNumber)?.id)
        .filter((weekId): weekId is string => Boolean(weekId))
      const currentWeekIds = [...savedWeeks]
        .sort((left, right) => left.displayOrder - right.displayOrder)
        .map((week) => week.id)
      const savedOrderChanged = orderedWeekIds.some((weekId, index) => weekId !== currentWeekIds[index])
      if (orderedWeekIds.length === savedWeeks.length && orderedWeekIds.length > 0 && savedOrderChanged) {
        await repository.reorderWeeks(classroomId, orderedWeekIds)
      }
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
        actions={<><Button onClick={() => navigate(classroomDetailPath(classroom.id))} variant="secondary">되돌리기</Button><Button disabled={!name.trim() || !startDate || isSaving} form="classroom-edit-form" type="submit">{isSaving ? '저장 중' : '변경사항 저장'}</Button></>}
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
                운영 종료는 기록을 보존합니다. 영구 삭제는 강의실 운영 데이터와 리포트·시험을 복구할 수 없게 제거합니다.
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
              {weekOrder.map((weekNumber, index) => {
                const displayWeekNumber = index + 1
                const week = weekByNumber.get(weekNumber)
                return (
                  <div
                    aria-label={`${displayWeekNumber}주차 항목`}
                    className={`grid min-h-11 grid-cols-[22px_42px_minmax(0,1fr)_32px] items-center gap-1.5 border-b border-stone-100 px-2.5 transition-colors last:border-0 ${draggedWeek === weekNumber ? 'bg-brand-50/70 opacity-60' : 'bg-white'}`}
                    key={weekNumber}
                    onDragEnter={(event) => enterWeekDropTarget(event, weekNumber)}
                    onDragOver={(event) => { if (draggedWeek !== null) event.preventDefault() }}
                    onDrop={(event) => { event.preventDefault(); setDraggedWeek(null) }}
                  >
                    <div>
                      <button
                        aria-label={`${displayWeekNumber}주차 순서 이동`}
                        className="flex size-6 cursor-grab items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 active:cursor-grabbing"
                        draggable
                        onDragEnd={() => setDraggedWeek(null)}
                        onDragStart={(event) => startWeekDrag(event, weekNumber)}
                        title="잡아서 원하는 주차 위치로 이동"
                        type="button"
                      >
                        <GripVertical aria-hidden="true" size={14} />
                      </button>
                    </div>
                    <span className="type-caption text-stone-500">{displayWeekNumber}주차</span>
                    <input
                      aria-label={`${displayWeekNumber}주차 이름`}
                      className="h-8 min-w-0 rounded-md border border-transparent px-2 type-caption font-semibold text-stone-800 hover:border-stone-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      onChange={(event) => setWeekTitles((current) => ({
                        ...current,
                        [weekNumber]: event.target.value,
                      }))}
                      placeholder="주차 이름 (선택)"
                      value={weekTitles[weekNumber] ?? week?.title ?? ''}
                    />
                    <button
                      aria-label={`${displayWeekNumber}주차 삭제`}
                      className="flex size-7 items-center justify-center rounded-md text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => void deleteWeek(weekNumber)}
                      title="주차 삭제"
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={13} />
                    </button>
                  </div>
                )
              })}
              <button
                aria-label="주차 추가"
                className="flex min-h-11 w-full items-center justify-center gap-1.5 border-t border-stone-100 bg-stone-50 type-caption font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-stone-50"
                disabled={weekCount >= 52}
                onClick={addWeek}
                type="button"
              >
                <Plus aria-hidden="true" size={14} />
                주차 추가
              </button>
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
                <p className="mt-2 type-caption leading-5 text-stone-500">강의실과 시험·리포트 등 소속 데이터가 영구 삭제됩니다. 학생 개인 학습 기록 (자료·세션·진도)은 유지됩니다.</p>
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
