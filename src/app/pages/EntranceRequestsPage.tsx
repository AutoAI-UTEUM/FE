import { Inbox, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useAuth } from '../../features/auth'
import {
  createClassroomsRepository,
  JOIN_REQUESTS_CHANGED_EVENT,
  type Classroom,
  type ClassroomStudent,
  type JoinRequest,
} from '../../features/classrooms'
import { getRequestErrorMessage } from '../../shared/api'
import { cx } from '../../shared/lib/cx'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Button, EmptyState, PageContainer, PageHeader, useToast } from '../../shared/ui'

type RequestTab = 'pending' | 'processed' | 'students'
type ClassroomStudentRow = ClassroomStudent & { classroomId: string; classroomName: string }

export function EntranceRequestsPage() {
  usePageTitle('입장 요청')
  const { apiRequest } = useAuth()
  const { show: showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const repository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState<RequestTab>(
    requestedTab === 'students' || requestedTab === 'processed' ? requestedTab : 'pending',
  )
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [hasLoadedClassrooms, setHasLoadedClassrooms] = useState(false)
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [students, setStudents] = useState<ClassroomStudentRow[]>([])
  const [selectedRequestKeys, setSelectedRequestKeys] = useState<Set<string>>(new Set())
  const [processingRequestKeys, setProcessingRequestKeys] = useState<Set<string>>(new Set())
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const [classroomReloadKey, setClassroomReloadKey] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    repository.list('', controller.signal)
      .then((items) => {
        setClassrooms(items)
        setError(null)
        setHasLoadedClassrooms(true)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(getRequestErrorMessage(requestError))
          setIsLoading(false)
        }
      })
    return () => controller.abort()
  }, [classroomReloadKey, repository])

  useEffect(() => {
    if (!hasLoadedClassrooms) return
    const controller = new AbortController()

    const load = async () => {
      if (tab === 'students') {
        const classroomStudents = await Promise.all(classrooms.map(async (classroom) => {
          const items = await repository.listStudents(classroom.id, {}, controller.signal)
          return items.map((student) => ({
            ...student,
            classroomId: classroom.id,
            classroomName: classroom.name,
          }))
        }))
        setStudents(classroomStudents.flat().sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)))
        setRequests([])
        return
      }

      const statuses = tab === 'pending' ? ['PENDING'] as const : ['APPROVED', 'REJECTED'] as const
      const classroomRequests = await Promise.all(classrooms.map(async (classroom) => {
        const items = await Promise.all(statuses.map((status) => (
          repository.listJoinRequests(classroom.id, status, controller.signal)
        )))
        return items.flat().map((request) => ({
          ...request,
          classroomId: classroom.id,
          classroomName: classroom.name,
        }))
      }))
      setRequests(classroomRequests.flat().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)))
      setStudents([])
    }

    void load()
      .then(() => setError(null))
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [classrooms, hasLoadedClassrooms, reloadKey, repository, tab])

  function selectTab(nextTab: RequestTab) {
    setIsLoading(true)
    setSelectedRequestKeys(new Set())
    setTab(nextTab)
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tab', nextTab)
      next.delete('classroomId')
      return next
    }, { replace: true })
  }

  function requestKey(request: JoinRequest) {
    return `${request.classroomId ?? 'unknown'}:${request.requestId}`
  }

  function toggleRequest(request: JoinRequest) {
    const key = requestKey(request)
    setSelectedRequestKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAllRequests() {
    if (selectedRequestKeys.size === requests.length) {
      setSelectedRequestKeys(new Set())
      return
    }
    setSelectedRequestKeys(new Set(requests.map(requestKey)))
  }

  async function process(request: JoinRequest, decision: 'approve' | 'reject') {
    const classroomId = request.classroomId
    if (!classroomId) return
    const classroom = classrooms.find((item) => item.id === classroomId)
    if (decision === 'approve' && classroom?.status === 'COMPLETED') {
      showToast('종료된 강의실에는 학습자를 추가할 수 없습니다.', 'danger')
      return
    }
    const key = requestKey(request)
    setProcessingRequestKeys((current) => new Set(current).add(key))
    try {
      await repository.processJoinRequest(classroomId, request.requestId, decision)
      window.dispatchEvent(new Event(JOIN_REQUESTS_CHANGED_EVENT))
      showToast(decision === 'approve' ? '입장 요청을 승인했습니다.' : '입장 요청을 거절했습니다.', 'success')
      setIsLoading(true)
      setSelectedRequestKeys(new Set())
      setReloadKey((value) => value + 1)
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    } finally {
      setProcessingRequestKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }

  async function processSelected(decision: 'approve' | 'reject') {
    const selected = requests.filter((request) => selectedRequestKeys.has(requestKey(request)))
    if (selected.length === 0 || isBatchProcessing) return
    setIsBatchProcessing(true)
    let completed = 0
    let skipped = 0
    let failed = 0
    for (const request of selected) {
      const classroom = classrooms.find((item) => item.id === request.classroomId)
      if (decision === 'approve' && classroom?.status === 'COMPLETED') {
        skipped += 1
        continue
      }
      if (!request.classroomId) {
        failed += 1
        continue
      }
      try {
        await repository.processJoinRequest(request.classroomId, request.requestId, decision)
        completed += 1
      } catch {
        failed += 1
      }
    }
    if (completed > 0) {
      window.dispatchEvent(new Event(JOIN_REQUESTS_CHANGED_EVENT))
      showToast(`${completed}건을 ${decision === 'approve' ? '승인' : '거절'}했습니다.`, 'success')
    }
    if (skipped > 0 || failed > 0) {
      showToast(`처리하지 못한 요청이 ${skipped + failed}건 있습니다.`, 'danger')
    }
    setIsBatchProcessing(false)
    setIsLoading(true)
    setSelectedRequestKeys(new Set())
    setReloadKey((value) => value + 1)
  }

  function retry() {
    setIsLoading(true)
    setError(null)
    if (hasLoadedClassrooms) setReloadKey((value) => value + 1)
    else setClassroomReloadKey((value) => value + 1)
  }

  async function removeStudent(student: ClassroomStudentRow) {
    if (!window.confirm(`${student.name} 학습자를 ${student.classroomName} 강의실에서 제외할까요?`)) return
    try {
      await repository.removeStudent(student.classroomId, student.id)
      setStudents((current) => current.filter((item) => (
        item.id !== student.id || item.classroomId !== student.classroomId
      )))
      showToast('학습자를 강의실에서 제외했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  const emptyTitle = tab === 'pending'
    ? '대기 중인 입장 요청이 없습니다'
    : tab === 'students'
      ? '승인된 학습자가 없습니다'
      : '처리한 입장 요청이 없습니다'
  const itemCount = tab === 'students' ? students.length : requests.length
  const allRequestsSelected = requests.length > 0 && selectedRequestKeys.size === requests.length

  return <PageContainer>
    <PageHeader title="입장 요청" />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div aria-label="입장 요청 상태" className="inline-flex w-fit rounded-lg border border-stone-200 bg-white p-1" role="tablist">
        <TabButton active={tab === 'pending'} label={`대기 중${tab === 'pending' ? ` ${requests.length}` : ''}`} onClick={() => selectTab('pending')} />
        <TabButton active={tab === 'students'} label="수강생 관리" onClick={() => selectTab('students')} />
        <TabButton active={tab === 'processed'} label="처리 내역" onClick={() => selectTab('processed')} />
      </div>
      {tab === 'pending' && requests.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <button className="h-7 rounded-md border border-stone-300 bg-white px-2 type-micro font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400" disabled={selectedRequestKeys.size === 0 || isBatchProcessing} onClick={() => void processSelected('reject')} type="button">선택 거절</button>
          <button className="h-7 rounded-md border border-brand-700 bg-brand-700 px-2 type-micro font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400" disabled={selectedRequestKeys.size === 0 || isBatchProcessing} onClick={() => void processSelected('approve')} type="button">선택 승인</button>
        </div>
      ) : null}
    </div>
    {isLoading ? <p className="py-16 text-center type-body text-stone-500" role="status">입장 정보를 불러오는 중입니다.</p> : null}
    {error ? <EmptyState action={<Button onClick={retry} variant="secondary">다시 시도</Button>} description={error} title="입장 정보를 불러오지 못했습니다" /> : null}
    {!isLoading && !error ? (
      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="hidden grid-cols-[36px_1fr_1.35fr_1fr_1fr_1fr_150px] items-center border-b border-stone-200 bg-stone-50 px-4 py-3 type-micro font-semibold text-stone-400 lg:grid">
          <span className="flex h-full items-center">
            {tab === 'pending' ? <input aria-label="전체 요청 선택" checked={allRequestsSelected} className="size-4 shrink-0" onChange={toggleAllRequests} type="checkbox" /> : null}
          </span>
          <span>학생</span><span>이메일</span><span>강의실</span><span>학교·소속</span>
          <span>{tab === 'students' ? '입장 시각' : '요청 시각'}</span><span className="text-right">상태</span>
        </div>
        {itemCount === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            {tab === 'students' ? <Users className="text-stone-300" size={20} /> : <Inbox className="text-stone-300" size={20} />}
            <h2 className="mt-4 font-bold">{emptyTitle}</h2>
          </div>
        ) : tab === 'students' ? students.map((student) => (
          <div className="grid gap-2 border-b border-stone-100 px-4 py-3 type-body last:border-0 lg:grid-cols-[36px_1fr_1.35fr_1fr_1fr_1fr_150px] lg:items-center" key={`${student.classroomId}:${student.id}`}>
            <span /><strong>{student.name}</strong><span className="text-stone-500">{student.email}</span>
            <span className="font-medium text-stone-700">{student.classroomName}</span>
            <span className="text-stone-500">{student.affiliation ?? '-'}</span>
            <span className="type-body text-stone-400">{new Date(student.joinedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <div className="flex justify-end"><Button onClick={() => void removeStudent(student)} size="sm" variant="ghost">제외</Button></div>
          </div>
        )) : requests.map((request) => {
          const key = requestKey(request)
          const classroom = classrooms.find((item) => item.id === request.classroomId)
          const isProcessing = processingRequestKeys.has(key) || isBatchProcessing
          return (
            <div className="grid gap-2 border-b border-stone-100 px-4 py-3 type-body last:border-0 lg:grid-cols-[36px_1fr_1.35fr_1fr_1fr_1fr_150px] lg:items-center" key={key}>
              <span className="flex h-full items-center">{tab === 'pending' ? <input aria-label={`${request.learner?.name ?? '학습자'} 요청 선택`} checked={selectedRequestKeys.has(key)} className="size-4 shrink-0" disabled={isBatchProcessing} onChange={() => toggleRequest(request)} type="checkbox" /> : null}</span>
              <strong>{request.learner?.name ?? '-'}</strong><span className="text-stone-500">{request.learner?.email ?? '-'}</span>
              <span className="font-medium text-stone-700">{request.classroomName ?? '-'}</span>
              <span className="text-stone-500">{request.learner?.affiliation ?? '-'}</span>
              <span className="type-body text-stone-400">{new Date(request.requestedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <div className="flex justify-end gap-2">
                {request.status === 'PENDING' ? <>
                  <Button disabled={isProcessing} onClick={() => void process(request, 'reject')} size="sm" variant="ghost">거절</Button>
                  <Button disabled={isProcessing || classroom?.status === 'COMPLETED'} onClick={() => void process(request, 'approve')} size="sm" title={classroom?.status === 'COMPLETED' ? '종료된 강의실에는 학습자를 추가할 수 없습니다.' : undefined}>승인</Button>
                </> : <span className="type-caption font-semibold text-stone-500">{request.status === 'APPROVED' ? '승인됨' : '거절됨'}</span>}
              </div>
            </div>
          )
        })}
      </section>
    ) : null}
  </PageContainer>
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-selected={active} className={cx('h-8 rounded-md px-3 type-caption font-semibold', active ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100')} onClick={onClick} role="tab" type="button">{label}</button>
}
