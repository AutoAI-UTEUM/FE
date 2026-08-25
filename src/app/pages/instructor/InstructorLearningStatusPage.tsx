import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  ClipboardCheck,
  FileQuestion,
  Info,
  LoaderCircle,
  Search,
  Users,
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
import { formatDetailedRelativeActivityDate, formatRelativeActivityDate } from '../../../shared/lib/format'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { Button, EmptyState } from '../../../shared/ui'
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

      <StudentLearningTable classroomId={classroom.id} repository={repository} students={students} />
    </ClassroomWorkspaceContainer>
  )
}

function StudentLearningTable({
  className,
  classroomId,
  repository,
  students,
}: {
  className?: string
  classroomId: string
  repository: ReturnType<typeof createClassroomsRepository>
  students: ClassroomStudent[]
}) {
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
      .sort((left, right) => compareStudents(left, right, sort))
  }, [searchQuery, sort, students])

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
      <div className="flex shrink-0 flex-col gap-3 border-b border-stone-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="type-body font-bold text-stone-900">수강생별 학습 현황</h2>
          <LearningStatusHelp />
        </div>
        <label className="relative block w-full sm:w-56">
          <span className="sr-only">수강생 검색</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" size={14} />
          <input
            aria-label="수강생 검색"
            className="h-9 w-full rounded-lg border border-stone-200 bg-white pr-3 pl-9 type-control text-stone-900 outline-none placeholder:text-stone-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="이름 또는 이메일 검색"
            type="search"
            value={searchQuery}
          />
        </label>
      </div>
      <div
        aria-label="수강생별 학습 현황 목록"
        className="min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-gutter:stable]"
        role="region"
        tabIndex={0}
      >
        <div className="min-w-[460px]">
          <div className="sticky top-0 z-10 grid min-h-10 grid-cols-[minmax(260px,1fr)_140px] items-center gap-3 border-b border-stone-100 bg-stone-50 px-5 type-caption font-semibold text-stone-500">
            <StudentSortHeader activeSort={sort} className="pl-11" label="이름" onSelect={selectSort} sortKey="name" />
            <StudentSortHeader activeSort={sort} className="justify-center" label="최근 학습" onSelect={selectSort} sortKey="recentActivity" />
          </div>
          {visibleStudents.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center type-body text-stone-400">
              {students.length === 0 ? '표시할 수강생이 없습니다.' : '검색 결과가 없습니다.'}
            </div>
          ) : visibleStudents.map((student) => {
            const isExpanded = expandedStudentId === student.id
            const detailId = `student-learning-detail-${student.id}`
            const detailKey = `${classroomId}:${student.id}`
            return <article aria-label={`${student.name} 학습 현황`} className="border-b border-stone-100 last:border-0" key={student.id}>
              <div className="grid min-h-16 grid-cols-[minmax(260px,1fr)_140px] items-center gap-3 px-5">
                <button
                  aria-controls={detailId}
                  aria-expanded={isExpanded}
                  aria-label={`${student.name} 프로필 상세 ${isExpanded ? '접기' : '펼치기'}`}
                  className="group flex min-w-0 items-center gap-3 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  onClick={() => toggleStudent(student.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 type-caption font-bold text-brand-700">{getInitial(student.name)}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate type-control text-stone-900 group-hover:text-brand-700">{student.name}</strong><span className="block truncate type-caption text-stone-400">{student.email}</span></span>
                  <ChevronDown aria-hidden="true" className={cx('shrink-0 text-stone-400 transition-transform', isExpanded && 'rotate-180 text-brand-700')} size={15} />
                </button>
                <span className="text-center type-control text-stone-600">{formatDetailedRelativeActivityDate(student.lastActiveAt)}</span>
              </div>
              {isExpanded ? <StudentLearningDetails
                analytics={analyticsByStudentId[detailKey]}
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
  const maxQuestionCount = Math.max(...analytics.questionsByPage.map((item) => item.questionCount), 1)

  return (
    <section aria-label={`${student.name} 상세 학습 현황`} className="border-t border-stone-100 bg-stone-50/80 p-4" id={detailId}>
      <div className="grid gap-3 xl:grid-cols-3">
        <StudentDetailCard icon={BarChart3} title="자료별 학습 현황">
          {analytics.materials.length === 0 ? (
            <DetailEmptyState>표시할 학습 자료가 없습니다.</DetailEmptyState>
          ) : (
            <div className="mt-3 space-y-3">
              {analytics.materials.map((material) => (
                <div className="rounded-md border border-stone-100 bg-stone-50 px-3 py-2.5" key={material.id}>
                  <div className="flex min-w-0 items-center gap-2">
                    <strong className="min-w-0 flex-1 truncate type-control text-stone-900" title={material.title}>{material.title}</strong>
                    {material.weekNumber ? <span className="shrink-0 type-micro text-stone-400">{material.weekNumber}주차</span> : null}
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 type-micro font-semibold', material.viewed ? 'bg-brand-50 text-brand-700' : 'bg-stone-100 text-stone-500')}>
                      {material.viewed ? `${material.progressRate}%` : '미열람'}
                    </span>
                  </div>
                  <div aria-label={`${material.title} 진도 ${material.progressRate}%`} className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
                    <span className="block h-full rounded-full bg-brand-700" style={{ width: `${Math.min(100, Math.max(0, material.progressRate))}%` }} />
                  </div>
                  <p className="mt-2 type-micro text-stone-400">
                    {material.viewed
                      ? `마지막 학습 ${material.lastViewedPage ?? '-'}페이지 · ${formatRelativeActivityDate(material.lastViewedAt ?? undefined)}`
                      : '아직 열람하지 않은 자료입니다.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </StudentDetailCard>

        <StudentDetailCard icon={FileQuestion} title="페이지별 질문 수">
          {analytics.questionsByPage.length === 0 ? (
            <DetailEmptyState>최근 7일 동안 작성한 질문이 없습니다.</DetailEmptyState>
          ) : (
            <div className="mt-3 space-y-2.5">
              {analytics.questionsByPage.map((question) => {
                return (
                  <div key={`${question.materialId}-${question.pageNumber}`}>
                    <div className="flex min-w-0 items-center gap-2 type-micro">
                      <span className="min-w-0 flex-1 truncate font-semibold text-stone-700" title={question.materialTitle}>{question.materialTitle}</span>
                      <span className="shrink-0 text-stone-400">{question.weekNumber ? `${question.weekNumber}주차 · ` : ''}{question.pageNumber}페이지</span>
                      <strong className="w-8 shrink-0 text-right text-brand-700">{question.questionCount}건</strong>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(question.questionCount / maxQuestionCount) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </StudentDetailCard>

        <StudentDetailCard icon={ClipboardCheck} title="퀴즈 현황">
          {analytics.quizzes.length === 0 ? (
            <DetailEmptyState>표시할 퀴즈가 없습니다.</DetailEmptyState>
          ) : (
            <div className="mt-3 space-y-2.5">
              {analytics.quizzes.map((quiz) => (
                <div className="rounded-md border border-stone-100 bg-stone-50 px-3 py-2.5" key={quiz.id}>
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate type-control text-stone-900" title={quiz.title}>{quiz.title}</strong>
                      <p className="mt-0.5 truncate type-micro text-stone-400">{quiz.materialTitle}{quiz.pageNumber ? ` · ${quiz.pageNumber}페이지` : ''}</p>
                    </div>
                    <QuizStatus quiz={quiz} />
                  </div>
                  <p className="mt-2 type-micro font-semibold text-stone-600">
                    {!quiz.submitted
                      ? '아직 응시하지 않았습니다.'
                      : quiz.score !== null && quiz.maxScore !== null
                        ? `${quiz.score} / ${quiz.maxScore}점`
                        : '제출 완료 · 채점 정보 없음'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </StudentDetailCard>
      </div>
      <p className="mt-3 text-right type-micro text-stone-400">최근 업데이트 {formatRelativeActivityDate(analytics.lastUpdatedAt)}</p>
    </section>
  )
}

function StudentDetailCard({ children, icon: Icon, title }: { children: React.ReactNode; icon: typeof Users; title: string }) {
  return <article className="min-w-0 rounded-lg border border-stone-200 bg-white p-4"><div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon aria-hidden="true" size={15} /></span><h3 className="type-control font-bold text-stone-900">{title}</h3></div>{children}</article>
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
    ? 'bg-stone-100 text-stone-500'
    : quiz.passed
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-amber-50 text-amber-700'
  return <span className={cx('shrink-0 rounded-full px-2 py-1 type-micro font-semibold', className)}>{label}</span>
}

type StudentSortKey = 'name' | 'recentActivity'
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
        'flex min-h-8 items-center gap-1 rounded-md text-left hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
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

function compareStudents(left: ClassroomStudent, right: ClassroomStudent, sort: StudentSort): number {
  let comparison: number
  if (sort.key === 'name') {
    comparison = left.name.localeCompare(right.name, 'ko-KR')
  } else {
    comparison = getActivityTime(left) - getActivityTime(right)
  }

  if (comparison === 0) comparison = left.name.localeCompare(right.name, 'ko-KR')
  return sort.direction === 'asc' ? comparison : -comparison
}

function getActivityTime(student: ClassroomStudent): number {
  return new Date(student.lastActiveAt ?? student.joinedAt).getTime()
}

function getInitial(name: string): string {
  return name.trim().slice(0, 1) || '?'
}
