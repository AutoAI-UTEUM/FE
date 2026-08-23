import {
  ArrowRight,
  ArrowDownUp,
  Check,
  DoorOpen,
  Plus,
  Search,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'

import { isInstructorRole, useAuth } from '../../features/auth'
import { createClassroomsRepository, type Classroom } from '../../features/classrooms'
import { createSessionsRepository, type LearningSession } from '../../features/sessions'
import { getRequestErrorMessage } from '../../shared/api'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Button, ButtonLink, EmptyState, PageContainer, PageHeader, useToast } from '../../shared/ui'
import { classroomDetailPath, sessionDetailPath } from '../routes'
import { InstructorClassroomsPage } from './instructor/InstructorClassroomsPage'

type ClassroomSort = 'name' | 'progress' | 'recent' | 'unread'

const sortOptions: Array<{ label: string; value: ClassroomSort }> = [
  { label: '최근 학습순', value: 'recent' },
  { label: '이름순', value: 'name' },
  { label: '진도 낮은 순', value: 'progress' },
  { label: '새 자료 우선', value: 'unread' },
]

export function ClassroomsPage() {
  const { user } = useAuth()

  return isInstructorRole(user?.role) ? (
    <InstructorClassroomsPage />
  ) : (
    <LearnerClassroomsPage />
  )
}

