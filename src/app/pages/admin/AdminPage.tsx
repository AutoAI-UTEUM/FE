import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDollarSign, Copy, KeyRound, RefreshCw, Search, TriangleAlert, WifiOff, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  createAdminRepository,
  type AdminClassroomDetail,
  type AdminClassroomSummary,
  type AdminXaiCredits,
  type AdminXaiOverview,
  type AdminXaiStatus,
  type AdminPageResult,
  type AdminSort,
  type AdminUserDetail,
  type AdminUserRole,
  type AdminUserStatus,
  type AdminUserSort,
  type AdminUserSummary,
  type AiUsageSummary,
  type AiUsageUser,
} from '../../../features/admin'
import { useAuth } from '../../../features/auth'
import { DevelopmentUpdatesPanel } from '../../../features/updates'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { formatDetailedRelativeActivityDate } from '../../../shared/lib/format'
import { useResponsiveViewport, TabletMasterDetail, TabletChartValues, useElementWidth } from '../../../shared/responsive'
import { Button } from '../../../shared/ui'
import {
  AdminErrorMessage,
  formatCount,
  formatDateTime,
  PanelMessage,
  toAdminError,
  type AdminErrorInfo,
} from './adminShared'
import { InfraPanel } from './InfraPanel'

export type AdminTab = 'users' | 'classrooms' | 'ai-usage' | 'xai' | 'infra' | 'updates'

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: 'users', label: '회원' },
  { id: 'classrooms', label: '강의실' },
  { id: 'ai-usage', label: 'AI 사용량' },
  { id: 'xai', label: 'xAI 관리' },
  { id: 'infra', label: '인프라' },
  { id: 'updates', label: '업데이트' },
]

