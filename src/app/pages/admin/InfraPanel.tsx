import { ArrowUpRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type {
  AdminRepository,
  AiUsageSummary,
  AiUsageUser,
  InfraApp,
  InfraCost,
  InfraEnv,
  InfraMetrics,
  InfraPoint,
  InfraRange,
  AdminXaiOverview,
} from '../../../features/admin'
import {
  AdminErrorMessage,
  AdminMetricStrip,
  AdminPanelHeading,
  formatCount,
  formatDateTime,
  PanelMessage,
  toAdminError,
  type AdminErrorInfo,
} from './adminShared'

type LoadState<T> = {
  data: T | null
  error: AdminErrorInfo | null
  loading: boolean
  receivedAt: string | null
}

const emptyState = <T,>(): LoadState<T> => ({
  data: null,
  error: null,
  loading: true,
  receivedAt: null,
})

export function InfraPanel({ repository }: { repository: AdminRepository }) {
  const [env, setEnv] = useState<InfraEnv>('prod')
  const [range, setRange] = useState<InfraRange>('24h')
  const [metrics, setMetrics] = useState<LoadState<InfraMetrics>>(emptyState)
  const [cost, setCost] = useState<LoadState<InfraCost>>(emptyState)
  const [app, setApp] = useState<LoadState<InfraApp>>(emptyState)
  const [xai, setXai] = useState<LoadState<AdminXaiOverview>>(emptyState)
  const [xaiUsage, setXaiUsage] = useState<LoadState<AiUsageSummary>>(emptyState)
  const [activeDrawer, setActiveDrawer] = useState<'aws' | 'xai' | null>(null)

  useEffect(() => {
    if (!activeDrawer) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setActiveDrawer(null) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [activeDrawer])

  useEffect(() => {
    const controller = new AbortController()
    repository.getInfraMetrics({ env, range }, controller.signal)
      .then((data) => {
        setMetrics({ data, error: null, loading: false, receivedAt: new Date().toISOString() })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setMetrics((current) => ({ ...current, error: toAdminError(error), loading: false }))
        }
      })
    return () => controller.abort()
  }, [env, range, repository])

  useEffect(() => {
    const controller = new AbortController()
    repository.getInfraCost(controller.signal)
      .then((data) => {
        setCost({ data, error: null, loading: false, receivedAt: new Date().toISOString() })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCost((current) => ({ ...current, error: toAdminError(error), loading: false }))
        }
      })
    return () => controller.abort()
  }, [repository])

  useEffect(() => {
    const controller = new AbortController()
    repository.getInfraApp(controller.signal)
      .then((data) => {
        setApp({ data, error: null, loading: false, receivedAt: new Date().toISOString() })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setApp((current) => ({ ...current, error: toAdminError(error), loading: false }))
        }
      })
    return () => controller.abort()
  }, [repository])

  useEffect(() => {
    const controller = new AbortController()
    repository.getXaiOverview(controller.signal)
      .then((data) => setXai({ data, error: null, loading: false, receivedAt: new Date().toISOString() }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setXai((current) => ({ ...current, error: toAdminError(error), loading: false }))
      })
    return () => controller.abort()
  }, [repository])

  useEffect(() => {
    const controller = new AbortController()
    const today = localDate(new Date())
    repository.getAiUsageSummary({ from: shiftIsoDate(today, -6), to: today }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setXaiUsage({ data, error: null, loading: false, receivedAt: new Date().toISOString() }) })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setXaiUsage((current) => ({ ...current, error: toAdminError(reason), loading: false })) })
    return () => controller.abort()
  }, [repository])

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto">
      <AdminPanelHeading aside={[metrics.error, app.error, xai.error].filter((error): error is AdminErrorInfo => error !== null).map((error, index) => <div className="overflow-hidden rounded-xl border border-rose-100" key={index}><AdminErrorMessage error={error} /></div>)} title="인프라" />
      <div className="flex shrink-0 flex-wrap items-center gap-2 mobile-phone:justify-between">
          <select aria-label="환경" className="h-11 min-w-36 rounded-xl border border-stone-300 bg-transparent px-4 type-control text-stone-700 outline-none focus:border-brand-600" onChange={(event) => {
            setMetrics((current) => ({ ...current, error: null, loading: true }))
            setEnv(event.target.value as InfraEnv)
          }} value={env}><option value="prod">운영</option><option value="dev">개발</option></select>
          <label className="flex items-center gap-2 type-caption font-medium text-stone-500">
            <span className="sr-only">기간</span>
            <select
              aria-label="조회 기간"
              className="h-11 min-w-36 rounded-xl border border-stone-300 bg-transparent px-4 type-control text-stone-700 outline-none focus:border-brand-600"
              onChange={(event) => {
                setMetrics((current) => ({ ...current, error: null, loading: true }))
                setRange(event.target.value as InfraRange)
              }}
              value={range}
            >
              <option value="1h">최근 1시간</option>
              <option value="6h">최근 6시간</option>
              <option value="24h">최근 24시간</option>
              <option value="7d">최근 7일</option>
            </select>
          </label>
      </div>

      <InfraSummary cost={cost} metrics={metrics} range={range} xai={xai} xaiUsage={xaiUsage} />
      <div className="grid min-h-[650px] gap-4 xl:flex-1 xl:grid-cols-2">
        <ApplicationOverview app={app} />
        <WeeklyCosts cost={cost} onOpen={setActiveDrawer} xai={xai} xaiUsage={xaiUsage} />
      </div>
      {activeDrawer ? <InfraDetailsDrawer cost={cost} onClose={() => setActiveDrawer(null)} repository={repository} type={activeDrawer} xai={xai} /> : null}
    </div>
  )
}

