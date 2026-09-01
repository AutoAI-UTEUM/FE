import { RefreshCw } from 'lucide-react'
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
import {
  AdminErrorMessage,
  formatCount,
  formatDateTime,
  Metric,
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
    <div className="h-full min-h-[560px] overflow-auto bg-[#F7F8FA]">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 mobile-phone:flex-col mobile-phone:items-stretch">
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
        <Button onClick={() => {
          setMetrics((current) => ({ ...current, error: null, loading: true }))
          setCost((current) => ({ ...current, error: null, loading: true }))
          setApp((current) => ({ ...current, error: null, loading: true }))
          setRefreshKey((key) => key + 1)
        }} className="mobile-phone:w-full" size="sm" variant="secondary">
          <RefreshCw aria-hidden="true" size={15} />
          새로고침
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <MetricsSection range={range} state={metrics} />
        <CostSection state={cost} />
        <AppSection state={app} />
      </div>
    </div>
  )
}

function MetricsSection({ range, state }: { range: InfraRange; state: LoadState<InfraMetrics> }) {
  const data = state.data
  const series = data?.series ?? emptySeries
  return (
    <section aria-labelledby="server-metrics-title" className="rounded-lg border border-stone-200 bg-white">
      <SectionHeader
        id="server-metrics-title"
        title="서버 상태"
        updatedAt={data?.to ?? state.receivedAt}
      />
      {state.error ? <AdminErrorMessage error={state.error} /> : null}
      {state.loading ? <PanelMessage message="서버 지표를 불러오는 중입니다." /> : null}
      {!state.loading && data && !data.available ? (
        <PanelMessage message={unavailableMessage(data.reason, 'metrics')} />
      ) : null}
      {!state.loading && data?.available ? (
        <>
          {data.stale ? <StaleNotice /> : null}
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            <PercentMetric label="CPU" threshold={80} value={data.latest?.cpu ?? null} />
            <PercentMetric label="메모리" threshold={85} value={data.latest?.mem ?? null} />
            <PercentMetric label="디스크" threshold={80} value={data.latest?.disk ?? null} />
            <Metric
              caption={data.latest?.status == null ? '데이터 없음' : undefined}
              label="상태검사"
              tone={(data.latest?.status ?? 0) >= 1 ? 'danger' : 'default'}
              value={data.latest?.status == null ? '-' : data.latest.status >= 1 ? '실패' : '정상'}
            />
          </div>
          <div className="grid border-t border-stone-200 xl:grid-cols-2">
            <InfraLineChart
              ariaLabel="CPU, 메모리, 디스크 사용률 추이"
              formatValue={formatPercent}
              range={range}
              series={[
                { color: '#20263A', label: 'CPU', points: series.cpu },
                { color: '#12833E', label: '메모리', points: series.mem },
                { color: '#E11D48', label: '디스크', points: series.disk },
              ]}
              title="사용률"
              yMax={100}
            />
            <InfraLineChart
              ariaLabel="네트워크 수신 및 송신 추이"
              formatValue={formatBytes}
              range={range}
              series={[
                { color: '#2563EB', label: '수신', points: series.netIn },
                { color: '#F59E0B', label: '송신', points: series.netOut },
              ]}
              title="네트워크"
            />
          </div>
        </>
      ) : null}
    </section>
  )
}

