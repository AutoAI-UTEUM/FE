import { ClipboardList, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { isInstructorRole, useAuth } from '../../features/auth'
import { createClassroomsRepository, rememberClassroomId, type Classroom } from '../../features/classrooms'
import { createExamsRepository, type CreateExamInput, type Exam, type ExamSummary, type ExamStatus } from '../../features/exams'
import { ExamEditor } from '../../features/exams/ExamEditor'
import { createQuestion, isExamDraftValid } from '../../features/exams/examEditorModel'
import { getRequestErrorMessage } from '../../shared/api'
import { formatDateTime } from '../../shared/lib/format'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { useFocusScope } from '../../shared/responsive'
import { Badge, Button, EmptyState, PageHeader, PageToolbar, Select, useToast } from '../../shared/ui'
import { classroomExamsPath, examDetailPath } from '../routes'
import { ClassroomWorkspaceContainer } from './classroom/ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader } from './classroom/ClassroomWorkspaceHeader'

const initialDraft: CreateExamInput = { allowRetake: false, description: '', questions: [createQuestion('SHORT')], title: '' }

export function ExamsPage() {
  usePageTitle('시험')
  const { apiRequest, user } = useAuth()
  const navigate = useNavigate()
  const { classroomId: routeClassroomId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const isInstructor = isInstructorRole(user?.role)
  const isGlobalRoute = !routeClassroomId
  const classroomsRepository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const examsRepository = useMemo(() => createExamsRepository(apiRequest), [apiRequest])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classroomsLoadKey, setClassroomsLoadKey] = useState<string | null>(null)
  const [classroomsReloadToken, setClassroomsReloadToken] = useState(0)
  const [classroomId, setClassroomId] = useState(routeClassroomId)
  const [exams, setExams] = useState<ExamSummary[]>([])
  const [failedClassroomIds, setFailedClassroomIds] = useState<string[]>([])
  const [status, setStatus] = useState<ExamStatus | ''>('')
  const [reloadToken, setReloadToken] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const retryFailedOnlyRef = useRef(false)
  const retryClassroomIdsRef = useRef<string[]>([])
  const retryRequestedRef = useRef(false)
  const accountKey = `${user?.id ?? user?.email ?? 'anonymous'}:${user?.role ?? ''}`
  const loadKey = `${accountKey}:${routeClassroomId || 'global'}`
  const discoveryIdentity = useMemo(
    () => ({ classroomsReloadToken, classroomsRepository, loadKey }),
    [classroomsReloadToken, classroomsRepository, loadKey],
  )
  const [activeDiscoveryIdentity, setActiveDiscoveryIdentity] = useState(discoveryIdentity)
  const requestedWeek = Number(searchParams.get('weekNumber'))
  const initialWeekNumber = Number.isInteger(requestedWeek) && requestedWeek > 0 ? requestedWeek : undefined
  const [isComposerOpen, setIsComposerOpen] = useState(isInstructor && searchParams.get('create') === '1')
  const [composerWeekNumber, setComposerWeekNumber] = useState<number | undefined>(initialWeekNumber)
  const selectedClassroom = classrooms.find((classroom) => classroom.id === classroomId)
  const classroomNameById = useMemo(
    () => new Map(classrooms.map((classroom) => [classroom.id, classroom.name])),
    [classrooms],
  )

  if (activeDiscoveryIdentity !== discoveryIdentity) {
    setActiveDiscoveryIdentity(discoveryIdentity)
    setClassrooms([])
    setClassroomsLoadKey(null)
    setClassroomId(routeClassroomId)
    setExams([])
    setFailedClassroomIds([])
    setError(null)
    setIsLoading(true)
  }

  useEffect(() => {
    const controller = new AbortController()
    retryFailedOnlyRef.current = false
    retryClassroomIdsRef.current = []
    classroomsRepository.list('', controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return
        setClassrooms(items)
        setClassroomId(isGlobalRoute ? '' : items.some((item) => item.id === routeClassroomId) ? routeClassroomId : items[0]?.id || '')
        setClassroomsLoadKey(loadKey)
        if (items.length === 0) setIsLoading(false)
      })
      .catch((requestError) => { if (!controller.signal.aborted) { setError(getRequestErrorMessage(requestError)); setIsLoading(false) } })
      .finally(() => { if (!controller.signal.aborted) retryRequestedRef.current = false })
    return () => controller.abort()
  }, [classroomsRepository, discoveryIdentity, isGlobalRoute, loadKey, routeClassroomId])

  useEffect(() => { if (classroomId) rememberClassroomId(classroomId) }, [classroomId])

  useEffect(() => {
    if (classroomsLoadKey !== loadKey) return
    if (!isGlobalRoute && !classroomId) return
    const controller = new AbortController()
    const failedOnly = isGlobalRoute && retryFailedOnlyRef.current
    const targetClassrooms = isGlobalRoute
      ? classrooms.filter((classroom) => !failedOnly || retryClassroomIdsRef.current.includes(classroom.id))
      : classrooms.filter((classroom) => classroom.id === classroomId)
    const request = Promise.all(targetClassrooms.map(async (classroom) => {
      try {
        const items = await examsRepository.list(classroom.id, status || undefined, controller.signal)
        return { classroom, items, status: 'fulfilled' as const }
      } catch (reason) {
        return { classroom, reason, status: 'rejected' as const }
      }
    }))
    request
      .then((results) => {
        if (controller.signal.aborted) return
        const fulfilled = results.filter((result) => result.status === 'fulfilled')
        const rejected = results.filter((result) => result.status === 'rejected')
        const nextItems = fulfilled.flatMap((result) => result.items)
        const targetIds = new Set(targetClassrooms.map((classroom) => classroom.id))
        setExams((current) => sortExamsByRecent(failedOnly
          ? [...current.filter((exam) => !targetIds.has(exam.classroomId)), ...nextItems]
          : nextItems))
        setFailedClassroomIds(rejected.map((result) => result.classroom.id))
        setError(rejected.length > 0
          ? isGlobalRoute
            ? getGlobalExamError(rejected, classrooms.length)
            : getRequestErrorMessage(rejected[0].reason)
          : null)
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          retryFailedOnlyRef.current = false
          retryClassroomIdsRef.current = []
          retryRequestedRef.current = false
          setIsLoading(false)
        }
      })
    return () => controller.abort()
  }, [classroomId, classrooms, classroomsLoadKey, examsRepository, isGlobalRoute, loadKey, reloadToken, status])

  function selectStatus(nextStatus: ExamStatus | '') {
    retryFailedOnlyRef.current = false
    retryClassroomIdsRef.current = []
    setExams([])
    setFailedClassroomIds([])
    beginListLoad()
    if (nextStatus === status) {
      setReloadToken((current) => current + 1)
      return
    }
    setStatus(nextStatus)
  }

  function retryList() {
    if (isLoading || retryRequestedRef.current) return
    retryRequestedRef.current = true
    beginListLoad()
    if (classroomsLoadKey !== loadKey) {
      setClassroomsReloadToken((current) => current + 1)
      return
    }
    retryFailedOnlyRef.current = isGlobalRoute && failedClassroomIds.length > 0
    retryClassroomIdsRef.current = failedClassroomIds
    setReloadToken((current) => current + 1)
  }

  function beginListLoad() {
    setIsLoading(true)
    setError(null)
  }

  return <ClassroomWorkspaceContainer>
    {selectedClassroom && !isGlobalRoute ? <ClassroomWorkspaceHeader actions={isInstructor ? <Button disabled={!classroomId} onClick={() => { setComposerWeekNumber(undefined); setIsComposerOpen(true) }}><Plus size={15} />시험 만들기</Button> : undefined} activeTab="course" classroom={selectedClassroom} /> : <PageHeader title="시험" />}
    <PageToolbar>
      {selectedClassroom && !isGlobalRoute ? <ClassroomSelect classrooms={classrooms} onChange={(nextClassroomId) => { beginListLoad(); navigate(classroomExamsPath(nextClassroomId), { replace: true }) }} value={classroomId} /> : null}
      {isInstructor ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="시험 상태 필터">
          {([['', '전체'], ['DRAFT', '초안'], ['PUBLISHED', '공개'], ['CLOSED', '종료']] as const).map(([value, label]) => <button aria-pressed={status === value} className={`h-9 rounded-lg border px-3 type-control font-semibold ${status === value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-200 bg-white text-stone-600'}`} key={value} onClick={() => selectStatus(value)} type="button">{label}</button>)}
        </div>
      ) : (
        <label className="block w-full min-[520px]:w-auto">
          <span className="sr-only">시험 상태 필터</span>
          <Select
            className="w-full min-w-36 font-semibold min-[520px]:w-auto"
            onChange={(event) => {
              selectStatus(event.target.value as ExamStatus | '')
            }}
            value={status}
          >
            <option value="">전체</option>
            <option value="PUBLISHED">공개</option>
            <option value="CLOSED">종료</option>
          </Select>
        </label>
      )}
    </PageToolbar>
    {isLoading ? <p className="py-16 text-center type-body text-stone-500" role="status">시험을 불러오는 중입니다.</p> : null}
    {error ? <EmptyState action={<Button onClick={retryList}>다시 시도</Button>} description={error} title="시험을 불러오지 못했습니다" /> : null}
    {!isLoading && !error && exams.length === 0 ? <EmptyState description={isInstructor ? '시험 초안을 만들고 문항을 구성해 보세요.' : '강의자가 시험을 공개하면 여기에 표시됩니다.'} title="등록된 시험이 없습니다" /> : null}
    {exams.length > 0 ? <section className="overflow-hidden rounded-lg border border-stone-200 bg-white" aria-label="시험 목록">{exams.map((exam) => <Link className="flex min-h-20 items-center gap-4 border-b border-stone-100 px-5 py-4 last:border-0 hover:bg-stone-50" key={exam.id} to={examDetailPath(exam.id, exam.classroomId)}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><ClipboardList size={17} /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate type-body text-stone-950">{exam.title}</strong><ExamStatusBadge status={exam.status} /></span><span className="mt-1 block type-caption text-stone-500">{examMetadata(exam, isGlobalRoute ? classroomNameById.get(exam.classroomId) ?? '강의실' : undefined)}</span></span>{!isInstructor && exam.mySubmission ? <LearnerExamStatus exam={exam} /> : null}</Link>)}</section> : null}
    {isComposerOpen ? <ExamComposer classroomId={classroomId} initialWeekNumber={composerWeekNumber} onClose={() => setIsComposerOpen(false)} onCreated={(exam) => { setExams((items) => [exam, ...items]); setIsComposerOpen(false) }} repository={examsRepository} /> : null}
  </ClassroomWorkspaceContainer>
}

function ClassroomSelect({ classrooms, onChange, value }: { classrooms: Classroom[]; onChange: (classroomId: string) => void; value: string }) {
  return <label className="w-full min-[520px]:w-auto"><span className="sr-only">강의실 선택</span><Select className="w-full min-w-40 font-semibold min-[520px]:w-auto" onChange={(event) => onChange(event.target.value)} value={value}>{classrooms.length === 0 ? <option value="">강의실 없음</option> : classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</Select></label>
}

function ExamComposer({ classroomId, initialWeekNumber, onClose, onCreated, repository }: { classroomId: string; initialWeekNumber?: number; onClose: () => void; onCreated: (exam: Exam) => void; repository: ReturnType<typeof createExamsRepository> }) {
  const { show } = useToast(); const [draft, setDraft] = useState<CreateExamInput>({ ...initialDraft, weekNumber: initialWeekNumber }); const [isSubmitting, setIsSubmitting] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const submitInFlightRef = useRef(false)
  const close = () => { if (!submitInFlightRef.current) onClose() }
  useFocusScope(dialogRef, true, close)
  async function submit(event: FormEvent) { event.preventDefault(); if (!isExamDraftValid(draft) || submitInFlightRef.current) return; submitInFlightRef.current = true; setIsSubmitting(true); try { onCreated(await repository.create(classroomId, { ...draft, title: draft.title.trim() })); show('시험 초안을 만들었습니다.', 'success') } catch (error) { show(getRequestErrorMessage(error), 'danger') } finally { submitInFlightRef.current = false; setIsSubmitting(false) } }
  return <div ref={dialogRef} aria-labelledby="exam-composer-title" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }} role="dialog"><form className="max-h-[calc(100dvh-3rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-xl bg-white p-6 [scrollbar-gutter:stable]" onSubmit={submit}><div className="mb-5 flex items-center justify-between"><h2 className="type-dialog-title font-bold" id="exam-composer-title">시험 만들기</h2><button aria-label="시험 만들기 닫기" className="p-2 text-stone-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={isSubmitting} onClick={close} type="button"><X size={17} /></button></div><ExamEditor autoFocusTitle onChange={setDraft} value={draft} /><div className="mt-6 flex justify-end gap-2"><Button disabled={isSubmitting} onClick={close} variant="ghost">취소</Button><Button disabled={!isExamDraftValid(draft) || isSubmitting} type="submit">{isSubmitting ? '저장 중' : '초안 저장'}</Button></div></form></div>
}

export function ExamStatusBadge({ status }: { status: ExamStatus }) { const values = { DRAFT: ['초안', 'neutral'], PUBLISHED: ['공개', 'success'], CLOSED: ['종료', 'warning'] } as const; return <Badge tone={values[status][1]}>{values[status][0]}</Badge> }

function LearnerExamStatus({ exam }: { exam: ExamSummary }) {
  const submission = exam.mySubmission
  if (!submission) return null
  if (submission.status === 'GRADED') {
    const score = submission.score !== undefined && submission.maxScore !== undefined
      ? `${submission.score} / ${submission.maxScore}점`
      : submission.normalizedScore !== undefined ? `${submission.normalizedScore}%` : '점수 확인 필요'
    return <span className="flex shrink-0 items-center gap-2"><Badge tone="success">응시 완료</Badge><strong className="type-control text-stone-700">{score}</strong></span>
  }
  if (submission.status === 'GRADING_FAILED') return <Badge tone="danger">채점 확인 필요</Badge>
  return <Badge tone="warning">제출 완료</Badge>
}

function sortExamsByRecent(items: ExamSummary[]): ExamSummary[] {
  return [...items].sort((left, right) => getExamTimestamp(right) - getExamTimestamp(left))
}

function getGlobalExamError(
  failures: Array<{ classroom: Classroom; reason: unknown; status: 'rejected' }>,
  requestedClassroomCount: number,
): string {
  const classroomNames = failures.map((failure) => failure.classroom.name).join(', ')
  const preservedMessage = failures.length < requestedClassroomCount
    ? ' 성공한 강의실의 시험은 계속 표시합니다.'
    : ''
  return `${classroomNames} 강의실의 시험 목록을 불러오지 못했습니다.${preservedMessage} ${getRequestErrorMessage(failures[0].reason)}`
}

function getExamTimestamp(exam: ExamSummary): number {
  const value = exam.updatedAt ?? exam.publishedAt ?? exam.createdAt ?? ''
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function examMetadata(exam: ExamSummary, classroomName?: string): string {
  return [
    classroomName,
    exam.weekNumber ? `${exam.weekNumber}주차` : undefined,
    exam.questionCount !== undefined ? `${exam.questionCount}문항` : undefined,
    exam.totalScore !== undefined ? `${exam.totalScore}점` : undefined,
    exam.dueAt ? `마감 ${formatDateTime(exam.dueAt)}` : exam.updatedAt ? formatDateTime(exam.updatedAt) : undefined,
  ].filter((value) => value !== undefined).join(' · ')
}
