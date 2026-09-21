import { ChevronLeft, ChevronRight, ExternalLink, LoaderCircle, RefreshCcw } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { cx } from '../../shared/lib/cx'
import { useElementWidth, useResponsiveViewport } from '../../shared/responsive'
import { createGithubUpdatesRepository, type DevelopmentPart, type DevelopmentUpdate } from './githubUpdatesRepository'

type PartFilter = 'ALL' | 'AI_BE' | 'FE'
interface UpdatesRepository { loadMonth: ReturnType<typeof createGithubUpdatesRepository>['loadMonth'] }
interface CalendarDay { dateKey: string; day: number }

const PARTS: PartFilter[] = ['ALL', 'AI_BE', 'FE']
const PART_LABELS: Record<PartFilter, string> = { ALL: '전체', AI_BE: 'AI·BE', FE: 'FE' }
const PART_COLORS: Record<DevelopmentPart, string> = { AI: 'bg-violet-50 text-violet-700', BE: 'bg-violet-50 text-violet-700', FE: 'bg-blue-50 text-blue-700' }
const UPDATE_PART_LABELS: Record<DevelopmentPart, string> = { AI: 'AI·BE', BE: 'AI·BE', FE: 'FE' }
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const defaultRepository = createGithubUpdatesRepository((input, init) => fetch(input, init))

