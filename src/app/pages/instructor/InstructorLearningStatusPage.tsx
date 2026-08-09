import { BarChart3, FileQuestion, FileSearch, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import { createClassroomsRepository, rememberClassroomId, type Classroom, type ClassroomAnalytics } from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { ButtonLink } from '../../../shared/ui'
import { classroomReportsPath } from '../../routes'
import { ClassroomWorkspaceContainer } from '../classroom/ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader } from '../classroom/ClassroomWorkspaceHeader'

export function InstructorLearningStatusPage() {
  usePageTitle('학습 현황')
  const { apiRequest } = useAuth()
  const { classroomId = '' } = useParams()
  const repository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [analytics, setAnalytics] = useState<ClassroomAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const selectedClassroom = classrooms.find((item) => item.id === classroomId) ?? classrooms[0]
  const summaryItems = [
    { label: '학습자', suffix: '명', value: analytics?.learnerCount ?? 0 },
    { label: '평균 진도', suffix: '%', value: analytics?.averageProgressRate ?? 0 },
    { label: 'AI 질문 수 (7일)', suffix: '건', value: analytics?.aiQuestionCountLast7Days ?? 0 },
    { label: '7일 이상 미접속', suffix: '명', value: analytics?.inactiveLearnerCountLast7Days ?? 0 },
  ]

  useEffect(() => {
    const controller = new AbortController()
    void repository.list('', controller.signal)
      .then(setClassrooms)
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [repository])

  useEffect(() => {
    if (selectedClassroom) rememberClassroomId(selectedClassroom.id)
  }, [selectedClassroom])

  useEffect(() => {
    if (!selectedClassroom) return
    const controller = new AbortController()
    void repository.getAnalytics(selectedClassroom.id, controller.signal)
      .then((value) => {
        setAnalytics(value)
        setError(null)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [repository, selectedClassroom])

  return (
    <ClassroomWorkspaceContainer>
      {selectedClassroom ? <ClassroomWorkspaceHeader
        actions={<><p className="type-caption font-medium text-stone-400">{analytics ? `마지막 갱신 ${formatUpdatedAt(analytics.lastUpdatedAt)}` : '마지막 갱신 정보 없음'}</p><ButtonLink to={classroomReportsPath(selectedClassroom.id)} variant="secondary"><FileSearch size={14} />학생 리포트</ButtonLink></>}
        activeTab="analytics"
        classroom={selectedClassroom}
      /> : <h1 className="type-page-title font-bold text-stone-950">학습 현황</h1>}

      {error ? <p className="type-body text-rose-700" role="alert">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => (
          <article
            className="min-h-28 rounded-lg border border-stone-200 bg-white px-5 py-4"
            key={item.label}
          >
            <p className="type-caption font-medium text-stone-400">{item.label}</p>
            <p className="mt-2 type-display font-bold text-stone-950">
              {item.value}
              <span className="ml-0.5 type-section-title">{item.suffix}</span>
            </p>
          </article>
        ))}
      </section>

      <section className="grid min-h-[520px] gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <MaterialAnalyticsPanel analytics={analytics} isLoading={isLoading} />
        <QuestionAnalyticsPanel analytics={analytics} isLoading={isLoading} />
      </section>
    </ClassroomWorkspaceContainer>
  )
}

function MaterialAnalyticsPanel({ analytics, isLoading }: { analytics: ClassroomAnalytics | null; isLoading: boolean }) {
  if (!isLoading && analytics && analytics.materials.length > 0) {
    return <article className="flex min-h-72 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="border-b border-stone-100 px-5 py-4"><h2 className="type-body font-bold text-stone-900">자료별 열람 현황</h2></div><div className="divide-y divide-stone-100">{analytics.materials.map((material) => <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_120px_80px] sm:items-center" key={material.id}><div className="min-w-0"><strong className="block truncate type-body text-stone-900">{material.title}</strong><span className="type-caption text-stone-400">열람 {material.viewerCount}명 · 평균 진도 {material.averageProgressRate}%</span></div><div aria-label={`${material.viewRate}% 열람`} className="h-1.5 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(0, Math.min(100, material.viewRate))}%` }} /></div><strong className="text-right type-caption text-brand-700">{material.viewRate}%</strong></div>)}</div></article>
  }
  return <EmptyAnalyticsPanel description="자료 열람이 시작되면 열람 인원과 평균 진도가 표시됩니다." icon={BarChart3} loading={isLoading} title="자료별 열람 현황" />
}

function QuestionAnalyticsPanel({ analytics, isLoading }: { analytics: ClassroomAnalytics | null; isLoading: boolean }) {
  if (!isLoading && analytics && analytics.questionsByPage.length > 0) {
    const titleByMaterialId = new Map(analytics.materials.map((item) => [item.id, item.title]))
    return <article className="flex min-h-72 flex-col overflow-hidden rounded-lg border border-stone-200 bg-white"><div className="border-b border-stone-100 px-5 py-4"><h2 className="type-body font-bold text-stone-900">페이지별 AI 질문 수</h2></div><div className="divide-y divide-stone-100">{analytics.questionsByPage.map((item) => <div className="flex items-center gap-3 px-5 py-4" key={`${item.materialId}-${item.pageNumber}`}><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 type-caption font-bold text-brand-700">{item.pageNumber}</span><div className="min-w-0 flex-1"><strong className="block truncate type-body text-stone-900">{titleByMaterialId.get(item.materialId) ?? `자료 ${item.materialId}`}</strong><span className="type-caption text-stone-400">{item.pageNumber}쪽</span></div><strong className="type-body text-stone-900">{item.questionCount}건</strong></div>)}</div></article>
  }
  return <EmptyAnalyticsPanel description="학습자가 질문한 횟수를 관련 자료 페이지별로 집계해 표시합니다." icon={FileQuestion} loading={isLoading} title="페이지별 AI 질문 수" />
}

function EmptyAnalyticsPanel({
  description,
  icon: Icon,
  loading = false,
  title,
}: {
  description: string
  icon: typeof Users
  loading?: boolean
  title: string
}) {
  return (
    <article className="flex min-h-72 flex-col rounded-lg border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-5 py-4">
        <h2 className="type-body font-bold text-stone-900">{title}</h2>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="flex size-10 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
          <Icon aria-hidden="true" size={19} />
        </span>
        <p className="mt-3 type-body font-semibold text-stone-800">
          {loading ? '학습 데이터를 불러오는 중입니다' : '표시할 학습 데이터가 없습니다'}
        </p>
        <p className="mt-1 type-caption leading-5 text-stone-400">{description}</p>
      </div>
    </article>
  )
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' }).format(new Date(value))
}
