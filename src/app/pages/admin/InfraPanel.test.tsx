import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminRepository, AdminXaiOverview, AdminXaiUsage, InfraApp, InfraCost, InfraMetrics } from '../../../features/admin'
import { ApiClientError } from '../../../shared/api'
import { TestAuthProvider } from '../../../test/TestAuthProvider'
import { InfraLineChart, InfraPanel } from './InfraPanel'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const metrics: InfraMetrics = {
  available: true,
  env: 'prod',
  from: '2026-09-01T00:00:00Z',
  latest: { cpu: 82.4, disk: 41.3, mem: 90.1, status: 0 },
  periodSeconds: 300,
  range: '24h',
  series: {
    cpu: points(40, 82.4),
    disk: points(32, 41.3),
    mem: points(70, 90.1),
    netIn: points(1024, 2 * 1024 * 1024),
    netOut: points(2048, 4 * 1024 * 1024),
    status: points(0, 0),
  },
  to: '2026-09-01T01:00:00Z',
}

const cost: InfraCost = {
  available: true,
  currency: 'USD',
  daily: [
    { date: '2026-08-24', total: 1.25 },
    { date: '2026-08-25', total: 1.5 },
    { date: '2026-08-31', total: 2.25 },
  ],
  monthToDate: {
    byService: [{ amount: 30, service: 'Amazon Elastic Compute Cloud' }],
    total: 42.75,
  },
  note: '어제까지 확정치',
  updatedAt: '2026-09-01T00:30:00Z',
}

const app: InfraApp = {
  aiService: { checkedAt: '2026-09-01T00:59:00Z', status: 'UP' },
  available: true,
  db: { activeConnections: 3, idleConnections: 7, maxConnections: 10 },
  http: { averageResponseTimeMs: 31.4, requestCount: 100, serverErrorCount: 2 },
  jvm: {
    gcCount: 8,
    heapCommittedBytes: 400 * 1024 * 1024,
    heapMaxBytes: 512 * 1024 * 1024,
    heapUsedBytes: 256 * 1024 * 1024,
    liveThreads: 42,
  },
  uptimeSeconds: 3 * 86400 + 4 * 3600 + 12 * 60,
}

const xaiOverview: AdminXaiOverview = {
  available: true,
  averageDailyCost7d: '1.25',
  currentMonthCostUsd: '37.14',
  fetchedAt: '2026-09-01T00:30:00Z',
  lastSuccessfulSyncAt: '2026-09-01T00:30:00Z',
  postpaidLimitUsd: '0',
  postpaidRemainingUsd: '0',
  prepaidAvailableUsd: '56.77',
  prepaidBalanceUsd: '93.91',
  prepaidUsedThisPeriodUsd: '37.14',
  projectedDepletionAt: null,
  riskLevel: 'NORMAL',
  stale: false,
  totalAvailableUsd: '56.77',
}

const xaiUsage: AdminXaiUsage = {
  from: '2026-08-26',
  granularity: 'DAY',
  groupBy: 'FEATURE',
  items: [{ callCount: 2, costUsd: '1.50', date: '2026-09-01', group: '학습 대화', tokenCount: 1000 }],
  metric: 'COST',
  to: '2026-09-01',
  unknownCostCalls: 0,
}

function points(first: number, second: number) {
  return [
    { t: '2026-09-01T00:00:00Z', v: first },
    { t: '2026-09-01T01:00:00Z', v: second },
  ]
}

function createRepository(overrides: Partial<AdminRepository> = {}) {
  return {
    getInfraApp: vi.fn().mockResolvedValue(app),
    getInfraCost: vi.fn().mockResolvedValue(cost),
    getInfraMetrics: vi.fn().mockResolvedValue(metrics),
    getXaiOverview: vi.fn().mockResolvedValue(xaiOverview),
    getXaiUsage: vi.fn().mockResolvedValue(xaiUsage),
    ...overrides,
  } as unknown as AdminRepository
}