function CostSection({ state }: { state: LoadState<InfraCost> }) {
  const data = state.data
  const services = data?.monthToDate?.byService ?? []
  const daily = data?.daily ?? []
  const maxService = Math.max(1, ...services.map((item) => item.amount))
  const maxDaily = Math.max(1, ...daily.map((item) => item.total))
  return (
    <section aria-labelledby="cost-title" className="rounded-lg border border-stone-200 bg-white">
      <SectionHeader id="cost-title" title="AWS 비용" updatedAt={data?.updatedAt ?? state.receivedAt} />
      {state.error ? <AdminErrorMessage error={state.error} /> : null}
      {state.loading ? <PanelMessage message="AWS 비용 정보를 불러오는 중입니다." /> : null}
      {!state.loading && data && !data.available ? (
        <PanelMessage message={unavailableMessage(data.reason, 'cost')} />
      ) : null}
      {!state.loading && data?.available ? (
        <>
          {data.stale ? <StaleNotice /> : null}
          <div className="grid xl:grid-cols-[minmax(220px,0.7fr)_1fr_1.4fr]">
            <div className="border-b border-stone-100 p-4 xl:border-r xl:border-b-0">
              <p className="type-caption text-stone-500">이번 달 누적</p>
              <p className="mt-2 type-page-title font-bold text-stone-950">
                {formatMoney(data.monthToDate?.total ?? 0, data.currency ?? 'USD')}
              </p>
              <p className="mt-2 type-caption text-stone-400">{data.note || '어제까지 확정치'}</p>
            </div>
            <div className="border-b border-stone-100 p-4 xl:border-r xl:border-b-0">
              <h3 className="type-control font-bold text-stone-900">서비스별 비용</h3>
              <div className="mt-3 space-y-3">
                {services.length === 0 ? <p className="type-caption text-stone-500">비용 내역이 없습니다.</p> : services.map((item) => (
                  <div key={item.service}>
                    <div className="mb-1 flex items-center justify-between gap-3 type-caption">
                      <span className="min-w-0 truncate text-stone-600" title={item.service}>{item.service}</span>
                      <span className="shrink-0 font-medium text-stone-800">{formatMoney(item.amount, data.currency ?? 'USD')}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full bg-brand-700" style={{ width: `${(item.amount / maxService) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0 p-4">
              <h3 className="type-control font-bold text-stone-900">최근 30일</h3>
              {daily.length === 0 ? <p className="py-8 text-center type-caption text-stone-500">일별 비용 내역이 없습니다.</p> : (
                <div className="mt-3 flex h-36 items-end gap-1 overflow-x-auto pb-6" role="img" aria-label="최근 30일 일별 AWS 비용">
                  {daily.map((item) => (
                    <div className="group relative flex h-full min-w-3 flex-1 items-end" key={item.date} title={`${item.date}: ${formatMoney(item.total, data.currency ?? 'USD')}`}>
                      <div className="w-full rounded-t-sm bg-emerald-500" style={{ height: `${Math.max(2, (item.total / maxDaily) * 100)}%` }} />
                      <span className="sr-only">{item.date} {formatMoney(item.total, data.currency ?? 'USD')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

function AppSection({ state }: { state: LoadState<InfraApp> }) {
  const data = state.data
  if (state.loading) {
    return <section className="rounded-lg border border-stone-200 bg-white"><SectionHeader id="app-title" title="앱 상태" updatedAt={null} /><PanelMessage message="앱 상태를 불러오는 중입니다." /></section>
  }
  return (
    <section aria-labelledby="app-title" className="rounded-lg border border-stone-200 bg-white">
      <SectionHeader id="app-title" title="앱 상태" updatedAt={state.receivedAt} />
      {state.error ? <AdminErrorMessage error={state.error} /> : null}
      {data && !data.available ? <PanelMessage message="앱 상태 정보를 일시적으로 가져오지 못했습니다." /> : null}
      {data?.available ? <AppCards data={data} /> : null}
    </section>
  )
}

function AppCards({ data }: { data: InfraApp }) {
  const heapPercent = ratioPercent(data.jvm.heapUsedBytes, data.jvm.heapMaxBytes)
  const errorPercent = data.http.requestCount > 0
    ? (data.http.serverErrorCount / data.http.requestCount) * 100
    : null
  const dbPercent = ratioPercent(data.db.activeConnections, data.db.maxConnections)
  const aiUp = data.aiService.status === 'UP'
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-5">
      <AppCard danger={(heapPercent ?? 0) > 85} label="JVM 힙" value={formatPercent(heapPercent)}>
        {formatBytes(data.jvm.heapUsedBytes)} / {formatBytes(data.jvm.heapMaxBytes)} · 스레드 {formatCount(data.jvm.liveThreads)}
      </AppCard>
      <AppCard label="HTTP" value={`${formatCount(data.http.requestCount)}건`}>
        5xx {formatPercent(errorPercent)} · 평균 {data.http.averageResponseTimeMs == null ? '-' : `${data.http.averageResponseTimeMs.toFixed(1)}ms`}
      </AppCard>
      <AppCard danger={(dbPercent ?? 0) > 80} label="DB 풀" value={`${formatCount(data.db.activeConnections)} / ${formatCount(data.db.maxConnections)}`}>
        유휴 {formatCount(data.db.idleConnections)} · 사용률 {formatPercent(dbPercent)}
      </AppCard>
      <AppCard label="가동 시간" value={formatUptime(data.uptimeSeconds)}>
        프로세스 기준
      </AppCard>
      <AppCard
        danger={!aiUp}
        label="AI 서비스"
        value={<span className={aiUp ? 'inline-flex rounded-md bg-emerald-50 px-2 py-1 type-caption font-semibold text-emerald-700' : 'inline-flex rounded-md bg-rose-50 px-2 py-1 type-caption font-semibold text-rose-700'}>{aiUp ? '정상' : '응답 없음'}</span>}
      >
        {data.aiService.checkedAt ? formatDateTime(data.aiService.checkedAt) : '확인 시각 없음'}
      </AppCard>
    </div>
  )
}

function AppCard({ children, danger = false, label, value }: { children: React.ReactNode; danger?: boolean; label: string; value: React.ReactNode }) {
  return (
    <div className="border-b border-stone-100 p-4 sm:border-r xl:border-b-0 xl:last:border-r-0">
      <p className="type-caption text-stone-500">{label}</p>
      <p className={`mt-1 type-section-title font-bold ${danger ? 'text-rose-700' : 'text-stone-950'}`}>{value}</p>
      <p className="mt-1 type-caption text-stone-400">{children}</p>
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
    <section className="min-w-0 border-b border-stone-100 p-4 xl:border-r xl:border-b-0 xl:last:border-r-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-control font-bold text-stone-900">{title}</h3>
        <div className="flex flex-wrap items-center gap-3 type-caption text-stone-500">
          {series.map((item) => <span className="flex items-center gap-1.5" key={item.label}><span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>)}
        </div>
      </div>
      {values.length === 0 ? <PanelMessage message="선택한 기간의 지표가 없습니다." /> : (
        <>
          <svg aria-label={ariaLabel} className="h-auto w-full" role="img" viewBox="0 0 720 220">
            <title>{ariaLabel}. {latestSummary}</title>
            {[0, 0.5, 1].map((ratio) => {
              const y = 14 + ratio * 166
              return <line key={ratio} stroke="#E8EAF1" strokeWidth="1" x1="44" x2="708" y1={y} y2={y} />
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
                  strokeWidth="2"
                />
                {item.points.filter((point) => point.v != null).map((point) => {
                  const x = scaleTime(Date.parse(point.t), minTime, maxTime)
                  const y = scaleValue(point.v ?? 0, resolvedMax)
                  return (
                    <circle cx={x} cy={y} fill="transparent" key={`${item.label}-${point.t}`} r="6" tabIndex={0}>
                      <title>{item.label} {formatChartTime(point.t, range)} {formatValue(point.v)}</title>
                    </circle>
                  )
                })}
              </g>
            ))}
            <text className="fill-stone-400 type-caption" textAnchor="end" x="40" y="18">{formatValue(resolvedMax)}</text>
            <text className="fill-stone-400 type-caption" textAnchor="end" x="40" y="184">{formatValue(0)}</text>
            {ticks.map((timestamp) => (
              <text className="fill-stone-400 type-caption" key={timestamp} textAnchor="middle" x={scaleTime(timestamp, minTime, maxTime)} y="207">
                {formatChartTime(new Date(timestamp).toISOString(), range)}
              </text>
            ))}
          </svg>
          <p className="sr-only">{latestSummary}</p>
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

function PercentMetric({ label, threshold, value }: { label: string; threshold: number; value: number | null }) {
  return <Metric caption={value == null ? '데이터 없음' : undefined} label={label} tone={(value ?? 0) > threshold ? 'danger' : 'default'} value={formatPercent(value)} />
}

function SectionHeader({ id, title, updatedAt }: { id: string; title: string; updatedAt: string | null | undefined }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
      <h2 className="type-section-title font-bold text-stone-950" id={id}>{title}</h2>
      <p className="type-caption text-stone-400">갱신 {updatedAt ? formatDateTime(updatedAt) : '-'}</p>
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

function ratioPercent(value: number, max: number) {
  return max > 0 ? (value / max) * 100 : null
}

function scaleTime(value: number, min: number, max: number) {
  if (max <= min) return 376
  return 44 + ((value - min) / (max - min)) * 664
}

function scaleValue(value: number, max: number) {
  return 180 - (Math.max(0, Math.min(value, max)) / Math.max(1, max)) * 166
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
