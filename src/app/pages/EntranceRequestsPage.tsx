import { Check, Inbox, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { TabletMasterDetail, useResponsiveViewport } from '../../shared/responsive'
import { Button, EmptyState, PageContainer, PageHeader, useToast } from '../../shared/ui'

type RequestTab = 'pending' | 'processed' | 'students'
type ClassroomStudentRow = ClassroomStudent & { classroomId: string; classroomName: string }
const EMPTY_REQUEST_KEYS = new Set<string>()

export function EntranceRequestsPage() {
  usePageTitle('입장 요청')
  const { apiRequest, user } = useAuth()
  const { isTablet } = useResponsiveViewport()
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const { show: showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const accountId = user?.id ?? null
  const repository = useMemo(() => {
    // Give every authenticated account its own read and mutation lifecycle even
    // though AuthProvider intentionally keeps apiRequest's function identity stable.
    void accountId
    return createClassroomsRepository(apiRequest)
  }, [accountId, apiRequest])
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState<RequestTab>(
    requestedTab === 'students' || requestedTab === 'processed' ? requestedTab : 'pending',
  )
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [loadedRepository, setLoadedRepository] = useState<typeof repository | null>(null)
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [students, setStudents] = useState<ClassroomStudentRow[]>([])
  const [selectedRequestState, setSelectedRequestState] = useState(() => ({
    keys: new Set<string>(),
    repository,
  }))
  const [processingRequestState, setProcessingRequestState] = useState(() => ({
    keys: new Set<string>(),
    repository,
  }))
  const [batchRepository, setBatchRepository] = useState<typeof repository | null>(null)
  const processingRequestKeysRef = useRef({ keys: new Set<string>(), repository })
  const isBatchProcessingRef = useRef<typeof repository | null>(null)
  const operationScopeRef = useRef({ active: true, repository })
  const [classroomReloadKey, setClassroomReloadKey] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [loadedContent, setLoadedContent] = useState<{
    classrooms: Classroom[]
    reloadKey: number
    repository: typeof repository
    tab: RequestTab
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const hasLoadedClassrooms = loadedRepository === repository
  const hasLoadedContent = loadedContent?.classrooms === classrooms
    && loadedContent.reloadKey === reloadKey
    && loadedContent.repository === repository
    && loadedContent.tab === tab
  const selectedRequestKeys = selectedRequestState.repository === repository
    ? selectedRequestState.keys
    : EMPTY_REQUEST_KEYS
  const processingRequestKeys = processingRequestState.repository === repository
    ? processingRequestState.keys
    : EMPTY_REQUEST_KEYS
  const isBatchProcessing = batchRepository === repository

  useEffect(() => {
    const scope = { active: true, repository }
    operationScopeRef.current = scope
    return () => { scope.active = false }
  }, [repository])

  useEffect(() => {
    const controller = new AbortController()
    repository.list('', controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setClassrooms(items)
        setError(null)
        setLoadedRepository(repository)
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
        if (controller.signal.aborted) return
        setStudents(classroomStudents.flat().sort((a, b) => b.joinedAt.localeCompare(a.joinedAt)))
        setRequests([])
        setLoadedContent({ classrooms, reloadKey, repository, tab })
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
      if (controller.signal.aborted) return
      const nextRequests = classroomRequests.flat().sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
      const availableKeys = new Set(nextRequests.map((request) => (
        `${request.classroomId ?? 'unknown'}:${request.requestId}`
      )))
      setRequests(nextRequests)
      setSelectedRequestState((current) => ({
        keys: current.repository === repository
          ? new Set([...current.keys].filter((key) => availableKeys.has(key)))
          : new Set(),
        repository,
      }))
      setStudents([])
      setLoadedContent({ classrooms, reloadKey, repository, tab })
    }

    void load()
      .then(() => {
        if (!controller.signal.aborted) setError(null)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [classrooms, hasLoadedClassrooms, reloadKey, repository, tab])

  function setSelectedRequestKeys(nextValue: Set<string> | ((current: Set<string>) => Set<string>)) {
    setSelectedRequestState((current) => {
      const currentKeys = current.repository === repository ? current.keys : EMPTY_REQUEST_KEYS
      const keys = typeof nextValue === 'function' ? nextValue(currentKeys) : nextValue
      return { keys, repository }
    })
  }

  function currentProcessingRequestKeys() {
    if (processingRequestKeysRef.current.repository !== repository) {
      processingRequestKeysRef.current = { keys: new Set(), repository }
    }
    return processingRequestKeysRef.current.keys
  }

  function setProcessingKeys(keys: Set<string>) {
    processingRequestKeysRef.current = { keys, repository }
    setProcessingRequestState({ keys: new Set(keys), repository })
  }

  function selectTab(nextTab: RequestTab) {
    setDetailKey(null)
    setIsLoading(true)
    setSelectedRequestKeys(new Set())
    if (nextTab === tab) {
      if (hasLoadedClassrooms) setReloadKey((value) => value + 1)
      else setClassroomReloadKey((value) => value + 1)
    }
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
    if (isBatchProcessingRef.current === repository || currentProcessingRequestKeys().has(key)) return
    setSelectedRequestKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAllRequests() {
    if (isBatchProcessingRef.current === repository || currentProcessingRequestKeys().size > 0) return
    if (requests.length > 0 && requests.every((request) => selectedRequestKeys.has(requestKey(request)))) {
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
    if (isBatchProcessingRef.current === repository || currentProcessingRequestKeys().has(key)) return
    const scope = operationScopeRef.current
    setProcessingKeys(new Set(currentProcessingRequestKeys()).add(key))
    try {
      await repository.processJoinRequest(classroomId, request.requestId, decision)
      if (!scope.active || operationScopeRef.current !== scope) return
      window.dispatchEvent(new Event(JOIN_REQUESTS_CHANGED_EVENT))
      showToast(decision === 'approve' ? '입장 요청을 승인했습니다.' : '입장 요청을 거절했습니다.', 'success')
      setIsLoading(true)
      setSelectedRequestKeys((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
      setReloadKey((value) => value + 1)
    } catch (requestError) {
      if (scope.active && operationScopeRef.current === scope) {
        showToast(getRequestErrorMessage(requestError), 'danger')
      }
    } finally {
      if (scope.active && operationScopeRef.current === scope) {
        const next = new Set(currentProcessingRequestKeys())
        next.delete(key)
        setProcessingKeys(next)
      }
    }
  }

  async function processSelected(decision: 'approve' | 'reject') {
    const selected = requests.filter((request) => selectedRequestKeys.has(requestKey(request)))
    if (selected.length === 0 || isBatchProcessingRef.current === repository) return
    const scope = operationScopeRef.current
    isBatchProcessingRef.current = repository
    setBatchRepository(repository)
    let completed = 0
    let skipped = 0
    let failed = 0
    const failedKeys = new Set<string>()
    const lockedKeys: string[] = []
    const processable: JoinRequest[] = []
    for (const request of selected) {
      const key = requestKey(request)
      const classroom = classrooms.find((item) => item.id === request.classroomId)
      if (currentProcessingRequestKeys().has(key)) skipped += 1
      else if (decision === 'approve' && classroom?.status === 'COMPLETED') skipped += 1
      else if (!request.classroomId) {
        failed += 1
        failedKeys.add(key)
      } else {
        lockedKeys.push(key)
        processable.push(request)
      }
    }
    setProcessingKeys(new Set([
      ...currentProcessingRequestKeys(),
      ...lockedKeys,
    ]))
    try {
      for (const request of processable) {
        if (!scope.active || operationScopeRef.current !== scope) return
        try {
          await repository.processJoinRequest(request.classroomId!, request.requestId, decision)
          completed += 1
        } catch {
          failed += 1
          failedKeys.add(requestKey(request))
        }
      }
      if (!scope.active || operationScopeRef.current !== scope) return
      if (completed > 0) {
        window.dispatchEvent(new Event(JOIN_REQUESTS_CHANGED_EVENT))
        showToast(`${completed}건을 ${decision === 'approve' ? '승인' : '거절'}했습니다.`, 'success')
      }
      if (failed > 0) {
        showToast(`${failed}건을 처리하지 못했습니다. 실패한 요청을 선택한 상태로 유지했습니다.`, 'danger')
      }
      if (skipped > 0) showToast(`${skipped}건을 건너뛰었습니다.`, 'info')
      setSelectedRequestKeys(failedKeys)
      if (completed > 0) {
        setIsLoading(true)
        setReloadKey((value) => value + 1)
      }
    } finally {
      if (scope.active && operationScopeRef.current === scope) {
        const next = new Set(currentProcessingRequestKeys())
        lockedKeys.forEach((key) => next.delete(key))
        setProcessingKeys(next)
        if (isBatchProcessingRef.current === repository) isBatchProcessingRef.current = null
        setBatchRepository((current) => current === repository ? null : current)
      }
    }
  }

  function retry() {
    setIsLoading(true)
    setError(null)
    if (hasLoadedClassrooms) setReloadKey((value) => value + 1)
    else setClassroomReloadKey((value) => value + 1)
  }

  async function removeStudent(student: ClassroomStudentRow) {
    if (!window.confirm(`${student.name} 학습자를 ${student.classroomName} 강의실에서 제외할까요?`)) return
    const scope = operationScopeRef.current
    try {
      await repository.removeStudent(student.classroomId, student.id)
      if (!scope.active || operationScopeRef.current !== scope) return
      setStudents((current) => current.filter((item) => (
        item.id !== student.id || item.classroomId !== student.classroomId
      )))
      showToast('학습자를 강의실에서 제외했습니다.', 'success')
    } catch (requestError) {
      if (scope.active && operationScopeRef.current === scope) {
        showToast(getRequestErrorMessage(requestError), 'danger')
      }
    }
  }

  const emptyTitle = tab === 'pending'
    ? '대기 중인 입장 요청이 없습니다'
    : tab === 'students'
      ? '승인된 학습자가 없습니다'
      : '처리한 입장 요청이 없습니다'
  const itemCount = tab === 'students' ? students.length : requests.length
  const allRequestsSelected = requests.length > 0 && requests.every((request) => (
    selectedRequestKeys.has(requestKey(request))
  ))
  const hasSelectedProcessingRequest = [...selectedRequestKeys].some((key) => (
    processingRequestKeys.has(key)
  ))
  const detailRequest = requests.find(request => requestKey(request) === detailKey)
  const detailStudent = students.find(student => `${student.classroomId}:${student.id}` === detailKey)

  return <PageContainer>
    <PageHeader title="입장 요청" />
    <div className="flex flex-wrap items-center justify-between gap-3 mobile-phone:flex-col mobile-phone:items-stretch">
      <div aria-label="입장 요청 상태" className="inline-flex w-fit rounded-[10px] border border-stone-200 bg-white p-1 mobile-horizontal-scroll mobile-phone:w-full" role="tablist">
        <TabButton active={tab === 'pending'} label={`대기 중${tab === 'pending' ? ` ${requests.length}` : ''}`} onClick={() => selectTab('pending')} />
        <TabButton active={tab === 'students'} label="수강생 관리" onClick={() => selectTab('students')} />
        <TabButton active={tab === 'processed'} label="처리 내역" onClick={() => selectTab('processed')} />
      </div>
      {tab === 'pending' && requests.length > 0 ? (
        <div className="flex items-center gap-1.5 mobile-phone:grid mobile-phone:grid-cols-2">
          <button className="h-7 rounded-md border border-stone-300 bg-white px-2 type-micro font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400" disabled={selectedRequestKeys.size === 0 || isBatchProcessing || hasSelectedProcessingRequest} onClick={() => void processSelected('reject')} type="button">선택 거절</button>
          <button className="h-7 rounded-md border border-brand-700 bg-brand-700 px-2 type-micro font-semibold text-white transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400" disabled={selectedRequestKeys.size === 0 || isBatchProcessing || hasSelectedProcessingRequest} onClick={() => void processSelected('approve')} type="button">선택 승인</button>
        </div>
      ) : null}
    </div>
    {!error && (isLoading || !hasLoadedClassrooms || !hasLoadedContent) ? <p className="py-16 text-center type-body text-stone-500" role="status">입장 정보를 불러오는 중입니다.</p> : null}
    {error ? <EmptyState action={<Button onClick={retry} variant="secondary">다시 시도</Button>} description={error} title="입장 정보를 불러오지 못했습니다" /> : null}
    {!isLoading && !error && hasLoadedClassrooms && hasLoadedContent ? (
      isTablet ? <section className="flex min-h-80 flex-col overflow-hidden border-y border-stone-200 bg-white">
        {tab === 'pending' ? <div className="flex items-center gap-2 border-b border-stone-200 p-3"><SelectionCheckbox ariaLabel="전체 요청 선택" checked={allRequestsSelected} disabled={isBatchProcessing || processingRequestKeys.size > 0} onChange={toggleAllRequests} />전체 선택</div> : null}
        <TabletMasterDetail onClose={() => setDetailKey(null)} title={tab === 'students' ? '수강생 상세' : '입장 요청 상세'} detail={detailStudent && tab === 'students' ? <div className="space-y-4 p-4"><h3 className="font-bold">{detailStudent.name}</h3><p className="break-all">{detailStudent.email}</p><p>{detailStudent.classroomName}</p><p>{detailStudent.affiliation ?? '-'}</p><Button variant="secondary" onClick={() => void removeStudent(detailStudent)}>강의실에서 제외</Button></div> : detailRequest ? <div className="space-y-4 p-4"><h3 className="font-bold">{detailRequest.learner?.name}</h3><p className="break-all">{detailRequest.learner?.email}</p><p>{detailRequest.classroomName}</p><p>{detailRequest.learner?.affiliation ?? '-'}</p><p>{new Date(detailRequest.requestedAt).toLocaleString('ko-KR')}</p>{detailRequest.status === 'PENDING' ? <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={processingRequestKeys.has(requestKey(detailRequest)) || isBatchProcessing} onClick={() => void process(detailRequest, 'reject')}>거절</Button><Button disabled={processingRequestKeys.has(requestKey(detailRequest)) || isBatchProcessing || classrooms.find(c => c.id === detailRequest.classroomId)?.status === 'COMPLETED'} onClick={() => void process(detailRequest, 'approve')}>승인</Button></div> : <p>{detailRequest.status === 'APPROVED' ? '승인됨' : '거절됨'}</p>}</div> : null}>
          {itemCount === 0 ? <p className="p-6 text-stone-500">{emptyTitle}</p> : tab === 'students' ? students.map(student => <button type="button" className="tablet-summary-row w-full border-b border-stone-100 p-4 text-left" key={`${student.classroomId}:${student.id}`} onClick={() => setDetailKey(`${student.classroomId}:${student.id}`)}><span className="min-w-0"><strong className="block">{student.name}</strong><span className="break-all text-stone-500">{student.email}</span></span><span>{student.classroomName}</span><span>수강 중</span></button>) : requests.map(request => <div className="flex items-center border-b border-stone-100 px-3" key={requestKey(request)}>{tab === 'pending' ? <SelectionCheckbox ariaLabel={`${request.learner?.name ?? '학습자'} 요청 선택`} checked={selectedRequestKeys.has(requestKey(request))} onChange={() => toggleRequest(request)} disabled={isBatchProcessing || processingRequestKeys.has(requestKey(request))} /> : null}<button type="button" className="tablet-summary-row min-w-0 flex-1 p-3 text-left" onClick={() => setDetailKey(requestKey(request))}><span className="min-w-0"><strong className="block">{request.learner?.name}</strong><span className="break-all type-caption text-stone-500">{request.learner?.email}</span></span><span>{request.classroomName}</span><span>{request.status === 'PENDING' ? '대기 중' : request.status === 'APPROVED' ? '승인됨' : '거절됨'}</span></button></div>)}
        </TabletMasterDetail>
      </section> : <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="hidden grid-cols-[36px_1fr_1.35fr_1fr_1fr_1fr_150px] items-center border-b border-stone-200 bg-stone-50 px-4 py-3 type-micro font-semibold text-stone-400 lg:grid">
          <span className="flex h-full items-center">
            {tab === 'pending' ? <SelectionCheckbox ariaLabel="전체 요청 선택" checked={allRequestsSelected} disabled={isBatchProcessing || processingRequestKeys.size > 0} onChange={toggleAllRequests} /> : null}
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
              <span className="flex h-full items-center">{tab === 'pending' ? <SelectionCheckbox ariaLabel={`${request.learner?.name ?? '학습자'} 요청 선택`} checked={selectedRequestKeys.has(key)} disabled={isProcessing} onChange={() => toggleRequest(request)} /> : null}</span>
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
  return <button aria-selected={active} className={cx('h-8 shrink-0 rounded-[7px] px-3 type-caption font-semibold mobile-web:h-11', active ? 'bg-stone-900 text-white dark:bg-stone-200 dark:text-stone-950' : 'text-stone-500 hover:bg-stone-100')} onClick={onClick} role="tab" type="button">{label}</button>
}

function SelectionCheckbox({
  ariaLabel,
  checked,
  disabled = false,
  onChange,
}: {
  ariaLabel: string
  checked: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded mobile-web:size-11">
      <input
        aria-label={ariaLabel}
        checked={checked}
        className="peer sr-only"
        disabled={disabled}
        onChange={onChange}
        type="checkbox"
      />
      <span className="flex size-4 items-center justify-center rounded border border-stone-400 bg-white text-white peer-checked:border-brand-700 peer-checked:bg-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
        {checked ? <Check aria-hidden="true" size={12} strokeWidth={3} /> : null}
      </span>
    </label>
  )
}
