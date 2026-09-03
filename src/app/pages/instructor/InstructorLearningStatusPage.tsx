import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  FileText,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createClassroomsRepository,
  rememberClassroomId,
  type Classroom,
  type ClassroomStudent,
  type ClassroomStudentLearningAnalytics,
} from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { cx } from '../../../shared/lib/cx'
import { formatDetailedRelativeActivityDate } from '../../../shared/lib/format'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { useResponsiveViewport } from '../../../shared/responsive'
import { Button, ButtonLink, EmptyState } from '../../../shared/ui'
import { classroomStudentReportsPath } from '../../routes'
import { ClassroomWorkspaceContainer } from '../classroom/ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader } from '../classroom/ClassroomWorkspaceHeader'

export function InstructorLearningStatusPage() {
  usePageTitle('학습 현황')
  const { apiRequest } = useAuth()
  const { classroomId = '' } = useParams()
  const repository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [students, setStudents] = useState<ClassroomStudent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [classrooms, nextStudents] = await Promise.all([
        repository.list(),
        repository.listStudents(classroomId, { sort: 'RECENT_ACTIVITY' }),
      ])
      const nextClassroom = classrooms.find((item) => item.id === classroomId) ?? classrooms[0]
      if (!nextClassroom) throw new Error('강의실 정보를 확인할 수 없습니다.')
      setClassroom(nextClassroom)
      setStudents(nextStudents)
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }, [classroomId, repository])

  useEffect(() => {
    if (classroomId) rememberClassroomId(classroomId)
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [classroomId, load])

  if (isLoading && !classroom) {
    return <ClassroomWorkspaceContainer><p className="py-16 text-center type-body text-stone-500" role="status">학습 현황을 불러오는 중입니다.</p></ClassroomWorkspaceContainer>
  }
  if (error || !classroom) {
    return <ClassroomWorkspaceContainer><EmptyState action={<Button onClick={() => void load()} variant="secondary">다시 시도</Button>} description={error ?? '강의실 학습 정보를 확인할 수 없습니다.'} title="학습 현황을 불러오지 못했습니다" /></ClassroomWorkspaceContainer>
  }

  return (
    <ClassroomWorkspaceContainer>
      <ClassroomWorkspaceHeader activeTab="learning" classroom={classroom} />

      <StudentLearningTable
        classroomId={classroom.id}
        isRefreshing={isLoading}
        onRefresh={() => void load()}
        repository={repository}
        students={students}
      />
    </ClassroomWorkspaceContainer>
  )
}

