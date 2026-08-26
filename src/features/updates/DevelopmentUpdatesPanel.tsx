import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RefreshCcw,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { cx } from '../../shared/lib/cx'
import {
  createGithubUpdatesRepository,
  type DevelopmentPart,
  type DevelopmentUpdate,
} from './githubUpdatesRepository'

type PartFilter = 'ALL' | DevelopmentPart

interface UpdatesRepository {
  loadMonth: ReturnType<typeof createGithubUpdatesRepository>['loadMonth']
}

interface CalendarDay {
  dateKey: string
  day: number
}

const PARTS: PartFilter[] = ['ALL', 'AI', 'BE', 'FE']
const PART_LABELS: Record<PartFilter, string> = {
  ALL: '전체',
  AI: 'AI',
  BE: 'BE',
  FE: 'FE',
}
const PART_COLORS: Record<DevelopmentPart, string> = {
  AI: 'bg-violet-500',
  BE: 'bg-emerald-500',
  FE: 'bg-blue-500',
}
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
const defaultRepository = createGithubUpdatesRepository((input, init) => fetch(input, init))

export function DevelopmentUpdatesPanel({
  initialDate,
  repository,
}: {
  initialDate?: Date
  repository?: UpdatesRepository
}) {
  const activeRepository = repository ?? defaultRepository
  const today = useMemo(() => initialDate ?? new Date(), [initialDate])
  const todayKey = useMemo(() => formatDateKey(today), [today])
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
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

  const filteredUpdates = useMemo(
    () => partFilter === 'ALL' ? updates : updates.filter((update) => update.part === partFilter),
    [partFilter, updates],
  )
  const updatesByDate = useMemo(() => groupUpdatesByDate(filteredUpdates), [filteredUpdates])
  const updateDateKeys = useMemo(
    () => Array.from(updatesByDate.keys()).sort((left, right) => right.localeCompare(left)),
    [updatesByDate],
  )
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth])
  const monthFirstDateKey = formatDateKey(visibleMonth)
  const activeDateKey = selectedDateKey ?? updateDateKeys[0] ?? monthFirstDateKey
  const activeDateUpdates = updatesByDate.get(activeDateKey) ?? []
  const activeDate = formatUpdateDate(activeDateKey)
  const monthLabel = `${visibleMonth.getFullYear()}년 ${visibleMonth.getMonth() + 1}월`
  const isUnavailablePart = partFilter !== 'ALL' && !availableParts.includes(partFilter)

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
    <section aria-labelledby="development-updates-title" className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="type-section-title font-bold text-stone-950" id="development-updates-title">업데이트</h2>
          <p className="mt-0.5 type-caption text-stone-500">AI·BE·FE 공개 개발 현황</p>
        </div>
        <a
          className="inline-flex size-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          href="https://github.com/AutoAI-UTEUM"
          rel="noreferrer"
          target="_blank"
          title="GitHub 조직 열기"
        >
          <ExternalLink aria-hidden="true" size={15} />
          <span className="sr-only">GitHub 조직 열기</span>
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex h-9 items-center rounded-lg border border-stone-200 bg-white">
          <button aria-label="이전 달" className="flex size-9 items-center justify-center rounded-l-lg text-stone-500 hover:bg-stone-50" onClick={() => moveMonth(-1)} type="button"><ChevronLeft aria-hidden="true" size={15} /></button>
          <strong className="min-w-28 text-center type-control text-stone-900">{monthLabel}</strong>
          <button aria-label="다음 달" className="flex size-9 items-center justify-center rounded-r-lg text-stone-500 hover:bg-stone-50" onClick={() => moveMonth(1)} type="button"><ChevronRight aria-hidden="true" size={15} /></button>
        </div>
        <div aria-label="개발 파트" className="flex h-9 rounded-lg bg-stone-100 p-0.5" role="group">
          {PARTS.map((part) => (
            <button
              aria-pressed={partFilter === part}
              className={cx(
                'min-w-10 rounded-md px-2 type-micro font-semibold transition-colors',
                partFilter === part ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-500 hover:text-stone-800',
              )}
              key={part}
              onClick={() => changePartFilter(part)}
              type="button"
            >
              {PART_LABELS[part]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 flex h-80 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white type-caption text-stone-500" role="status"><LoaderCircle aria-hidden="true" className="animate-spin" size={14} />개발 현황을 불러오는 중입니다.</p>
      ) : error ? (
        <div className="mt-4 flex h-80 flex-col items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white text-center">
          <p className="type-caption text-rose-700" role="alert">{error}</p>
          <button className="inline-flex items-center gap-1 type-caption font-semibold text-brand-700" onClick={reloadUpdates} type="button"><RefreshCcw aria-hidden="true" size={12} />다시 시도</button>
        </div>
      ) : (
        <div className="mt-4 grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
          <section aria-label={`${monthLabel} 업데이트 달력`} className="min-w-0 rounded-lg border border-stone-200 bg-white p-3 sm:p-4">
            <div aria-label={`${monthLabel} 업데이트 달력`} role="grid">
              <div className="grid grid-cols-7 gap-1" role="row">
                {WEEKDAY_LABELS.map((weekday, index) => (
                  <span
                    className={cx(
                      'flex h-8 items-center justify-center type-caption font-semibold',
                      index === 0 ? 'text-rose-600' : index === 6 ? 'text-blue-600' : 'text-stone-500',
                    )}
                    key={weekday}
                    role="columnheader"
                  >
                    {weekday}
                  </span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((calendarDay, index) => {
                  if (!calendarDay) return <span aria-hidden="true" className="min-h-16 rounded-md bg-stone-50/60 lg:min-h-20" key={`empty-${index}`} />
                  const dayUpdates = updatesByDate.get(calendarDay.dateKey) ?? []
                  const dayParts = Array.from(new Set(dayUpdates.map((update) => update.part)))
                  const isSelected = activeDateKey === calendarDay.dateKey
                  const isToday = todayKey === calendarDay.dateKey
                  return (
                    <button
                      aria-label={`${visibleMonth.getFullYear()}년 ${visibleMonth.getMonth() + 1}월 ${calendarDay.day}일, ${dayUpdates.length > 0 ? `업데이트 ${dayUpdates.length}건` : '업데이트 없음'}`}
                      aria-pressed={isSelected}
                      className={cx(
                        'flex min-h-16 min-w-0 flex-col rounded-md border p-2 text-left transition-colors lg:min-h-20',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                        isSelected
                          ? 'border-brand-700 bg-brand-50'
                          : 'border-stone-100 bg-white hover:border-stone-300 hover:bg-stone-50',
                      )}
                      key={calendarDay.dateKey}
                      onClick={() => setSelectedDateKey(calendarDay.dateKey)}
                      role="gridcell"
                      type="button"
                    >
                      <span className={cx('flex size-6 items-center justify-center rounded-full type-caption font-semibold', isToday && !isSelected ? 'bg-stone-900 text-white' : isSelected ? 'text-brand-800' : 'text-stone-600')}>{calendarDay.day}</span>
                      {dayUpdates.length > 0 ? (
                        <span className="mt-auto flex min-w-0 items-center gap-1">
                          <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                            {dayParts.map((part) => <span className={cx('size-1.5 rounded-full', PART_COLORS[part])} key={part} />)}
                          </span>
                          <span className="truncate type-micro font-semibold text-stone-600">{dayUpdates.length}건</span>
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <aside aria-label="선택한 날짜 업데이트" className="flex min-h-[320px] min-w-0 flex-col rounded-lg border border-stone-200 bg-white lg:h-[556px]">
            <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-3">
              <h3 className="type-body font-bold text-stone-950">{activeDate.label}</h3>
              <span className="type-caption text-stone-400">{activeDate.weekday}</span>
              <span className="ml-auto type-caption text-stone-400">{activeDateUpdates.length}건</span>
            </div>
            {isUnavailablePart ? (
              <p className="flex flex-1 items-center justify-center px-5 text-center type-caption text-stone-500">{partFilter} 공개 저장소 활동을 확인할 수 없습니다.</p>
            ) : activeDateUpdates.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 text-center type-caption text-stone-500">선택한 날짜의 공개 개발 기록이 없습니다.</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-4">
                {activeDateUpdates.map((update) => (
                  <a
                    className="block border-b border-stone-100 py-4 last:border-b-0 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
                    href={update.url}
                    key={`${update.repositoryName}-${update.sha}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cx('w-8 shrink-0 rounded px-1 py-1 text-center type-micro font-bold text-white', PART_COLORS[update.part])}>{update.part}</span>
                      <span className="min-w-0 flex-1 truncate type-caption text-stone-400">{update.repositoryName}</span>
                      <span className="shrink-0 type-micro text-stone-400">{update.sha}</span>
                    </div>
                    <p className="mt-2 type-body font-semibold leading-5 text-stone-900">{update.message}</p>
                    <p className="mt-1 type-micro text-stone-400">{update.author}</p>
                  </a>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  )
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

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push({ dateKey: formatDateKey(new Date(year, monthIndex, day)), day })
  }
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
  return {
    label: `${month}월 ${day}일`,
    weekday: WEEKDAYS[date.getDay()],
  }
}
