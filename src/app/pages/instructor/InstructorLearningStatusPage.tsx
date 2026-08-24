import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  FileQuestion,
  FileText,
  Search,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createClassroomsRepository,
  rememberClassroomId,
  type Classroom,
  type ClassroomAnalytics,
  type ClassroomStudent,
} from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { cx } from '../../../shared/lib/cx'
import { formatRelativeActivityDate } from '../../../shared/lib/format'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
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
  const [analytics, setAnalytics] = useState<ClassroomAnalytics | null>(null)
  const [students, setStudents] = useState<ClassroomStudent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [classrooms, nextAnalytics, nextStudents] = await Promise.all([
        repository.list(),
        repository.getAnalytics(classroomId),
        repository.listStudents(classroomId, { sort: 'RECENT_ACTIVITY' }),
      ])
      const nextClassroom = classrooms.find((item) => item.id === classroomId) ?? classrooms[0]
      if (!nextClassroom) throw new Error('강의실 정보를 확인할 수 없습니다.')
      setClassroom(nextClassroom)
      setAnalytics(nextAnalytics)
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

      <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(260px,0.9fr)_minmax(240px,0.75fr)_minmax(680px,1.35fr)] 2xl:grid-rows-[minmax(0,1fr)]">
        <MaterialAnalyticsPanel analytics={analytics} />
        <QuestionAnalyticsPanel analytics={analytics} />
        <StudentLearningTable className="lg:col-span-2 2xl:col-span-1" classroomId={classroom.id} students={students} />
      </section>
    </ClassroomWorkspaceContainer>
  )
}