export function DevelopmentUpdatesPanel({ initialDate, repository, showTitle = true }: { initialDate?: Date; repository?: UpdatesRepository; showTitle?: boolean }) {
  const activeRepository = repository ?? defaultRepository
  const { isTablet } = useResponsiveViewport()
  const [measureArea, areaWidth] = useElementWidth()
  const compactCalendar = isTablet && areaWidth < 400
  const today = useMemo(() => initialDate ?? new Date(), [initialDate])
  const todayKey = useMemo(() => formatDateKey(today), [today])
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [partFilter, setPartFilter] = useState<PartFilter>('ALL')
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [updates, setUpdates] = useState<DevelopmentUpdate[]>([])
  const [availableParts, setAvailableParts] = useState<DevelopmentPart[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    activeRepository.loadMonth(visibleMonth.getFullYear(), visibleMonth.getMonth())
      .then((result) => {
        if (cancelled) return
        setUpdates(result.updates)
        setAvailableParts(result.availableParts)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : '개발 현황을 불러오지 못했습니다.')
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [activeRepository, reloadKey, visibleMonth])

  const filteredUpdates = useMemo(() => {
    if (partFilter === 'ALL') return updates
    if (partFilter === 'AI_BE') return updates.filter((update) => update.part === 'AI' || update.part === 'BE')
    return updates.filter((update) => update.part === partFilter)
  }, [partFilter, updates])
  const updatesByDate = useMemo(() => groupUpdatesByDate(filteredUpdates), [filteredUpdates])
  const updateDateKeys = useMemo(() => Array.from(updatesByDate.keys()).sort((left, right) => right.localeCompare(left)), [updatesByDate])
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth])
  const monthFirstDateKey = formatDateKey(visibleMonth)
  const activeDateKey = selectedDateKey ?? updateDateKeys[0] ?? monthFirstDateKey
  const activeDateUpdates = updatesByDate.get(activeDateKey) ?? []
  const activeDate = formatUpdateDate(activeDateKey)
  const monthLabel = `${visibleMonth.getFullYear()}년 ${visibleMonth.getMonth() + 1}월`
  const feCount = updates.filter((update) => update.part === 'FE').length
  const aiBeCount = updates.length - feCount
  const activeDays = new Set(updates.map((update) => update.date)).size
  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
  const latestUpdate = [...updates].sort((left, right) => right.committedAt.localeCompare(left.committedAt))[0]
  const isUnavailablePart = partFilter === 'AI_BE'
    ? !availableParts.includes('AI') && !availableParts.includes('BE')
    : partFilter !== 'ALL' && !availableParts.includes(partFilter)

  function moveMonth(offset: number) {
    setIsLoading(true)
    setError(null)
    setSelectedDateKey(null)
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  function changePartFilter(part: PartFilter) {
    setPartFilter(part)
    setSelectedDateKey(null)
  }

  function reloadUpdates() {
    setIsLoading(true)
    setError(null)
    setReloadKey((key) => key + 1)
  }

  return (
    <section aria-label={showTitle ? undefined : '업데이트'} aria-labelledby={showTitle ? 'development-updates-title' : undefined} className="mx-auto flex h-full min-h-0 w-full max-w-[1560px] flex-col gap-[14px] overflow-y-auto pb-1" ref={measureArea}>
      {showTitle ? <h1 className="type-admin-title shrink-0 font-bold text-stone-950" id="development-updates-title">업데이트</h1> : null}

      <div className="grid shrink-0 gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        <UpdateSummaryCard dark detail={latestUpdate ? `최근 배포 ${formatCompactDate(latestUpdate.date)}` : '배포 기록 없음'} label={`${visibleMonth.getMonth() + 1}월 배포`} value={updates.length} />
        <UpdateSummaryCard detail={`전체의 ${formatShare(feCount, updates.length)}`} label="FE" value={feCount} />
        <UpdateSummaryCard detail={`전체의 ${formatShare(aiBeCount, updates.length)}`} label="AI · BE" value={aiBeCount} />
        <UpdateSummaryCard detail={`${visibleMonth.getMonth() + 1}월 ${daysInMonth}일 중`} label="배포한 날" value={activeDays} />
      </div>

      <section className="shrink-0 rounded-[14px] border border-stone-200 bg-white px-[22px] py-5" aria-label={`${monthLabel} 업데이트 달력`}>
        <div aria-label="업데이트 도구" className={cx('flex flex-wrap items-center justify-between gap-3', areaWidth < 700 && 'justify-center')} role="toolbar">
          <div className="flex min-w-0 items-center gap-2">
            <button aria-label="이전 달" className="flex size-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 mobile-web:size-11" onClick={() => moveMonth(-1)} type="button"><ChevronLeft aria-hidden="true" size={15} /></button>
            <strong className="min-w-28 text-center type-control font-bold text-stone-900">{monthLabel}</strong>
            <button aria-label="다음 달" className="flex size-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 mobile-web:size-11" onClick={() => moveMonth(1)} type="button"><ChevronRight aria-hidden="true" size={15} /></button>
            <span className="hidden type-caption text-stone-400 sm:inline">날짜를 눌러 해당 배포만 보기</span>
          </div>
          <div className="flex items-center gap-2">
            <div aria-label="개발 파트" className="flex h-10 rounded-[10px] border border-stone-200 bg-white p-1" role="group">
              {PARTS.map((part) => <button aria-pressed={partFilter === part} className={cx('min-w-11 rounded-[7px] px-3 type-caption font-semibold transition-colors', partFilter === part ? 'bg-[#1B2436] text-white' : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800')} key={part} onClick={() => changePartFilter(part)} type="button">{PART_LABELS[part]}</button>)}
            </div>
            <a aria-label="GitHub 조직 열기" className="inline-flex size-10 items-center justify-center rounded-[10px] border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-900" href="https://github.com/AutoAI-UTEUM" rel="noreferrer" target="_blank" title="GitHub 조직 열기"><ExternalLink aria-hidden="true" size={15} /></a>
            <button aria-label="업데이트 새로고침" className="inline-flex size-10 items-center justify-center rounded-[10px] border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-900" onClick={reloadUpdates} title="새로고침" type="button"><RefreshCcw aria-hidden="true" className={isLoading ? 'animate-spin' : undefined} size={15} /></button>
          </div>
        </div>

        {isLoading ? <PanelState><LoaderCircle aria-hidden="true" className="animate-spin" size={14} />개발 현황을 불러오는 중입니다.</PanelState> : error ? <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center"><p className="type-caption text-rose-700" role="alert">{error}</p><button className="inline-flex items-center gap-1 type-caption font-semibold text-brand-700" onClick={reloadUpdates} type="button"><RefreshCcw aria-hidden="true" size={12} />다시 시도</button></div> : compactCalendar ? (
          <label className="mt-5 block type-control font-semibold">날짜 선택<input className="mt-2 block h-11 w-full min-w-0 rounded-lg border border-stone-200 px-3" type="date" value={activeDateKey} onChange={(event) => { if (!event.target.value) return; const next = new Date(`${event.target.value}T12:00:00`); setSelectedDateKey(event.target.value); if (next.getMonth() !== visibleMonth.getMonth() || next.getFullYear() !== visibleMonth.getFullYear()) { setIsLoading(true); setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1)) } }} /></label>
        ) : (
          <div aria-label={`${monthLabel} 업데이트 달력`} className="mt-5" role="group">
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAY_LABELS.map((weekday, index) => <span className={cx('pb-1 text-center type-micro font-semibold', index === 0 ? 'text-rose-600' : index === 6 ? 'text-blue-600' : 'text-stone-500')} key={weekday}>{weekday}</span>)}
              {calendarDays.map((calendarDay, index) => {
                if (!calendarDay) return <span aria-hidden="true" className="min-h-[66px]" key={`empty-${index}`} />
                const dayUpdates = updatesByDate.get(calendarDay.dateKey) ?? []
                const dayParts = Array.from(new Set(dayUpdates.map((update) => update.part)))
                const isSelected = activeDateKey === calendarDay.dateKey
                const isToday = todayKey === calendarDay.dateKey
                return <button aria-label={`${visibleMonth.getFullYear()}년 ${visibleMonth.getMonth() + 1}월 ${calendarDay.day}일, ${dayUpdates.length > 0 ? `업데이트 ${dayUpdates.length}건` : '업데이트 없음'}`} aria-pressed={isSelected} className={cx('flex min-h-[66px] min-w-0 flex-col items-start justify-between gap-1.5 rounded-[10px] border p-2 text-left transition-colors', isSelected ? 'border-[#1B2436] bg-[#1B2436] text-white' : 'border-stone-100 bg-white hover:bg-stone-50')} key={calendarDay.dateKey} onClick={() => setSelectedDateKey(calendarDay.dateKey)} type="button"><span className={cx('type-caption font-semibold', isSelected ? 'text-white' : isToday ? 'text-stone-950' : 'text-stone-600')}>{calendarDay.day}</span><span className="flex flex-wrap gap-1" aria-hidden="true">{dayParts.map((part) => <span className={cx('rounded px-1.5 py-0.5 type-micro font-bold', isSelected ? 'bg-white/15 text-white' : PART_COLORS[part])} key={part}>{UPDATE_PART_LABELS[part]}</span>)}</span></button>
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 type-micro text-stone-400"><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-blue-50" />FE 배포</span><span className="flex items-center gap-1.5"><i className="size-2.5 rounded-[3px] bg-violet-50" />AI·BE 배포</span></div>
          </div>
        )}
      </section>

      <aside aria-label="월별 업데이트 목록" className="flex min-h-[18rem] shrink-0 flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white px-[22px] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2"><h3 className="type-section-title font-bold text-stone-950">{activeDate.label}</h3><span className="type-caption text-stone-400">{activeDate.weekday}</span><span className="type-caption text-stone-400">{activeDateUpdates.length}건</span></div>
          {selectedDateKey ? <button className="h-8 rounded-lg border border-stone-200 px-3 type-caption text-stone-600 hover:bg-stone-50" onClick={() => setSelectedDateKey(null)} type="button">최근 배포 보기</button> : null}
        </div>
        {isUnavailablePart ? <PanelState>{PART_LABELS[partFilter]} 공개 저장소 활동을 확인할 수 없습니다.</PanelState> : activeDateUpdates.length === 0 ? <PanelState>선택한 날짜의 공개 개발 기록이 없습니다.</PanelState> : (
          <div aria-label="업데이트 기록" className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]" role="region" tabIndex={0}>
            <div className="grid gap-2.5 border-l border-stone-100 pl-[18px]">
              {activeDateUpdates.map((update) => <a className="flex min-h-14 min-w-0 items-start gap-3 rounded-[11px] border border-stone-100 bg-[#FCFDFE] px-3 py-2.5 hover:border-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600" href={update.url} key={`${update.repositoryName}-${update.sha}`} rel="noreferrer" target="_blank"><span className={cx('shrink-0 rounded-md px-2 py-1 type-micro font-bold', PART_COLORS[update.part])}>{UPDATE_PART_LABELS[update.part]}</span><span className="min-w-0 flex-1"><span className="block type-control text-stone-900">{update.message}</span><span className="mt-1 block type-micro text-stone-400">{update.sha}</span></span></a>)}
            </div>
          </div>
        )}
      </aside>
    </section>
  )
}

function UpdateSummaryCard({ dark = false, detail, label, value }: { dark?: boolean; detail: string; label: string; value: number }) {
  return <article className={`flex min-h-32 min-w-0 flex-col gap-2.5 rounded-[14px] px-5 py-[18px] ${dark ? 'bg-[#1B2436] text-white' : 'border border-stone-200 bg-white text-stone-950'}`}><p className={`type-caption font-medium ${dark ? 'text-[#A9B4C7]' : 'text-stone-500'}`}>{label}</p><strong className="type-metric font-extrabold tracking-normal tabular-nums">{value.toLocaleString('ko-KR')}</strong><p className={`mt-auto type-caption ${dark ? 'text-[#8D99AD]' : 'text-stone-400'}`}>{detail}</p></article>
}

function PanelState({ children }: { children: ReactNode }) {
  return <p className="flex min-h-56 flex-1 items-center justify-center gap-2 px-5 text-center type-caption text-stone-500" role="status">{children}</p>
}

function groupUpdatesByDate(updates: DevelopmentUpdate[]) {
  return updates.reduce<Map<string, DevelopmentUpdate[]>>((groups, update) => {
    const current = groups.get(update.date) ?? []
    groups.set(update.date, [...current, update])
    return groups
  }, new Map())
}

function buildCalendarDays(month: Date): Array<CalendarDay | null> {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const leadingEmptyDays = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const days: Array<CalendarDay | null> = Array.from({ length: leadingEmptyDays }, () => null)
  for (let day = 1; day <= daysInMonth; day += 1) days.push({ dateKey: formatDateKey(new Date(year, monthIndex, day)), day })
  while (days.length < 42) days.push(null)
  return days
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatUpdateDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return { label: dateKey, weekday: '' }
  const date = new Date(year, month - 1, day)
  return { label: `${month}월 ${day}일`, weekday: WEEKDAYS[date.getDay()] }
}

function formatCompactDate(dateKey: string) {
  const [, month, day] = dateKey.split('-')
  return `${Number(month)}월 ${Number(day)}일`
}

function formatShare(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}%` : '-'
}