function InfraSummary({ cost, metrics, range, xai, xaiUsage }: { cost: LoadState<InfraCost>; metrics: LoadState<InfraMetrics>; range: InfraRange; xai: LoadState<AdminXaiOverview>; xaiUsage: LoadState<AiUsageSummary> }) {
  const metricData = metrics.data
  const costData = cost.data
  const xaiCost = xai.data?.currentMonthCostUsd
  const xaiCalls = xaiUsage.data?.daily.map((day) => day.callCount) ?? []
  return (
    <section aria-label="서버 상태" className="shrink-0">
      {!metrics.loading && metricData && !metricData.available ? <p className="sr-only" role="status">{unavailableMessage(metricData.reason)}</p> : null}
      {metricData?.stale ? <StaleNotice /> : null}
      <AdminMetricStrip
        inlineGraph
        items={[
          { danger: (metricData?.latest?.cpu ?? 0) > 80, label: 'CPU', series: trend(metricData?.series?.cpu) ?? sample(metricData?.latest?.cpu), seriesTrend: pointTrend(metricData?.series?.cpu), value: metricData?.latest?.cpu == null ? '-' : metricData.latest.cpu.toFixed(1), unit: metricData?.latest?.cpu == null ? undefined : '%', delta: range === '24h' ? deltaFromAverage(metricData?.latest?.cpu, metricData?.series?.cpu) : undefined, detail: range === '24h' ? '24시간 평균' : '' },
          { danger: (metricData?.latest?.mem ?? 0) > 85, label: '메모리', series: trend(metricData?.series?.mem) ?? sample(metricData?.latest?.mem), seriesTrend: pointTrend(metricData?.series?.mem), value: metricData?.latest?.mem == null ? '-' : metricData.latest.mem.toFixed(1), unit: metricData?.latest?.mem == null ? undefined : '%', delta: range === '24h' ? deltaFromAverage(metricData?.latest?.mem, metricData?.series?.mem) : undefined, detail: range === '24h' ? '24시간 평균' : '' },
          { danger: (metricData?.latest?.disk ?? 0) > 80, label: '디스크', series: trend(metricData?.series?.disk) ?? sample(metricData?.latest?.disk), seriesTrend: pointTrend(metricData?.series?.disk), value: metricData?.latest?.disk == null ? '-' : metricData.latest.disk.toFixed(1), unit: metricData?.latest?.disk == null ? undefined : '%', delta: range === '24h' ? deltaFromAverage(metricData?.latest?.disk, metricData?.series?.disk) : undefined, detail: range === '24h' ? '24시간 평균' : '' },
          { label: 'AI 사용 비용', series: xaiCalls.length ? xaiCalls : sample(xaiCost == null ? null : Number(xaiCost)), seriesLabel: xaiCalls.length ? '최근 7일 AI 호출 수 추이' : '이번 달 AI 비용 현재 값', ...moneyParts(xaiCost == null ? null : Number(xaiCost), 'USD'), detail: '지난달 대비' },
          { label: 'AWS 비용', series: costData?.daily?.length ? costData.daily.map((day) => day.total) : sample(costData?.monthToDate?.total), ...moneyParts(costData?.available ? costData.monthToDate?.total ?? 0 : null, costData?.currency ?? 'USD'), detail: '지난달 대비' },
        ]}
      />
    </section>
  )
}

