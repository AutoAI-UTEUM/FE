import { ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type {
  AdminRepository,
  AdminXaiOverview,
  AdminXaiUsage,
  InfraApp,
  InfraCost,
  InfraEnv,
  InfraMetrics,
  InfraPoint,
  InfraRange,
} from '../../../features/admin'
import { Button } from '../../../shared/ui'
import { TabletChartValues } from '../../../shared/responsive'
import {
  AdminErrorMessage,
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

export function InfraPanel({ repository, showTitle = true }: { repository: AdminRepository; showTitle?: boolean }) {
  const [env, setEnv] = useState<InfraEnv>('prod')
  const [range, setRange] = useState<InfraRange>('24h')
  const [refreshKey, setRefreshKey] = useState(0)
  const [metrics, setMetrics] = useState<LoadState<InfraMetrics>>(emptyState)
  const [cost, setCost] = useState<LoadState<InfraCost>>(emptyState)
  const [app, setApp] = useState<LoadState<InfraApp>>(emptyState)
  const [xaiOverview, setXaiOverview] = useState<LoadState<AdminXaiOverview>>(emptyState)
  const [xaiUsage, setXaiUsage] = useState<LoadState<AdminXaiUsage>>(emptyState)
  const [detailPanel, setDetailPanel] = useState<'aws' | 'xai' | null>(null)
  const isRefreshing = metrics.loading || cost.loading || app.loading || xaiOverview.loading || xaiUsage.loading
  const xaiRange = weekEndingAt(localDate(new Date()))

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
  }, [env, range, refreshKey, repository])

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
  }, [refreshKey, repository])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      repository.getXaiOverview(controller.signal),
      repository.getXaiUsage({ from: xaiRange.from, to: xaiRange.to }, controller.signal),
    ]).then(([overview, usage]) => {
      const receivedAt = new Date().toISOString()
      setXaiOverview({ data: overview, error: null, loading: false, receivedAt })
      setXaiUsage({ data: usage, error: null, loading: false, receivedAt })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      const nextError = toAdminError(error)
      setXaiOverview((current) => ({ ...current, error: nextError, loading: false }))
      setXaiUsage((current) => ({ ...current, error: nextError, loading: false }))
    })
    return () => controller.abort()
  }, [refreshKey, repository, xaiRange.from, xaiRange.to])

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
  }, [refreshKey, repository])

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-[14px] overflow-y-auto pb-1">
      <div className={`flex shrink-0 flex-wrap items-end gap-4 mobile-phone:flex-col mobile-phone:items-stretch ${showTitle ? 'justify-between' : 'justify-end'}`}>
        {showTitle ? <h1 className="type-admin-title font-bold text-stone-950">인프라</h1> : null}
        <div className="flex flex-wrap items-center gap-3 mobile-phone:justify-between">
          <SegmentedControl
            label="환경"
            onChange={(value) => {
              if (value === env) return
              setMetrics((current) => ({ ...current, error: null, loading: true }))
              setEnv(value as InfraEnv)
            }}
            options={[['prod', '운영'], ['dev', '개발']]}
            value={env}
          />
          <label className="flex items-center gap-2 type-caption font-medium text-stone-500">
            기간
            <select
              aria-label="조회 기간"
              className="h-9 rounded-lg border border-stone-200 bg-white px-3 type-control text-stone-700 outline-none focus:border-brand-600 mobile-web:h-11"
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
          <Button aria-label="인프라 새로고침" onClick={() => {
          setMetrics((current) => ({ ...current, error: null, loading: true }))
          setCost((current) => ({ ...current, error: null, loading: true }))
          setApp((current) => ({ ...current, error: null, loading: true }))
          setXaiOverview((current) => ({ ...current, error: null, loading: true }))
          setXaiUsage((current) => ({ ...current, error: null, loading: true }))
          setRefreshKey((key) => key + 1)
          }} className="size-9 shrink-0 p-0 mobile-web:size-11 mobile-phone:self-end" disabled={isRefreshing} size="sm" title="새로고침" variant="secondary">
            <RefreshCw aria-hidden="true" className={isRefreshing ? 'animate-spin' : undefined} size={15} />
          </Button>
        </div>
      </div>

      <InfraSummary cost={cost} metrics={metrics} xai={xaiOverview} />
      <div className="grid min-h-[28rem] gap-[14px] xl:grid-cols-[minmax(360px,1fr)_minmax(440px,1fr)]">
        <section className="overflow-hidden rounded-[18px] border border-[#E6EAF0] bg-white px-[22px] py-5" aria-labelledby="application-summary-title">
          <h2 className="type-dialog-title font-bold text-[#111827]" id="application-summary-title">애플리케이션</h2>
          {app.error ? <div className="mt-4"><AdminErrorMessage error={app.error} /></div> : null}
          <div className="mt-4"><AppStatusTable data={app.data} /></div>
        </section>
        <WeeklyCostsSection cost={cost.data} onOpen={setDetailPanel} range={xaiRange} usage={xaiUsage.data} />
      </div>
      {detailPanel ? <CostDetailDrawer cost={cost.data} onClose={() => setDetailPanel(null)} type={detailPanel} usage={xaiUsage.data} /> : null}
    </div>
  )
}

