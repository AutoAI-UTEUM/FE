import { BarChart3, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  createAdminRepository,
  type AdminClassroomDetail,
  type AdminClassroomSummary,
  type AdminPageResult,
  type AdminSort,
  type AdminUserDetail,
  type AdminUserRole,
  type AdminUserStatus,
  type AdminUserSummary,
  type AiUsageSummary,
  type AiUsageUser,
} from '../../../features/admin'
import { useAuth } from '../../../features/auth'
import { ApiClientError } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { Button } from '../../../shared/ui'
import { routes } from '../../routes'

type AdminTab = 'users' | 'classrooms' | 'ai-usage'

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: 'users', label: '회원' },
  { id: 'classrooms', label: '강의실' },
  { id: 'ai-usage', label: 'AI 사용량' },
]

export function AdminPage() {
  usePageTitle('관리자')
  const { apiRequest } = useAuth()
  const repository = useMemo(() => createAdminRepository(apiRequest), [apiRequest])
  const [tab, setTab] = useState<AdminTab>('users')

  return (
    <div className="flex min-h-[calc(100dvh-40px)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-700 text-white">
            <ShieldCheck aria-hidden="true" size={18} />
          </span>
          <div>
            <h1 className="type-page-title font-bold text-stone-950">관리자</h1>
            <p className="mt-0.5 type-caption text-stone-500">서비스 운영 현황 조회</p>
          </div>
        </div>
        <nav aria-label="관리자 메뉴" className="flex h-9 items-center rounded-lg bg-stone-100 p-1">
          {tabs.map((item) => (
            <button
              aria-current={tab === item.id ? 'page' : undefined}
              className={tab === item.id
                ? 'h-7 rounded-md bg-white px-3 type-control font-semibold text-stone-950 shadow-sm'
                : 'h-7 rounded-md px-3 type-control font-medium text-stone-500 hover:text-stone-900'}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="mt-4 min-h-0 flex-1 overflow-hidden rounded-lg border border-stone-200 bg-white">
        {tab === 'users' ? <UsersPanel repository={repository} /> : null}
        {tab === 'classrooms' ? <ClassroomsPanel repository={repository} /> : null}
        {tab === 'ai-usage' ? <AiUsagePanel repository={repository} /> : null}
      </section>
    </div>
  )
}

type Repository = ReturnType<typeof createAdminRepository>

function UsersPanel({ repository }: { repository: Repository }) {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [role, setRole] = useState<AdminUserRole | ''>('')
  const [status, setStatus] = useState<AdminUserStatus | ''>('')
  const [sort, setSort] = useState<AdminSort>('RECENT')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<AdminPageResult<AdminUserSummary> | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [error, setError] = useState<AdminErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    repository.listUsers({
      page,
      q: submittedQuery || undefined,
      role: role || undefined,
      size: 20,
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
    void repository.getUser(userId).then(setDetail).catch((reason: unknown) => setError(toAdminError(reason)))
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="type-section-title font-bold text-stone-950">회원 목록</h2>
          <p className="type-caption text-stone-500">{formatCount(result?.totalElements)}명</p>
        </div>
        <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); setPage(0); setSubmittedQuery(query.trim()) }}>
          <label className="relative">
            <span className="sr-only">회원 검색</span>
            <Search aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" size={15} />
            <input className="h-9 w-60 rounded-lg border border-stone-200 bg-white pr-3 pl-9 type-control outline-none focus:border-brand-600" onChange={(event) => setQuery(event.target.value)} placeholder="이름 또는 이메일 검색" value={query} />
          </label>
          <FilterSelect label="역할" onChange={(value) => { setPage(0); setRole(value as AdminUserRole | '') }} value={role} options={[['', '전체 역할'], ['LEARNER', '학습자'], ['INSTRUCTOR', '강의자'], ['ADMIN', '관리자']]} />
          <FilterSelect label="상태" onChange={(value) => { setPage(0); setStatus(value as AdminUserStatus | '') }} value={status} options={[['', '전체 상태'], ['ACTIVE', '활성'], ['DELETED', '탈퇴']]} />
          <FilterSelect label="정렬" onChange={(value) => { setPage(0); setSort(value as AdminSort) }} value={sort} options={[['RECENT', '최근 가입순'], ['NAME', '이름순']]} />
        </form>
      </div>
      {error ? <AdminErrorMessage error={error} /> : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[780px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#F7F8FA] type-caption font-semibold text-stone-500">
            <tr><th className="px-4 py-3">회원</th><th className="px-4 py-3">역할</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">가입일</th><th className="px-4 py-3">인증</th><th className="w-12 px-4 py-3"><span className="sr-only">상세</span></th></tr>
          </thead>
          <tbody>
            {result?.items.map((user) => (
              <UserRows detail={expandedId === user.id ? detail : null} expanded={expandedId === user.id} key={user.id} onToggle={() => toggleDetail(user.id)} user={user} />
            ))}
          </tbody>
        </table>
        {!loading && result?.items.length === 0 ? <PanelMessage message="조건에 맞는 회원이 없습니다." /> : null}
        {loading ? <PanelMessage message="회원 정보를 불러오는 중입니다." /> : null}
      </div>
      <Pagination page={page} totalPages={result?.totalPages ?? 0} onChange={setPage} />
    </div>
  )
}

function UserRows({ detail, expanded, onToggle, user }: { detail: AdminUserDetail | null; expanded: boolean; onToggle: () => void; user: AdminUserSummary }) {
  return (
    <>
      <tr className="border-b border-stone-100 type-body text-stone-700 hover:bg-stone-50">
        <td className="px-4 py-3"><p className="font-semibold text-stone-950">{user.name}</p><p className="type-caption text-stone-500">{user.email}</p></td>
        <td className="px-4 py-3">{roleLabel(user.role)}</td><td className="px-4 py-3"><StatusBadge status={user.status} /></td><td className="px-4 py-3">{formatDate(user.createdAt)}</td><td className="px-4 py-3">{user.authProvider}</td>
        <td className="px-4 py-3"><button aria-expanded={expanded} aria-label={`${user.name} 상세 정보`} className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-800" onClick={onToggle} type="button">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td>
      </tr>
      {expanded ? <tr className="border-b border-stone-100 bg-[#F7F8FA]"><td className="px-4 py-3 type-caption text-stone-600" colSpan={6}>{detail ? <div className="flex flex-wrap gap-x-8 gap-y-2"><span>회원 ID <strong className="text-stone-900">{detail.id}</strong></span><span>소속 <strong className="text-stone-900">{detail.affiliation || '-'}</strong></span><span>동의 일시 <strong className="text-stone-900">{detail.consentedAt ? formatDateTime(detail.consentedAt) : '-'}</strong></span></div> : '상세 정보를 불러오는 중입니다.'}</td></tr> : null}
    </>
  )
}

function ClassroomsPanel({ repository }: { repository: Repository }) {
  const [sort, setSort] = useState<AdminSort>('RECENT')
  const [page, setPage] = useState(0)
  const [result, setResult] = useState<AdminPageResult<AdminClassroomSummary> | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<AdminClassroomDetail | null>(null)
  const [error, setError] = useState<AdminErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)

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
    void repository.getClassroom(classroomId).then(setDetail).catch((reason: unknown) => setError(toAdminError(reason)))
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3"><div><h2 className="type-section-title font-bold text-stone-950">전체 강의실</h2><p className="type-caption text-stone-500">{formatCount(result?.totalElements)}개</p></div><FilterSelect label="정렬" onChange={(value) => { setPage(0); setSort(value as AdminSort) }} value={sort} options={[['RECENT', '최근 생성순'], ['NAME', '이름순']]} /></div>
      {error ? <AdminErrorMessage error={error} /> : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[720px] border-collapse text-left"><thead className="sticky top-0 z-10 bg-[#F7F8FA] type-caption font-semibold text-stone-500"><tr><th className="px-4 py-3">강의실</th><th className="px-4 py-3">개설자</th><th className="px-4 py-3">인원</th><th className="px-4 py-3">상태</th><th className="px-4 py-3">생성일</th><th className="w-12 px-4 py-3"><span className="sr-only">상세</span></th></tr></thead><tbody>
          {result?.items.map((classroom) => <ClassroomRows classroom={classroom} detail={expandedId === classroom.id ? detail : null} expanded={expandedId === classroom.id} key={classroom.id} onToggle={() => toggleDetail(classroom.id)} />)}
        </tbody></table>
        {!loading && result?.items.length === 0 ? <PanelMessage message="강의실이 없습니다." /> : null}
        {loading ? <PanelMessage message="강의실 정보를 불러오는 중입니다." /> : null}
      </div>
      <Pagination page={page} totalPages={result?.totalPages ?? 0} onChange={setPage} />
    </div>
  )
}

function ClassroomRows({ classroom, detail, expanded, onToggle }: { classroom: AdminClassroomSummary; detail: AdminClassroomDetail | null; expanded: boolean; onToggle: () => void }) {
  return <><tr className="border-b border-stone-100 type-body text-stone-700 hover:bg-stone-50"><td className="px-4 py-3 font-semibold text-stone-950">{classroom.name}</td><td className="px-4 py-3">{classroom.instructor.name}</td><td className="px-4 py-3">{classroom.memberCount}명</td><td className="px-4 py-3"><StatusBadge status={classroom.status} /></td><td className="px-4 py-3">{formatDate(classroom.createdAt)}</td><td className="px-4 py-3"><button aria-expanded={expanded} aria-label={`${classroom.name} 상세 정보`} className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-800" onClick={onToggle} type="button">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button></td></tr>{expanded ? <tr className="border-b border-stone-100 bg-[#F7F8FA]"><td className="px-4 py-3" colSpan={6}>{detail ? <div><p className="type-caption font-semibold text-stone-700">참여 회원 {detail.members.length}명</p><div className="mt-2 flex flex-wrap gap-2">{detail.members.map((member) => <span className="rounded-md border border-stone-200 bg-white px-2 py-1 type-caption text-stone-600" key={member.userId}>{member.name} · {roleLabel(member.role)}</span>)}</div></div> : <p className="type-caption text-stone-500">상세 정보를 불러오는 중입니다.</p>}</td></tr> : null}</>
}

function AiUsagePanel({ repository }: { repository: Repository }) {
  const initialRange = useMemo(() => defaultDateRange(), [])
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [range, setRange] = useState(initialRange)
  const [summary, setSummary] = useState<AiUsageSummary | null>(null)
  const [users, setUsers] = useState<AiUsageUser[]>([])
  const [error, setError] = useState<AdminErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      repository.getAiUsageSummary(range, controller.signal),
      repository.getAiUsageUsers({ ...range, limit: 20 }, controller.signal),
    ]).then(([nextSummary, nextUsers]) => { setSummary(nextSummary); setUsers(nextUsers); setError(null) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(toAdminError(reason)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [range, repository])

  const daily = summary?.daily ?? []
  const totals = {
    calls: daily.reduce((total, day) => total + day.callCount, 0),
    failures: daily.reduce((total, day) => total + day.failCount, 0),
    tokens: sumNullableTokenTotals(daily),
  }

  return <div className="flex h-full min-h-[560px] flex-col"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3"><div><h2 className="type-section-title font-bold text-stone-950">AI 사용량</h2><p className="type-caption text-stone-500">호출 및 토큰 사용 현황</p></div><form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); setRange({ from, to }) }}><label className="type-caption text-stone-500">시작일 <input className="ml-1 h-9 rounded-lg border border-stone-200 px-2 text-stone-800" max={to} onChange={(event) => setFrom(event.target.value)} type="date" value={from} /></label><label className="type-caption text-stone-500">종료일 <input className="ml-1 h-9 rounded-lg border border-stone-200 px-2 text-stone-800" min={from} onChange={(event) => setTo(event.target.value)} type="date" value={to} /></label><Button size="sm" type="submit">조회</Button></form></div>
    {error ? <AdminErrorMessage error={error} /> : null}
    <div className="min-h-0 flex-1 overflow-auto"><div className="grid border-b border-stone-200 sm:grid-cols-3"><Metric label="총 호출" value={`${formatCount(totals.calls)}건`} /><Metric label="실패" value={`${formatCount(totals.failures)}건`} /><Metric label="총 토큰" value={formatCount(totals.tokens)} /></div>
      {loading ? <PanelMessage message="AI 사용량을 불러오는 중입니다." /> : <><DailyUsageChart daily={daily} /><div className="grid xl:grid-cols-2"><UsageTable summary={summary} /><UsersUsageTable users={users} /></div></>}
    </div>
  </div>
}

function UsageTable({ summary }: { summary: AiUsageSummary | null }) {
  return <div className="border-b border-stone-200 xl:border-r xl:border-b-0"><h3 className="border-b border-stone-100 px-4 py-3 type-control font-bold text-stone-900">기능별 호출</h3><table className="w-full text-left type-caption"><thead className="bg-[#F7F8FA] text-stone-500"><tr><th className="px-4 py-2">기능</th><th className="px-4 py-2 text-right">호출</th><th className="px-4 py-2 text-right">토큰</th></tr></thead><tbody>{summary?.features.map((item) => <tr className="border-b border-stone-100" key={item.feature}><td className="px-4 py-2.5 font-medium text-stone-800">{featureLabel(item.feature)}</td><td className="px-4 py-2.5 text-right">{formatCount(item.callCount)}</td><td className="px-4 py-2.5 text-right">{formatCount(tokenTotal(item))}</td></tr>)}</tbody></table></div>
}

function UsersUsageTable({ users }: { users: AiUsageUser[] }) {
  return <div><h3 className="border-b border-stone-100 px-4 py-3 type-control font-bold text-stone-900">사용자별 호출 상위</h3><table className="w-full text-left type-caption"><thead className="bg-[#F7F8FA] text-stone-500"><tr><th className="px-4 py-2">회원</th><th className="px-4 py-2 text-right">호출</th><th className="px-4 py-2 text-right">토큰</th></tr></thead><tbody>{users.map((user) => <tr className="border-b border-stone-100" key={user.userId}><td className="px-4 py-2.5"><p className="font-medium text-stone-800">{user.name}</p><p className="text-stone-400">{user.email}</p></td><td className="px-4 py-2.5 text-right">{formatCount(user.callCount)}</td><td className="px-4 py-2.5 text-right">{formatCount(tokenTotal(user))}</td></tr>)}</tbody></table></div>
}

function DailyUsageChart({ daily }: { daily: AiUsageSummary['daily'] }) {
  const maxCalls = Math.max(1, ...daily.map((day) => day.callCount))
  const knownTokens = daily.map(tokenTotal).filter((value): value is number => value !== null)
  const maxTokens = Math.max(1, ...knownTokens)

  return (
    <section className="border-b border-stone-200 px-4 py-4" aria-labelledby="daily-usage-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 type-control font-bold text-stone-900" id="daily-usage-title"><BarChart3 aria-hidden="true" size={16} />일별 사용 추이</h3>
        <div className="flex items-center gap-4 type-caption text-stone-500"><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-brand-700" />호출</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-500" />토큰</span></div>
      </div>
      {daily.length === 0 ? <p className="py-10 text-center type-body text-stone-500">선택한 기간의 사용 기록이 없습니다.</p> : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-end gap-2" role="img" aria-label="날짜별 AI 호출 수와 토큰 사용량 막대 차트">
            {daily.map((day) => {
              const tokens = tokenTotal(day)
              return <div className="flex w-14 shrink-0 flex-col items-center" key={day.date} title={`${day.date}: 호출 ${formatCount(day.callCount)}건, 토큰 ${formatCount(tokens)}`}><div className="flex h-28 items-end gap-1"><span className="w-3 rounded-t-sm bg-brand-700" style={{ height: `${Math.max(3, (day.callCount / maxCalls) * 100)}%` }} /><span className="w-3 rounded-t-sm bg-emerald-500" style={{ height: tokens === null ? 0 : `${Math.max(3, (tokens / maxTokens) * 100)}%` }} /></div><span className="mt-2 type-caption text-stone-500">{formatMonthDay(day.date)}</span></div>
            })}
          </div>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border-b border-stone-100 px-4 py-4 sm:border-r sm:last:border-r-0"><p className="type-caption text-stone-500">{label}</p><p className="mt-1 type-section-title font-bold text-stone-950">{value}</p></div> }

function FilterSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) { return <label><span className="sr-only">{label}</span><select className="h-9 rounded-lg border border-stone-200 bg-white px-3 type-control text-stone-700 outline-none focus:border-brand-600" onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label> }

function Pagination({ onChange, page, totalPages }: { onChange: (page: number) => void; page: number; totalPages: number }) { return <div className="flex h-12 items-center justify-end gap-2 border-t border-stone-200 px-4 type-caption text-stone-500"><span>{totalPages === 0 ? 0 : page + 1} / {totalPages}</span><button aria-label="이전 페이지" className="flex size-8 items-center justify-center rounded-md border border-stone-200 disabled:opacity-40" disabled={page <= 0} onClick={() => onChange(page - 1)} type="button"><ChevronLeft size={15} /></button><button aria-label="다음 페이지" className="flex size-8 items-center justify-center rounded-md border border-stone-200 disabled:opacity-40" disabled={page + 1 >= totalPages} onClick={() => onChange(page + 1)} type="button"><ChevronRight size={15} /></button></div> }

function PanelMessage({ action, message, tone = 'default' }: { action?: React.ReactNode; message: string; tone?: 'default' | 'error' }) { return <div className={tone === 'error' ? 'flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-4 py-3 type-body text-rose-700' : 'px-4 py-10 text-center type-body text-stone-500'} role={tone === 'error' ? 'alert' : 'status'}><span>{message}</span>{action}</div> }
function AdminErrorMessage({ error }: { error: AdminErrorInfo }) { const { logout } = useAuth(); const navigate = useNavigate(); const action = error.forbidden ? <Button onClick={() => { void logout().finally(() => navigate(routes.login, { replace: true })) }} size="sm" variant="secondary">다시 로그인</Button> : undefined; return <PanelMessage action={action} message={error.message} tone="error" /> }
function StatusBadge({ status }: { status: string }) { const active = status === 'ACTIVE'; return <span className={active ? 'inline-flex rounded-md bg-emerald-50 px-2 py-1 type-caption font-semibold text-emerald-700' : 'inline-flex rounded-md bg-stone-100 px-2 py-1 type-caption font-semibold text-stone-500'}>{active ? '활성' : status === 'DELETED' ? '탈퇴' : status}</span> }
function roleLabel(role: string) { return role === 'ADMIN' ? '관리자' : role === 'INSTRUCTOR' || role === 'TEACHER' ? '강의자' : '학습자' }
function formatCount(value: number | null | undefined) { return value == null ? '-' : value.toLocaleString('ko-KR') }
function formatDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value)) }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function defaultDateRange() { const to = new Date(); const from = new Date(to); from.setDate(from.getDate() - 6); return { from: localDate(from), to: localDate(to) } }
function localDate(value: Date) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(value) }
type AdminErrorInfo = { forbidden: boolean; message: string }
function toAdminError(error: unknown): AdminErrorInfo { if (error instanceof ApiClientError && error.status === 403) return { forbidden: true, message: '관리자 권한이 변경되었어요. 다시 로그인하면 현재 권한에 맞는 화면으로 이동합니다.' }; return { forbidden: false, message: error instanceof Error ? error.message : '관리자 정보를 불러오지 못했습니다.' } }
function featureLabel(feature: string) { return ({ TURN: '학습 대화', DOC_CHAT: '자료 채팅', GRADE: '채점', QUIZ_ASSESSMENT: '퀴즈 평가', DIAGNOSIS: '진단', REPORT: '리포트', EXAM_DRAFT: '시험 초안', OUTLINE: '개요', CAPTIONS: '자막', CRITERIA: '평가 기준', EXTRACT: '문서 추출' } as Record<string, string>)[feature] ?? feature }
function tokenTotal(value: { inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null }) { const tokens = [value.inputTokens, value.outputTokens, value.reasoningTokens]; return tokens.every((token) => token === null) ? null : tokens.reduce<number>((total, token) => total + (token ?? 0), 0) }
function sumNullableTokenTotals(values: Array<{ inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null }>) { const totals = values.map(tokenTotal).filter((value): value is number => value !== null); return totals.length === 0 ? null : totals.reduce((sum, value) => sum + value, 0) }
function formatMonthDay(value: string) { const [, month, day] = value.split('-'); return `${Number(month)}/${Number(day)}` }