/** 결측 구간은 스파크라인에서 빼고, 추세로 읽을 게 없으면 아예 그리지 않는다. */
function trend(points: InfraPoint[] | undefined) {
  const values = (points ?? []).map((point) => point.v).filter((value): value is number => value != null)
  return values.length ? values : undefined
}

function pointTrend(points: InfraPoint[] | undefined) {
  const values = trend(points)
  if (!values || values.length < 2) return undefined
  return values[values.length - 1] === values[0] ? null : values[values.length - 1] > values[0]
}

function deltaFromAverage(latest: number | null | undefined, points: InfraPoint[] | undefined) {
  const values = (points ?? []).map((point) => point.v).filter((value): value is number => value != null && Number.isFinite(value))
  if (latest == null || !Number.isFinite(latest) || values.length === 0) return undefined
  const difference = Math.round((latest - values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
  return { note: '24시간 평균', up: difference === 0 ? null : difference > 0, value: `${difference > 0 ? '+' : ''}${difference.toFixed(1)}` }
}

function sample(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? [value] : undefined
}

function ApplicationOverview({ app }: { app: LoadState<InfraApp> }) {
  const data = app.data
  const errorRate = data && data.http.requestCount > 0 ? (data.http.serverErrorCount / data.http.requestCount) * 100 : 0
  const rows = data?.available ? [
    { label: 'JVM 힙', detail: `${formatBytes(data.jvm.heapUsedBytes)} / ${formatBytes(data.jvm.heapMaxBytes)}`, value: formatPercent(ratioPercent(data.jvm.heapUsedBytes, data.jvm.heapMaxBytes)) },
    { label: '스레드', detail: `GC ${formatCount(data.jvm.gcCount)}회`, value: `${formatCount(data.jvm.liveThreads)}개` },
    { label: 'HTTP 요청', detail: `평균 ${data.http.averageResponseTimeMs == null ? '-' : `${data.http.averageResponseTimeMs.toFixed(1)}ms`}`, value: `${formatCount(data.http.requestCount)}건` },
    { label: '5xx 오류', detail: `${formatCount(data.http.serverErrorCount)}건 / ${formatCount(data.http.requestCount)}건`, value: formatPercent(errorRate), healthy: errorRate === 0 },
    { label: 'DB 풀', detail: `유휴 ${formatCount(data.db.idleConnections)} · 사용률 ${formatPercent(ratioPercent(data.db.activeConnections, data.db.maxConnections))}`, value: `${formatCount(data.db.activeConnections)} / ${formatCount(data.db.maxConnections)}` },
    { label: 'AI 서비스', detail: data.aiService.checkedAt ? `${formatDateTime(data.aiService.checkedAt)} 확인` : '확인 시각 없음', value: data.aiService.status === 'UP' ? '정상' : '응답 없음', healthy: data.aiService.status === 'UP' },
  ] : []
  return (
    <section aria-labelledby="application-overview-title" className="min-w-0 rounded-3xl border border-stone-200 bg-white p-5 xl:min-h-0 xl:overflow-y-auto">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="type-section-title font-bold text-stone-950" id="application-overview-title">애플리케이션</h2>{data?.available ? <span className="type-micro text-stone-400">가동 {formatUptime(data.uptimeSeconds)}</span> : null}</div>
      {app.loading ? <PanelMessage message="애플리케이션 정보를 불러오는 중입니다." /> : rows.length === 0 ? <PanelMessage message="애플리케이션 데이터를 사용할 수 없습니다." /> : (
        <dl className="mt-4 space-y-2">
          {rows.map((row) => <div className="flex min-h-[58px] items-center justify-between gap-4 rounded-xl bg-[#F7F9FC] px-4 py-2.5" key={row.label}>
            <div className="min-w-0"><dt className="type-caption font-semibold text-stone-800">{row.label}</dt><dd className="mt-0.5 truncate type-micro text-stone-500" title={row.detail}>{row.detail}</dd></div>
            <strong className={`shrink-0 type-control font-semibold ${row.healthy ? 'text-emerald-700' : 'text-stone-900'}`}>{row.value}</strong>
          </div>)}
        </dl>
      )}
    </section>
  )
}

function WeeklyCosts({ cost, onOpen, xai, xaiUsage }: { cost: LoadState<InfraCost>; onOpen: (type: 'aws' | 'xai') => void; xai: LoadState<AdminXaiOverview>; xaiUsage: LoadState<AiUsageSummary> }) {
  const daily = completeLastSevenDays(cost.data?.daily ?? [])
  const awsTotal = daily.reduce((sum, day) => sum + (day.item?.total ?? 0), 0)
  const hasAwsDailyData = daily.some((day) => day.item !== null)
  return (
    <section aria-label="주간 비용" className="flex min-h-[650px] min-w-0 flex-col rounded-3xl border border-stone-200 bg-white p-5">
      <div className="flex min-h-[290px] flex-1 flex-col pb-5">
        <div className="flex items-center justify-between gap-3"><h2 className="type-section-title font-bold text-stone-950">AWS 주간 비용</h2><button aria-label="AWS 비용 상세 보기" className="inline-flex size-8 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-50" onClick={() => onOpen('aws')} type="button"><ArrowUpRight aria-hidden="true" size={15} /></button></div>
        <p className="mt-3 type-metric-compact font-semibold text-stone-950">{cost.data?.available && hasAwsDailyData ? formatMoney(awsTotal, cost.data.currency ?? 'USD') : '-'}</p>
        <WeeklyBarChart currency={cost.data?.currency ?? 'USD'} daily={cost.data?.available ? daily : completeLastSevenDays([])} />
      </div>
      <div className="flex min-h-[290px] flex-1 flex-col border-t border-stone-100 pt-5">
        <div className="flex items-center justify-between gap-3"><h2 className="type-section-title font-bold text-stone-950">xAI 주간 비용</h2><button aria-label="xAI 상세 보기" className="inline-flex size-8 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-50" onClick={() => onOpen('xai')} type="button"><ArrowUpRight aria-hidden="true" size={15} /></button></div>
        <p aria-label="이번 달 xAI 비용" className="mt-3 type-metric-compact font-semibold text-stone-950">{xai.data?.available && xai.data.currentMonthCostUsd != null ? formatMoney(Number(xai.data.currentMonthCostUsd), 'USD') : '-'}</p>
        <WeeklyCallsChart daily={xaiUsage.data?.daily ?? []} />
      </div>
    </section>
  )
}

function WeeklyCallsChart({ daily }: { daily: AiUsageSummary['daily'] }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const items = completeLastSevenDays(daily)
  const hasDailyCosts = items.some((day) => day.item?.costUsd != null && Number.isFinite(Number(day.item.costUsd)))
  const valueFor = (day: typeof items[number]) => hasDailyCosts ? Number(day.item?.costUsd ?? 0) : day.item?.callCount ?? 0
  const maximum = Math.max(1, ...items.map(valueFor))
  const highlightedDate = items.some((day) => day.date === selectedDate && valueFor(day) > 0)
    ? selectedDate
    : [...items].sort((left, right) => valueFor(right) - valueFor(left))[0]?.date
  return <div aria-label={hasDailyCosts ? 'xAI 주간 비용 그래프' : 'xAI 최근 7일 호출 그래프'} className="mt-auto flex items-end gap-2 pt-4" role="img">{items.map((day) => {
    const amount = valueFor(day)
    const selected = amount > 0 && day.date === highlightedDate
    const description = hasDailyCosts ? formatMoney(amount, 'USD') : `${formatCount(amount)}건`
    return <div aria-label={amount > 0 ? `${day.date}: ${description}` : undefined} className="flex min-w-0 flex-1 flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-violet-700" data-chart-date={day.date} key={day.date} onFocus={() => { if (amount > 0) setSelectedDate(day.date) }} onMouseEnter={() => { if (amount > 0) setSelectedDate(day.date) }} tabIndex={amount > 0 ? 0 : undefined}>
      <div className="flex h-36 w-full flex-col justify-end">
        {selected && hasDailyCosts ? <span className="mb-2 self-center whitespace-nowrap rounded-full bg-[#1B2436] px-2.5 py-1 type-micro font-bold text-white">{formatBarMoney(amount, 'USD')}</span> : null}
        {amount > 0 ? <div className={`w-full rounded-xl ${selected ? 'bg-violet-700' : 'bg-violet-300'}`} style={{ height: `${Math.max(8, (amount / maximum) * 106)}px` }} title={`${day.date}: ${description}`} /> : <div className="h-1 w-full rounded-full bg-violet-200" />}
      </div>
      <span className={`type-micro type-graph-label ${amount > 0 ? 'text-stone-500' : 'text-stone-300'}`}>{formatMonthDay(day.date)}</span>
    </div>
  })}</div>
}

function WeeklyBarChart({ currency, daily }: { currency: string; daily: Array<{ date: string; item: { total: number } | null }> }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const maximum = Math.max(1, ...daily.map((day) => day.item?.total ?? 0))
  const highlightedDate = daily.some((day) => day.date === selectedDate && (day.item?.total ?? 0) > 0)
    ? selectedDate
    : daily.find((day) => (day.item?.total ?? 0) > 0)?.date
  return <div aria-label="AWS 주간 비용 그래프" className="mt-auto flex items-end gap-2 pt-4" role="img">
    {daily.map((day) => {
      const amount = day.item?.total ?? 0
      const selected = amount > 0 && day.date === highlightedDate
      return <div aria-label={amount > 0 ? `${day.date}: ${formatMoney(amount, currency)}` : undefined} className="flex min-w-0 flex-1 flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-600" data-chart-date={day.date} key={day.date} onFocus={() => { if (amount > 0) setSelectedDate(day.date) }} onMouseEnter={() => { if (amount > 0) setSelectedDate(day.date) }} tabIndex={amount > 0 ? 0 : undefined}>
        <div className="flex h-36 w-full flex-col justify-end">
          {selected ? <span className="mb-2 self-center whitespace-nowrap rounded-full bg-[#1B2436] px-2.5 py-1 type-micro font-bold text-white">{formatBarMoney(amount, currency)}</span> : null}
          {amount > 0 ? <div className={`w-full rounded-xl ${selected ? 'bg-[#1B2436]' : 'bg-[#D1D7E2]'}`} style={{ height: `${Math.max(8, (amount / maximum) * 106)}px` }} title={`${day.date}: ${formatMoney(amount, currency)}`} /> : <div className="h-1 w-full rounded-full bg-[#C7CEDA]" />}
        </div>
        <span className={`type-micro type-graph-label ${amount > 0 ? 'text-stone-500' : 'text-stone-300'}`}>{formatMonthDay(day.date)}</span>
      </div>
    })}
  </div>
}

function completeLastSevenDays<T extends { date: string }>(items: T[]) {
  const latestCompleteDay = shiftIsoDate(localDate(new Date()), -1)
  const byDate = new Map(items.map((item) => [item.date, item]))
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftIsoDate(latestCompleteDay, index - 6)
    return { date, item: byDate.get(date) ?? null }
  })
}