function InfraSummary({ cost, metrics, xai }: { cost: LoadState<InfraCost>; metrics: LoadState<InfraMetrics>; xai: LoadState<AdminXaiOverview> }) {
  const metricData = metrics.data
  const costData = cost.data
  return (
    <section aria-label="서버 상태" className="shrink-0 overflow-hidden rounded-[18px] border border-[#E6EAF0] bg-white px-6 py-4">
      {metrics.error ? <AdminErrorMessage error={metrics.error} /> : null}
      {!metrics.loading && metricData && !metricData.available ? <PanelMessage message={unavailableMessage(metricData.reason, 'metrics')} /> : null}
      {metricData?.stale ? <StaleNotice /> : null}
      <div className="grid [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <SummaryMetric danger={(metricData?.latest?.cpu ?? 0) > 80} label="CPU" value={formatPercent(metricData?.latest?.cpu)} />
        <SummaryMetric danger={(metricData?.latest?.mem ?? 0) > 85} label="메모리" value={formatPercent(metricData?.latest?.mem)} />
        <SummaryMetric danger={(metricData?.latest?.disk ?? 0) > 80} label="디스크" value={formatPercent(metricData?.latest?.disk)} />
        <SummaryMetric label="AI 사용 비용" value={xai.data?.available && xai.data.currentMonthCostUsd != null ? formatMoney(Number(xai.data.currentMonthCostUsd), 'USD') : '-'} />
        <SummaryMetric label="AWS 비용" value={costData?.available ? formatMoney(costData.monthToDate?.total ?? 0, costData.currency ?? 'USD') : '-'} />
      </div>
    </section>
  )
}

function SummaryMetric({ danger = false, label, value }: { danger?: boolean; label: string; value: string }) {
  return <article className="flex min-h-[104px] min-w-0 flex-col justify-center gap-2 border-l border-[#EEF1F5] px-6 first:border-l-0"><p className="type-caption font-medium text-[#111827]">{label}</p><p className={`font-numeric truncate text-[2.25rem] font-medium leading-none tracking-normal ${danger ? 'text-rose-700' : 'text-[#111827]'}`} title={value}>{value}</p><span className="type-micro text-[#5F6675]">{value === '-' ? '데이터 없음' : '현재 조회 값'}</span></article>
}

