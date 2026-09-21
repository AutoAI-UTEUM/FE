import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import type {
  AdminRepository,
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

const emptySeries = {
  cpu: [],
  netIn: [],
  netOut: [],
  mem: [],
  disk: [],
  status: [],
}

export function InfraPanel({ repository }: { repository: AdminRepository }) {
  const [env, setEnv] = useState<InfraEnv>('prod')
  const [range, setRange] = useState<InfraRange>('24h')
  const [refreshKey, setRefreshKey] = useState(0)
  const [metrics, setMetrics] = useState<LoadState<InfraMetrics>>(emptyState)
  const [cost, setCost] = useState<LoadState<InfraCost>>(emptyState)
  const [app, setApp] = useState<LoadState<InfraApp>>(emptyState)
  const isRefreshing = metrics.loading || cost.loading || app.loading

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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1560px] flex-col gap-[14px] overflow-y-auto pb-1">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4 mobile-phone:flex-col mobile-phone:items-stretch">
        <h1 className="type-admin-title font-bold text-stone-950">인프라</h1>
        <div className="flex flex-wrap items-center gap-3 mobile-phone:justify-between">
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
        </div>
        <Button aria-label="인프라 새로고침" onClick={() => {
          setMetrics((current) => ({ ...current, error: null, loading: true }))
          setCost((current) => ({ ...current, error: null, loading: true }))
          setApp((current) => ({ ...current, error: null, loading: true }))
          setRefreshKey((key) => key + 1)
        }} className="size-9 shrink-0 p-0 mobile-web:size-11 mobile-phone:self-end" disabled={isRefreshing} size="sm" title="새로고침" variant="secondary">
          <RefreshCw aria-hidden="true" className={isRefreshing ? 'animate-spin' : undefined} size={15} />
        </Button>
        </div>
      </div>

      <InfraSummary app={app} cost={cost} metrics={metrics} />
      <SystemSection app={app} range={range} metrics={metrics} />
      <CostSection state={cost} />
    </div>
  )
}

function InfraSummary({ app, cost, metrics }: { app: LoadState<InfraApp>; cost: LoadState<InfraCost>; metrics: LoadState<InfraMetrics> }) {
  const metricData = metrics.data
  const appData = app.data
  const costData = cost.data
  const statusFailed = (metricData?.latest?.status ?? 0) >= 1
  return (
    <section aria-label="서버 상태" className="shrink-0">
      {metrics.error ? <AdminErrorMessage error={metrics.error} /> : null}
      {!metrics.loading && metricData && !metricData.available ? <PanelMessage message={unavailableMessage(metricData.reason, 'metrics')} /> : null}
      {metricData?.stale ? <StaleNotice /> : null}
      <div className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <SummaryMetric dark detail={appData?.available ? formatUptime(appData.uptimeSeconds) : '가동 시간 데이터 없음'} danger={statusFailed} label="상태" value={metricData?.latest?.status == null ? '-' : statusFailed ? '실패' : '정상'} />
        <SummaryMetric danger={(metricData?.latest?.cpu ?? 0) > 80} label="CPU" value={formatPercent(metricData?.latest?.cpu)} />
        <SummaryMetric danger={(metricData?.latest?.mem ?? 0) > 85} label="메모리" value={formatPercent(metricData?.latest?.mem)} />
        <SummaryMetric danger={(metricData?.latest?.disk ?? 0) > 80} label="디스크" value={formatPercent(metricData?.latest?.disk)} />
        <SummaryMetric label="AWS 비용" value={costData?.available ? formatMoney(costData.monthToDate?.total ?? 0, costData.currency ?? 'USD') : '-'} />
      </div>
    </section>
  )
}

function SummaryMetric({ dark = false, danger = false, detail, label, value }: { dark?: boolean; danger?: boolean; detail?: string; label: string; value: string }) {
  return <article className={`flex min-h-32 min-w-0 flex-col gap-2.5 rounded-[14px] px-5 py-[18px] ${dark ? 'bg-[#1B2436] text-white' : 'border border-stone-200 bg-white'}`}><p className={`type-caption font-medium ${dark ? 'text-[#A9B4C7]' : 'text-stone-500'}`}>{label}</p><p className={`type-metric truncate font-extrabold tracking-normal tabular-nums ${danger ? 'text-rose-700' : dark ? 'text-white' : 'text-stone-950'}`} title={value}>{value}</p><span className={`mt-auto type-caption ${dark ? 'text-[#8D99AD]' : 'text-stone-400'}`}>{detail ?? (value === '-' ? '데이터 없음' : '현재 조회 값')}</span></article>
}

function SystemSection({ app, metrics, range }: { app: LoadState<InfraApp>; metrics: LoadState<InfraMetrics>; range: InfraRange }) {
  const series = metrics.data?.series ?? emptySeries
  return <section aria-labelledby="system-title" className="overflow-hidden rounded-lg border border-stone-200 bg-white"><SectionHeader id="system-title" label="조회" title="시스템" updatedAt={metrics.data?.to ?? app.receivedAt} />{app.error ? <AdminErrorMessage error={app.error} /> : null}{metrics.loading || app.loading ? <PanelMessage message="시스템 상태를 불러오는 중입니다." /> : <div className="grid xl:grid-cols-[minmax(340px,1fr)_minmax(0,1.45fr)]"><AppStatusTable data={app.data} /><div className="min-w-0 border-t border-stone-200 xl:border-t-0 xl:border-l"><InfraLineChart ariaLabel="CPU, 메모리, 디스크 사용률 추이" formatValue={formatPercent} range={range} series={[{ color: '#20263A', label: 'CPU', points: series.cpu }, { color: '#10B981', label: '메모리', points: series.mem }, { color: '#E11D48', label: '디스크', points: series.disk }]} title="리소스 사용률" yMax={100} /><InfraLineChart ariaLabel="네트워크 수신 및 송신 추이" formatValue={formatBytes} range={range} series={[{ color: '#2563EB', label: '수신', points: series.netIn }, { color: '#F59E0B', label: '송신', points: series.netOut }]} title="네트워크" /></div></div>}</section>
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
    ['AI 서비스', data.aiService.status === 'UP' ? '정상' : '응답 없음', data.aiService.checkedAt ? `${formatDateTime(data.aiService.checkedAt)} 확인` : '확인 시각 없음'],
  ]
  return <div className="min-w-0"><h3 className="border-b border-stone-100 px-4 py-3 type-control font-bold text-stone-700">애플리케이션</h3><table className="w-full table-fixed type-caption"><thead className="bg-[#F7F8FA] text-left text-stone-500"><tr><th className="w-[34%] px-4 py-2">항목</th><th className="w-[25%] px-4 py-2 text-right">값</th><th className="px-4 py-2">상세</th></tr></thead><tbody>{rows.map(([label, value, detail]) => <tr className="border-b border-stone-100" key={label}><th className="px-4 py-2.5 text-left font-semibold text-stone-800">{label}</th><td className={`px-4 py-2.5 text-right font-semibold ${label === 'AI 서비스' && value === '정상' ? 'text-emerald-700' : label === '5xx 오류' && (errorPercent ?? 0) > 0 ? 'text-amber-700' : 'text-stone-700'}`}>{value}</td><td className="truncate px-4 py-2.5 text-stone-400" title={detail}>{detail}</td></tr>)}</tbody></table></div>
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