export function AdminPage() {
  const { apiRequest } = useAuth()
  const repository = useMemo(() => createAdminRepository(apiRequest), [apiRequest])
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const tab: AdminTab = isAdminTab(requestedTab) ? requestedTab : 'users'
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0]
  usePageTitle(activeTab.label)

  function selectTab(nextTab: AdminTab) {
    setSearchParams(nextTab === 'users' ? {} : { tab: nextTab }, { replace: true })
  }

  return (
    <div className={tab === 'ai-usage' || tab === 'updates'
      ? 'flex h-full min-h-0 flex-col overflow-hidden'
      : 'flex min-h-[calc(100dvh-40px)] flex-col'}>
      <header className="border-b border-stone-200">
        <h1 className="type-page-title font-bold text-stone-950">{activeTab.label}</h1>
        <nav aria-label="관리자 메뉴" className="mobile-horizontal-scroll mt-2 flex h-9 items-end gap-6 overflow-x-auto mobile-web:h-11 mobile-web:gap-5">
          {tabs.map((item) => (
            <button
              aria-current={tab === item.id ? 'page' : undefined}
              className={tab === item.id
                ? 'h-9 shrink-0 border-b-2 border-brand-700 px-0 type-control font-bold text-stone-950'
                : 'h-9 shrink-0 border-b-2 border-transparent px-0 type-control font-medium text-stone-400 hover:text-stone-800'}
              key={item.id}
              onClick={() => selectTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <section className={tab === 'infra' || tab === 'updates'
        ? 'mt-5 flex min-h-0 flex-1 flex-col overflow-hidden'
        : 'mt-5 min-h-0 flex-1 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm shadow-stone-200/30'}>
        {tab === 'users' ? <UsersPanel repository={repository} /> : null}
        {tab === 'classrooms' ? <ClassroomsPanel repository={repository} /> : null}
        {tab === 'ai-usage' ? <AiUsagePanel repository={repository} /> : null}
        {tab === 'xai' ? <XaiManagementPanel repository={repository} /> : null}
        {tab === 'infra' ? <InfraPanel repository={repository} /> : null}
        {tab === 'updates' ? <DevelopmentUpdatesPanel showTitle={false} /> : null}
      </section>
    </div>
  )
}

function isAdminTab(value: string | null): value is AdminTab {
  return tabs.some((item) => item.id === value)
}

type Repository = ReturnType<typeof createAdminRepository>

const ADMIN_USERS_PAGE_SIZE = 17

function UsersPanel({ repository }: { repository: Repository }) {
  const { user: currentUser } = useAuth()
  const { isMobileWeb, isTablet } = useResponsiveViewport()
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [role, setRole] = useState<AdminUserRole | ''>('')
  const [status, setStatus] = useState<AdminUserStatus | ''>('')
  const [sort, setSort] = useState<AdminUserSort>('RECENT')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<AdminPageResult<AdminUserSummary> | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState<AdminErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [resetResult, setResetResult] = useState<{ message: string; name: string; temporaryPassword: string } | null>(null)
  const [roleCounts, setRoleCounts] = useState<Partial<Record<AdminUserRole, number>>>({})

  useEffect(() => {
    const controller = new AbortController()
    Promise.all((['INSTRUCTOR', 'LEARNER', 'ADMIN'] as const).map(async (targetRole) => {
      const data = await repository.listUsers({ page: 0, role: targetRole, size: 1 }, controller.signal)
      return [targetRole, data.totalElements] as const
    }))
      .then((entries) => setRoleCounts(Object.fromEntries(entries)))
      .catch(() => undefined)
    return () => controller.abort()
  }, [repository])

  useEffect(() => {
    const controller = new AbortController()
    repository.listUsers({
      page,
      q: submittedQuery || undefined,
      role: role || undefined,
      size: ADMIN_USERS_PAGE_SIZE,
      sort,
      status: status || undefined,
    }, controller.signal)
      .then((data) => {
        setResult(data)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(toAdminError(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [page, repository, role, sort, status, submittedQuery])

  function toggleDetail(userId: number) {
    if (expandedId === userId) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(userId)
    setDetail(null)
  }

  useEffect(() => {
    if (expandedId === null) return
    const controller = new AbortController()
    repository.getUser(expandedId, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDetail(value) })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) { setError(toAdminError(reason)); setExpandedId(null) }
      })
    return () => controller.abort()
  }, [expandedId, repository])

  async function resetPassword(target: AdminUserSummary) {
    if (!window.confirm(`${target.name} 회원의 비밀번호를 임시 비밀번호로 초기화할까요?`)) return
    try {
      const result = await repository.resetUserPassword(target.id)
      setResetResult({ ...result, name: target.name })
      setError(null)
    } catch (reason) {
      setError(toAdminError(reason))
    }
  }

  return (
    <div className="flex h-full mobile-web:min-h-0 min-h-[620px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="type-section-title font-bold text-stone-950">회원 목록 <span className="ml-1">{formatCount(result?.totalElements)}</span></h2>
          <p className="flex flex-wrap gap-3 type-caption text-stone-500">
            <span>강의자 <strong className="text-stone-700">{formatCount(roleCounts.INSTRUCTOR)}명</strong></span>
            <span>학습자 <strong className="text-stone-700">{formatCount(roleCounts.LEARNER)}명</strong></span>
            <span>관리자 <strong className="text-stone-700">{formatCount(roleCounts.ADMIN)}명</strong></span>
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2 mobile-phone:w-full" onSubmit={(event) => { event.preventDefault(); setPage(0); setSubmittedQuery(query.trim()) }}>
          <label className="relative mobile-phone:w-full">
            <span className="sr-only">회원 검색</span>
            <Search aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" size={15} />
            <input className="h-9 w-60 rounded-lg border border-stone-200 bg-white pr-3 pl-9 type-control outline-none focus:border-brand-600 mobile-web:h-11 mobile-phone:w-full" onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 이메일 검색" value={query} />
          </label>
          <FilterSelect label="역할" onChange={(value) => { setPage(0); setRole(value as AdminUserRole | '') }} value={role} options={[['', '전체 역할'], ['LEARNER', '학습자'], ['INSTRUCTOR', '강의자'], ['ADMIN', '관리자']]} />
          <FilterSelect label="상태" onChange={(value) => { setPage(0); setStatus(value as AdminUserStatus | '') }} value={status} options={[['', '전체 상태'], ['ACTIVE', '활성'], ['DELETED', '탈퇴']]} />
          {isTablet ? <FilterSelect label="회원 정렬" onChange={(value) => { setPage(0); setSort(value as AdminUserSort) }} value={sort} options={[[ 'RECENT', '가입일 최신순' ], ['NAME', '이름순'], ['RECENT_ACTIVITY_DESC', '최근 활동 최신순'], ['RECENT_ACTIVITY_ASC', '최근 활동 오래된순']]} /> : null}
        </form>
      </div>
      {error ? <AdminErrorMessage error={error} /> : null}
      <TabletMasterDetail enabled={isTablet} onClose={() => setExpandedId(null)} title="회원 상세" detail={expandedId !== null ? <div className="p-4">{detail ? <><h4 className="type-section-title font-bold">{detail.name}</h4><p className="mt-2 break-all text-stone-500">{detail.email}</p><dl className="mt-5 grid gap-4 type-body"><div><dt>역할</dt><dd>{roleLabel(detail.role)}</dd></div><div><dt>상태</dt><dd><StatusBadge status={detail.status} /></dd></div><div><dt>소속</dt><dd>{detail.affiliation || '-'}</dd></div><div><dt>가입일</dt><dd>{formatDate(detail.createdAt)}</dd></div><div><dt>인증</dt><dd>{detail.authProvider}</dd></div><div><dt>최근 활동</dt><dd>{formatDetailedRelativeActivityDate(detail.lastActiveAt ?? undefined)}</dd></div><div><dt>동의 일시</dt><dd>{detail.consentedAt ? formatDateTime(detail.consentedAt) : '-'}</dd></div></dl>{detail.authProvider === 'LOCAL' && detail.status === 'ACTIVE' && detail.id !== currentUser?.id ? <Button className="mt-5" onClick={() => void resetPassword(detail)} variant="secondary">임시 비밀번호 발급</Button> : null}</> : <p role="status">상세 정보를 불러오는 중입니다.</p>}</div> : null}>
        {isTablet ? <div aria-label="회원 목록" className="divide-y divide-stone-100" role="region">{result?.items.map((user) => <button aria-label={`${user.name} 상세 정보`} aria-expanded={expandedId === user.id} className="tablet-summary-row w-full px-4 py-4 text-left hover:bg-stone-50" key={user.id} onClick={() => toggleDetail(user.id)} type="button"><span className="min-w-0"><strong className="block break-words">{user.name}</strong><span className="block break-all type-caption text-stone-500">{user.email}</span></span><span>{roleLabel(user.role)}</span><StatusBadge status={user.status} /></button>)}</div> : isMobileWeb ? <div aria-label="회원 목록" className="divide-y divide-stone-100" role="region">{result?.items.map((user) => <MobileUserRow currentUserId={currentUser?.id} detail={expandedId === user.id ? detail : null} expanded={expandedId === user.id} key={user.id} onResetPassword={() => void resetPassword(user)} onToggle={() => toggleDetail(user.id)} user={user} />)}</div> : <table className="w-full min-w-[980px] table-fixed border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#F7F8FA] type-caption font-semibold text-stone-500">
            <tr>
              <th className="w-[16%] px-4 py-2.5"><SortButton active={sort === 'NAME'} direction="asc" label="회원 · ID" onClick={() => { setPage(0); setSort('NAME') }} /></th>
              <th className="w-[22%] px-4 py-2.5">이메일</th>
              <th className="w-[15%] px-4 py-2.5">역할 · 소속</th>
              <th className="w-[14%] px-4 py-2.5"><SortButton active={sort === 'RECENT'} direction="desc" label="가입일" onClick={() => { setPage(0); setSort('RECENT') }} /></th>
              <th className="w-[13%] px-4 py-2.5"><SortButton active={sort === 'RECENT_ACTIVITY_DESC' || sort === 'RECENT_ACTIVITY_ASC'} direction={sort === 'RECENT_ACTIVITY_ASC' ? 'asc' : 'desc'} label="최근 활동" onClick={() => { setPage(0); setSort(sort === 'RECENT_ACTIVITY_DESC' ? 'RECENT_ACTIVITY_ASC' : 'RECENT_ACTIVITY_DESC') }} toggleable /></th>
              <th className="w-[10%] px-4 py-2.5">인증</th>
              <th className="w-[8%] px-4 py-2.5">상태</th>
              <th className="w-10 px-2 py-2.5"><span className="sr-only">상세</span></th>
            </tr>
          </thead>
          <tbody>
            {result?.items.map((user) => (
              <UserRows currentUserId={currentUser?.id} detail={expandedId === user.id ? detail : null} expanded={expandedId === user.id} key={user.id} onResetPassword={() => void resetPassword(user)} onToggle={() => toggleDetail(user.id)} user={user} />
            ))}
          </tbody>
        </table>}
        {!loading && result?.items.length === 0 ? <PanelMessage message="조건에 맞는 회원이 없습니다." /> : null}
        {loading ? <PanelMessage message="회원 정보를 불러오는 중입니다." /> : null}
      </TabletMasterDetail>
      <Pagination page={page} pageSize={result?.size ?? ADMIN_USERS_PAGE_SIZE} totalElements={result?.totalElements ?? 0} totalPages={result?.totalPages ?? 0} onChange={setPage} />
      {resetResult ? <PasswordResetDialog onClose={() => setResetResult(null)} result={resetResult} /> : null}
    </div>
  )
}

function MobileUserRow({ currentUserId, detail, expanded, onResetPassword, onToggle, user }: { currentUserId?: number; detail: AdminUserDetail | null; expanded: boolean; onResetPassword: () => void; onToggle: () => void; user: AdminUserSummary }) {
  const canResetPassword = user.authProvider === 'LOCAL' && user.status === 'ACTIVE' && user.id !== currentUserId
  return <article><button aria-expanded={expanded} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left" onClick={onToggle} type="button"><span className="min-w-0 flex-1"><strong className="block truncate type-body text-stone-950">{user.name}</strong><span className="block truncate type-caption text-stone-500">{user.email}</span><span className="mt-2 flex flex-wrap items-center gap-2 type-caption text-stone-600"><span>{roleLabel(user.role)}</span><StatusBadge status={user.status} /><span>최근 활동 {formatDetailedRelativeActivityDate(user.lastActiveAt ?? undefined)}</span></span></span>{expanded ? <ChevronUp aria-hidden="true" size={17} /> : <ChevronDown aria-hidden="true" size={17} />}</button>{expanded ? <div className="bg-stone-50 px-4 py-3 type-caption text-stone-600">{detail ? <><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-stone-400">회원 ID</dt><dd className="font-semibold text-stone-900">{detail.id}</dd></div><div><dt className="text-stone-400">인증</dt><dd className="font-semibold text-stone-900">{user.authProvider}</dd></div><div><dt className="text-stone-400">소속</dt><dd className="font-semibold text-stone-900">{detail.affiliation || '-'}</dd></div><div><dt className="text-stone-400">가입일</dt><dd className="font-semibold text-stone-900">{formatDate(user.createdAt)}</dd></div><div><dt className="text-stone-400">동의 일시</dt><dd className="font-semibold text-stone-900">{detail.consentedAt ? formatDateTime(detail.consentedAt) : '-'}</dd></div></dl>{canResetPassword ? <Button className="mt-4" onClick={onResetPassword} size="sm" variant="secondary"><KeyRound aria-hidden="true" size={14} />임시 비밀번호 발급</Button> : null}</> : '상세 정보를 불러오는 중입니다.'}</div> : null}</article>
}

function UserRows({ currentUserId, detail, expanded, onResetPassword, onToggle, user }: { currentUserId?: number; detail: AdminUserDetail | null; expanded: boolean; onResetPassword: () => void; onToggle: () => void; user: AdminUserSummary }) {
  const canResetPassword = user.authProvider === 'LOCAL' && user.status === 'ACTIVE' && user.id !== currentUserId
  return (
    <>
      <tr className="border-b border-stone-100 type-body text-stone-700 hover:bg-stone-50">
        <td className="px-4 py-3"><p className="truncate font-semibold text-stone-950">{user.name} <span className="font-normal text-stone-400">#{user.id}</span></p></td>
        <td className="truncate px-4 py-3 text-stone-500" title={user.email}>{user.email}</td>
        <td className="px-4 py-3"><p className="font-medium text-stone-800">{roleLabel(user.role)}</p><p className="type-caption text-stone-400">{detail?.affiliation || '-'}</p></td>
        <td className="px-4 py-3 text-stone-500">{formatDate(user.createdAt)}</td>
        <td className="px-4 py-3 text-stone-500">{formatDetailedRelativeActivityDate(user.lastActiveAt ?? undefined)}</td>
        <td className="px-4 py-3 type-caption font-semibold text-stone-500">{user.authProvider}</td>
        <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
        <td className="px-2 py-3"><button aria-expanded={expanded} aria-label={`${user.name} 상세 정보`} className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-800" onClick={onToggle} type="button">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td>
      </tr>
      {expanded ? <tr className="border-b border-stone-100 bg-[#F7F8FA]"><td className="px-4 py-3 type-caption text-stone-600" colSpan={8}>{detail ? <div className="flex flex-wrap items-center gap-x-8 gap-y-2"><span>소속 <strong className="text-stone-900">{detail.affiliation || '-'}</strong></span><span>동의 일시 <strong className="text-stone-900">{detail.consentedAt ? formatDateTime(detail.consentedAt) : '-'}</strong></span>{canResetPassword ? <Button onClick={onResetPassword} size="sm" variant="secondary"><KeyRound aria-hidden="true" size={14} />임시 비밀번호 발급</Button> : null}</div> : '상세 정보를 불러오는 중입니다.'}</td></tr> : null}
    </>
  )
}

function PasswordResetDialog({ onClose, result }: { onClose: () => void; result: { message: string; name: string; temporaryPassword: string } }) {
  return <div aria-labelledby="password-reset-title" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/40 px-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} role="dialog"><section className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-2xl"><div className="flex items-center justify-between gap-3"><h2 className="type-dialog-title font-bold text-stone-950" id="password-reset-title">임시 비밀번호 발급 완료</h2><button aria-label="닫기" className="flex size-9 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100" onClick={onClose} type="button"><X aria-hidden="true" size={17} /></button></div><p className="mt-2 type-body text-stone-600">{result.name} 회원에게 아래 비밀번호를 전달하세요. 이 값은 닫은 뒤 다시 확인할 수 없습니다.</p><div className="mt-5 flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 p-3"><code className="min-w-0 flex-1 break-all type-body font-bold text-stone-950">{result.temporaryPassword}</code><Button aria-label="임시 비밀번호 복사" onClick={() => void navigator.clipboard.writeText(result.temporaryPassword)} size="sm" title="복사" variant="secondary"><Copy aria-hidden="true" size={15} /></Button></div>{result.message ? <p className="mt-3 type-caption text-stone-500">{result.message}</p> : null}<div className="mt-5 flex justify-end"><Button onClick={onClose}>확인</Button></div></section></div>
}

function ClassroomsPanel({ repository }: { repository: Repository }) {
  const { isMobileWeb, isTablet } = useResponsiveViewport()
  const [sort, setSort] = useState<AdminSort>('RECENT')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<AdminPageResult<AdminClassroomSummary> | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminClassroomDetail | null>(null)
  const [error, setError] = useState<AdminErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const maxMembers = Math.max(1, ...(result?.items.map((item) => item.memberCount) ?? []))

  useEffect(() => {
    const controller = new AbortController()
    repository.listClassrooms({ page, size: 20, sort }, controller.signal)
      .then((data) => { setResult(data); setError(null) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(toAdminError(reason)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [page, repository, sort])

  function toggleDetail(classroomId: number) {
    if (expandedId === classroomId) { setExpandedId(null); setDetail(null); return }
    setExpandedId(classroomId)
    setDetail(null)
  }

  useEffect(() => {
    if (expandedId === null) return
    const controller = new AbortController()
    repository.getClassroom(expandedId, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDetail(value) })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) { setError(toAdminError(reason)); setExpandedId(null) }
      })
    return () => controller.abort()
  }, [expandedId, repository])

  return (
    <div className="flex h-full mobile-web:min-h-0 min-h-[620px] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3"><h2 className="type-section-title font-bold text-stone-950">강의실 목록 <span className="ml-1">{formatCount(result?.totalElements)}</span></h2><FilterSelect label="정렬" onChange={(value) => { setPage(0); setSort(value as AdminSort) }} value={sort} options={[['RECENT', '최근 생성순'], ['NAME', '이름순']]} /></div>
      {error ? <AdminErrorMessage error={error} /> : null}
      <TabletMasterDetail enabled={isTablet} onClose={() => setExpandedId(null)} title="강의실 상세" detail={expandedId !== null ? <div className="p-4">{detail ? <><h4 className="type-section-title font-bold">{detail.name}</h4><p className="mt-2 type-body">개설자 {detail.instructor.name}</p><p className="mt-4 type-control font-semibold">참여 회원 {detail.members.length}명</p><ul className="mt-2 divide-y divide-stone-100">{detail.members.map((member) => <li className="flex flex-wrap justify-between gap-2 py-3" key={member.userId}><span>{member.name}</span><span className="text-stone-500">{roleLabel(member.role)}</span></li>)}</ul></> : <p role="status">상세 정보를 불러오는 중입니다.</p>}</div> : null}>
        {isTablet ? <div aria-label="강의실 목록" className="divide-y divide-stone-100" role="region">{result?.items.map((classroom) => <button aria-label={`${classroom.name} 상세 정보`} aria-expanded={expandedId === classroom.id} className="tablet-summary-row w-full px-4 py-4 text-left hover:bg-stone-50" key={classroom.id} onClick={() => toggleDetail(classroom.id)} type="button"><span className="min-w-0"><strong className="block break-words">{classroom.name}</strong><span className="block type-caption text-stone-500">{classroom.instructor.name}</span></span><span>{classroom.memberCount}명</span><StatusBadge status={classroom.status} /></button>)}</div> : isMobileWeb ? <div aria-label="강의실 목록" className="divide-y divide-stone-100" role="region">{result?.items.map((classroom) => <MobileClassroomRow classroom={classroom} detail={expandedId === classroom.id ? detail : null} expanded={expandedId === classroom.id} key={classroom.id} onToggle={() => toggleDetail(classroom.id)} />)}</div> : <table className="w-full min-w-[820px] table-fixed border-collapse text-left"><thead className="sticky top-0 z-10 bg-[#F7F8FA] type-caption font-semibold text-stone-500"><tr><th className="w-[31%] px-4 py-2.5"><SortButton active={sort === 'NAME'} direction="asc" label="강의실 · ID" onClick={() => { setPage(0); setSort('NAME') }} /></th><th className="w-[16%] px-4 py-2.5">개설자</th><th className="w-[24%] px-4 py-2.5">수강 인원</th><th className="w-[14%] px-4 py-2.5"><SortButton active={sort === 'RECENT'} direction="desc" label="생성일" onClick={() => { setPage(0); setSort('RECENT') }} /></th><th className="w-[10%] px-4 py-2.5">상태</th><th className="w-10 px-2 py-2.5"><span className="sr-only">상세</span></th></tr></thead><tbody>
          {result?.items.map((classroom) => <ClassroomRows classroom={classroom} detail={expandedId === classroom.id ? detail : null} expanded={expandedId === classroom.id} key={classroom.id} maxMembers={maxMembers} onToggle={() => toggleDetail(classroom.id)} />)}
        </tbody></table>}
        {!loading && result?.items.length === 0 ? <PanelMessage message="강의실이 없습니다." /> : null}
        {loading ? <PanelMessage message="강의실 정보를 불러오는 중입니다." /> : null}
      </TabletMasterDetail>
      <Pagination page={page} pageSize={result?.size ?? 20} totalElements={result?.totalElements ?? 0} totalPages={result?.totalPages ?? 0} onChange={setPage} />
    </div>
  )
}

function MobileClassroomRow({ classroom, detail, expanded, onToggle }: { classroom: AdminClassroomSummary; detail: AdminClassroomDetail | null; expanded: boolean; onToggle: () => void }) {
  return <article><button aria-expanded={expanded} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left" onClick={onToggle} type="button"><span className="min-w-0 flex-1"><strong className="block truncate type-body text-stone-950">{classroom.name}</strong><span className="block truncate type-caption text-stone-500">{classroom.instructor.name}</span><span className="mt-2 flex flex-wrap items-center gap-2 type-caption text-stone-600"><span>{classroom.memberCount}명</span><StatusBadge status={classroom.status} /><span>{formatDate(classroom.createdAt)}</span></span></span>{expanded ? <ChevronUp aria-hidden="true" size={17} /> : <ChevronDown aria-hidden="true" size={17} />}</button>{expanded ? <div className="bg-stone-50 px-4 py-3">{detail ? <><p className="type-caption font-semibold text-stone-700">참여 회원 {detail.members.length}명</p><div className="mt-2 flex flex-wrap gap-2">{detail.members.map((member) => <span className="rounded-md border border-stone-200 bg-white px-2 py-1.5 type-caption text-stone-600" key={member.userId}>{member.name} · {roleLabel(member.role)}</span>)}</div></> : <p className="type-caption text-stone-500">상세 정보를 불러오는 중입니다.</p>}</div> : null}</article>
}

function ClassroomRows({ classroom, detail, expanded, maxMembers, onToggle }: { classroom: AdminClassroomSummary; detail: AdminClassroomDetail | null; expanded: boolean; maxMembers: number; onToggle: () => void }) {
  return <><tr className="border-b border-stone-100 type-body text-stone-700 hover:bg-stone-50"><td className="px-4 py-3"><p className="truncate font-semibold text-stone-950">{classroom.name} <span className="font-normal text-stone-400">#{classroom.id}</span></p></td><td className="px-4 py-3 text-stone-500">{classroom.instructor.name}</td><td className="px-4 py-3"><div className="flex items-center gap-3"><strong className="w-9 shrink-0 text-right text-stone-900">{classroom.memberCount}명</strong><span className="h-1 flex-1 overflow-hidden rounded-full bg-stone-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(classroom.memberCount > 0 ? 2 : 0, (classroom.memberCount / maxMembers) * 100)}%` }} /></span></div></td><td className="px-4 py-3 text-stone-500">{formatDate(classroom.createdAt)}</td><td className="px-4 py-3"><StatusBadge status={classroom.status} /></td><td className="px-2 py-3"><button aria-expanded={expanded} aria-label={`${classroom.name} 상세 정보`} className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-800" onClick={onToggle} type="button">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td></tr>{expanded ? <tr className="border-b border-stone-100 bg-[#F7F8FA]"><td className="px-4 py-3" colSpan={6}>{detail ? <div><p className="type-caption font-semibold text-stone-700">참여 회원 {detail.members.length}명</p><div className="mt-2 flex flex-wrap gap-2">{detail.members.map((member) => <span className="rounded-md border border-stone-200 bg-white px-2 py-1 type-caption text-stone-600" key={member.userId}>{member.name} · {roleLabel(member.role)}</span>)}</div></div> : <p className="type-caption text-stone-500">상세 정보를 불러오는 중입니다.</p>}</td></tr> : null}</>
}

function AiUsagePanel({ repository }: { repository: Repository }) {
  const initialRange = useMemo(() => defaultDateRange(), [])
  const [range, setRange] = useState(initialRange)
  const [summary, setSummary] = useState<AiUsageSummary | null>(null)
  const [users, setUsers] = useState<AiUsageUser[]>([])
  const [error, setError] = useState<AdminErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      repository.getAiUsageSummary(range, controller.signal),
      repository.getAiUsageUsers({ ...range, limit: 20 }, controller.signal),
    ]).then(([nextSummary, nextUsers]) => { setSummary(nextSummary); setUsers(nextUsers); setError(null) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(toAdminError(reason)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [range, refreshKey, repository])

  const daily = summary?.daily ?? []
  const totals = {
    calls: daily.reduce((total, day) => total + day.callCount, 0),
    failures: daily.reduce((total, day) => total + day.failCount, 0),
    tokens: sumNullableTokenTotals(daily),
  }
  const failureRate = totals.calls > 0 ? (totals.failures / totals.calls) * 100 : 0
  const tokensPerCall = totals.calls > 0 && totals.tokens != null ? totals.tokens / totals.calls : null

  function moveWeek(offset: -1 | 1) {
    setLoading(true)
    setError(null)
    setRange((current) => shiftDateRange(current, offset * 7))
  }

  return <div className="flex h-full min-h-0 flex-col"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3"><div className="flex flex-wrap items-baseline gap-x-4 gap-y-1"><h2 className="type-section-title font-bold text-stone-950">AI 사용량</h2><p className="flex flex-wrap gap-3 type-caption text-stone-500"><span>총 호출 <strong className="text-stone-700">{formatCount(totals.calls)}건</strong></span><span>실패 <strong className={totals.failures > 0 ? 'text-amber-700' : 'text-stone-700'}>{formatCount(totals.failures)}건 ({failureRate.toFixed(1)}%)</strong></span><span>총 토큰 <strong className="text-stone-700">{formatCount(totals.tokens)}</strong></span><span>호출당 <strong className="text-stone-700">{formatCount(tokensPerCall)}</strong></span></p></div><div className="flex items-center gap-2 mobile-phone:w-full mobile-phone:justify-end"><div aria-label="AI 사용량 조회 기간" className="flex h-9 items-center overflow-hidden rounded-lg border border-stone-200 bg-white mobile-web:h-11"><button aria-label="이전 주" className="flex h-full w-9 items-center justify-center text-stone-500 hover:bg-stone-50 hover:text-stone-900 disabled:opacity-40 mobile-web:w-11" disabled={loading} onClick={() => moveWeek(-1)} type="button"><ChevronLeft aria-hidden="true" size={15} /></button><span className="min-w-28 px-2 text-center type-control font-semibold text-stone-700">{formatWeekRange(range)}</span><button aria-label="다음 주" className="flex h-full w-9 items-center justify-center text-stone-500 hover:bg-stone-50 hover:text-stone-900 disabled:opacity-40 mobile-web:w-11" disabled={loading || range.to >= initialRange.to} onClick={() => moveWeek(1)} type="button"><ChevronRight aria-hidden="true" size={15} /></button></div><Button aria-label="AI 사용량 새로고침" className="size-9 shrink-0 p-0 mobile-web:size-11" disabled={loading} onClick={() => { setLoading(true); setError(null); setRefreshKey((key) => key + 1) }} size="sm" title="새로고침" type="button" variant="secondary"><RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : undefined} size={15} /></Button></div></div>
    {error ? <AdminErrorMessage error={error} /> : null}
    <div aria-label="AI 사용량 상세" className="min-h-0 flex-1 overflow-hidden" role="region">
      {loading ? <PanelMessage message="AI 사용량을 불러오는 중입니다." /> : <UsageLayout ranking={<UsersUsageRanking totalCalls={totals.calls} users={users} />} charts={<><DailyUsageChart daily={daily} /><FeatureUsageChart summary={summary} /></>} />}
    </div>
  </div>
}

function XaiManagementPanel({ repository }: { repository: Repository }) {
  const [overview, setOverview] = useState<AdminXaiOverview | null>(null)
  const [credits, setCredits] = useState<AdminXaiCredits | null>(null)
  const [status, setStatus] = useState<AdminXaiStatus | null>(null)
  const [error, setError] = useState<AdminErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      repository.getXaiOverview(controller.signal),
      repository.getXaiCredits(controller.signal),
      repository.getXaiStatus(controller.signal),
    ])
      .then(([nextOverview, nextCredits, nextStatus]) => {
        if (controller.signal.aborted) return
        setOverview(nextOverview)
        setCredits(nextCredits)
        setStatus(nextStatus)
        setError(null)
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(toAdminError(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [repository])

  async function sync() {
    setSyncing(true)
    setSyncMessage(null)
    setError(null)
    try {
      const nextOverview = await repository.syncXai()
      const [nextCredits, nextStatus] = await Promise.all([
        repository.getXaiCredits(),
        repository.getXaiStatus(),
      ])
      setOverview(nextOverview)
      setCredits(nextCredits)
      setStatus(nextStatus)
      setSyncMessage('xAI 비용과 크레딧을 최신 정보로 동기화했습니다.')
    } catch (reason) {
      setError(toAdminError(reason))
    } finally {
      setSyncing(false)
    }
  }

  const available = overview?.available || credits?.available || status?.available
  const stale = overview?.stale === true || credits?.stale === true
  const usedPercent = ratioPercent(credits?.postpaidUsedUsd, credits?.postpaidLimitUsd)

  return (
    <div className="min-h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="type-section-title font-bold text-stone-950">xAI 비용 및 크레딧</h2>
          <p className="mt-1 type-caption text-stone-500">잔액, 이번 달 비용과 소진 위험을 확인합니다.</p>
        </div>
        <Button disabled={loading || syncing || !available} onClick={() => void sync()} size="sm" variant="secondary">
          <RefreshCw aria-hidden="true" className={syncing ? 'animate-spin' : undefined} size={15} />
          {syncing ? '동기화 중' : '지금 동기화'}
        </Button>
      </div>

      {error ? <AdminErrorMessage error={error} /> : null}
      {syncMessage ? <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 type-body text-emerald-800" role="status">{syncMessage}</p> : null}
      {stale ? <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 type-body text-amber-900" role="status"><TriangleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={16} /><span>최신 동기화에 실패해 마지막으로 확인된 정보를 표시하고 있습니다.</span></div> : null}

      {loading ? <PanelMessage message="xAI 관리 정보를 불러오는 중입니다." /> : !available ? (
        <div className="flex min-h-72 flex-col items-center justify-center px-5 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-stone-100 text-stone-500"><WifiOff aria-hidden="true" size={20} /></span>
          <h3 className="mt-4 type-section-title font-bold text-stone-900">xAI 관리 연동을 사용할 수 없습니다.</h3>
          <p className="mt-2 max-w-lg type-body text-stone-500">Management API 설정을 확인한 뒤 다시 접속해 주세요. 인증 정보는 이 화면에 표시되지 않습니다.</p>
          {status?.recentErrorClassification ? <p className="mt-3 type-caption font-semibold text-amber-800">{xaiFailureLabel(status.recentErrorClassification)}</p> : null}
        </div>
      ) : (
        <div>
          <section aria-labelledby="xai-balance-title">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
              <h3 className="type-control font-bold text-stone-900" id="xai-balance-title">비용 요약</h3>
              <XaiRiskBadge risk={overview?.riskLevel ?? null} />
            </div>
            <dl className="grid sm:grid-cols-2 xl:grid-cols-4">
              <XaiMetric label="사용 가능 잔액" value={formatUsd(overview?.totalAvailableUsd)} emphasized />
              <XaiMetric label="선불 잔액" value={formatUsd(overview?.prepaidBalanceUsd)} />
              <XaiMetric label="이번 달 사용 비용" value={formatUsd(overview?.currentMonthCostUsd)} />
              <XaiMetric label="최근 일평균 비용" value={formatUsd(overview?.averageDailyCost7d)} />
            </dl>
          </section>

          <section className="border-t border-stone-200 px-4 py-5" aria-labelledby="xai-postpaid-title">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="type-control font-bold text-stone-900" id="xai-postpaid-title">후불 한도</h3>
                  <span className="type-caption text-stone-500">잔여 {formatUsd(credits?.postpaidRemainingUsd)}</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="후불 한도 사용률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent ?? undefined}>
                  <span className="block h-full rounded-full bg-brand-700" style={{ width: `${usedPercent ?? 0}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-4 type-body">
                  <div><dt className="text-stone-500">사용</dt><dd className="mt-1 font-semibold text-stone-900">{formatUsd(credits?.postpaidUsedUsd)}</dd></div>
                  <div className="text-right"><dt className="text-stone-500">월 한도</dt><dd className="mt-1 font-semibold text-stone-900">{formatUsd(credits?.postpaidLimitUsd)}</dd></div>
                </dl>
              </div>
              <div className="border-t border-stone-100 pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
                <h3 className="type-control font-bold text-stone-900">예상 소진</h3>
                <p className="mt-3 type-section-title font-bold text-stone-950">{overview?.projectedDepletionAt ? formatDate(overview.projectedDepletionAt) : '예측 불가'}</p>
                <p className="mt-1 type-caption text-stone-500">현재 잔액과 평균 사용 비용을 기준으로 계산됩니다.</p>
              </div>
            </div>
          </section>

          <section className="border-t border-stone-200 px-4 py-5" aria-labelledby="xai-sync-title">
            <h3 className="type-control font-bold text-stone-900" id="xai-sync-title">연동 상태</h3>
            <dl className="mt-4 grid gap-x-8 gap-y-4 type-body sm:grid-cols-2 xl:grid-cols-4">
              <XaiDetail label="상태" value={stale ? '이전 데이터' : '정상'} />
              <XaiDetail label="마지막 성공" value={formatOptionalDateTime(status?.lastSuccessfulSyncAt ?? overview?.lastSuccessfulSyncAt)} />
              <XaiDetail label="데이터 조회" value={formatOptionalDateTime(overview?.fetchedAt ?? credits?.fetchedAt)} />
              <XaiDetail label="최근 실패" value={status?.lastFailureAt ? `${formatDateTime(status.lastFailureAt)} · ${xaiFailureLabel(status.recentErrorClassification)}` : '없음'} />
            </dl>
          </section>
        </div>
      )}
    </div>
  )
}

function XaiMetric({ emphasized = false, label, value }: { emphasized?: boolean; label: string; value: string }) {
  return <div className="border-b border-stone-100 px-4 py-4 sm:border-r sm:[&:nth-child(2n)]:border-r-0 xl:border-b-0 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0"><dt className="type-caption text-stone-500">{label}</dt><dd className={`mt-1 font-bold ${emphasized ? 'type-page-title text-brand-700' : 'type-section-title text-stone-950'}`}>{value}</dd></div>
}

function XaiDetail({ label, value }: { label: string; value: string }) {
  return <div><dt className="type-caption text-stone-500">{label}</dt><dd className="mt-1 break-words font-semibold text-stone-800">{value}</dd></div>
}

function XaiRiskBadge({ risk }: { risk: AdminXaiOverview['riskLevel'] }) {
  const style = risk === 'CRITICAL'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : risk === 'WARNING'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : risk === 'NORMAL'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-stone-200 bg-stone-50 text-stone-600'
  const label = risk === 'CRITICAL' ? '소진 위험' : risk === 'WARNING' ? '잔액 주의' : risk === 'NORMAL' ? '정상' : '판단 대기'
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 type-caption font-semibold ${style}`}><CircleDollarSign aria-hidden="true" size={14} />{label}</span>
}

function UsageLayout({ ranking, charts }: { ranking: ReactNode; charts: ReactNode }) {
  const { isTablet } = useResponsiveViewport()
  const [measureArea, areaWidth] = useElementWidth()
  const [view, setView] = useState('charts')
  if (!isTablet) return <div className="grid h-full min-h-0 grid-rows-[minmax(150px,1fr)_minmax(240px,1.35fr)] xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.55fr)] xl:grid-rows-1">{ranking}<div className="grid min-h-0 grid-rows-2 overflow-hidden">{charts}</div></div>
  const narrow = areaWidth < 960
  return <div ref={measureArea} className="flex h-full min-h-0 flex-col">
    {narrow ? <div aria-label="사용량 보기" role="group" className="flex shrink-0 border-b border-stone-200 p-2">{[['charts', '추이 · 기능'], ['users', '사용자별 호출']].map(([value, label]) => <button type="button" aria-pressed={view === value} key={value} onClick={() => setView(value)} className={`min-h-11 flex-1 rounded-lg px-3 type-control ${view === value ? 'bg-brand-50 font-bold text-brand-700' : 'text-stone-500'}`}>{label}</button>)}</div> : null}
    <div className="flex min-h-0 flex-1">
      <div className={`${narrow && view !== 'users' ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-col ${narrow ? 'w-full' : 'w-2/5'}`}>{ranking}</div>
      <div className={`${narrow && view !== 'charts' ? 'hidden' : 'block'} min-h-0 min-w-0 flex-1 overflow-auto`}>{charts}</div>
    </div>
  </div>
}

function UsersUsageRanking({ totalCalls, users }: { totalCalls: number; users: AiUsageUser[] }) {
  const { isTablet } = useResponsiveViewport()
  if (isTablet) return <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="usage-ranking-title">
    <h3 className="shrink-0 border-b border-stone-200 p-3 type-control font-bold" id="usage-ranking-title">사용자별 호출 <span className="font-normal text-stone-500">상위 {users.length}명</span></h3>
    <div aria-label="사용자별 호출 목록" role="region" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <ol className="divide-y divide-stone-100">{users.map((user, index) => <li key={user.userId} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 p-3">
        <span className="font-bold text-stone-500">{index + 1}</span>
        <div className="min-w-0"><p className="break-words type-body font-semibold">{user.name}</p><p className="break-all type-caption text-stone-500">{user.email}</p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 type-caption"><div><dt className="text-stone-500">호출</dt><dd>{formatCount(user.callCount)}건</dd></div><div><dt className="text-stone-500">비중</dt><dd>{totalCalls > 0 ? `${Math.round(user.callCount / totalCalls * 100)}%` : '-'}</dd></div><div><dt className="text-stone-500">토큰</dt><dd>{formatCount(tokenTotal(user))}</dd></div></dl>
        </div>
      </li>)}</ol>{users.length === 0 ? <PanelMessage message="선택한 기간의 사용자 기록이 없습니다." /> : null}
    </div>
  </section>
  return <section className="flex min-h-0 flex-col overflow-hidden border-b border-stone-200 xl:border-r xl:border-b-0" aria-labelledby="usage-ranking-title"><h3 className="shrink-0 border-b border-stone-100 px-4 py-3 type-control font-bold text-stone-900" id="usage-ranking-title">사용자별 호출 <span className="ml-1 font-normal text-stone-400">상위 {users.length}명</span></h3><div aria-label="사용자별 호출 목록" className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" role="region"><table className="w-full table-fixed text-left type-caption"><thead className="sticky top-0 z-10 bg-[#F7F8FA] text-stone-500"><tr><th className="w-10 px-4 py-2">#</th><th className="px-2 py-2">사용자</th><th className="w-16 px-2 py-2 text-right">호출</th><th className="w-16 px-2 py-2 text-right">비중</th><th className="w-24 px-4 py-2 text-right">토큰</th></tr></thead><tbody>{users.map((user, index) => <tr className="border-b border-stone-100" key={user.userId}><td className="px-4 py-3"><span className={index < 3 ? 'inline-flex size-5 items-center justify-center rounded-md bg-emerald-50 font-bold text-emerald-700' : 'inline-flex size-5 items-center justify-center text-stone-400'}>{index + 1}</span></td><td className="min-w-0 px-2 py-3"><p className="truncate font-semibold text-stone-800">{user.name}</p><p className="truncate text-stone-400">{user.email}</p></td><td className="px-2 py-3 text-right font-semibold text-stone-800">{formatCount(user.callCount)}</td><td className="px-2 py-3 text-right text-stone-500">{totalCalls > 0 ? `${Math.round((user.callCount / totalCalls) * 100)}%` : '-'}</td><td className="px-4 py-3 text-right text-stone-500">{formatCount(tokenTotal(user))}</td></tr>)}</tbody></table>{users.length === 0 ? <PanelMessage message="선택한 기간의 사용자 기록이 없습니다." /> : null}</div></section>
}

function DailyUsageChart({ daily }: { daily: AiUsageSummary['daily'] }) {
  const maxCalls = Math.max(1, ...daily.map((day) => day.callCount))

  return (
    <section className="min-h-0 overflow-hidden border-b border-stone-200 px-4 py-3" aria-labelledby="daily-usage-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-control font-bold text-stone-900" id="daily-usage-title">일별 호출</h3>
        <div className="flex items-center gap-4 type-caption text-stone-500"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-brand-700" />성공</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-amber-500" />실패</span></div>
      </div>
      {daily.length === 0 ? <p className="py-10 text-center type-body text-stone-500">선택한 기간의 사용 기록이 없습니다.</p> : (
        <div className="overflow-x-auto pb-1" role="region" aria-label="일별 호출 그래프" tabIndex={0}>
          <div className="flex min-w-max items-end justify-around gap-5" role="img" aria-label="날짜별 AI 성공 및 실패 호출 막대 차트">
            {daily.map((day) => {
              const tokens = tokenTotal(day)
              const successHeight = (day.successCount / maxCalls) * 100
              const failHeight = (day.failCount / maxCalls) * 100
              return <div className="flex w-16 shrink-0 flex-col items-center" key={day.date} title={`${day.date}: 성공 ${formatCount(day.successCount)}건, 실패 ${formatCount(day.failCount)}건, 토큰 ${formatCount(tokens)}`}><strong className="mb-1 type-caption text-stone-700">{formatCount(day.callCount)}</strong><div className="flex h-16 w-7 flex-col justify-end overflow-hidden rounded-t-sm sm:h-20 xl:h-28"><span className="w-full bg-amber-500" style={{ height: `${failHeight}%` }} /><span className="w-full bg-brand-700" style={{ height: `${Math.max(day.successCount > 0 ? 3 : 0, successHeight)}%` }} /></div><span className="mt-1 type-caption text-stone-500">{formatMonthDay(day.date)}</span><span className="type-micro text-stone-400">{formatCompactNumber(tokens)}</span></div>
            })}
          </div>
        </div>
      )}
      <TabletChartValues label="일별 호출" columns={['날짜', '성공', '실패', '토큰']} rows={daily.map(day => [day.date, formatCount(day.successCount), formatCount(day.failCount), formatCount(tokenTotal(day))])} />
    </section>
  )
}

function FeatureUsageChart({ summary }: { summary: AiUsageSummary | null }) {
  const features = summary?.features ?? []
  const maxCalls = Math.max(1, ...features.map((item) => item.callCount))
  return <section className="min-h-0 overflow-hidden px-4 py-3" aria-labelledby="feature-usage-title">
    <h3 className="mb-2 type-control font-bold text-stone-900" id="feature-usage-title">기능별 호출</h3>
    {features.length === 0 ? <p className="py-8 text-center type-body text-stone-500">선택한 기간의 기능별 기록이 없습니다.</p> : <div className="overflow-x-auto pb-1" role="region" aria-label="기능별 호출 그래프" tabIndex={0}>
      <div className="flex min-w-max items-end justify-around gap-5" role="img" aria-label="기능별 AI 호출 막대 차트">{features.map((item) => <div className="flex w-20 shrink-0 flex-col items-center" key={item.feature} title={`${featureLabel(item.feature)}: ${formatCount(item.callCount)}건, 토큰 ${formatCount(tokenTotal(item))}`}><strong className="mb-1 type-caption text-stone-700">{formatCount(item.callCount)}</strong><span className="flex h-16 items-end sm:h-20 xl:h-28"><span className="block w-7 rounded-t-sm bg-brand-700" style={{ height: `${Math.max(3, (item.callCount / maxCalls) * 100)}%` }} /></span><span className="mt-1 max-w-full truncate type-caption text-stone-600">{featureLabel(item.feature)}</span><span className="type-micro text-stone-400">{formatCompactNumber(tokenTotal(item))}</span></div>)}</div>
    </div>}
    <TabletChartValues label="기능별 호출" columns={['기능', '호출', '토큰']} rows={features.map(item => [featureLabel(item.feature), formatCount(item.callCount), formatCount(tokenTotal(item))])} />
  </section>
}

function FilterSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) { return <label><span className="sr-only">{label}</span><select className="h-9 rounded-lg border border-stone-200 bg-white px-3 type-control text-stone-700 outline-none focus:border-brand-600" onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label> }

function SortButton({ active, direction, label, onClick, toggleable = false }: { active: boolean; direction: 'asc' | 'desc'; label: string; onClick: () => void; toggleable?: boolean }) {
  const nextDirection = active && toggleable
    ? direction === 'asc' ? '내림차순' : '오름차순'
    : direction === 'asc' ? '오름차순' : '내림차순'
  const SortIcon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown
  return <button aria-label={`${label} ${nextDirection} 정렬`} aria-pressed={active} className={`inline-flex min-h-8 items-center gap-1 whitespace-nowrap text-left hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 ${active ? 'text-brand-700' : ''}`} onClick={onClick} type="button"><span>{label}</span><SortIcon aria-hidden="true" className="shrink-0" size={12} /></button>
}

function Pagination({ onChange, page, pageSize, totalElements, totalPages }: { onChange: (page: number) => void; page: number; pageSize: number; totalElements: number; totalPages: number }) { const start = totalElements === 0 ? 0 : page * pageSize + 1; const end = Math.min(totalElements, (page + 1) * pageSize); return <div className="flex h-12 items-center justify-between gap-2 border-t border-stone-200 px-4 type-caption text-stone-500"><span>{start}-{end} / {formatCount(totalElements)}</span><span className="flex items-center gap-2"><button aria-label="이전 페이지" className="flex h-8 items-center justify-center rounded-md border border-stone-200 px-2.5 disabled:opacity-40" disabled={page <= 0} onClick={() => onChange(page - 1)} type="button">이전</button><button aria-label="다음 페이지" className="flex h-8 items-center justify-center rounded-md border border-stone-200 px-2.5 disabled:opacity-40" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)} type="button">다음</button></span></div> }

function StatusBadge({ status }: { status: string }) { const active = status === 'ACTIVE'; return <span className={active ? 'inline-flex rounded-md bg-emerald-50 px-2 py-1 type-caption font-semibold text-emerald-700' : 'inline-flex rounded-md bg-stone-100 px-2 py-1 type-caption font-semibold text-stone-500'}>{active ? '활성' : status === 'DELETED' ? '탈퇴' : status}</span> }
function roleLabel(role: string) { return role === 'ADMIN' ? '관리자' : role === 'INSTRUCTOR' || role === 'TEACHER' ? '강의자' : '학습자' }
function formatDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value)) }
function defaultDateRange() { const to = new Date(); const from = new Date(to); from.setDate(from.getDate() - 6); return { from: localDate(from), to: localDate(to) } }
function localDate(value: Date) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(value) }
function shiftDateRange(range: { from: string; to: string }, days: number) { return { from: shiftIsoDate(range.from, days), to: shiftIsoDate(range.to, days) } }
function shiftIsoDate(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
function formatWeekRange(range: { from: string; to: string }) { return `${formatPaddedMonthDay(range.from)} - ${formatPaddedMonthDay(range.to)}` }
function formatPaddedMonthDay(value: string) { const [, month, day] = value.split('-'); return `${month}.${day}` }
function featureLabel(feature: string) { return ({ TURN: '학습 대화', DOC_CHAT: '자료 채팅', GRADE: '채점', QUIZ_ASSESSMENT: '퀴즈 평가', DIAGNOSIS: '진단', REPORT: '리포트', EXAM_DRAFT: '시험 초안', OUTLINE: '개요', CAPTIONS: '자막', CRITERIA: '평가 기준', EXTRACT: '문서 추출' } as Record<string, string>)[feature] ?? feature }
function tokenTotal(value: { inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null }) { const tokens = [value.inputTokens, value.outputTokens, value.reasoningTokens]; return tokens.every((token) => token === null) ? null : tokens.reduce<number>((total, token) => total + (token ?? 0), 0) }
function sumNullableTokenTotals(values: Array<{ inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null }>) { const totals = values.map(tokenTotal).filter((value): value is number => value !== null); return totals.length === 0 ? null : totals.reduce((sum, value) => sum + value, 0) }
function formatMonthDay(value: string) { const [, month, day] = value.split('-'); return `${Number(month)}/${Number(day)}` }
function formatCompactNumber(value: number | null | undefined) { if (value == null) return '-'; return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1, notation: 'compact' }).format(value) }
function formatUsd(value: string | null | undefined) { if (value == null || value.trim() === '') return '-'; const amount = Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount) : '-' }
function formatOptionalDateTime(value: string | null | undefined) { return value ? formatDateTime(value) : '-' }
function ratioPercent(value: string | null | undefined, total: string | null | undefined) { const amount = Number(value); const maximum = Number(total); return Number.isFinite(amount) && Number.isFinite(maximum) && maximum > 0 ? Math.min(100, Math.max(0, amount / maximum * 100)) : null }
function xaiFailureLabel(value: AdminXaiStatus['recentErrorClassification']) { return value === 'CONFIGURATION_ERROR' ? '연동 설정 오류' : value === 'TEMPORARY_FAILURE' ? '일시적인 통신 오류' : '확인된 오류 없음' }