function MaterialAnalyticsPanel({ analytics, className }: { analytics: ClassroomAnalytics | null; className?: string }) {
  if (!analytics || analytics.materials.length === 0) {
    return <EmptyAnalyticsPanel className={className} description="자료 열람이 시작되면 조회율과 평균 진도가 표시됩니다." icon={BarChart3} title="자료별 학습 현황" />
  }

  return (
    <article className={cx('flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white', className)}>
      <div className="shrink-0 border-b border-stone-100 px-5 py-4"><h2 className="type-body font-bold text-stone-900">자료별 학습 현황</h2></div>
      <div className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto overscroll-contain">
        {analytics.materials.map((material) => (
          <div className="px-5 py-3.5" key={material.id}>
            <div className="mb-2 flex items-center justify-between gap-4">
              <strong className="min-w-0 truncate type-control text-stone-900">{material.title}</strong>
              <span className="shrink-0 type-caption text-stone-500">조회율 {material.viewRate}% · 평균 진도 {material.averageProgressRate}%</span>
            </div>
            <div aria-label={`${material.title} 평균 진도 ${material.averageProgressRate}%`} className="h-1.5 overflow-hidden rounded-full bg-stone-100">
              <span className="block h-full rounded-full bg-brand-600" style={{ width: `${clampPercentage(material.averageProgressRate)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

function QuestionAnalyticsPanel({ analytics, className }: { analytics: ClassroomAnalytics | null; className?: string }) {
  const questions = [...(analytics?.questionsByPage ?? [])]
    .sort((left, right) => right.questionCount - left.questionCount)
    .slice(0, 6)

  if (questions.length === 0) {
    return <EmptyAnalyticsPanel className={className} description="학습자가 질문한 횟수를 관련 페이지별로 표시합니다." icon={FileQuestion} title="페이지별 질문 수" />
  }

  const maximum = Math.max(...questions.map((item) => item.questionCount), 1)
  return (
    <article className={cx('flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white', className)}>
      <div className="shrink-0 border-b border-stone-100 px-5 py-4"><h2 className="type-body font-bold text-stone-900">페이지별 질문 수</h2></div>
      <div className="min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto overscroll-contain">
        {questions.map((item) => (
          <div className="px-5 py-3.5" key={`${item.materialId}-${item.pageNumber}`}>
            <div className="mb-2 flex items-center justify-between gap-4">
              <strong className="type-control text-stone-900">p.{item.pageNumber}</strong>
              <span className="shrink-0 type-caption text-stone-500">질문 {item.questionCount}건</span>
            </div>
            <div aria-label={`${item.pageNumber}쪽 질문 ${item.questionCount}건`} className="h-1.5 overflow-hidden rounded-full bg-stone-100">
              <span className="block h-full rounded-full bg-brand-600" style={{ width: `${item.questionCount / maximum * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}

function StudentLearningTable({ classroomId, className, students }: { classroomId: string; className?: string; students: ClassroomStudent[] }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<StudentSort>({ direction: 'desc', key: 'recentActivity' })
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

  return (
    <section aria-label="수강생별 학습 현황" className={cx('flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white', className)}>
      <div className="flex shrink-0 flex-col gap-3 border-b border-stone-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="type-body font-bold text-stone-900">수강생별 학습 현황</h2>
          <span className="type-caption text-stone-400">{visibleStudents.length}명</span>
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
        <div className="min-w-[680px]">
          <div className="sticky top-0 z-10 grid min-h-10 grid-cols-[minmax(160px,1.2fr)_minmax(140px,1fr)_110px_100px_86px] items-center gap-3 border-b border-stone-100 bg-stone-50 px-5 type-caption font-semibold text-stone-500">
            <StudentSortHeader activeSort={sort} label="이름" onSelect={selectSort} sortKey="name" />
            <StudentSortHeader activeSort={sort} label="평균 진도율" onSelect={selectSort} sortKey="progress" />
            <StudentSortHeader activeSort={sort} label="최근 7일 AI 질문" onSelect={selectSort} sortKey="questions" />
            <StudentSortHeader activeSort={sort} label="최근 학습" onSelect={selectSort} sortKey="recentActivity" />
            <span className="text-center">리포트</span>
          </div>
          {visibleStudents.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center type-body text-stone-400">
              {students.length === 0 ? '표시할 수강생이 없습니다.' : '검색 결과가 없습니다.'}
            </div>
          ) : visibleStudents.map((student) => (
            <article className="grid min-h-14 grid-cols-[minmax(160px,1.2fr)_minmax(140px,1fr)_110px_100px_86px] items-center gap-3 border-b border-stone-100 px-5 last:border-0" key={student.id}>
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 type-caption font-bold text-brand-700">{getInitial(student.name)}</span>
                <div className="min-w-0"><strong className="block truncate type-control text-stone-900">{student.name}</strong><span className="block truncate type-caption text-stone-400">{student.email}</span></div>
              </div>
              <StudentProgress value={student.averageProgressRate} />
              <span className="type-control text-stone-600">{student.aiQuestionCountLast7Days}건</span>
              <span className="type-control text-stone-600">{formatRelativeActivityDate(student.lastActiveAt)}</span>
              <ButtonLink aria-label={`${student.name} 리포트`} size="sm" to={classroomStudentReportsPath(classroomId, student.id)} variant="secondary"><FileText aria-hidden="true" size={14} />리포트</ButtonLink>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

type StudentSortKey = 'name' | 'progress' | 'questions' | 'recentActivity'
type StudentSortDirection = 'asc' | 'desc'
type StudentSort = { direction: StudentSortDirection; key: StudentSortKey }

function StudentSortHeader({
  activeSort,
  label,
  onSelect,
  sortKey,
}: {
  activeSort: StudentSort
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
      )}
      onClick={() => onSelect(sortKey)}
      type="button"
    >
      <span>{label}</span>
      <SortIcon aria-hidden="true" className="shrink-0" size={12} />
    </button>
  )
}

function compareStudents(left: ClassroomStudent, right: ClassroomStudent, sort: StudentSort): number {
  let comparison: number
  if (sort.key === 'name') {
    comparison = left.name.localeCompare(right.name, 'ko-KR')
  } else if (sort.key === 'progress') {
    if (left.averageProgressRate === undefined && right.averageProgressRate !== undefined) return 1
    if (left.averageProgressRate !== undefined && right.averageProgressRate === undefined) return -1
    comparison = (left.averageProgressRate ?? 0) - (right.averageProgressRate ?? 0)
  } else if (sort.key === 'questions') {
    comparison = left.aiQuestionCountLast7Days - right.aiQuestionCountLast7Days
  } else {
    comparison = getActivityTime(left) - getActivityTime(right)
  }

  if (comparison === 0) comparison = left.name.localeCompare(right.name, 'ko-KR')
  return sort.direction === 'asc' ? comparison : -comparison
}

function StudentProgress({ value }: { value?: number }) {
  if (value === undefined) return <span className="type-control text-stone-400">-</span>
  return <div className="flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${clampPercentage(value)}%` }} /></div><strong className="w-9 text-right type-caption text-stone-700">{value}%</strong></div>
}

function EmptyAnalyticsPanel({ className, description, icon: Icon, title }: { className?: string; description: string; icon: typeof Users; title: string }) {
  return (
    <article className={cx('flex h-full min-h-64 flex-col rounded-lg border border-stone-200 bg-white', className)}>
      <div className="border-b border-stone-100 px-5 py-4"><h2 className="type-body font-bold text-stone-900">{title}</h2></div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg bg-stone-100 text-stone-400"><Icon aria-hidden="true" size={19} /></span>
        <p className="mt-3 type-body font-semibold text-stone-800">표시할 학습 데이터가 없습니다</p>
        <p className="mt-1 type-caption leading-5 text-stone-400">{description}</p>
      </div>
    </article>
  )
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function getActivityTime(student: ClassroomStudent): number {
  return new Date(student.lastActiveAt ?? student.joinedAt).getTime()
}

function getInitial(name: string): string {
  return name.trim().slice(0, 1) || '?'
}