function AppStatusTable({ data }: { data: InfraApp | null }) {
  if (data && !data.available) return <PanelMessage message="앱 상태 정보를 일시적으로 가져오지 못했습니다." />
  if (!data) return <PanelMessage message="앱 상태 데이터가 없습니다." />
  const heapPercent = ratioPercent(data.jvm.heapUsedBytes, data.jvm.heapMaxBytes)
  const errorPercent = data.http.requestCount > 0 ? (data.http.serverErrorCount / data.http.requestCount) * 100 : null
  const dbPercent = ratioPercent(data.db.activeConnections, data.db.maxConnections)
  const rows = [
    ['JVM 힙', formatPercent(heapPercent), `${formatBytes(data.jvm.heapUsedBytes)} / ${formatBytes(data.jvm.heapMaxBytes)}`],
    ['스레드', `${formatCount(data.jvm.liveThreads)}개`, `GC ${formatCount(data.jvm.gcCount)}회`],
    ['HTTP 요청', `${formatCount(data.http.requestCount)}건`, `평균 ${data.http.averageResponseTimeMs == null ? '-' : `${data.http.averageResponseTimeMs.toFixed(1)}ms`}`],
    ['5xx 오류', formatPercent(errorPercent), `${formatCount(data.http.serverErrorCount)}건 / ${formatCount(data.http.requestCount)}건`],
    ['DB 풀', `${formatCount(data.db.activeConnections)} / ${formatCount(data.db.maxConnections)}`, `유휴 ${formatCount(data.db.idleConnections)} · 사용률 ${formatPercent(dbPercent)}`],
    ['가동 시간', formatUptime(data.uptimeSeconds), '현재 애플리케이션 프로세스'],
    ['AI 서비스', data.aiService.status === 'UP' ? '정상' : '응답 없음', data.aiService.checkedAt ? `${formatDateTime(data.aiService.checkedAt)} 확인` : '확인 시각 없음'],
  ]
  return <div className="min-w-0"><table className="w-full table-fixed type-caption"><thead className="bg-[#F7F8FA] text-left text-stone-500"><tr><th className="w-[34%] px-4 py-2">항목</th><th className="w-[25%] px-4 py-2 text-right">값</th><th className="px-4 py-2">상세</th></tr></thead><tbody>{rows.map(([label, value, detail]) => <tr className="border-b border-stone-100 last:border-b-0" key={label}><th className="px-4 py-2.5 text-left font-semibold text-stone-800">{label}</th><td className={`px-4 py-2.5 text-right font-semibold ${label === 'AI 서비스' && value === '정상' ? 'text-emerald-700' : label === '5xx 오류' && (errorPercent ?? 0) > 0 ? 'text-amber-700' : 'text-stone-700'}`}>{value}</td><td className="truncate px-4 py-2.5 text-stone-400" title={detail}>{detail}</td></tr>)}</tbody></table></div>
}

function WeeklyCostsSection({
  cost,
  onOpen,
  range,
  usage,
}: {
  cost: InfraCost | null
  onOpen: (type: 'aws' | 'xai') => void
  range: { from: string; to: string }
  usage: AdminXaiUsage | null
}) {
  const awsByDate = new Map((cost?.daily ?? []).map((item) => [item.date, item.total]))
  const xaiByDate = new Map<string, number>()
  for (const item of usage?.items ?? []) {
    const amount = numberOrNull(item.costUsd)
    if (amount == null) continue
    xaiByDate.set(item.date, (xaiByDate.get(item.date) ?? 0) + amount)
  }
  const dates = Array.from({ length: 7 }, (_, index) => shiftIsoDate(range.from, index))
  const awsDaily = dates.map((date) => ({ date, total: awsByDate.get(date) ?? null }))
  const xaiDaily = dates.map((date) => ({ date, total: xaiByDate.get(date) ?? null }))

  return (
    <section aria-label="주간 비용" className="overflow-hidden rounded-[18px] border border-[#E6EAF0] bg-white px-[22px] py-5">
      <WeeklyCostChart
        color="#1B2436"
        daily={awsDaily}
        label="AWS 주간 비용"
        onOpen={() => onOpen('aws')}
        total={cost?.available ? sumKnown(awsDaily) : null}
      />
      <div className="my-5 border-t border-[#EEF1F5]" />
      <WeeklyCostChart
        color="#7C3AED"
        daily={xaiDaily}
        label="xAI 주간 비용"
        onOpen={() => onOpen('xai')}
        total={usage ? sumKnown(xaiDaily) : null}
      />
    </section>
  )
}

