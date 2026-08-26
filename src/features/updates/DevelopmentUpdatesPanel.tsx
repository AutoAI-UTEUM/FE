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
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [partFilter, setPartFilter] = useState<PartFilter>('ALL')
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
  const updateGroups = useMemo(
    () => Array.from(groupUpdatesByDate(filteredUpdates), ([date, dateUpdates]) => ({
      date,
      updates: dateUpdates,
    })).sort((left, right) => right.date.localeCompare(left.date)),
    [filteredUpdates],
  )

  function moveMonth(offset: number) {
    setIsLoading(true)
    setError(null)
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex h-8 items-center rounded-lg border border-stone-200 bg-white">
          <button aria-label="이전 달" className="flex size-8 items-center justify-center rounded-l-lg text-stone-500 hover:bg-stone-50" onClick={() => moveMonth(-1)} type="button"><ChevronLeft aria-hidden="true" size={14} /></button>
          <strong className="min-w-24 text-center type-control text-stone-900">{visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월</strong>
          <button aria-label="다음 달" className="flex size-8 items-center justify-center rounded-r-lg text-stone-500 hover:bg-stone-50" onClick={() => moveMonth(1)} type="button"><ChevronRight aria-hidden="true" size={14} /></button>
        </div>
        <div aria-label="개발 파트" className="flex h-8 rounded-lg bg-stone-100 p-0.5" role="group">
          {PARTS.map((part) => (
            <button
              aria-pressed={partFilter === part}
              className={cx(
                'min-w-9 rounded-md px-2 type-micro font-semibold transition-colors',
                partFilter === part ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-500 hover:text-stone-800',
              )}
              key={part}
              onClick={() => setPartFilter(part)}
              type="button"
            >
              {PART_LABELS[part]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-0 border-t border-stone-200">
        {isLoading ? (
          <p className="flex h-28 items-center justify-center gap-2 type-caption text-stone-500" role="status"><LoaderCircle aria-hidden="true" className="animate-spin" size={14} />개발 현황을 불러오는 중입니다.</p>
        ) : error ? (
          <div className="flex h-28 flex-col items-center justify-center gap-2 text-center">
            <p className="type-caption text-rose-700" role="alert">{error}</p>
            <button className="inline-flex items-center gap-1 type-caption font-semibold text-brand-700" onClick={reloadUpdates} type="button"><RefreshCcw aria-hidden="true" size={12} />다시 시도</button>
          </div>
        ) : partFilter !== 'ALL' && !availableParts.includes(partFilter) ? (
          <p className="flex h-28 items-center justify-center text-center type-caption text-stone-500">{partFilter} 공개 저장소 활동을 확인할 수 없습니다.</p>
        ) : updateGroups.length === 0 ? (
          <p className="flex h-28 items-center justify-center text-center type-caption text-stone-500">선택한 달의 공개 개발 기록이 없습니다.</p>
        ) : (
          <div className="max-h-[calc(100dvh-220px)] overflow-y-auto pr-1">
            {updateGroups.map((group) => {
              const date = formatUpdateDate(group.date)
              return (
                <section aria-labelledby={`updates-${group.date}`} className="py-3" key={group.date}>
                  <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                    <h3 className="type-body font-bold text-stone-950" id={`updates-${group.date}`}>{date.label}</h3>
                    <span className="type-caption text-stone-400">{date.weekday}</span>
                    <span className="ml-auto type-caption text-stone-400">{group.updates.length}건</span>
                  </div>
                  <div className="mt-1 grid gap-0.5">
                    {group.updates.map((update) => (
                      <a className="flex h-8 min-w-0 items-center gap-2 rounded-md px-2 hover:bg-stone-50" href={update.url} key={`${update.repositoryName}-${update.sha}`} rel="noreferrer" target="_blank">
                        <span className={cx('w-8 shrink-0 rounded px-1 py-1 text-center type-micro font-bold text-white', PART_COLORS[update.part])}>{update.part}</span>
                        <span className="min-w-0 flex-1 truncate type-caption font-medium text-stone-800" title={update.message}>{update.message}</span>
                        <span className="shrink-0 type-micro text-stone-400">{update.sha}</span>
                      </a>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
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

function formatUpdateDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return { label: dateKey, weekday: '' }
  const date = new Date(year, month - 1, day)
  return {
    label: `${month}월 ${day}일`,
    weekday: WEEKDAYS[date.getDay()],
  }
}
