import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminRepository, AdminXaiOverview, InfraApp, InfraCost, InfraMetrics } from '../../../features/admin'
import { ApiClientError } from '../../../shared/api'
import { TestAuthProvider } from '../../../test/TestAuthProvider'
import { InfraPanel } from './InfraPanel'

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

const xai: AdminXaiOverview = {
  available: true,
  averageDailyCost7d: '1.25',
  currentMonthCostUsd: '12.50',
  fetchedAt: '2026-09-01T00:30:00Z',
  lastSuccessfulSyncAt: '2026-09-01T00:30:00Z',
  postpaidLimitUsd: null,
  postpaidRemainingUsd: null,
  prepaidBalanceUsd: null,
  projectedDepletionAt: null,
  riskLevel: null,
  stale: false,
  totalAvailableUsd: null,
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
    getXaiOverview: vi.fn().mockResolvedValue(xai),
    getAiUsageSummary: vi.fn().mockResolvedValue({ daily: [{ date: '2026-09-01', callCount: 5, successCount: 4, failCount: 1, inputTokens: 10, outputTokens: 20, reasoningTokens: 0 }], features: [{ feature: 'TURN', callCount: 5, inputTokens: 10, outputTokens: 20, reasoningTokens: 0 }] }),
    getAiUsageUsers: vi.fn().mockResolvedValue([{ userId: 1, name: '학습자', email: 'learner@example.com', status: 'ACTIVE', callCount: 5, inputTokens: 10, outputTokens: 20, reasoningTokens: 0 }]),
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
  it('opens the reference-style AWS and xAI detail drawers without fabricating costs', async () => {
    const { repository } = renderPanel()
    await screen.findByTitle('42.75$')

    fireEvent.click(screen.getByRole('button', { name: 'AWS 비용 상세 보기' }))
    expect(screen.getByRole('dialog', { name: 'AWS 사용량 · 비용' })).toHaveTextContent('서비스별 비용')
    expect(screen.getByRole('dialog')).toHaveTextContent('EC2')
    fireEvent.click(screen.getByRole('button', { name: '상세 패널 닫기' }))

    fireEvent.click(screen.getByRole('button', { name: 'xAI 상세 보기' }))
    expect(await screen.findByText('학습자')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'xAI 사용량 · 호출' })).toHaveTextContent('기능별 호출')
    expect(repository.getAiUsageSummary).toHaveBeenCalledTimes(2)
  })

  it('renders server thresholds, cost and the application overview without the detail box', async () => {
    renderPanel()

    const serverSection = await screen.findByRole('region', { name: '서버 상태' })
    expect(within(serverSection).getByText('82.4')).toHaveClass('text-rose-700')
    expect(within(serverSection).getByText('90.1')).toHaveClass('text-rose-700')
    expect(within(serverSection).getByText('41.3')).not.toHaveClass('text-rose-700')
    expect(within(serverSection).getByText('CPU', { selector: 'p' }).parentElement?.querySelector('.type-metric-compact')).toHaveTextContent('%')
    expect(screen.getAllByText('정상').length).toBeGreaterThan(0)
    expect(await screen.findByTitle('42.75$')).toBeInTheDocument()
    expect(screen.getAllByText('50.0%').length).toBeGreaterThan(0)
    expect(screen.getByText(/가동 3일 4시간 12분/)).toBeInTheDocument()
    expect(screen.getAllByText('100건').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: '애플리케이션' })).toBeInTheDocument()
    for (const label of ['CPU 추이', '메모리 추이', '디스크 추이', '최근 7일 AI 호출 수 추이', 'AWS 비용 추이']) {
      expect(await screen.findByRole('img', { name: new RegExp(label) })).toBeInTheDocument()
    }
    const cpuGraph = screen.getByRole('img', { name: 'CPU 추이' })
    expect(cpuGraph).toHaveClass('w-[64px]')
    expect(cpuGraph.querySelector('path[stroke]')).toHaveAttribute('stroke', 'var(--color-rose-700)')
    expect(cpuGraph.parentElement).toHaveClass('items-end')
    expect(screen.queryByText('상세 모니터링')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '시스템' })).not.toBeInTheDocument()
  })

  it('colors falling graphs blue and unchanged graphs black', async () => {
    renderPanel(createRepository({
      getInfraMetrics: vi.fn().mockResolvedValue({
        ...metrics,
        series: { ...metrics.series, cpu: points(80, 40), mem: points(50, 50) },
      }),
    }))
    const cpuGraph = await screen.findByRole('img', { name: 'CPU 추이' })
    const memoryGraph = screen.getByRole('img', { name: '메모리 추이' })
    expect(cpuGraph.querySelector('path[stroke]')).toHaveAttribute('stroke', 'var(--color-accent-blue-600)')
    expect(memoryGraph.querySelector('path[stroke]')).toHaveAttribute('stroke', '#1B2436')
  })

  it('keeps seven dated chart slots and leaves missing days without bars', async () => {
    const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() - 24 * 60 * 60 * 1000))
    renderPanel(createRepository({
      getInfraCost: vi.fn().mockResolvedValue({ ...cost, daily: [{ date: yesterday, total: 2.5 }] }),
      getAiUsageSummary: vi.fn().mockResolvedValue({
        daily: [{ date: yesterday, callCount: 3, successCount: 3, failCount: 0, inputTokens: 10, outputTokens: 20, reasoningTokens: 0 }],
        features: [],
      }),
    }))

    const awsChart = await screen.findByRole('img', { name: 'AWS 주간 비용 그래프' })
    const xaiChart = await screen.findByRole('img', { name: 'xAI 최근 7일 호출 그래프' })
    for (const chart of [awsChart, xaiChart]) {
      expect(chart.querySelectorAll('[data-chart-date]')).toHaveLength(7)
      expect(chart.querySelectorAll('[title]')).toHaveLength(1)
      expect(chart.querySelector('[data-chart-date]:last-child')).toHaveAttribute('data-chart-date', yesterday)
    }
    expect(screen.getByRole('region', { name: '주간 비용' })).toHaveTextContent('$2.50')
    expect(within(awsChart).getByText('2.50$')).toBeInTheDocument()
    expect(within(xaiChart).queryByText(/\$/)).not.toBeInTheDocument()
    expect(screen.queryByText('이번 달 누적 비용 · 일별 비용 API는 아직 없습니다.')).not.toBeInTheDocument()
    expect(screen.queryByText('최근 7일 호출 수')).not.toBeInTheDocument()
  })

  it('shows the actual daily AWS cost above the focused bar', async () => {
    const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() - 24 * 60 * 60 * 1000))
    const dayBefore = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() - 48 * 60 * 60 * 1000))
    renderPanel(createRepository({
      getInfraCost: vi.fn().mockResolvedValue({ ...cost, daily: [{ date: dayBefore, total: 1.25 }, { date: yesterday, total: 2.5 }] }),
    }))

    const chart = await screen.findByRole('img', { name: 'AWS 주간 비용 그래프' })
    expect(within(chart).getByText('1.25$')).toBeInTheDocument()
    fireEvent.focus(chart.querySelector(`[data-chart-date="${yesterday}"]`)!)
    expect(within(chart).getByText('2.50$')).toBeInTheDocument()
    expect(within(chart).queryByText('1.25$')).not.toBeInTheDocument()
  })

  it('shows an xAI cost badge only when a daily cost is supplied', async () => {
    const yesterday = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() - 24 * 60 * 60 * 1000))
    renderPanel(createRepository({
      getAiUsageSummary: vi.fn().mockResolvedValue({
        daily: [{ date: yesterday, costUsd: '2.90', callCount: 3, successCount: 3, failCount: 0, inputTokens: 10, outputTokens: 20, reasoningTokens: 0 }],
        features: [],
      }),
    }))

    const chart = await screen.findByRole('img', { name: 'xAI 주간 비용 그래프' })
    expect(within(chart).getByText('2.90$')).toBeInTheDocument()
  })

  it('shows seven dates but no bars when daily data is empty', async () => {
    renderPanel(createRepository({
      getInfraCost: vi.fn().mockResolvedValue({ ...cost, daily: [] }),
      getAiUsageSummary: vi.fn().mockResolvedValue({ daily: [], features: [] }),
    }))

    const awsChart = await screen.findByRole('img', { name: 'AWS 주간 비용 그래프' })
    const xaiChart = await screen.findByRole('img', { name: 'xAI 최근 7일 호출 그래프' })
    for (const chart of [awsChart, xaiChart]) {
      expect(chart.querySelectorAll('[data-chart-date]')).toHaveLength(7)
      expect(chart.querySelectorAll('[title]')).toHaveLength(0)
    }
  })

  it('treats disabled metrics as information while other sections still render', async () => {
    renderPanel(createRepository({
      getInfraMetrics: vi.fn().mockResolvedValue({ available: false, reason: 'DISABLED' }),
    }))

    expect(await screen.findByText('인프라 조회가 비활성화되어 있습니다.')).toBeInTheDocument()
    expect(await screen.findByTitle('42.75$')).toBeInTheDocument()
    expect(screen.getByText(/가동 3일 4시간 12분/)).toBeInTheDocument()
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
    expect(within(serverSection).getByText('CPU', { selector: 'p' }).parentElement).toHaveTextContent('CPU-24시간 평균')
  })

  it('compares infrastructure metrics with the 24-hour average using only reference copy', async () => {
    renderPanel()
    const serverSection = await screen.findByRole('region', { name: '서버 상태' })
    await within(serverSection).findByText('+21.2')
    expect(within(serverSection).getAllByText('24시간 평균')).toHaveLength(3)
    expect(within(serverSection).getAllByText('지난달 대비')).toHaveLength(2)
    expect(within(serverSection).queryByText('이번 달 누적 비용 · 그래프는 호출 수')).not.toBeInTheDocument()
  })

  it('shows a measured point when only one infrastructure sample is available', async () => {
    renderPanel(createRepository({
      getInfraMetrics: vi.fn().mockResolvedValue({
        ...metrics,
        series: { ...metrics.series!, cpu: [{ t: '2026-09-01T01:00:00Z', v: 82.4 }] },
      }),
    }))

    expect(await screen.findByRole('img', { name: 'CPU 추이 · 측정값 1개' })).toBeInTheDocument()
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
    expect(await screen.findByTitle('42.75$')).toBeInTheDocument()
  })

  it('reloads only metrics for filters without showing a manual refresh button', async () => {
    const repository = createRepository()
    renderPanel(repository)
    await screen.findByTitle('42.75$')

    expect(screen.getByLabelText('환경').closest('[data-page-toolbar="filters"]')).toBeInTheDocument()
    expect(screen.getByLabelText('조회 기간').closest('[data-page-toolbar="filters"]')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('환경'), { target: { value: 'dev' } })
    fireEvent.change(screen.getByLabelText('조회 기간'), { target: { value: '6h' } })
    await waitFor(() => expect(vi.mocked(repository.getInfraMetrics).mock.calls.at(-1)?.[0]).toEqual({ env: 'dev', range: '6h' }))
    expect(repository.getInfraCost).toHaveBeenCalledTimes(1)
    expect(repository.getInfraApp).toHaveBeenCalledTimes(1)

    expect(screen.queryByRole('button', { name: '인프라 새로고침' })).not.toBeInTheDocument()
  })

  it('does not poll when time passes', async () => {
    const repository = createRepository()
    renderPanel(repository)
    await screen.findByTitle('42.75$')
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