function WeeklyCostChart({
  color,
  daily,
  label,
  onOpen,
  total,
}: {
  color: string
  daily: Array<{ date: string; total: number | null }>
  label: string
  onOpen: () => void
  total: number | null
}) {
  const max = Math.max(0, ...daily.map((item) => item.total ?? 0))
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="type-dialog-title font-bold text-[#111827]">{label}</h2><p className="mt-1 type-caption text-[#5F6675]">합계 {total == null ? '-' : formatMoney(total, 'USD')}</p></div>
        <button aria-label={`${label} 상세 보기`} className="flex size-9 items-center justify-center rounded-[10px] border border-[#E3E6EE] text-[#5F6675] hover:bg-[#F7F8FA]" onClick={onOpen} title="상세 보기" type="button"><ArrowUpRight aria-hidden="true" size={16} /></button>
      </div>
      <div className="mt-4 grid h-[118px] grid-cols-7 items-end gap-2" role="img" aria-label={`${label} 일별 막대 그래프`}>
        {daily.map((item) => {
          const height = item.total == null || item.total <= 0 || max <= 0 ? 3 : Math.max(6, Math.round((item.total / max) * 82))
          return <div className="flex min-w-0 flex-col items-center justify-end gap-2" key={item.date} title={`${item.date}: ${item.total == null ? '데이터 없음' : formatMoney(item.total, 'USD')}`}><span className="w-full max-w-9 rounded-t-[4px]" style={{ backgroundColor: item.total == null ? '#E3E6EE' : color, height }} /><span className="type-micro text-[#8D95A5]">{formatMonthDay(item.date)}</span></div>
        })}
      </div>
    </div>
  )
}

function CostDetailDrawer({
  cost,
  onClose,
  type,
  usage,
}: {
  cost: InfraCost | null
  onClose: () => void
  type: 'aws' | 'xai'
  usage: AdminXaiUsage | null
}) {
  const xaiRows = aggregateXaiUsage(usage)
  return (
    <div aria-modal="true" className="fixed inset-0 z-[90] bg-stone-950/35" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} role="dialog">
      <aside className="absolute inset-y-0 right-0 flex w-[min(560px,94vw)] flex-col bg-white shadow-2xl">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E3E6EE] px-6">
          <h2 className="type-section-title font-bold text-[#171A22]">{type === 'aws' ? 'AWS 비용 상세' : 'xAI 비용 상세'}</h2>
          <button aria-label="비용 상세 닫기" className="flex size-10 items-center justify-center rounded-lg text-[#5F6675] hover:bg-[#F7F8FA]" onClick={onClose} type="button"><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {type === 'aws' ? (
            cost ? <CostSection state={{ data: cost, error: null, loading: false, receivedAt: cost.updatedAt ?? null }} /> : <PanelMessage message="AWS 비용 데이터가 없습니다." />
          ) : usage ? (
            <><DetailTotal label="선택 주간 xAI 비용" value={formatMoney(xaiRows.reduce((sum, item) => sum + item.total, 0), 'USD')} /><DetailRows rows={xaiRows.map((item) => ({ label: item.label, value: formatMoney(item.total, 'USD') }))} />{usage.unknownCostCalls > 0 ? <p className="mt-4 type-caption text-amber-700">비용을 확인할 수 없는 호출 {formatCount(usage.unknownCostCalls)}건이 제외되었습니다.</p> : null}</>
          ) : <PanelMessage message="xAI 비용 데이터가 없습니다." />}
        </div>
      </aside>
    </div>
  )
}

function DetailTotal({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[14px] bg-[#1B2436] px-5 py-5 text-white"><p className="type-caption text-[#A9B4C7]">{label}</p><p className="mt-2 font-numeric text-[2rem] font-extrabold tracking-normal">{value}</p></div>
}

function DetailRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) return <PanelMessage message="비용 내역이 없습니다." />
  return <dl className="mt-5 divide-y divide-[#EEF1F5]">{rows.map((row) => <div className="flex items-center justify-between gap-4 py-4" key={row.label}><dt className="min-w-0 truncate type-body text-[#3C4152]" title={row.label}>{row.label}</dt><dd className="shrink-0 font-numeric type-body font-bold text-[#171A22]">{row.value}</dd></div>)}</dl>
}

