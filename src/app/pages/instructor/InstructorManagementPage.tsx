import {
  BarChart3,
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Settings2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createClassroomsRepository,
  rememberClassroomId,
  type Classroom,
} from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from '../../../shared/ui'
import {
  classroomAnalyticsPath,
  classroomAnnouncementsPath,
  classroomDetailPath,
  classroomEditPath,
  classroomEntranceRequestsPath,
  classroomExamsPath,
  classroomStudentsPath,
} from '../../routes'

const managementItems = [
  { description: '주차별 자료와 공개 상태를 관리합니다.', icon: BookOpen, label: '자료', path: classroomDetailPath },
  { description: '강의실 공지를 작성하고 게시 상태를 확인합니다.', icon: FileText, label: '공지', path: classroomAnnouncementsPath },
  { description: '시험 초안, 공개와 제출 현황을 관리합니다.', icon: ClipboardCheck, label: '시험', path: classroomExamsPath },
  { description: '진도와 AI 질문 활동을 확인합니다.', icon: BarChart3, label: '학습 현황', path: classroomAnalyticsPath },
  { description: '수강생과 학생별 리포트를 확인합니다.', icon: Users, label: '수강생·리포트', path: classroomStudentsPath },
  { description: '대기 중인 강의실 입장 요청을 처리합니다.', icon: UserPlus, label: '입장 요청', path: classroomEntranceRequestsPath },
  { description: '강의실 정보와 운영 상태를 변경합니다.', icon: Settings2, label: '관리', path: classroomEditPath },
] as const

export function InstructorManagementPage() {
  usePageTitle('통합 관리')
  const { apiRequest } = useAuth()
  const repository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    repository.list('', controller.signal)
      .then((items) => {
        setClassrooms(items)
        setSelectedId((current) => items.some((item) => item.id === current)
          ? current
          : items.find((item) => item.status === 'ACTIVE')?.id ?? items[0]?.id ?? '')
        setError(null)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [repository])

  const activeClassrooms = classrooms.filter((item) => item.status === 'ACTIVE')
  const selectedClassroom = classrooms.find((item) => item.id === selectedId)
  const learnerCount = activeClassrooms.reduce((sum, item) => sum + item.learnerCount, 0)
  const pendingCount = activeClassrooms.reduce((sum, item) => sum + item.pendingRequestCount, 0)
  const averageProgress = activeClassrooms.length === 0
    ? 0
    : Math.round(activeClassrooms.reduce((sum, item) => sum + item.progressRate, 0) / activeClassrooms.length)

  function selectClassroom(id: string) {
    setSelectedId(id)
    if (id) rememberClassroomId(id)
  }

  return (
    <PageContainer>
      <PageHeader
        title="통합 관리"
        titleAccessory={classrooms.length > 0 ? (
          <label>
            <span className="sr-only">관리할 강의실 선택</span>
            <select
              className="h-9 min-w-48 rounded-lg border border-stone-200 bg-white px-3 type-control font-semibold text-stone-700"
              onChange={(event) => selectClassroom(event.target.value)}
              value={selectedId}
            >
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
              ))}
            </select>
          </label>
        ) : undefined}
      />

      {isLoading ? <LoadingState message="관리 현황을 불러오는 중입니다." /> : null}
      {error ? <ErrorState description={error} title="관리 현황을 불러오지 못했습니다" /> : null}
      {!isLoading && !error && classrooms.length === 0 ? (
        <EmptyState description="강의실을 만든 뒤 운영 기능을 한곳에서 관리할 수 있습니다." title="관리할 강의실이 없습니다" />
      ) : null}

      {!isLoading && !error && selectedClassroom ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="전체 운영 요약">
            <ManagementMetric label="운영 중 강의실" value={`${activeClassrooms.length}개`} />
            <ManagementMetric label="전체 학습자" value={`${learnerCount}명`} />
            <ManagementMetric label="평균 진도" value={`${averageProgress}%`} />
            <ManagementMetric emphasis={pendingCount > 0} label="대기 중 입장 요청" value={`${pendingCount}건`} />
          </section>

          <section aria-labelledby="selected-classroom-management">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 pb-3">
              <div>
                <h2 className="type-section-title font-bold text-stone-950" id="selected-classroom-management">
                  {selectedClassroom.name}
                </h2>
                <p className="mt-1 type-caption text-stone-500">
                  {selectedClassroom.status === 'ACTIVE' ? '운영 중' : '종료'} · 학습자 {selectedClassroom.learnerCount}명 · 평균 진도 {selectedClassroom.progressRate}%
                </p>
              </div>
              <Link className="inline-flex items-center gap-1 type-control font-semibold text-brand-700 hover:text-brand-800" to={classroomDetailPath(selectedClassroom.id)}>
                강의실 열기<ChevronRight aria-hidden="true" size={14} />
              </Link>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {managementItems.map((item) => (
                <Link
                  className="group flex min-h-24 items-start gap-3 rounded-lg border border-stone-200 bg-white p-4 hover:border-brand-300 hover:bg-brand-50"
                  key={item.label}
                  to={item.path(selectedClassroom.id)}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 group-hover:bg-white group-hover:text-brand-700">
                    <item.icon aria-hidden="true" size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block type-body text-stone-950">{item.label}</strong>
                    <span className="mt-1 block type-caption leading-5 text-stone-500">{item.description}</span>
                    {item.label === '입장 요청' && selectedClassroom.pendingRequestCount > 0 ? (
                      <span className="mt-2 inline-flex rounded-full bg-rose-50 px-2 py-0.5 type-micro font-bold text-rose-700">
                        {selectedClassroom.pendingRequestCount}건 대기
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight aria-hidden="true" className="mt-1 shrink-0 text-stone-400 group-hover:text-brand-700" size={15} />
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </PageContainer>
  )
}

function ManagementMetric({ emphasis = false, label, value }: { emphasis?: boolean; label: string; value: string }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white px-5 py-4">
      <p className="type-caption font-medium text-stone-500">{label}</p>
      <strong className={emphasis ? 'mt-2 block type-page-title text-rose-600' : 'mt-2 block type-page-title text-stone-950'}>{value}</strong>
    </article>
  )
}