function LearnerClassroomsPage() {
  usePageTitle('내 강의실')
  const { apiRequest } = useAuth()
  const { show: showToast } = useToast()
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [latestSession, setLatestSession] = useState<LearningSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isJoining, setIsJoining] = useState(false)
  const [sort, setSort] = useState<ClassroomSort>('recent')
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isJoinOpen, setIsJoinOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const joinInputRef = useRef<HTMLInputElement | null>(null)
  const repository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const sessionsRepository = useMemo(() => createSessionsRepository(apiRequest), [apiRequest])

  async function loadClassrooms(search = '') {
    setIsLoading(true)
    setError(null)
    try {
      setClassrooms(await repository.list(search))
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    repository.list().then((items) => { if (!cancelled) setClassrooms(items) }).catch((requestError) => { if (!cancelled) setError(getRequestErrorMessage(requestError)) }).finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [repository])

  useEffect(() => {
    const controller = new AbortController()
    sessionsRepository
      .list(controller.signal)
      .then((sessions) => {
        const latest = sessions
          .filter((session) => session.status === 'ACTIVE')
          .sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt))[0]
        setLatestSession(latest ?? null)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [sessionsRepository])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setIsSearchOpen(false)
        setIsJoinOpen(false)
        setIsSortOpen(false)
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus()
  }, [isSearchOpen])

  useEffect(() => {
    if (isJoinOpen) joinInputRef.current?.focus()
  }, [isJoinOpen])

  async function submitInviteCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!inviteCode.trim() || isJoining) return
    setIsJoining(true)
    try {
      await repository.join(inviteCode)
      setInviteCode('')
      setIsJoinOpen(false)
      showToast('강의실 참여 요청을 보냈습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    } finally {
      setIsJoining(false)
    }
  }

  const selectedSortLabel =
    sortOptions.find((option) => option.value === sort)?.label ??
    '최근 학습순'
  const sortedClassrooms = useMemo(() => {
    return [...classrooms].sort((left, right) => {
      if (sort === 'name') return left.name.localeCompare(right.name, 'ko-KR')
      if (sort === 'progress') return left.progressRate - right.progressRate
      if (sort === 'unread') return (right.currentWeek ?? 0) - (left.currentWeek ?? 0)
      return right.id.localeCompare(left.id, undefined, { numeric: true })
    })
  }, [classrooms, sort])

  return (
    <PageContainer>
      <PageHeader
        title="내 강의실"
        actions={<>
          <button
            aria-label="강의실 검색"
            className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-left type-body text-stone-400 transition-colors hover:border-stone-300 hover:text-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:min-w-72 xl:flex-none"
            onClick={() => setIsSearchOpen(true)}
            type="button"
          >
            <Search aria-hidden="true" size={15} />
            <span className="flex-1">강의실 검색</span>
            <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 type-micro text-stone-400">
              Ctrl K
            </kbd>
          </button>

          <div className="relative">
            <button
              aria-expanded={isSortOpen}
              aria-haspopup="menu"
              className="flex h-10 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 type-body font-medium text-stone-700 hover:border-stone-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              onClick={() => setIsSortOpen((open) => !open)}
              type="button"
            >
              <ArrowDownUp aria-hidden="true" size={14} />
              {selectedSortLabel}
            </button>
            {isSortOpen ? (
              <div
                className="absolute top-[calc(100%+6px)] right-0 z-20 w-40 rounded-lg border border-stone-200 bg-white p-1.5 shadow-lg"
                role="menu"
              >
                {sortOptions.map((option) => (
                  <button
                    className="flex h-9 w-full items-center rounded-md px-2.5 text-left type-control text-stone-700 hover:bg-stone-100"
                    key={option.value}
                    onClick={() => {
                      setSort(option.value)
                      setIsSortOpen(false)
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {option.label}
                    {sort === option.value ? (
                      <Check
                        aria-hidden="true"
                        className="ml-auto text-brand-700"
                        size={14}
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <Button className="h-10" onClick={() => setIsJoinOpen(true)}>
            <Plus aria-hidden="true" size={15} />
            강의실 참여
          </Button>
        </>}
      />

      {latestSession ? (
        <section className="flex flex-col gap-4 rounded-lg bg-stone-100 px-5 py-4 sm:flex-row sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 type-micro font-bold text-rose-600">
            PDF
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate type-body font-bold text-stone-950">
              이어서 학습하기 — {latestSession.materialTitle}
            </h2>
            <p className="mt-1 type-caption text-stone-400">
              {latestSession.currentPage}쪽까지 학습했습니다.
            </p>
          </div>
          <ButtonLink to={sessionDetailPath(latestSession.id)}>
            {latestSession.currentPage}쪽부터 계속
            <ArrowRight aria-hidden="true" size={14} />
          </ButtonLink>
        </section>
      ) : null}

      {error ? <EmptyState action={<Button onClick={() => void loadClassrooms()} variant="secondary">다시 시도</Button>} description={error} title="강의실을 불러오지 못했습니다" /> : null}
      {!error && isLoading ? <p className="py-16 text-center type-body text-stone-500" role="status">강의실을 불러오는 중입니다.</p> : null}
      {!error && !isLoading ? <section
        aria-labelledby="classroom-list-heading"
        className="border-t border-stone-100 pt-5"
      >
        <h2 className="sr-only" id="classroom-list-heading">
          참여 중인 강의실
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedClassrooms.map((classroom) => (
            <Link className="flex min-h-[252px] flex-col rounded-lg border border-stone-200 bg-white p-5 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600" key={classroom.id} to={classroomDetailPath(classroom.id)}>
              <div className="flex items-start gap-4">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-lg type-body font-bold ${getClassroomTone(classroom)}`}>
                  {classroom.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate type-card-title font-bold text-stone-950">{classroom.name}</h2>
                  <p className="mt-0.5 truncate type-micro text-stone-400">
                    {classroom.instructorName} · {classroom.currentWeek ?? 1}주차
                  </p>
                </div>
                <span className={classroom.status === 'ACTIVE'
                  ? 'rounded-full bg-[#E7F6EC] px-2 py-1 type-micro font-semibold text-[#12833E]'
                  : 'rounded-full bg-stone-100 px-2 py-1 type-micro font-semibold text-stone-500'}>
                  {classroom.status === 'ACTIVE' ? '수강 중' : '종료'}
                </span>
              </div>
              <div className="mt-auto pt-5">
                <div className="flex items-center justify-between type-micro">
                  <span className="text-stone-400">진도</span>
                  <strong className="text-brand-700">{classroom.progressRate}%</strong>
                </div>
                <div className="mt-1.5 h-1 rounded-full bg-stone-100">
                  <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(0, classroom.progressRate))}%` }} />
                </div>
                <p className="mt-3 truncate type-caption text-stone-500">
                  {classroom.progressRate >= 100
                    ? '모든 자료를 학습했어요'
                    : `${classroom.currentWeek ?? 1}주차 학습 이어가기`}
                </p>
              </div>
            </Link>
          ))}
        </div>

        {classrooms.length === 0 ? <div className="pt-7 text-center">
          <h2 className="type-section-title font-bold text-stone-900">
            아직 참여 중인 강의실이 없습니다
          </h2>
          <p className="mt-1.5 type-body text-stone-500">
            강의자가 전달한 초대 코드를 입력해 첫 강의실에 참여하세요.
          </p>
        </div> : null}
      </section> : null}

      {isSearchOpen ? (
        <div
          aria-label="강의실 검색"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/35 px-4 pt-[15vh]"
          role="dialog"
        >
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex h-14 items-center gap-3 border-b border-stone-100 px-4">
              <Search aria-hidden="true" className="text-stone-400" size={16} />
              <input
                aria-label="검색어"
                className="h-full min-w-0 flex-1 border-0 bg-transparent type-body text-stone-900 outline-none placeholder:text-stone-400"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="강의실 이름을 검색하세요"
                ref={searchInputRef}
                value={searchQuery}
              />
              <button
                aria-label="검색 닫기"
                className="flex size-7 items-center justify-center rounded-md border border-stone-200 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                onClick={() => setIsSearchOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
            <div className="min-h-44 px-4 py-4">
              {classrooms.filter((item) => item.name.toLowerCase().includes(searchQuery.trim().toLowerCase())).map((item) => <Link className="block rounded-lg px-3 py-3 type-body font-semibold text-stone-800 hover:bg-stone-50" key={item.id} onClick={() => setIsSearchOpen(false)} to={classroomDetailPath(item.id)}>{item.name}<span className="ml-2 type-caption font-normal text-stone-400">{item.instructorName}</span></Link>)}
              {!searchQuery.trim() ? <p className="py-12 text-center type-body text-stone-500">검색할 강의실 이름을 입력하세요</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {isJoinOpen ? (
        <div
          aria-labelledby="join-classroom-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <DoorOpen aria-hidden="true" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  className="type-section-title font-bold text-stone-950"
                  id="join-classroom-title"
                >
                  강의실 참여
                </h2>
                <p className="mt-1 type-body text-stone-500">
                  강의자가 공유한 초대 코드를 입력하세요.
                </p>
              </div>
              <button
                aria-label="참여 창 닫기"
                className="flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                onClick={() => setIsJoinOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>

            <form className="mt-5" onSubmit={submitInviteCode}>
              <label
                className="type-control font-semibold text-stone-800"
                htmlFor="classroom-invite-code"
              >
                초대 코드
              </label>
              <input
                autoComplete="off"
                className="mt-1 h-11 w-full rounded-lg border border-stone-300 bg-white px-3.5 type-body font-medium tracking-wider text-stone-900 outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                id="classroom-invite-code"
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="예: EDU-2026"
                ref={joinInputRef}
                value={inviteCode}
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  onClick={() => setIsJoinOpen(false)}
                  variant="secondary"
                >
                  취소
                </Button>
                <Button disabled={!inviteCode.trim() || isJoining} type="submit">
                  {isJoining ? '요청 중' : '참여 요청'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageContainer>
  )
}

function getClassroomTone(_classroom: Classroom): string {
  void _classroom
  return 'bg-brand-50 text-brand-700'
}