function StudentLearningTable({
  className,
  classroomId,
  isRefreshing,
  onRefresh,
  repository,
  students,
}: {
  className?: string
  classroomId: string
  isRefreshing: boolean
  onRefresh: () => void
  repository: ReturnType<typeof createClassroomsRepository>
  students: ClassroomStudent[]
}) {
  const { isMobileWeb } = useResponsiveViewport()
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<StudentSort>({ direction: 'desc', key: 'recentActivity' })
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [analyticsByStudentId, setAnalyticsByStudentId] = useState<Record<string, ClassroomStudentLearningAnalytics>>({})
  const [detailErrors, setDetailErrors] = useState<Record<string, string | undefined>>({})
  const [loadingStudentIds, setLoadingStudentIds] = useState<Set<string>>(() => new Set())
  const detailRequestsRef = useRef(new Set<string>())
  const visibleStudents = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ko-KR')
    return students
      .filter((student) => !normalizedQuery
        || student.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery)
        || student.email.toLocaleLowerCase('ko-KR').includes(normalizedQuery))
      .sort((left, right) => compareStudents(
        left,
        right,
        sort,
        analyticsByStudentId,
        classroomId,
      ))
  }, [analyticsByStudentId, classroomId, searchQuery, sort, students])

  function selectSort(key: StudentSortKey) {
    setSort((current) => current.key === key
      ? { direction: current.direction === 'asc' ? 'desc' : 'asc', key }
      : { direction: key === 'name' ? 'asc' : 'desc', key })
  }

  async function loadStudentDetails(studentId: string) {
    const detailKey = `${classroomId}:${studentId}`
    if (detailRequestsRef.current.has(detailKey)) return
    detailRequestsRef.current.add(detailKey)
    setLoadingStudentIds((current) => new Set(current).add(detailKey))
    setDetailErrors((current) => ({ ...current, [detailKey]: undefined }))
    try {
      const analytics = await repository.getStudentLearningAnalytics(
        classroomId,
        studentId,
        'LAST_7_DAYS',
      )
      setAnalyticsByStudentId((current) => ({ ...current, [detailKey]: analytics }))
    } catch (requestError) {
      setDetailErrors((current) => ({
        ...current,
        [detailKey]: getRequestErrorMessage(requestError),
      }))
    } finally {
      detailRequestsRef.current.delete(detailKey)
      setLoadingStudentIds((current) => {
        const next = new Set(current)
        next.delete(detailKey)
        return next
      })
    }
  }

  function toggleStudent(studentId: string) {
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null)
      return
    }
    setExpandedStudentId(studentId)
    if (!analyticsByStudentId[`${classroomId}:${studentId}`]) void loadStudentDetails(studentId)
  }

  return (
    <section aria-label="수강생별 학습 현황" className={cx('flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white', className)}>
      <div className="flex shrink-0 flex-col gap-3 border-b border-stone-100 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="type-body font-bold text-stone-900">수강생별 학습 현황</h2>
          <LearningStatusHelp />
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            aria-label="수강생 목록 새로고침"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 outline-none transition-colors hover:bg-stone-50 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60 mobile-web:size-11"
            disabled={isRefreshing}
            onClick={onRefresh}
            title="수강생 목록 새로고침"
            type="button"
          >
            <RefreshCw aria-hidden="true" className={cx(isRefreshing && 'animate-spin')} size={15} />
          </button>
          <label className="relative block min-w-0 flex-1 sm:w-56 sm:flex-none">
            <span className="sr-only">수강생 검색</span>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" size={14} />
            <input
              aria-label="수강생 검색"
              className="h-9 w-full rounded-lg border border-stone-200 bg-white pr-3 pl-9 type-control text-stone-900 outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 mobile-web:h-11"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="이름 또는 이메일 검색"
              type="search"
              value={searchQuery}
            />
          </label>
        </div>
      </div>
      <div
        aria-label="수강생별 학습 현황 목록"
        className="min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]"
        role="region"
        tabIndex={0}
      >
        <div className="min-w-[920px] mobile-web:min-w-0">
          <div
            aria-label="학습 현황 열 제목"
            className="sticky top-0 z-10 grid min-h-10 grid-cols-[minmax(220px,1fr)_90px_90px_120px_130px_84px_20px] items-center gap-4 border-b border-stone-100 bg-stone-50 px-5 type-caption font-semibold text-stone-500 mobile-web:mobile-horizontal-scroll mobile-web:flex mobile-web:min-h-12 mobile-web:overflow-x-auto mobile-web:px-3"
          >
            <StudentSortHeader activeSort={sort} className="pl-11" label="이름" onSelect={selectSort} sortKey="name" />
            <StudentSortHeader activeSort={sort} className="justify-self-center" label="진도" onSelect={selectSort} sortKey="progress" />
            <StudentSortHeader activeSort={sort} className="justify-self-center" label="질문" onSelect={selectSort} sortKey="question" />
            <StudentSortHeader activeSort={sort} className="justify-self-center" label="퀴즈" onSelect={selectSort} sortKey="quiz" />
            <StudentSortHeader activeSort={sort} label="최근 학습" onSelect={selectSort} sortKey="recentActivity" />
            <span className="text-center mobile-web:hidden">리포트</span>
            <span aria-hidden="true" />
          </div>
          <div>
            {visibleStudents.length === 0 ? (
              <div className="flex min-h-40 items-center justify-center type-body text-stone-400">
                {students.length === 0 ? '표시할 수강생이 없습니다.' : '검색 결과가 없습니다.'}
              </div>
            ) : visibleStudents.map((student) => {
            const isExpanded = expandedStudentId === student.id
            const detailId = `student-learning-detail-${student.id}`
            const detailKey = `${classroomId}:${student.id}`
            const analytics = analyticsByStudentId[detailKey]
            return <article aria-label={`${student.name} 학습 현황`} className="overflow-hidden border-b border-stone-100 bg-white last:border-b-0" key={student.id}>
              <div className="group grid min-h-16 w-full grid-cols-[minmax(220px,1fr)_90px_90px_120px_130px_84px_20px] items-center gap-4 px-5 transition-colors hover:bg-stone-50 mobile-web:grid-cols-[minmax(0,1fr)_auto_auto_auto] mobile-web:gap-3 mobile-web:px-3 mobile-web:py-3">
                <button
                  aria-controls={detailId}
                  aria-expanded={isExpanded}
                  aria-label={`${student.name} 프로필 상세 ${isExpanded ? '접기' : '펼치기'}`}
                  className="col-span-5 grid min-h-16 grid-cols-subgrid items-center text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-brand-500 mobile-web:col-span-2 mobile-web:min-h-11"
                  onClick={() => toggleStudent(student.id)}
                  type="button"
                >
                <span className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 type-caption font-bold text-brand-700">{getInitial(student.name)}</span>
                  <span className="min-w-0"><strong className="block truncate type-control text-stone-900 group-hover:text-brand-700">{student.name}</strong><span className="block truncate type-caption text-stone-400">{student.email}</span>{isMobileWeb ? <span className="mt-2 grid grid-cols-3 gap-2"><StudentSummaryMetric label="진도" value={`${Math.round(student.averageProgressRate ?? 0)}%`} /><StudentSummaryMetric label="질문" value={`${getStudentQuestionCount(student, analytics)}건`} /><StudentQuizSummary analytics={analytics} student={student} /></span> : null}</span>
                </span>
                {!isMobileWeb ? <span className="contents"><StudentSummaryMetric label="진도" value={`${Math.round(student.averageProgressRate ?? 0)}%`} /><StudentSummaryMetric label="질문" value={`${getStudentQuestionCount(student, analytics)}건`} /><StudentQuizSummary analytics={analytics} student={student} /></span> : null}
                <StudentSummaryMetric label="최근 학습" value={formatDetailedRelativeActivityDate(student.lastActiveAt)} />
                </button>
                <ButtonLink
                  aria-label={`${student.name} 리포트 보기`}
                  className="relative z-[1] w-full px-2 mobile-web:w-auto"
                  size="sm"
                  to={classroomStudentReportsPath(classroomId, student.id)}
                  variant="secondary"
                >
                  <FileText aria-hidden="true" size={13} />
                  <span className="mobile-web:sr-only">리포트</span>
                </ButtonLink>
                <button
                  aria-controls={detailId}
                  aria-expanded={isExpanded}
                  aria-label={`${student.name} 상세 ${isExpanded ? '접기' : '펼치기'}`}
                  className="flex size-8 items-center justify-center rounded-md outline-none hover:bg-stone-100 focus-visible:ring-2 focus-visible:ring-brand-500 mobile-web:size-11"
                  onClick={() => toggleStudent(student.id)}
                  type="button"
                >
                <ChevronDown aria-hidden="true" className={cx('shrink-0 text-stone-400 transition-transform', isExpanded && 'rotate-180 text-brand-700')} size={15} />
                </button>
              </div>
              {isExpanded ? <StudentLearningDetails
                analytics={analytics}
                detailId={detailId}
                error={detailErrors[detailKey]}
                isLoading={loadingStudentIds.has(detailKey)}
                onRetry={() => void loadStudentDetails(student.id)}
                student={student}
              /> : null}
            </article>
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function StudentLearningDetails({
  analytics,
  detailId,
  error,
  isLoading,
  onRetry,
  student,
}: {
  analytics?: ClassroomStudentLearningAnalytics
  detailId: string
  error?: string
  isLoading: boolean
  onRetry: () => void
  student: ClassroomStudent
}) {
  if (isLoading && !analytics) {
    return (
      <section aria-label={`${student.name} 상세 학습 현황`} className="flex min-h-40 items-center justify-center gap-2 border-t border-stone-100 bg-stone-50/80 type-control text-stone-500" id={detailId}>
        <LoaderCircle aria-hidden="true" className="animate-spin text-brand-600" size={16} />
        상세 학습 현황을 불러오는 중입니다.
      </section>
    )
  }

  if (error && !analytics) {
    return (
      <section aria-label={`${student.name} 상세 학습 현황`} className="flex min-h-40 flex-col items-center justify-center gap-3 border-t border-stone-100 bg-stone-50/80 px-4 text-center" id={detailId}>
        <p className="type-control text-rose-700">{error}</p>
        <Button onClick={onRetry} size="sm" variant="secondary">다시 시도</Button>
      </section>
    )
  }

  if (!analytics) return null
  const questionsByMaterial = aggregateQuestionsByMaterial(analytics.questionsByPage)
  const maxQuestionCount = Math.max(...questionsByMaterial.map((item) => item.questionCount), 1)
  const quizGroups = groupQuizzesByMaterial(analytics.quizzes)

  return (
    <section aria-label={`${student.name} 상세 학습 현황`} className="border-t border-stone-100 bg-white" id={detailId}>
      <div className="grid divide-y divide-stone-100 xl:grid-cols-[1.15fr_1fr_1fr] xl:divide-x xl:divide-y-0">
        <StudentDetailSection title="자료별 학습 현황">
          {analytics.materials.length === 0 ? (
            <DetailEmptyState>표시할 학습 자료가 없습니다.</DetailEmptyState>
          ) : (
            <div className="mt-3 space-y-2.5">
              {analytics.materials.map((material) => (
                <div className="grid grid-cols-[minmax(0,1fr)_64px_36px] items-center gap-3" key={material.id}>
                  <strong className="truncate type-caption font-semibold text-stone-800" title={material.title}>{material.title}</strong>
                  <div aria-label={`${material.title} 진도 ${material.progressRate}%`} className="h-1 overflow-hidden rounded-full bg-stone-100">
                    <span className="block h-full rounded-full bg-brand-700" style={{ width: `${Math.min(100, Math.max(0, material.progressRate))}%` }} />
                  </div>
                  <strong className="text-right type-caption text-stone-900">{material.progressRate}%</strong>
                </div>
              ))}
            </div>
          )}
        </StudentDetailSection>

        <StudentDetailSection title="페이지별 질문 수">
          {questionsByMaterial.length === 0 ? (
            <DetailEmptyState>최근 7일 동안 작성한 질문이 없습니다.</DetailEmptyState>
          ) : (
            <div className="mt-3 space-y-2.5">
              {questionsByMaterial.map((question) => (
                <div className="grid grid-cols-[minmax(0,1fr)_64px_32px] items-center gap-3" key={question.materialId}>
                  <span className="truncate type-caption font-semibold text-stone-800" title={question.materialTitle}>{question.materialTitle}</span>
                  <div className="h-1 overflow-hidden rounded-full bg-stone-100">
                    <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(question.questionCount / maxQuestionCount) * 100}%` }} />
                  </div>
                  <strong className="text-right type-caption text-stone-900">{question.questionCount}건</strong>
                </div>
              ))}
            </div>
          )}
        </StudentDetailSection>

        <StudentDetailSection title="퀴즈 현황">
          {analytics.quizzes.length === 0 ? (
            <DetailEmptyState>표시할 퀴즈가 없습니다.</DetailEmptyState>
          ) : (
            <div className="mt-3 space-y-3">
              {quizGroups.map((group) => (
                <div key={group.materialId}>
                  <p className="mb-1.5 truncate type-caption text-stone-400" title={group.materialTitle}>{group.materialTitle}</p>
                  <div className="space-y-1.5">
                    {group.quizzes.map((quiz) => (
                      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3" key={quiz.id}>
                        <strong className="truncate type-caption font-semibold text-stone-800" title={quiz.title}>{quiz.title}</strong>
                        <span className="type-caption font-semibold text-stone-900">
                          {quiz.submitted && quiz.score !== null && quiz.maxScore !== null ? `${quiz.score}/${quiz.maxScore}` : '-'}
                        </span>
                        <QuizStatus quiz={quiz} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </StudentDetailSection>
      </div>
    </section>
  )
}

function StudentSummaryMetric({ label, value }: { label: string; value: string }) {
  return <strong aria-label={`${label} ${value}`} className="whitespace-nowrap text-center type-caption text-stone-900">{value}</strong>
}

function StudentQuizSummary({
  analytics,
  student,
}: {
  analytics?: ClassroomStudentLearningAnalytics
  student: ClassroomStudent
}) {
  const quizCount = getStudentQuizCount(student, analytics)
  return <StudentSummaryMetric label="퀴즈" value={quizCount === undefined ? '-' : `${quizCount}건`} />
}

function StudentDetailSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <article className="min-w-0 px-6 py-5"><h3 className="type-control font-bold text-stone-900">{title}</h3>{children}</article>
}

function aggregateQuestionsByMaterial(questions: ClassroomStudentLearningAnalytics['questionsByPage']) {
  const aggregated = new Map<string, { materialId: string; materialTitle: string; questionCount: number }>()
  questions.forEach((question) => {
    const current = aggregated.get(question.materialId)
    aggregated.set(question.materialId, {
      materialId: question.materialId,
      materialTitle: question.materialTitle,
      questionCount: (current?.questionCount ?? 0) + question.questionCount,
    })
  })
  return [...aggregated.values()]
}

function groupQuizzesByMaterial(quizzes: ClassroomStudentLearningAnalytics['quizzes']) {
  const groups = new Map<string, {
    materialId: string
    materialTitle: string
    quizzes: ClassroomStudentLearningAnalytics['quizzes']
  }>()
  quizzes.forEach((quiz) => {
    const current = groups.get(quiz.materialId)
    if (current) {
      current.quizzes.push(quiz)
      return
    }
    groups.set(quiz.materialId, {
      materialId: quiz.materialId,
      materialTitle: quiz.materialTitle,
      quizzes: [quiz],
    })
  })
  return [...groups.values()]
}

function getStudentQuestionCount(student: ClassroomStudent, analytics?: ClassroomStudentLearningAnalytics): number {
  if (analytics) return analytics.questionsByPage.reduce((sum, question) => sum + question.questionCount, 0)
  return student.aiQuestionCountLast7Days
}

function DetailEmptyState({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-md bg-stone-50 px-3 py-6 text-center type-caption text-stone-400">{children}</p>
}

function QuizStatus({ quiz }: { quiz: ClassroomStudentLearningAnalytics['quizzes'][number] }) {
  const label = !quiz.submitted
    ? '미응시'
    : quiz.passed === true
      ? '통과'
      : quiz.passed === false
        ? '복습 필요'
        : '결과 대기'
  const className = !quiz.submitted || quiz.passed === null
    ? 'text-stone-400'
    : quiz.passed
      ? 'text-emerald-700'
      : 'text-amber-700'
  return <span className={cx('min-w-14 shrink-0 whitespace-nowrap text-right type-caption font-semibold', className)}>{label}</span>
}

type StudentSortKey = 'name' | 'progress' | 'question' | 'quiz' | 'recentActivity'
type StudentSortDirection = 'asc' | 'desc'
type StudentSort = { direction: StudentSortDirection; key: StudentSortKey }

function StudentSortHeader({
  activeSort,
  className,
  label,
  onSelect,
  sortKey,
}: {
  activeSort: StudentSort
  className?: string
  label: string
  onSelect: (key: StudentSortKey) => void
  sortKey: StudentSortKey
}) {
  const isActive = activeSort.key === sortKey
  const nextDirection = isActive
    ? activeSort.direction === 'asc' ? '내림차순' : '오름차순'
    : sortKey === 'name' ? '오름차순' : '내림차순'
  const SortIcon = !isActive
    ? ArrowUpDown
    : activeSort.direction === 'asc'
      ? ArrowUp
      : ArrowDown

  return (
    <button
      aria-label={`${label} ${nextDirection} 정렬`}
      aria-pressed={isActive}
      className={cx(
        'inline-flex min-h-8 w-fit shrink-0 items-center gap-1 text-left type-caption font-semibold text-stone-500 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 mobile-web:min-h-11 mobile-web:rounded-lg mobile-web:border mobile-web:border-stone-200 mobile-web:bg-white mobile-web:px-3',
        isActive && 'text-brand-700',
        className,
      )}
      onClick={() => onSelect(sortKey)}
      type="button"
    >
      <span>{label}</span>
      <SortIcon aria-hidden="true" className="shrink-0" size={12} />
    </button>
  )
}

function LearningStatusHelp() {
  return (
    <span className="group relative inline-flex shrink-0 items-center">
      <button
        aria-label="수강생별 학습 현황 안내"
        className="flex size-6 cursor-help items-center justify-center rounded-full text-stone-400 outline-none hover:bg-stone-100 hover:text-stone-700 focus-visible:ring-2 focus-visible:ring-brand-500"
        type="button"
      >
        <Info aria-hidden="true" size={14} />
      </button>
      <span
        className="pointer-events-none absolute top-[calc(100%+7px)] left-0 z-30 w-72 rounded-md bg-stone-900 px-3 py-2 type-micro leading-5 font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        role="tooltip"
      >
        학습자 프로필을 누르면 자료별 학습·페이지별 질문·퀴즈 현황이 펼쳐집니다. 상세 지표는 학습자별 집계를 기준으로 표시됩니다.
      </span>
    </span>
  )
}

function compareStudents(
  left: ClassroomStudent,
  right: ClassroomStudent,
  sort: StudentSort,
  analyticsByStudentId: Record<string, ClassroomStudentLearningAnalytics>,
  classroomId: string,
): number {
  let comparison: number
  if (sort.key === 'name') {
    comparison = left.name.localeCompare(right.name, 'ko-KR')
  } else if (sort.key === 'recentActivity') {
    comparison = getActivityTime(left) - getActivityTime(right)
  } else {
    const leftValue = getStudentSortValue(left, sort.key, analyticsByStudentId[`${classroomId}:${left.id}`])
    const rightValue = getStudentSortValue(right, sort.key, analyticsByStudentId[`${classroomId}:${right.id}`])
    if (leftValue === undefined || rightValue === undefined) {
      if (leftValue === rightValue) return left.name.localeCompare(right.name, 'ko-KR')
      return leftValue === undefined ? 1 : -1
    }
    comparison = leftValue - rightValue
  }

  if (comparison === 0) comparison = left.name.localeCompare(right.name, 'ko-KR')
  return sort.direction === 'asc' ? comparison : -comparison
}

function getStudentSortValue(
  student: ClassroomStudent,
  key: Exclude<StudentSortKey, 'name' | 'recentActivity'>,
  analytics?: ClassroomStudentLearningAnalytics,
): number | undefined {
  if (key === 'progress') return student.averageProgressRate ?? 0
  if (key === 'question') return getStudentQuestionCount(student, analytics)
  return getStudentQuizCount(student, analytics)
}

function getStudentQuizCount(
  student: ClassroomStudent,
  analytics?: ClassroomStudentLearningAnalytics,
): number | undefined {
  if (student.quizSubmissionCount !== undefined) return student.quizSubmissionCount
  if (analytics) return analytics.quizzes.filter((quiz) => quiz.submitted).length
  return undefined
}

function getActivityTime(student: ClassroomStudent): number {
  return new Date(student.lastActiveAt ?? student.joinedAt).getTime()
}

function getInitial(name: string): string {
  return name.trim().slice(0, 1) || '?'
}
