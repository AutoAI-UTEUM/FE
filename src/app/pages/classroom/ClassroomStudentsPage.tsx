import { ArrowUpDown, ChevronDown, Copy, Download, KeyRound, MoreHorizontal, Search, UserRoundX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import { createClassroomsRepository, rememberClassroomId, type Classroom, type ClassroomStudent } from '../../../features/classrooms'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import { Button, ButtonLink, EmptyState, useToast } from '../../../shared/ui'
import { classroomEntranceRequestsPath } from '../../routes'
import { ClassroomWorkspaceContainer } from './ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader } from './ClassroomWorkspaceHeader'

type StudentFilter = 'all' | 'inactive' | 'recent'
type StudentSort = 'activity-desc' | 'joined-desc' | 'name-asc'

export function ClassroomStudentsPage() {
  usePageTitle('수강생 관리')
  const { classroomId = '' } = useParams()
  const { apiRequest } = useAuth()
  const { show: showToast } = useToast()
  const repository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [students, setStudents] = useState<ClassroomStudent[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StudentFilter>('all')
  const [sort, setSort] = useState<StudentSort>('activity-desc')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [nextClassroom, nextStudents] = await Promise.all([
        repository.get(classroomId),
        repository.listStudents(classroomId),
      ])
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
    const loadTimer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [classroomId, load])

  const inactiveCount = students.filter(isInactiveStudent).length
  const visibleStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
    return students
      .filter((student) => {
        if (filter === 'inactive' && !isInactiveStudent(student)) return false
        if (filter === 'recent' && isInactiveStudent(student)) return false
        if (!normalizedQuery) return true
        return [student.name, student.email, student.affiliation]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase('ko-KR').includes(normalizedQuery))
      })
      .sort((left, right) => {
        if (sort === 'name-asc') return left.name.localeCompare(right.name, 'ko-KR')
        if (sort === 'joined-desc') return new Date(right.joinedAt).getTime() - new Date(left.joinedAt).getTime()
        return getActivityTime(right) - getActivityTime(left)
      })
  }, [filter, query, sort, students])

  async function copyInviteCode() {
    if (!classroom) return
    try {
      const inviteCode = classroom.inviteCode || await repository.getInviteCode(classroom.id)
      await navigator.clipboard.writeText(inviteCode)
      setClassroom((current) => current ? { ...current, inviteCode } : current)
      showToast('초대 코드를 복사했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  async function removeStudent(student: ClassroomStudent) {
    if (!window.confirm(`${student.name} 수강생을 강의실에서 제외할까요?`)) return
    try {
      await repository.removeStudent(classroomId, student.id)
      setStudents((items) => items.filter((item) => item.id !== student.id))
      setClassroom((current) => current ? { ...current, learnerCount: Math.max(0, current.learnerCount - 1) } : current)
      showToast('수강생을 강의실에서 제외했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  function exportRoster() {
    if (!classroom || students.length === 0) return
    const rows = [
      ['이름', '이메일', '소속', '참여일', '최근 활동'],
      ...students.map((student) => [student.name, student.email, student.affiliation ?? '', student.joinedAt, student.lastActiveAt ?? '']),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${classroom.name}-수강생.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <ClassroomWorkspaceContainer><p className="py-16 text-center type-body text-stone-500" role="status">수강생 정보를 불러오는 중입니다.</p></ClassroomWorkspaceContainer>
  if (error || !classroom) return <ClassroomWorkspaceContainer><EmptyState action={<Button onClick={() => void load()} variant="secondary">다시 시도</Button>} description={error ?? '강의실 정보를 확인할 수 없습니다.'} title="수강생 정보를 불러오지 못했습니다" /></ClassroomWorkspaceContainer>

  return (
    <ClassroomWorkspaceContainer>
      <ClassroomWorkspaceHeader
        actions={<><Button onClick={() => void copyInviteCode()} variant="secondary"><KeyRound aria-hidden="true" size={14} /><span className="font-bold">{classroom.inviteCode ?? '초대 코드'}</span><Copy aria-hidden="true" size={13} /></Button><Button disabled={students.length === 0} onClick={exportRoster} variant="secondary"><Download aria-hidden="true" size={14} />명단 내보내기</Button></>}
        activeTab="learning"
        classroom={classroom}
      />

      {classroom.pendingRequestCount > 0 ? <section className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800"><strong className="type-control">입장 요청 {classroom.pendingRequestCount}건이 승인을 기다리고 있습니다.</strong><ButtonLink className="ml-auto border-rose-200 bg-white text-rose-700 hover:bg-rose-50" size="sm" to={classroomEntranceRequestsPath(classroom.id)} variant="secondary">요청 보기</ButtonLink></section> : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>전체 {students.length}</FilterButton>
        <FilterButton active={filter === 'recent'} onClick={() => setFilter('recent')}>최근 활동 {students.length - inactiveCount}</FilterButton>
        <FilterButton active={filter === 'inactive'} onClick={() => setFilter('inactive')}>7일 이상 미활동 {inactiveCount}</FilterButton>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <label className="relative min-w-48 sm:w-72"><span className="sr-only">수강생 검색</span><Search aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" size={14} /><input className="h-10 w-full rounded-lg border border-stone-200 bg-white pr-3 pl-9 type-control outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" onChange={(event) => setQuery(event.target.value)} placeholder="이름 · 이메일 검색" value={query} /></label>
          <label className="relative shrink-0"><span className="sr-only">수강생 정렬</span><ArrowUpDown aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" size={14} /><select aria-label="수강생 정렬" className="h-10 appearance-none rounded-lg border border-stone-200 bg-white pr-8 pl-9 type-control text-stone-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" onChange={(event) => setSort(event.target.value as StudentSort)} value={sort}><option value="activity-desc">최근 활동순</option><option value="name-asc">이름순</option><option value="joined-desc">최근 참여순</option></select><ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-stone-400" size={13} /></label>
        </div>
      </div>

      <section aria-label="수강생 목록" className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="hidden min-h-10 grid-cols-[minmax(240px,1.5fr)_130px_130px_minmax(160px,1fr)_100px_54px] items-center gap-3 border-b border-stone-200 bg-stone-50 px-4 type-caption font-semibold text-stone-500 lg:grid"><span>수강생</span><span>참여일</span><span>최근 활동</span><span>소속</span><span>상태</span><span className="text-center">작업</span></div>
        {visibleStudents.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><UserRoundX aria-hidden="true" className="text-stone-300" size={24} /><h2 className="mt-4 type-body font-bold text-stone-900">{query.trim() ? '검색 결과가 없습니다' : '표시할 수강생이 없습니다'}</h2></div> : visibleStudents.map((student) => {
          const inactive = isInactiveStudent(student)
          return <article className={inactive ? 'grid gap-3 border-b border-amber-100 bg-amber-50/70 px-4 py-3 last:border-0 lg:grid-cols-[minmax(240px,1.5fr)_130px_130px_minmax(160px,1fr)_100px_54px] lg:items-center' : 'grid gap-3 border-b border-stone-100 px-4 py-3 last:border-0 lg:grid-cols-[minmax(240px,1.5fr)_130px_130px_minmax(160px,1fr)_100px_54px] lg:items-center'} key={student.id}><div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-100 type-caption font-bold text-stone-600">{getInitial(student.name)}</span><div className="min-w-0"><strong className="block truncate type-control text-stone-900">{student.name}</strong><span className="block truncate type-caption text-stone-400">{student.email}</span></div></div><span className="type-control text-stone-600">{formatDate(student.joinedAt)}</span><span className={inactive ? 'type-control font-semibold text-amber-700' : 'type-control text-stone-600'}>{formatRelativeActivity(student.lastActiveAt)}</span><span className="truncate type-control text-stone-600">{student.affiliation ?? '-'}</span><span className={inactive ? 'type-caption font-semibold text-amber-700' : 'type-caption font-semibold text-emerald-700'}>{inactive ? '미활동' : '활동 중'}</span><details className="relative justify-self-end"><summary aria-label={`${student.name} 관리 메뉴`} className="flex size-8 cursor-pointer list-none items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"><MoreHorizontal aria-hidden="true" size={17} /></summary><div className="absolute top-9 right-0 z-20 w-32 rounded-lg border border-stone-200 bg-white p-1 shadow-lg"><button className="block h-8 w-full rounded px-2 text-left type-caption font-semibold text-rose-700 hover:bg-rose-50" onClick={() => void removeStudent(student)} type="button">강의실에서 제외</button></div></details></article>
        })}
        <footer className="border-t border-stone-100 px-4 py-3 type-caption text-stone-400">전체 {students.length}명 중 {visibleStudents.length}명 표시</footer>
      </section>
      <p className="type-caption text-stone-500">최근 활동 시각은 서버가 제공한 마지막 활동 기록을 기준으로 표시됩니다.</p>
    </ClassroomWorkspaceContainer>
  )
}

function FilterButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={active ? 'h-9 rounded-lg bg-stone-950 px-3 type-caption font-bold text-white' : 'h-9 rounded-lg border border-stone-200 bg-white px-3 type-caption font-semibold text-stone-600 hover:bg-stone-50'} onClick={onClick} type="button">{children}</button>
}

function isInactiveStudent(student: ClassroomStudent): boolean {
  if (!student.lastActiveAt) return true
  return Date.now() - new Date(student.lastActiveAt).getTime() >= 7 * 24 * 60 * 60 * 1000
}

function getActivityTime(student: ClassroomStudent): number {
  return new Date(student.lastActiveAt ?? student.joinedAt).getTime()
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', { day: 'numeric', month: 'long' }).format(date)
}

function formatRelativeActivity(value?: string): string {
  if (!value) return '기록 없음'
  const difference = Date.now() - new Date(value).getTime()
  if (difference < 60 * 60 * 1000) return '방금 전'
  if (difference < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(difference / (60 * 60 * 1000)))}시간 전`
  return `${Math.max(1, Math.floor(difference / (24 * 60 * 60 * 1000)))}일 전`
}

function getInitial(name: string): string {
  return name.trim().slice(0, 1) || '?'
}

function escapeCsvValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}