function aggregateXaiUsage(usage: AdminXaiUsage | null) {
  const totals = new Map<string, number>()
  for (const item of usage?.items ?? []) {
    const amount = numberOrNull(item.costUsd)
    if (amount == null) continue
    const label = `${formatMonthDay(item.date)} · ${item.group}`
    totals.set(label, (totals.get(label) ?? 0) + amount)
  }
  return Array.from(totals, ([label, total]) => ({ label, total })).sort((first, second) => second.total - first.total)
}

function numberOrNull(value: string | null | undefined) {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sumKnown(items: Array<{ total: number | null }>) {
  return items.reduce((sum, item) => sum + (item.total ?? 0), 0)
}

function CostSection({ state }: { state: LoadState<InfraCost> }) {
  const data = state.data
  const services = data?.monthToDate?.byService ?? []
  const allDaily = [...(data?.daily ?? [])].sort((first, second) => first.date.localeCompare(second.date))
  const latestDate = allDaily.at(-1)?.date ?? localDate(new Date())
  const latestWeek = weekEndingAt(latestDate)
  const [weekOffset, setWeekOffset] = useState(0)
  const selectedWeek = shiftDateRange(latestWeek, weekOffset * 7)
  const selectedDaily = allDaily.filter((item) => item.date >= selectedWeek.from && item.date <= selectedWeek.to)
  const dailyByDate = new Map(selectedDaily.map((item) => [item.date, item.total]))
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = shiftIsoDate(selectedWeek.from, index)
    return { date, total: dailyByDate.get(date) ?? 0 }
  })
  const totalCost = Math.max(1, data?.monthToDate?.total ?? 0)
  const canGoPrevious = allDaily.length > 0 && selectedWeek.from > allDaily[0].date
  const canGoNext = weekOffset < 0
  return (
    <section aria-labelledby="cost-title" className="shrink-0 rounded-[14px] border border-stone-200 bg-white">
      <SectionHeader
        detail={data?.updatedAt ? `비용 데이터 기준 ${formatDateTime(data.updatedAt)}` : undefined}
        id="cost-title"
        label="조회"
        title="AWS 비용"
        updatedAt={state.receivedAt}
      />
      {state.error ? <AdminErrorMessage error={state.error} /> : null}
      {state.loading ? <PanelMessage message="AWS 비용 정보를 불러오는 중입니다." /> : null}
      {!state.loading && data && !data.available ? (
        <PanelMessage message={unavailableMessage(data.reason, 'cost')} />
      ) : null}
      {!state.loading && data?.available ? (
        <>
          {data.stale ? <StaleNotice /> : null}
          <div className="grid xl:grid-cols-[minmax(360px,1fr)_minmax(0,1fr)]">
            <div className="border-b border-stone-100 p-3 xl:border-r xl:border-b-0">
              <h3 className="type-control font-bold text-stone-700">서비스별</h3>
              <div className="mt-2 space-y-2.5">
                {services.length === 0 ? <p className="type-caption text-stone-500">비용 내역이 없습니다.</p> : services.map((item) => (
                  <div key={item.service}>
                    <div className="mb-1 flex items-center justify-between gap-3 type-caption">
                      <span className="min-w-0 truncate font-medium text-stone-700" title={item.service}>{item.service}</span>
                      <span className="flex shrink-0 items-center gap-3"><strong className="text-stone-800">{formatMoney(item.amount, data.currency ?? 'USD')}</strong><span className="w-8 text-right text-stone-400">{Math.round((item.amount / totalCost) * 100)}%</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.min(100, (item.amount / totalCost) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="type-control font-bold text-stone-700">일별 비용</h3>
                <WeekRangeControl
                  canGoNext={canGoNext}
                  canGoPrevious={canGoPrevious}
                  label="AWS 비용 조회 기간"
                  onNext={() => setWeekOffset((current) => Math.min(0, current + 1))}
                  onPrevious={() => setWeekOffset((current) => current - 1)}
                  range={selectedWeek}
                />
              </div>
              {selectedDaily.length === 0 ? <p className="py-8 text-center type-caption text-stone-500">일별 비용 내역이 없습니다.</p> : (
                <DailyCostChart currency={data.currency ?? 'USD'} daily={daily} range={selectedWeek} />
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

function DailyCostChart({ currency, daily, range }: { currency: string; daily: Array<{ date: string; total: number }>; range: { from: string; to: string } }) {
  const yMax = costAxisMaximum(daily.map((item) => item.total))
  const slotWidth = (COST_CHART_RIGHT - COST_CHART_LEFT) / daily.length
  const chartHeight = COST_CHART_BOTTOM - COST_CHART_TOP
  return (
    <div><div className="mt-2 overflow-x-auto pb-1" role="region" aria-label="일별 비용 그래프" tabIndex={0}>
      <svg aria-label={`${range.from}부터 ${range.to}까지 일별 AWS 비용`} className="h-auto min-w-[680px] w-full" role="img" viewBox="0 0 860 230">
        <title>{range.from}부터 {range.to}까지 일별 AWS 비용</title>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = COST_CHART_TOP + ratio * chartHeight
          const value = yMax * (1 - ratio)
          return (
            <g key={ratio}>
              <line stroke="#E8EAF1" strokeWidth="1" x1={COST_CHART_LEFT} x2={COST_CHART_RIGHT} y1={y} y2={y} />
              <text className="fill-stone-400 type-micro" textAnchor="end" x={COST_CHART_LEFT - 10} y={y + 4}>{formatMoney(value, currency)}</text>
            </g>
          )
        })}
        {daily.map((item, index) => {
          const x = COST_CHART_LEFT + slotWidth * index + slotWidth / 2
          const barHeight = item.total <= 0 ? 0 : Math.max(2, (item.total / yMax) * chartHeight)
          const y = COST_CHART_BOTTOM - barHeight
          return (
            <g key={item.date}>
              {item.total > 0 ? <text className="fill-stone-700 type-micro font-semibold" textAnchor="middle" x={x} y={Math.max(COST_CHART_TOP + 10, y - 8)}>{formatMoney(item.total, currency)}</text> : null}
              <rect role="img" aria-label={`${item.date}: ${formatMoney(item.total, currency)}`} className="fill-brand-700" data-cost-date={item.date} height={barHeight} rx="2" width="28" x={x - 14} y={y}>
                <title>{item.date}: {formatMoney(item.total, currency)}</title>
              </rect>
              <text className="fill-stone-500 type-micro" textAnchor="middle" x={x} y="216">{formatMonthDay(item.date)}</text>
            </g>
          )
        })}
      </svg>
    </div>
    <TabletChartValues label="일별 비용" columns={['날짜', '비용']} rows={daily.map(day => [day.date, formatMoney(day.total, currency)])} />
    </div>
  )
}

type ChartSeries = { color: string; label: string; points: InfraPoint[] }

export function InfraLineChart({
  ariaLabel,
  formatValue,
  range,
  series,
  title,
  yMax,
}: {
  ariaLabel: string
  formatValue: (value: number | null | undefined) => string
  range: InfraRange
  series: ChartSeries[]
  title: string
  yMax?: number
}) {
  const allPoints = series.flatMap((item) => item.points)
  const timestamps = allPoints.map((point) => Date.parse(point.t)).filter(Number.isFinite)
  const values = allPoints.map((point) => point.v).filter((value): value is number => value != null && Number.isFinite(value))
  const minTime = timestamps.length ? Math.min(...timestamps) : 0
  const maxTime = timestamps.length ? Math.max(...timestamps) : 0
  const resolvedMax = yMax ?? Math.max(1, ...values)
  const ticks = chartTicks([...new Set(timestamps)].sort((a, b) => a - b), 5)
  const latestSummary = series.map((item) => {
    const latest = [...item.points].reverse().find((point) => point.v != null)?.v
    const max = Math.max(...item.points.map((point) => point.v).filter((value): value is number => value != null), 0)
    return `${item.label} 최근 ${formatValue(latest)}, 최대 ${formatValue(max)}`
  }).join(', ')

  return (
    <section className="min-w-0 border-b border-stone-100 p-2.5 xl:border-r xl:border-b-0 xl:last:border-r-0">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-micro font-bold text-stone-900">{title}</h3>
        <div className="flex flex-wrap items-center gap-2 type-micro text-stone-500">
          {series.map((item) => <span className="flex items-center gap-1" key={item.label}><span className="size-1.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
        </div>
      </div>
      {values.length === 0 ? <PanelMessage message="선택한 기간의 지표가 없습니다." /> : (
        <>
          <div className="overflow-x-auto" role="region" aria-label={`${title} 그래프 영역`} tabIndex={0}>
            <svg aria-label={ariaLabel} className="h-auto min-w-[720px] w-full" role="img" viewBox="0 0 1200 128">
              <title>{ariaLabel}. {latestSummary}</title>
              {[0, 0.5, 1].map((ratio) => {
                const y = CHART_TOP + ratio * (CHART_BOTTOM - CHART_TOP)
                return <line key={ratio} stroke="#E8EAF1" strokeWidth="0.75" x1={CHART_LEFT} x2={CHART_RIGHT} y1={y} y2={y} />
              })}
              {series.map((item) => (
                <g key={item.label}>
                  <path
                    d={buildLinePath(item.points, minTime, maxTime, resolvedMax)}
                    data-series={item.label}
                    fill="none"
                    stroke={item.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.25"
                  />
                  {item.points.filter((point) => point.v != null).map((point) => {
                    const x = scaleTime(Date.parse(point.t), minTime, maxTime)
                    const y = scaleValue(point.v ?? 0, resolvedMax)
                    return (
                      <circle cx={x} cy={y} fill="transparent" key={`${item.label}-${point.t}`} r="4" tabIndex={0}>
                        <title>{item.label} {formatChartTime(point.t, range)} {formatValue(point.v)}</title>
                      </circle>
                    )
                  })}
                </g>
              ))}
              <text className="fill-stone-400 type-micro" textAnchor="end" x="44" y={CHART_TOP + 3}>{formatValue(resolvedMax)}</text>
              <text className="fill-stone-400 type-micro" textAnchor="end" x="44" y={CHART_BOTTOM + 3}>{formatValue(0)}</text>
              {ticks.map((timestamp, index) => (
                <text className="fill-stone-400 type-micro" data-time-tick="true" key={timestamp} textAnchor={index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle'} x={scaleTime(timestamp, minTime, maxTime)} y="121">
                  {formatChartTime(new Date(timestamp).toISOString(), range)}
                </text>
              ))}
            </svg>
          </div>
          <p className="sr-only">{latestSummary}</p>
          <TabletChartValues label={title} columns={['지표', '시각', '값']} rows={series.flatMap(item => item.points.map(point => [item.label, formatChartTime(point.t, range), formatValue(point.v)]))} />
        </>
      )}
    </section>
  )
}

function buildLinePath(points: InfraPoint[], minTime: number, maxTime: number, yMax: number) {
  let drawing = false
  return points.map((point) => {
    if (point.v == null || !Number.isFinite(point.v)) {
      drawing = false
      return ''
    }
    const command = drawing ? 'L' : 'M'
    drawing = true
    return `${command}${scaleTime(Date.parse(point.t), minTime, maxTime).toFixed(2)},${scaleValue(point.v, yMax).toFixed(2)}`
  }).filter(Boolean).join(' ')
}

function SectionHeader({ detail, id, label = '갱신', title, updatedAt }: { detail?: string; id: string; label?: string; title: string; updatedAt: string | null | undefined }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
      <h2 className="type-control font-bold text-stone-950" id={id}>{title}</h2>
      <p className="type-micro text-stone-400" title={detail}>{label} {updatedAt ? formatDateTime(updatedAt) : '-'}</p>
    </div>
  )
}

function SegmentedControl({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <div aria-label={label} className="flex h-9 items-center rounded-lg bg-stone-100 p-1" role="group">
      {options.map(([optionValue, optionLabel]) => (
        <button
          aria-pressed={value === optionValue}
          className={value === optionValue ? 'h-7 rounded-md bg-white px-3 type-control font-semibold text-stone-950 shadow-sm' : 'h-7 rounded-md px-3 type-control text-stone-500'}
          key={optionValue}
          onClick={() => onChange(optionValue)}
          type="button"
        >
          {optionLabel}
        </button>
      ))}
    </div>
  )
}

function WeekRangeControl({
  canGoNext,
  canGoPrevious,
  label,
  onNext,
  onPrevious,
  range,
}: {
  canGoNext: boolean
  canGoPrevious: boolean
  label: string
  onNext: () => void
  onPrevious: () => void
  range: { from: string; to: string }
}) {
  return (
    <div aria-label={label} className="flex h-8 items-center overflow-hidden rounded-lg border border-stone-200 bg-white mobile-web:h-11">
      <button aria-label="AWS 비용 이전 주" className="flex h-full w-8 items-center justify-center text-stone-500 hover:bg-stone-50 hover:text-stone-900 disabled:opacity-40 mobile-web:w-11" disabled={!canGoPrevious} onClick={onPrevious} type="button"><ChevronLeft aria-hidden="true" size={14} /></button>
      <span className="min-w-24 px-1.5 text-center type-caption font-semibold text-stone-700">{formatWeekRange(range)}</span>
      <button aria-label="AWS 비용 다음 주" className="flex h-full w-8 items-center justify-center text-stone-500 hover:bg-stone-50 hover:text-stone-900 disabled:opacity-40 mobile-web:w-11" disabled={!canGoNext} onClick={onNext} type="button"><ChevronRight aria-hidden="true" size={14} /></button>
    </div>
  )
}

function StaleNotice() {
  return <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 type-caption font-medium text-amber-800">마지막 성공값 표시 중 (AWS 응답 실패)</div>
}

function unavailableMessage(reason: string | undefined, section: 'metrics' | 'cost') {
  if (reason === 'DISABLED') return '인프라 조회가 비활성화되어 있습니다.'
  return section === 'cost'
    ? 'AWS 비용 정보를 일시적으로 가져오지 못했습니다.'
    : '서버 지표를 일시적으로 가져오지 못했습니다.'
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

function formatMonthDay(value: string) {
  const [, month, day] = value.split('-')
  return `${Number(month)}/${Number(day)}`
}

function localDate(value: Date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(value)
}

function weekEndingAt(to: string) {
  return { from: shiftIsoDate(to, -6), to }
}

function shiftDateRange(range: { from: string; to: string }, days: number) {
  return { from: shiftIsoDate(range.from, days), to: shiftIsoDate(range.to, days) }
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatWeekRange(range: { from: string; to: string }) {
  return `${formatPaddedMonthDay(range.from)} - ${formatPaddedMonthDay(range.to)}`
}

function formatPaddedMonthDay(value: string) {
  const [, month, day] = value.split('-')
  return `${month}.${day}`
}

function ratioPercent(value: number, max: number) {
  return max > 0 ? (value / max) * 100 : null
}

const CHART_LEFT = 52
const CHART_RIGHT = 1188
const CHART_TOP = 8
const CHART_BOTTOM = 94
const COST_CHART_LEFT = 58
const COST_CHART_RIGHT = 848
const COST_CHART_TOP = 22
const COST_CHART_BOTTOM = 190

function scaleTime(value: number, min: number, max: number) {
  if (max <= min) return (CHART_LEFT + CHART_RIGHT) / 2
  return CHART_LEFT + ((value - min) / (max - min)) * (CHART_RIGHT - CHART_LEFT)
}

function scaleValue(value: number, max: number) {
  return CHART_BOTTOM - (Math.max(0, Math.min(value, max)) / Math.max(1, max)) * (CHART_BOTTOM - CHART_TOP)
}

function costAxisMaximum(values: number[]) {
  const maximum = Math.max(0, ...values)
  const step = Math.max(0.25, Math.ceil(maximum) / 4)
  return step * 4
}

function chartTicks(timestamps: number[], count: number) {
  if (timestamps.length <= count) return timestamps
  return Array.from({ length: count }, (_, index) => timestamps[Math.round((index / (count - 1)) * (timestamps.length - 1))])
}

function formatChartTime(value: string, range: InfraRange) {
  return new Intl.DateTimeFormat('ko-KR', range === '7d'
    ? { day: 'numeric', month: 'numeric', timeZone: 'Asia/Seoul' }
    : { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(value))
}