function InfraDetailsDrawer({ cost, onClose, repository, type, xai }: { cost: LoadState<InfraCost>; onClose: () => void; repository: AdminRepository; type: 'aws' | 'xai'; xai: LoadState<AdminXaiOverview> }) {
  const daily = [...(cost.data?.daily ?? [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-7)
  const today = localDate(new Date())
  const period = type === 'xai'
    ? `${formatMonthDay(shiftIsoDate(today, -6))} – ${formatMonthDay(today)}`
    : daily.length ? `${formatMonthDay(daily[0].date)} – ${formatMonthDay(daily[daily.length - 1].date)}` : '최근 7일'
  return <div aria-labelledby="infra-drawer-title" aria-modal="true" className="fixed inset-0 z-[90] flex justify-end bg-[#172033]/35" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} role="dialog">
    <div className="flex h-full w-full max-w-[640px] flex-col bg-white shadow-2xl">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-100 px-7 py-6">
        <div><h2 className="type-section-title font-bold text-stone-950" id="infra-drawer-title">{type === 'aws' ? 'AWS 사용량 · 비용' : 'xAI 사용량 · 호출'}</h2><p className="mt-1 type-caption text-stone-400">{period} 주간 기준</p></div>
        <button aria-label="상세 패널 닫기" autoFocus className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-50" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">{type === 'aws' ? <AwsDrawerBody cost={cost} daily={daily} /> : <XaiDrawerBody repository={repository} xai={xai} />}</div>
    </div>
  </div>
}

function DrawerMetrics({ items }: { items: Array<{ label: string; value: string }> }) {
  return <dl className="grid grid-cols-3 divide-x divide-stone-100 border-b border-stone-100 pb-6">{items.map((item) => <div className="min-w-0 px-4 first:pl-0" key={item.label}><dt className="type-caption font-semibold text-stone-700">{item.label}</dt><dd className="mt-1 truncate type-metric-compact font-semibold text-stone-950" title={item.value}>{item.value}</dd></div>)}</dl>
}

function AwsDrawerBody({ cost, daily }: { cost: LoadState<InfraCost>; daily: Array<{ date: string; total: number }> }) {
  const data = cost.data
  const currency = data?.currency ?? 'USD'
  const services = [...(data?.monthToDate?.byService ?? [])].sort((a, b) => b.amount - a.amount)
  const weeklyTotal = daily.reduce((sum, item) => sum + item.total, 0)
  const serviceTotal = services.reduce((sum, item) => sum + item.amount, 0)
  const maxService = Math.max(1, ...services.map((item) => item.amount))
  return <>
    <DrawerMetrics items={[{ label: '이번 달 AWS 비용', value: data?.available && data.monthToDate ? formatMoney(data.monthToDate.total, currency) : '-' }, { label: '주간 합계', value: data?.available && daily.length ? formatMoney(weeklyTotal, currency) : '-' }, { label: '최다 지출 서비스', value: services[0] ? shortServiceName(services[0].service) : '-' }]} />
    <h3 className="mt-7 type-section-title font-bold text-stone-950">서비스별 비용</h3>
    {!data?.available || services.length === 0 ? <PanelMessage message="서비스별 AWS 비용 데이터가 없습니다." /> : <div className="mt-7 flex h-64 items-end gap-2.5" role="img" aria-label="AWS 서비스별 비용 그래프">{services.slice(0, 7).map((service) => <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2" key={service.service}><strong className="type-micro font-semibold text-stone-800">{formatMoney(service.amount, currency)}</strong><div className="w-full rounded-t-xl bg-[#1B2436]" style={{ height: `${Math.max(4, (service.amount / maxService) * 176)}px` }} title={service.service} /><span className="w-full truncate text-center type-micro font-semibold text-stone-500" title={service.service}>{shortServiceName(service.service)}</span><span className="type-micro text-stone-400">{serviceTotal > 0 ? `${Math.round((service.amount / serviceTotal) * 100)}%` : '-'}</span></div>)}</div>}
    {data?.note ? <p className="mt-8 type-caption text-stone-400">{data.note}</p> : null}
  </>
}

function XaiDrawerBody({ repository, xai }: { repository: AdminRepository; xai: LoadState<AdminXaiOverview> }) {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null)
  const [users, setUsers] = useState<AiUsageUser[]>([])
  const [error, setError] = useState<AdminErrorInfo | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    const today = new Date()
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    const range = { from: localDate(start), to: localDate(today) }
    Promise.all([repository.getAiUsageSummary(range, controller.signal), repository.getAiUsageUsers({ ...range, limit: 5 }, controller.signal)])
      .then(([nextSummary, nextUsers]) => { if (!controller.signal.aborted) { setSummary(nextSummary); setUsers(nextUsers); setLoading(false) } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) { setError(toAdminError(reason)); setLoading(false) } })
    return () => controller.abort()
  }, [repository])
  const daily = [...(summary?.daily ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const calls = daily.reduce((sum, day) => sum + day.callCount, 0)
  const failures = daily.reduce((sum, day) => sum + day.failCount, 0)
  const maxDaily = Math.max(1, ...daily.map((day) => day.callCount))
  const features = [...(summary?.features ?? [])].sort((a, b) => b.callCount - a.callCount)
  const maxFeature = Math.max(1, ...features.map((feature) => feature.callCount))
  return <>
    <DrawerMetrics items={[{ label: '이번 달 xAI 비용', value: xai.data?.available && xai.data.currentMonthCostUsd != null ? formatMoney(Number(xai.data.currentMonthCostUsd), 'USD') : '-' }, { label: '총 호출', value: loading ? '-' : formatCount(calls) }, { label: '실패율', value: loading || calls === 0 ? '-' : formatPercent((failures / calls) * 100) }]} />
    {error ? <AdminErrorMessage error={error} /> : null}
    <div className="mt-7 flex items-center justify-between"><h3 className="type-section-title font-bold text-stone-950">일별 호출</h3><span className="type-caption text-stone-500"><i className="mr-1 inline-block size-2 rounded-full bg-violet-700" />성공 <i className="mr-1 ml-3 inline-block size-2 rounded-full bg-amber-500" />실패</span></div>
    {loading ? <PanelMessage message="xAI 호출 정보를 불러오는 중입니다." /> : daily.length === 0 ? <PanelMessage message="일별 호출 데이터가 없습니다." /> : <div className="mt-6 flex h-48 items-end gap-2">{daily.map((day) => <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5" key={day.date}><strong className="type-micro text-stone-800">{day.callCount || ''}</strong><div className="flex w-full flex-col justify-end gap-0.5" style={{ height: '130px' }}><div className="w-full rounded-t-lg bg-violet-700" style={{ height: `${Math.max(day.successCount ? 3 : 0, (day.successCount / maxDaily) * 125)}px` }} /><div className="w-full rounded bg-amber-500" style={{ height: `${Math.max(day.failCount ? 3 : 0, (day.failCount / maxDaily) * 125)}px` }} /></div><span className="type-micro text-stone-500">{formatMonthDay(day.date)}</span></div>)}</div>}
    <h3 className="mt-9 type-section-title font-bold text-stone-950">기능별 호출</h3>
    {features.length === 0 ? <PanelMessage message="기능별 호출 데이터가 없습니다." /> : <div className="mt-5 flex h-48 items-end gap-2">{features.slice(0, 7).map((feature) => <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5" key={feature.feature}><strong className="type-micro text-stone-800">{formatCount(feature.callCount)}</strong><div className="w-full rounded-t-lg bg-violet-700" style={{ height: `${Math.max(3, (feature.callCount / maxFeature) * 135)}px` }} /><span className="w-full truncate text-center type-micro text-stone-500" title={feature.feature}>{feature.feature}</span></div>)}</div>}
    <h3 className="mt-9 type-section-title font-bold text-stone-950">사용자별 호출</h3>
    {users.length === 0 ? <PanelMessage message="사용자별 호출 데이터가 없습니다." /> : <div className="mt-4 space-y-2">{users.map((user) => <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#F7F9FC] px-4 py-3" key={user.userId}><div className="min-w-0"><p className="truncate type-control font-semibold text-stone-800">{user.name}</p><p className="truncate type-caption text-stone-400">{user.email}</p></div><div className="shrink-0 text-right"><strong className="type-control font-semibold text-stone-900">{formatCount(user.callCount)}</strong><p className="type-micro text-stone-400">{formatCount((user.inputTokens ?? 0) + (user.outputTokens ?? 0) + (user.reasoningTokens ?? 0))} 토큰</p></div></div>)}</div>}
  </>
}

function shortServiceName(service: string) {
  if (/elastic compute cloud/i.test(service)) return 'EC2'
  if (/virtual private cloud/i.test(service)) return 'VPC'
  if (/route 53/i.test(service)) return 'Route 53'
  if (/cost explorer/i.test(service)) return 'Cost Expl.'
  return service.length > 16 ? `${service.slice(0, 14)}…` : service
}

function StaleNotice() {
  return <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 type-caption font-medium text-amber-800">마지막 성공값 표시 중 (AWS 응답 실패)</div>
}

function unavailableMessage(reason: string | undefined) {
  if (reason === 'DISABLED') return '인프라 조회가 비활성화되어 있습니다.'
  return '서버 지표를 일시적으로 가져오지 못했습니다.'
}

function formatBytes(value: number | null | undefined) {
  if (value == null) return '-'
  if (value === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(Math.abs(value)) / Math.log(1024)), units.length - 1)
  return `${(value / (1024 ** exponent)).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

function formatPercent(value: number | null | undefined) {
  return value == null ? '-' : `${value.toFixed(1)}%`
}

function formatUptime(seconds: number) {
  const minutes = Math.max(0, Math.floor(seconds / 60))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const restMinutes = minutes % 60
  return [days ? `${days}일` : '', hours ? `${hours}시간` : '', `${restMinutes}분`].filter(Boolean).join(' ')
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { currency, style: 'currency' }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

/** KPI 스트립용. 통화 기호를 %처럼 값 오른쪽 단위 칸에 둔다. */
function moneyParts(value: number | null, currency: string) {
  if (value == null || !Number.isFinite(value)) return { value: '-' }
  return { unit: currency === 'USD' ? '$' : currency, value: value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) }
}

function formatBarMoney(value: number, currency: string) {
  return currency === 'USD' ? `${value.toFixed(2)}$` : formatMoney(value, currency)
}

function formatMonthDay(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function localDate(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(value)
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function ratioPercent(value: number, max: number) {
  return max > 0 ? (value / max) * 100 : null
}