function renderPanel(repository = createRepository()) {
  return {
    repository,
    ...render(
      <TestAuthProvider>
        <MemoryRouter><InfraPanel repository={repository} /></MemoryRouter>
      </TestAuthProvider>,
    ),
  }
}

describe('InfraPanel', () => {
  it('renders server thresholds, cost and the BE app metrics contract', async () => {
    const { container } = renderPanel()

    const serverSection = await screen.findByRole('region', { name: '서버 상태' })
    expect(within(serverSection).getByText('82.4%')).toHaveClass('text-rose-700')
    expect(within(serverSection).getByText('90.1%')).toHaveClass('text-rose-700')
    expect(within(serverSection).getByText('41.3%')).not.toHaveClass('text-rose-700')
    expect(screen.getByText('정상')).toBeInTheDocument()
    expect(await screen.findByText('$42.75')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText('3일 4시간 12분')).toBeInTheDocument()
    expect(screen.getByText('100건')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'AWS 주간 비용 상세 보기' }))
    const costHeader = screen.getByRole('heading', { name: 'AWS 비용' }).parentElement
    expect(costHeader).toHaveTextContent('조회')
    expect(costHeader?.textContent).not.toMatch(/:\d{2}:\d{2}/)
    expect(container.querySelectorAll('[data-cost-date]')).toHaveLength(7)
    expect(container.querySelector('[data-cost-date="2026-08-31"]')).toHaveClass('fill-brand-700')
  })

  it('treats disabled metrics as information while other sections still render', async () => {
    renderPanel(createRepository({
      getInfraMetrics: vi.fn().mockResolvedValue({ available: false, reason: 'DISABLED' }),
    }))

    expect(await screen.findByText('인프라 조회가 비활성화되어 있습니다.')).toBeInTheDocument()
    expect(await screen.findByText('$42.75')).toBeInTheDocument()
    expect(screen.getAllByText('3일 4시간 12분')).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows stale and null metric states without crashing', async () => {
    renderPanel(createRepository({
      getInfraMetrics: vi.fn().mockResolvedValue({
        ...metrics,
        latest: { ...metrics.latest, cpu: null },
        stale: true,
      }),
    }))

    expect(await screen.findByText('마지막 성공값 표시 중 (AWS 응답 실패)')).toBeInTheDocument()
    const serverSection = screen.getByRole('region', { name: '서버 상태' })
    expect(within(serverSection).getByText('CPU', { selector: 'p' }).parentElement).toHaveTextContent('-데이터 없음')
  })

  it('uses the shared administrator re-login error for 403 responses', async () => {
    renderPanel(createRepository({
      getInfraMetrics: vi.fn().mockRejectedValue(new ApiClientError({
        code: 'FORBIDDEN',
        message: '접근 권한이 없습니다.',
        status: 403,
      })),
    }))

    expect(await screen.findByText(/관리자 권한이 변경되었어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 로그인' })).toBeInTheDocument()
    expect(await screen.findByText('$42.75')).toBeInTheDocument()
  })

  it('reloads only metrics for filters and reloads every section manually', async () => {
    const repository = createRepository({
      getInfraCost: vi.fn()
        .mockResolvedValueOnce(cost)
        .mockResolvedValueOnce({
          ...cost,
          monthToDate: { ...cost.monthToDate, total: 43.5 },
          updatedAt: '2026-09-01T01:30:00Z',
        }),
    })
    renderPanel(repository)
    await screen.findByText('$42.75')

    fireEvent.click(screen.getByRole('button', { name: '개발' }))
    fireEvent.change(screen.getByLabelText('조회 기간'), { target: { value: '6h' } })
    await waitFor(() => expect(vi.mocked(repository.getInfraMetrics).mock.calls.at(-1)?.[0]).toEqual({ env: 'dev', range: '6h' }))
    expect(repository.getInfraCost).toHaveBeenCalledTimes(1)
    expect(repository.getInfraApp).toHaveBeenCalledTimes(1)

    const metricsCalls = vi.mocked(repository.getInfraMetrics).mock.calls.length
    const refreshButton = screen.getByRole('button', { name: '인프라 새로고침' })
    expect(refreshButton).toHaveAttribute('title', '새로고침')
    expect(refreshButton).toHaveTextContent('')
    fireEvent.click(refreshButton)
    await waitFor(() => expect(repository.getInfraCost).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('$43.50')).toBeInTheDocument()
    expect(repository.getInfraApp).toHaveBeenCalledTimes(2)
    expect(repository.getInfraMetrics).toHaveBeenCalledTimes(metricsCalls + 1)
  })

  it('shows AWS daily costs in fixed seven-day ranges', async () => {
    const { repository } = renderPanel()
    await screen.findByText('$42.75')
    fireEvent.click(screen.getByRole('button', { name: 'AWS 주간 비용 상세 보기' }))

    const rangeControl = screen.getByLabelText('AWS 비용 조회 기간')
    expect(rangeControl).toHaveTextContent('08.25 - 08.31')
    expect(screen.getByLabelText('2026-08-31: $2.25')).toBeInTheDocument()
    expect(screen.queryByLabelText('2026-08-24: $1.25')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AWS 비용 다음 주' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'AWS 비용 이전 주' }))

    expect(rangeControl).toHaveTextContent('08.18 - 08.24')
    expect(screen.getByLabelText('2026-08-24: $1.25')).toBeInTheDocument()
    expect(screen.queryByLabelText('2026-08-31: $2.25')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AWS 비용 다음 주' })).toBeEnabled()
    expect(repository.getInfraCost).toHaveBeenCalledTimes(1)
  })

  it('does not poll when time passes', async () => {
    const repository = createRepository()
    renderPanel(repository)
    await screen.findByText('$42.75')
    const counts = [
      vi.mocked(repository.getInfraMetrics).mock.calls.length,
      vi.mocked(repository.getInfraCost).mock.calls.length,
      vi.mocked(repository.getInfraApp).mock.calls.length,
    ]

    vi.useFakeTimers()
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)

    expect(repository.getInfraMetrics).toHaveBeenCalledTimes(counts[0])
    expect(repository.getInfraCost).toHaveBeenCalledTimes(counts[1])
    expect(repository.getInfraApp).toHaveBeenCalledTimes(counts[2])
  })
})

describe('InfraLineChart', () => {
  it('restarts the SVG path after null points and provides an accessible label', () => {
    const { container } = render(
      <InfraLineChart
        ariaLabel="CPU 추이"
        formatValue={(value) => value == null ? '-' : `${value}%`}
        range="24h"
        series={[{
          color: '#000',
          label: 'CPU',
          points: [
            { t: '2026-09-01T00:00:00Z', v: 10 },
            { t: '2026-09-01T00:30:00Z', v: null },
            { t: '2026-09-01T01:00:00Z', v: 30 },
          ],
        }]}
        title="사용률"
        yMax={100}
      />,
    )

    expect(screen.getByRole('img', { name: 'CPU 추이' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'CPU 추이' })).toHaveAttribute('viewBox', '0 0 1200 128')
    expect(container.querySelector('path[data-series="CPU"]')).toHaveAttribute('stroke-width', '1.25')
    expect(container.querySelector('path[data-series="CPU"]')?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    const timeTicks = container.querySelectorAll('[data-time-tick="true"]')
    expect(timeTicks.item(0)).toHaveAttribute('text-anchor', 'start')
    expect(timeTicks.item(timeTicks.length - 1)).toHaveAttribute('text-anchor', 'end')
  })

  it('shows the empty message when every point is unavailable', () => {
    render(
      <InfraLineChart
        ariaLabel="빈 지표"
        formatValue={() => '-'}
        range="1h"
        series={[{ color: '#000', label: 'CPU', points: [] }]}
        title="사용률"
      />,
    )
    expect(screen.getByText('선택한 기간의 지표가 없습니다.')).toBeInTheDocument()
  })
})
