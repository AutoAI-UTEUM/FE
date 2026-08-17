import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BarChart3,
  ChevronRight,
  FileSearch,
  LoaderCircle,
  Plus,
  Settings2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createClassroomsRepository,
  rememberClassroomId,
  type Classroom,
  type ClassroomWeek,
} from '../../../features/classrooms'
import {
  createReportsRepository,
  type ReportCriterion,
  type ReportCriterionResult,
  type ReportGenerationStatus,
  type ReportScope,
  type ReportStatement,
  type ReportStudent,
  type StudentReport,
} from '../../../features/reports'
import { ApiClientError, getRequestErrorMessage } from '../../../shared/api'
import { isApiCapabilityEnabled } from '../../../shared/config/capabilities'
import { formatDateTime } from '../../../shared/lib/format'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { useAsyncJobPolling } from '../../../shared/state'
import { Badge, Button, ButtonLink, EmptyState, ErrorState, LoadingState, PageContainer, PageHeader, useToast } from '../../../shared/ui'
import {
  classroomReportCriteriaPath,
  classroomReportDetailPath,
  classroomReportsPath,
  classroomStudentReportsPath,
} from '../../routes'
import { ClassroomWorkspaceHeader } from '../classroom/ClassroomWorkspaceHeader'

const reportsEnabled = isApiCapabilityEnabled('reports')

