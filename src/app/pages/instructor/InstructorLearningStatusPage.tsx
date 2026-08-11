import { BarChart3, FileQuestion, Users } from 'lucide-react'
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
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { Button, ButtonLink, EmptyState } from '../../../shared/ui'
import { classroomStudentReportsPath } from '../../routes'
import { ClassroomWorkspaceContainer } from '../classroom/ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader } from '../classroom/ClassroomWorkspaceHeader'

export function InstructorLearningStatusPage() {
  usePageTitle('학습 현황·리포트')
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

  const summaryItems = [
    { label: '수강생', tone: 'text-stone-950', value: `${analytics?.learnerCount ?? classroom.learnerCount}명` },
    { label: '평균 진도율', tone: 'text-brand-600', value: `${analytics?.averageProgressRate ?? 0}%` },
    { label: '최근 7일 AI 질문', tone: 'text-stone-950', value: `${analytics?.aiQuestionCountLast7Days ?? 0}건` },
    { label: '7일 미활동', tone: 'text-rose-600', value: `${analytics?.inactiveLearnerCountLast7Days ?? 0}명` },
  ]

  return (
    <ClassroomWorkspaceContainer>
      <ClassroomWorkspaceHeader activeTab="learning" classroom={classroom} />

      <section aria-label="학습 현황 요약" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => (
          <article className="min-h-28 rounded-lg border border-stone-200 bg-white px-5 py-4" key={item.label}>
            <p className="type-caption font-semibold text-stone-500">{item.label}</p>
            <p className={`mt-2 type-display font-bold ${item.tone}`}>{item.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <MaterialAnalyticsPanel analytics={analytics} />
        <QuestionAnalyticsPanel analytics={analytics} />
      </section>

      <StudentLearningTable classroomId={classroom.id} students={students} />
    </ClassroomWorkspaceContainer>
  )
}

function MaterialAnalyticsPanel({ analytics }: { analytics: ClassroomAnalytics | null }) {
  if (!analytics || analytics.materials.length === 0) {
    return <EmptyAnalyticsPanel description="자료 열람이 시작되면 조회율과 평균 진도가 표시됩니다." icon={BarChart3} title="자료별 학습 현황" />
  }

  return (
    <article className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-5 py-4"><h2 className="type-body font-bold text-stone-900">자료별 학습 현황</h2></div>
      <div className="divide-y divide-stone-100">
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

function QuestionAnalyticsPanel({ analytics }: { analytics: ClassroomAnalytics | null }) {
  const questions = [...(analytics?.questionsByPage ?? [])]
    .sort((left, right) => right.questionCount - left.questionCount)
    .slice(0, 6)

  if (questions.length === 0) {
    return <EmptyAnalyticsPanel description="학습자가 질문한 횟수를 관련 페이지별로 표시합니다." icon={FileQuestion} title="페이지별 질문 수" />
  }

  const maximum = Math.max(...questions.map((item) => item.questionCount), 1)
  return (
    <article className="flex min-h-64 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-5 py-4"><h2 className="type-body font-bold text-stone-900">페이지별 질문 수</h2></div>
      <div className="flex flex-1 items-end justify-around gap-3 px-5 pt-8 pb-4">
        {questions.map((item) => (
          <div className="flex h-40 min-w-0 flex-1 flex-col items-center justify-end" key={`${item.materialId}-${item.pageNumber}`}>
            <strong className="mb-2 type-caption text-brand-700">{item.questionCount}</strong>
            <div aria-label={`${item.pageNumber}쪽 질문 ${item.questionCount}건`} className="w-full max-w-8 rounded-t-md bg-brand-200" style={{ height: `${Math.max(12, item.questionCount / maximum * 100)}%` }} />
            <span className="mt-2 type-caption text-stone-500">p.{item.pageNumber}</span>
          </div>
        ))}
      </div>
    </article>
  )
}

function StudentLearningTable({ classroomId, students }: { classroomId: string; students: ClassroomStudent[] }) {
  const orderedStudents = [...students].sort((left, right) => getActivityTime(right) - getActivityTime(left))

  return (
    <section aria-label="수강생별 학습 현황" className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-4">
        <h2 className="type-body font-bold text-stone-900">수강생별 학습 현황</h2>
        <p className="type-caption text-stone-400">리포트는 서버에 기록된 학습 데이터를 기준으로 생성됩니다.</p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid min-h-10 grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_120px_120px_100px] items-center gap-4 border-b border-stone-100 bg-stone-50 px-5 type-caption font-semibold text-stone-500">
            <span>이름</span><span>평균 진도율</span><span>AI 질문</span><span>최근 학습</span><span className="text-center">리포트</span>
          </div>
          {orderedStudents.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center type-body text-stone-400">표시할 수강생이 없습니다.</div>
          ) : orderedStudents.map((student) => (
            <article className="grid min-h-14 grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_120px_120px_100px] items-center gap-4 border-b border-stone-100 px-5 last:border-0" key={student.id}>
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 type-caption font-bold text-brand-700">{getInitial(student.name)}</span>
                <div className="min-w-0"><strong className="block truncate type-control text-stone-900">{student.name}</strong><span className="block truncate type-caption text-stone-400">{student.email}</span></div>
              </div>
              <StudentProgress value={student.averageProgressRate} />
              <span className="type-control text-stone-600">{student.aiQuestionCount === undefined ? '-' : `${student.aiQuestionCount}건`}</span>
              <span className="type-control text-stone-600">{formatRelativeActivity(student.lastActiveAt)}</span>
              <ButtonLink className="justify-self-center" size="sm" to={classroomStudentReportsPath(classroomId, student.id)} variant="secondary">리포트</ButtonLink>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function StudentProgress({ value }: { value?: number }) {
  if (value === undefined) return <span className="type-control text-stone-400">-</span>
  return <div className="flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${clampPercentage(value)}%` }} /></div><strong className="w-9 text-right type-caption text-stone-700">{value}%</strong></div>
}

function EmptyAnalyticsPanel({ description, icon: Icon, title }: { description: string; icon: typeof Users; title: string }) {
  return (
    <article className="flex min-h-64 flex-col rounded-lg border border-stone-200 bg-white">
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

function formatRelativeActivity(value?: string): string {
  if (!value) return '기록 없음'
  const difference = Date.now() - new Date(value).getTime()
  if (difference < 60 * 60 * 1000) return '오늘'
  if (difference < 2 * 24 * 60 * 60 * 1000) return '어제'
  return `${Math.max(2, Math.floor(difference / (24 * 60 * 60 * 1000)))}일 전`
}

function getInitial(name: string): string {
  return name.trim().slice(0, 1) || '?'
}
