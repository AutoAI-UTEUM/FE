import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AdminRepository, InfraApp, InfraCost, InfraMetrics } from '../../../features/admin'
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
  daily: [{ date: '2026-08-31', total: 2.25 }],
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
    renderPanel()

    const serverSection = await screen.findByRole('region', { name: '서버 상태' })
    expect(within(serverSection).getByText('82.4%')).toHaveClass('text-rose-700')
    expect(within(serverSection).getByText('90.1%')).toHaveClass('text-rose-700')
    expect(within(serverSection).getByText('41.3%')).not.toHaveClass('text-rose-700')
    expect(within(serverSection).getByText('정상')).toBeInTheDocument()
    expect(await screen.findByText('$42.75')).toBeInTheDocument()
    expect(screen.getByText('50.0%')).toBeInTheDocument()
    expect(screen.getByText('3일 4시간 12분')).toBeInTheDocument()
    expect(screen.getByText('100건')).toBeInTheDocument()
  })

  it('treats disabled metrics as information while other sections still render', async () => {
    renderPanel(createRepository({
      getInfraMetrics: vi.fn().mockResolvedValue({ available: false, reason: 'DISABLED' }),
    }))

    expect(await screen.findByText('인프라 조회가 비활성화되어 있습니다.')).toBeInTheDocument()
    expect(await screen.findByText('$42.75')).toBeInTheDocument()
    expect(screen.getByText('3일 4시간 12분')).toBeInTheDocument()
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
    const repository = createRepository()
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
    expect(repository.getInfraApp).toHaveBeenCalledTimes(2)
    expect(repository.getInfraMetrics).toHaveBeenCalledTimes(metricsCalls + 1)
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
    expect(container.querySelector('path[data-series="CPU"]')?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
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