export function InstructorReportsPage() {
  usePageTitle('학습 리포트')
  const { classroomId = '' } = useParams()
  const { apiRequest } = useAuth()
  const repository = useMemo(() => createReportsRepository(apiRequest), [apiRequest])
  const classroomsRepository = useMemo(
    () => createClassroomsRepository(apiRequest),
    [apiRequest],
  )
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [students, setStudents] = useState<ReportStudent[]>([])
  const [isLoading, setIsLoading] = useState(reportsEnabled)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    classroomsRepository
      .list('', controller.signal)
      .then(setClassrooms)
      .catch(() => undefined)
    return () => controller.abort()
  }, [classroomsRepository])

  useEffect(() => {
    if (!classroomId || !reportsEnabled) return
    rememberClassroomId(classroomId)
    const controller = new AbortController()
    repository.listStudents(classroomId, controller.signal)
      .then(setStudents)
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [classroomId, repository])

  const selectedClassroom = classrooms.find((classroom) => classroom.id === classroomId)
  const headerActions = classroomId ? <ButtonLink to={classroomReportCriteriaPath(classroomId)} variant="secondary"><Settings2 size={14} />평가 기준</ButtonLink> : undefined

  return <PageContainer>
    {selectedClassroom
      ? <ClassroomWorkspaceHeader actions={headerActions} activeTab="learning" classroom={selectedClassroom} />
      : <PageHeader actions={headerActions} title="학습 리포트" />}
    {!reportsEnabled ? <ReportsUnavailableState /> : null}
    {reportsEnabled && isLoading ? <LoadingState message="학습자 목록을 불러오는 중입니다." /> : null}
    {reportsEnabled && error ? <ErrorState description={error} title="학습자 목록을 불러오지 못했습니다" /> : null}
    {reportsEnabled && !isLoading && !error && students.length === 0 ? <EmptyState description="승인된 학습자가 들어오면 학생별 리포트를 생성할 수 있습니다." title="리포트를 생성할 학습자가 없습니다" /> : null}
    {reportsEnabled && students.length > 0 ? <section className="overflow-hidden rounded-lg border border-stone-200 bg-white" aria-label="학습자 리포트 목록">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] border-b border-stone-200 bg-stone-50 px-5 py-3 type-caption font-semibold text-stone-500 sm:grid-cols-[1fr_1.4fr_1fr_auto]"><span>학습자</span><span className="hidden sm:block">이메일</span><span className="hidden sm:block">소속</span><span>리포트</span></div>
      {students.map((student) => <Link className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-stone-100 px-5 py-3 last:border-0 hover:bg-stone-50 sm:grid-cols-[1fr_1.4fr_1fr_auto]" key={student.id} to={classroomStudentReportsPath(classroomId, student.id)}><strong className="truncate type-body text-stone-900">{student.name}</strong><span className="hidden truncate type-control text-stone-500 sm:block">{student.email}</span><span className="hidden truncate type-control text-stone-500 sm:block">{student.affiliation ?? '-'}</span><span className="inline-flex items-center gap-1 type-control font-semibold text-brand-700">열기<ChevronRight size={14} /></span></Link>)}
    </section> : null}
  </PageContainer>
}

export function InstructorStudentReportsPage() {
  usePageTitle('학생 리포트')
  const { classroomId = '', studentId = '' } = useParams()
  const navigate = useNavigate()
  const { apiRequest } = useAuth()
  const repository = useMemo(() => createReportsRepository(apiRequest), [apiRequest])
  const classroomsRepository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const [reports, setReports] = useState<StudentReport[]>([])
  const [weeks, setWeeks] = useState<ClassroomWeek[]>([])
  const [scopeType, setScopeType] = useState<ReportScope['type']>('FULL')
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [activeReport, setActiveReport] = useState<StudentReport | null>(null)
  const [isLoading, setIsLoading] = useState(reportsEnabled)
  const [isCreating, setIsCreating] = useState(false)
  const [isDelayed, setIsDelayed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef<string | null>(null)

  const loadReports = useCallback(async (signal?: AbortSignal) => {
    const result = await repository.listReports(classroomId, studentId, signal)
    setReports(result.items)
    setActiveReport((current) => current ?? result.activeGeneration)
    return result.items
  }, [classroomId, repository, studentId])

  useEffect(() => {
    if (!classroomId || !studentId || !reportsEnabled) return
    rememberClassroomId(classroomId)
    const controller = new AbortController()
    Promise.all([repository.listReports(classroomId, studentId, controller.signal), classroomsRepository.listWeeks(classroomId, controller.signal)])
      .then(([nextReports, nextWeeks]) => {
        setReports(nextReports.items)
        setActiveReport(nextReports.activeGeneration)
        setWeeks(nextWeeks)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [classroomId, classroomsRepository, repository, studentId])

  const fetchReport = useCallback((signal: AbortSignal) => {
    if (!activeReport) throw new Error('진행 중인 리포트가 없습니다.')
    return repository.getReport(activeReport.reportId, signal)
  }, [activeReport, repository])
  const handlePollingResult = useCallback((report: StudentReport) => {
    setActiveReport(report)
    if (report.status === 'COMPLETED') {
      requestIdRef.current = null
      void loadReports()
      navigate(classroomReportDetailPath(classroomId, studentId, report.reportId), { replace: true })
    }
    if (report.status === 'FAILED') {
      requestIdRef.current = null
      setIsCreating(false)
    }
  }, [classroomId, loadReports, navigate, studentId])
  const handlePollingError = useCallback((requestError: unknown) => setError(getRequestErrorMessage(requestError)), [])
  const handlePollingDelay = useCallback(() => { setIsDelayed(true); setIsCreating(false) }, [])
  const getReportDelay = useCallback((_elapsedMs: number, report?: StudentReport) => Math.max(1000, Math.min(10_000, (report?.pollAfterSeconds ?? 3) * 1000)), [])

  useAsyncJobPolling({
    enabled: activeReport?.status === 'PENDING' || activeReport?.status === 'PROCESSING',
    fetchNext: fetchReport,
    getDelayMs: getReportDelay,
    isPending: isReportPending,
    maxDurationMs: 210_000,
    onDelayed: handlePollingDelay,
    onError: handlePollingError,
    onResult: handlePollingResult,
  })

  async function createReport() {
    if (!reportsEnabled || isCreating || (scopeType === 'WEEK' && selectedWeek === null)) return
    setIsCreating(true)
    setIsDelayed(false)
    setError(null)
    requestIdRef.current ??= createRequestId()
    const scope: ReportScope = scopeType === 'FULL'
      ? { type: 'FULL' }
      : { type: 'WEEK', weekNumber: selectedWeek as number }
    try {
      const report = await repository.createReport(classroomId, studentId, { requestId: requestIdRef.current, scope })
      setActiveReport(report)
      if (report.status === 'COMPLETED') {
        requestIdRef.current = null
        navigate(classroomReportDetailPath(classroomId, studentId, report.reportId))
      } else if (report.status === 'FAILED') {
        requestIdRef.current = null
        setIsCreating(false)
      }
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
      setIsCreating(false)
    }
  }

  function startNewGeneration() {
    requestIdRef.current = null
    setActiveReport(null)
    setIsDelayed(false)
    void createReport()
  }

  const isReportGenerating = isCreating || Boolean(activeReport && isReportPending(activeReport))

  return <PageContainer>
    <PageHeader actions={<ButtonLink to={classroomReportsPath(classroomId)} variant="secondary">학습자 목록</ButtonLink>} title="학생 리포트" />
    {!reportsEnabled ? <ReportsUnavailableState /> : null}
    {reportsEnabled && isLoading ? <LoadingState message="리포트 정보를 불러오는 중입니다." /> : null}
    {reportsEnabled && !isLoading ? <>
      <section className="rounded-lg border border-stone-200 bg-white p-5" aria-labelledby="report-scope-title">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="type-section-title font-bold text-stone-950" id="report-scope-title">분석 범위</h2><p className="mt-1 type-caption text-stone-500">전체 학습 기간 또는 한 주차를 선택합니다.</p></div><Button aria-busy={isReportGenerating} disabled={isReportGenerating || (scopeType === 'WEEK' && selectedWeek === null)} onClick={startNewGeneration}>{isReportGenerating ? <LoaderCircle aria-hidden="true" className="animate-spin" size={15} /> : <BarChart3 aria-hidden="true" size={15} />}{isReportGenerating ? '리포트 생성 중' : '새 리포트 생성'}</Button></div>
        <div className="mt-4 inline-flex rounded-lg border border-stone-200 bg-stone-50 p-1" role="radiogroup" aria-label="분석 범위"><ScopeButton active={scopeType === 'FULL'} label="전체 기간" onClick={() => setScopeType('FULL')} /><ScopeButton active={scopeType === 'WEEK'} label="주차 선택" onClick={() => setScopeType('WEEK')} /></div>
        {scopeType === 'WEEK' ? <label className="mt-4 block max-w-sm type-control font-semibold text-stone-700" htmlFor="report-week-select">분석 주차<select className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body font-normal text-stone-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400" disabled={weeks.length === 0} id="report-week-select" onChange={(event) => setSelectedWeek(event.target.value ? Number(event.target.value) : null)} value={selectedWeek ?? ''}><option value="">{weeks.length === 0 ? '선택 가능한 주차가 없습니다' : '주차를 선택하세요'}</option>{weeks.map((week) => <option key={week.weekNumber} value={week.weekNumber}>{week.weekNumber}주차 · {week.title}</option>)}</select></label> : null}
      </section>
      {activeReport?.status === 'FAILED' ? <ErrorState action={<Button onClick={startNewGeneration}>다시 생성</Button>} description={activeReport.failureMessage ?? '리포트 생성에 실패했습니다.'} title="리포트를 생성하지 못했습니다" /> : null}
      {isDelayed ? <ErrorState action={<Button onClick={() => { setIsDelayed(false); setIsCreating(true); setActiveReport((current) => current ? { ...current, status: 'PROCESSING' } : current) }} variant="secondary">상태 다시 확인</Button>} description="서버 작업은 계속될 수 있습니다. 새 작업을 만들지 않고 현재 작업 상태를 다시 확인합니다." title="리포트 생성이 지연되고 있습니다" /> : null}
      {error ? <p className="type-body text-rose-700" role="alert">{error}</p> : null}
      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white" aria-label="저장된 리포트 버전">
        <div className="border-b border-stone-200 bg-stone-50 px-5 py-3"><h2 className="type-body font-bold text-stone-900">저장된 버전</h2></div>
        {reports.length === 0 ? <EmptyState description="분석 범위를 선택하고 첫 리포트를 생성하세요." title="저장된 리포트가 없습니다" /> : reports.map((report) => <Link className="flex min-h-16 items-center gap-4 border-b border-stone-100 px-5 py-3 last:border-0 hover:bg-stone-50" key={`${report.reportId}-${report.version ?? 0}`} to={classroomReportDetailPath(classroomId, studentId, report.reportId)}><span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><FileSearch size={17} /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="type-body">버전 {report.version ?? '-'}</strong>{report.stale ? <Badge tone="warning">새 데이터 있음</Badge> : null}<ReportStatusBadge status={report.status} /></span><span className="mt-1 block type-caption text-stone-500">{report.sourceDataAsOf ? `데이터 기준 ${formatDateTime(report.sourceDataAsOf)}` : report.createdAt ? formatDateTime(report.createdAt) : '생성 시각 정보 없음'}</span></span><ChevronRight className="text-stone-400" size={16} /></Link>)}
      </section>
    </> : null}
  </PageContainer>
}

export function InstructorReportDetailPage() {
  usePageTitle('리포트 상세')
  const { classroomId = '', studentId = '', reportId = '' } = useParams()
  const { apiRequest } = useAuth()
  const repository = useMemo(() => createReportsRepository(apiRequest), [apiRequest])
  const [report, setReport] = useState<StudentReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(reportsEnabled)

  useEffect(() => {
    if (!reportId || !reportsEnabled) return
    rememberClassroomId(classroomId)
    const controller = new AbortController()
    repository.getReport(reportId, controller.signal)
      .then(setReport)
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [classroomId, reportId, repository])

  if (!reportsEnabled) return <PageContainer><PageHeader title="리포트 상세" /><ReportsUnavailableState /></PageContainer>
  if (isLoading) return <LoadingState message="리포트를 불러오는 중입니다." />
  if (!report) return <ErrorState action={<ButtonLink to={classroomStudentReportsPath(classroomId, studentId)}>리포트 목록</ButtonLink>} description={error ?? '리포트가 없거나 접근 권한이 없습니다.'} title="리포트를 불러오지 못했습니다" />
  if (report.status !== 'COMPLETED') return <ErrorState action={<ButtonLink to={classroomStudentReportsPath(classroomId, studentId)}>생성 상태 확인</ButtonLink>} description={report.failureMessage ?? '완료된 리포트만 상세 내용을 확인할 수 있습니다.'} title="리포트가 아직 준비되지 않았습니다" />

  const overallStage = report.overallScore === null
    ? '관찰 데이터 축적 중'
    : report.stage ?? '단계 정보 없음'

  return <PageContainer>
    <PageHeader actions={<ButtonLink to={classroomStudentReportsPath(classroomId, studentId)} variant="secondary">버전 목록</ButtonLink>} title={report.studentName ? `${report.studentName} 리포트` : '학생 리포트'} titleAccessory={<span className="type-caption text-stone-500">버전 {report.version ?? '-'}</span>} />
    <section className="grid gap-3 sm:grid-cols-3"><Metric label="종합 단계" value={overallStage} /><Metric label="종합 점수" value={report.overallScore === null ? '데이터 부족' : `${report.overallScore}점`} /><Metric label="동일 범위의 이전 리포트 대비" value={report.overallScore === null ? '데이터 부족' : getTrendLabel(report.trend)} trend={report.overallScore === null ? undefined : report.trend} /></section>
    {report.overview ? <section className="border-y border-stone-200 py-5"><h2 className="type-section-title font-bold">종합 해석</h2><p className="mt-2 type-body leading-6 text-stone-600">{report.overview}</p></section> : null}
    <section aria-labelledby="criteria-results-title"><h2 className="type-section-title font-bold" id="criteria-results-title">평가 항목</h2><div className="mt-3 grid gap-3 lg:grid-cols-3">{report.criterionResults.map((result) => <CriterionResultCard evidence={report.evidence} key={result.criterionKey} result={result} />)}</div></section>
    <section className="grid gap-3 lg:grid-cols-2"><StatementSection evidence={report.evidence} items={report.strengths} title="강점" /><StatementSection evidence={report.evidence} items={report.improvements} title="보완점" /><StatementSection evidence={report.evidence} items={report.misconceptionCandidates} title="오개념 후보" /><StatementSection evidence={report.evidence} items={report.recommendedActions} title="추천 지도 행동" /></section>
    {error ? <p className="type-body text-rose-700" role="alert">{error}</p> : null}
  </PageContainer>
}

export function InstructorReportCriteriaPage() {
  usePageTitle('리포트 평가 기준')
  const { classroomId = '' } = useParams()
  const { apiRequest } = useAuth()
  const { show } = useToast()
  const repository = useMemo(() => createReportsRepository(apiRequest), [apiRequest])
  const [criteria, setCriteria] = useState<ReportCriterion[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rubric, setRubric] = useState('')
  const [isLoading, setIsLoading] = useState(reportsEnabled)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeCustomCriterionCount = criteria.filter((item) => item.active && !item.builtin).length

  useEffect(() => {
    if (!classroomId || !reportsEnabled) return
    rememberClassroomId(classroomId)
    repository.listCriteria(classroomId)
      .then(setCriteria)
      .catch((requestError) => setError(getRequestErrorMessage(requestError)))
      .finally(() => setIsLoading(false))
  }, [classroomId, repository])

  async function createCriterion(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !description.trim() || !rubric.trim() || isSaving || activeCustomCriterionCount >= 20) return
    setIsSaving(true)
    try {
      const created = await repository.createCriterion(classroomId, {
        active: true,
        description: description.trim(),
        key: createCriterionKey(name),
        minimumEvidence: 2,
        name: name.trim(),
        rubric: rubric.trim(),
        sourceTypes: ['SESSION', 'QA_QUESTION', 'QUIZ_SUBMISSION', 'DIAGNOSIS', 'MEMORY', 'EXAM_SUBMISSION'],
        weight: 1,
      })
      setCriteria((items) => [...items, created])
      setName(''); setDescription(''); setRubric('')
      show('평가 기준을 추가했습니다.', 'success')
    } catch (requestError) {
      setError(requestError instanceof ApiClientError && requestError.status === 409
        ? '기본 평가 기준 또는 기존 커스텀 기준과 이름이 중복됩니다.'
        : getRequestErrorMessage(requestError))
    }
    finally { setIsSaving(false) }
  }

  async function toggleCriterion(criterion: ReportCriterion) {
    if (criterion.id === null || criterion.builtin) return
    try {
      const updated = await repository.updateCriterion(classroomId, criterion.id, { active: !criterion.active })
      setCriteria((items) => items.map((item) => item.id === updated.id ? updated : item))
    } catch (requestError) { setError(getRequestErrorMessage(requestError)) }
  }

  return <PageContainer>
    <PageHeader actions={<ButtonLink to={classroomReportsPath(classroomId)} variant="secondary">리포트</ButtonLink>} title="평가 기준" />
    {!reportsEnabled ? <ReportsUnavailableState /> : null}
    {reportsEnabled && isLoading ? <LoadingState message="평가 기준을 불러오는 중입니다." /> : null}
    {reportsEnabled && !isLoading ? <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="border-b border-stone-200 bg-stone-50 px-5 py-3"><h2 className="type-body font-bold">활성 커스텀 기준 {activeCustomCriterionCount}/20</h2></div>{criteria.length === 0 ? <EmptyState description="기본 평가 기준은 서버 정책에 따라 제공되며 강의실별 기준을 추가할 수 있습니다." title="추가 평가 기준이 없습니다" /> : criteria.map((criterion) => <div className="flex items-start gap-4 border-b border-stone-100 px-5 py-4 last:border-0" key={criterion.id ?? `builtin-${criterion.key}`}><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><strong className="type-body">{criterion.name}</strong><Badge tone={criterion.active ? 'success' : 'neutral'}>{criterion.active ? '사용 중' : '비활성'}</Badge>{criterion.builtin ? <Badge tone="neutral">기본</Badge> : null}</div><p className="mt-1 type-caption leading-5 text-stone-500">{criterion.description}</p><p className="mt-2 type-micro text-stone-400">최소 근거 {criterion.minimumEvidence}개 · 버전 {criterion.version || '-'}</p></div>{criterion.builtin ? null : <Button onClick={() => void toggleCriterion(criterion)} size="sm" variant="secondary">{criterion.active ? '비활성화' : '활성화'}</Button>}</div>)}</section>
      <form className="h-fit rounded-lg border border-stone-200 bg-white p-5" onSubmit={createCriterion}><div className="flex items-center gap-2"><Plus size={16} /><h2 className="type-section-title font-bold">기준 추가</h2></div><label className="mt-4 block type-control font-semibold">이름<input className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 type-body" maxLength={60} onChange={(event) => setName(event.target.value)} value={name} /></label><label className="mt-4 block type-control font-semibold">설명<textarea className="mt-1 min-h-20 w-full resize-none rounded-lg border border-stone-300 px-3 py-2 type-body" onChange={(event) => setDescription(event.target.value)} value={description} /></label><label className="mt-4 block type-control font-semibold">평가 기준<textarea className="mt-1 min-h-28 w-full resize-none rounded-lg border border-stone-300 px-3 py-2 type-body" onChange={(event) => setRubric(event.target.value)} value={rubric} /></label><Button className="mt-4 w-full" disabled={!name.trim() || !description.trim() || !rubric.trim() || isSaving || activeCustomCriterionCount >= 20} type="submit">{isSaving ? '저장 중' : '기준 추가'}</Button>{activeCustomCriterionCount >= 20 ? <p className="mt-2 type-caption text-amber-700">활성 커스텀 평가 기준은 최대 20개입니다.</p> : null}</form>
    </div> : null}
    {error ? <p className="type-body text-rose-700" role="alert">{error}</p> : null}
  </PageContainer>
}

function ReportsUnavailableState() {
  return <ErrorState description="현재 빌드에서 리포트 기능이 비활성화되어 있습니다. VITE_API_CAPABILITIES에 reports를 추가해 다시 빌드해 주세요." title="리포트 기능 비활성화" />
}

function ScopeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-checked={active} className={`h-8 rounded-md px-3 type-control font-semibold ${active ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-500'}`} onClick={onClick} role="radio" type="button">{label}</button>
}

function ReportStatusBadge({ status }: { status: ReportGenerationStatus }) {
  const values = { COMPLETED: ['완료', 'success'], FAILED: ['실패', 'danger'], PENDING: ['대기', 'warning'], PROCESSING: ['생성 중', 'warning'] } as const
  return <Badge tone={values[status][1]}>{values[status][0]}</Badge>
}

function Metric({ label, trend, value }: { label: string; trend?: string | null; value: string }) {
  return <article className="rounded-lg border border-stone-200 bg-white px-5 py-4"><p className="type-caption text-stone-500">{label}</p><p className="mt-2 flex items-center gap-2 type-dialog-title font-bold text-stone-950">{trend ? <TrendDirectionIcon trend={trend} /> : null}{value}</p></article>
}

function TrendDirectionIcon({ trend }: { trend: string }) {
  const value = trend.toUpperCase()
  if (value === 'UP' || value === 'IMPROVING') return <ArrowUp className="text-brand-700" size={18} />
  if (value === 'DOWN' || value === 'DECLINING') return <ArrowDown className="text-brand-700" size={18} />
  return <ArrowRight className="text-brand-700" size={18} />
}

function CriterionResultCard({ evidence, result }: { evidence: StudentReport['evidence']; result: ReportCriterionResult }) {
  const isInsufficient = result.status === 'INSUFFICIENT_DATA' || result.score === null
  return <article className="rounded-lg border border-stone-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="type-body font-bold text-stone-900">{getCriterionTitle(result)}</h3><p className="mt-1 type-caption text-stone-500">{getTrendLabel(result.trend)}</p></div>{isInsufficient ? <Badge tone="neutral">데이터 부족</Badge> : <strong className="type-dialog-title text-brand-700">{result.score}점</strong>}</div>{!isInsufficient ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${result.score}%` }} /></div> : null}<p className="mt-3 type-control leading-5 text-stone-600">{result.narrative}</p><EvidenceDetails evidence={evidence} evidenceIds={result.evidenceIds} /></article>
}

function StatementSection({ evidence, items, title }: { evidence: StudentReport['evidence']; items: ReportStatement[]; title: string }) {
  return <section className="rounded-lg border border-stone-200 bg-white p-5"><h2 className="type-section-title font-bold">{title}</h2>{items.length === 0 ? <p className="mt-3 type-body text-stone-400">표시할 내용이 없습니다.</p> : <div className="mt-3 space-y-3">{items.map((item, index) => <div className="border-t border-stone-100 pt-3 first:border-0 first:pt-0" key={`${title}-${index}`}><p className="type-body leading-6 text-stone-700">{item.content}</p><EvidenceDetails evidence={evidence} evidenceIds={item.evidenceIds} /></div>)}</div>}</section>
}

function EvidenceDetails({ evidence, evidenceIds }: { evidence: StudentReport['evidence']; evidenceIds: string[] }) {
  const matches = evidence.filter((item) => evidenceIds.includes(item.evidenceId))
  if (matches.length === 0) return null
  return (
    <details className="mt-3">
      <summary className="cursor-pointer type-caption font-semibold text-brand-700">근거 {matches.length}개</summary>
      <ul className="mt-2 space-y-2">
        {matches.map((item) => (
          <li className="rounded-md bg-stone-50 px-3 py-2 type-caption leading-5 text-stone-600" key={item.evidenceId}>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <strong className="text-stone-800">{item.label}</strong>
              <span className="text-stone-400">{formatDateTime(item.occurredAt)}</span>
            </div>
            {item.metrics?.length ? (
              <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {item.metrics.map((metric, index) => (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-2.5 py-1.5" key={`${metric.label}-${index}`}>
                    <dt className="text-stone-500">{metric.label}</dt>
                    <dd className="font-semibold text-stone-900">{metric.value}</dd>
                  </div>
                ))}
              </dl>
            ) : item.fact ? <p className="mt-1">{item.fact}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

function isReportPending(report: StudentReport): boolean { return report.status === 'PENDING' || report.status === 'PROCESSING' }
function createRequestId(): string { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `report-${Date.now()}` }
function createCriterionKey(name: string): string { return `custom_${name.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, '_').replace(/^_|_$/g, '')}_${Date.now().toString(36)}`.slice(0, 50) }
function getTrendLabel(trend?: string | null): string { if (!trend) return '추세 정보 없음'; const values: Record<string, string> = { DECLINING: '하락', DOWN: '하락', FLAT: '유지', IMPROVING: '상승', STABLE: '유지', UP: '상승' }; return values[trend.toUpperCase()] ?? trend }

const criterionTitles: Record<string, string> = {
  application_transfer: '응용 및 전이력',
  class_participation: '수업 참여도',
  concept_understanding: '개념 이해도',
  error_reflection: '오답 성찰력',
  growth_flow: '성장 흐름',
  growth_trend: '성장 흐름',
  learning_persistence: '학습 지속성',
  problem_solving: '문제 해결력',
  question_specificity: '질문 구체성',
  quiz_exam_accuracy: '퀴즈 및 시험 정확도',
}

function getCriterionTitle(result: ReportCriterionResult): string {
  const normalizedKey = result.criterionKey.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return criterionTitles[normalizedKey] ?? (result.criterionName || result.criterionKey)
}
