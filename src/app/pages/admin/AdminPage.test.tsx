import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResponsiveViewportProvider } from '../../../shared/responsive'
import { TestAuthProvider } from '../../../test/TestAuthProvider'
import { AdminPage } from './AdminPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AdminPage', () => {
  it('refreshes the selected AI usage range from an icon-only button', async () => {
    const requestedPaths: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      requestedPaths.push(url.pathname)
      if (url.pathname === '/api/admin/ai-usage/summary') {
        return success({ daily: [], features: [] })
      }
      if (url.pathname === '/api/admin/ai-usage/users') {
        return success({ items: [] })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <ResponsiveViewportProvider>
        <TestAuthProvider>
          <MemoryRouter initialEntries={['/?tab=ai-usage']}><AdminPage /></MemoryRouter>
        </TestAuthProvider>
      </ResponsiveViewportProvider>,
    )

    await waitFor(() => expect(countRequests(requestedPaths, '/api/admin/ai-usage/summary')).toBe(1))
    expect(screen.getByRole('region', { name: 'AI 사용량 상세' })).toBeVisible()
    expect(screen.getByRole('region', { name: '사용자별 호출 목록' })).toHaveClass('overflow-y-auto')
    expect(screen.queryByRole('button', { name: 'xAI 관리' })).not.toBeInTheDocument()

    const refreshButton = screen.getByRole('button', { name: 'AI 관리 새로고침' })
    expect(refreshButton).toHaveAttribute('title', '새로고침')
    expect(refreshButton).toHaveTextContent('')
    fireEvent.click(refreshButton)

    await waitFor(() => expect(countRequests(requestedPaths, '/api/admin/ai-usage/summary')).toBe(2))
    expect(countRequests(requestedPaths, '/api/admin/ai-usage/users')).toBe(2)
  })

  it('shows recent activity and issues a one-time temporary password', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/admin/users/7/password-reset' && init?.method === 'POST') {
        return success({ message: '로그인 후 즉시 변경하세요.', temporaryPassword: 'Temporary1234' })
      }
      if (url.pathname === '/api/admin/users/7') {
        return success({ affiliation: '테스트 학교', authProvider: 'LOCAL', consentedAt: null, createdAt: '2026-09-01T00:00:00Z', email: 'member@example.com', id: 7, name: '회원', role: 'LEARNER', status: 'ACTIVE' })
      }
      if (url.pathname === '/api/admin/users') {
        return success({ items: [{ authProvider: 'LOCAL', createdAt: '2026-09-01T00:00:00Z', email: 'member@example.com', id: 7, lastActiveAt: new Date().toISOString(), name: '회원', role: 'LEARNER', status: 'ACTIVE' }], page: 0, size: 17, totalElements: 1, totalPages: 1 })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <ResponsiveViewportProvider>
        <TestAuthProvider>
          <MemoryRouter><AdminPage /></MemoryRouter>
        </TestAuthProvider>
      </ResponsiveViewportProvider>,
    )

    expect(await screen.findByText('방금 전')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가입일 내림차순 정렬' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '회원 · ID 오름차순 정렬' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 내림차순 정렬' }))
    await waitFor(() => expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => String(input instanceof Request ? input.url : input).includes('sort=RECENT_ACTIVITY_DESC'))).toBe(true))
    expect(screen.getByRole('button', { name: '최근 활동 오름차순 정렬' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '회원 상세 정보' }))
    expect(await screen.findByRole('button', { name: '임시 비밀번호 발급' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '임시 비밀번호 발급' }))
    expect(await screen.findByText('Temporary1234')).toBeInTheDocument()
  })

  it('shows xAI credits, risk and performs a manual sync', async () => {
    const requested: Array<{ method: string; path: string }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : null
      const url = new URL(request?.url ?? String(input), 'http://localhost')
      const method = init?.method ?? request?.method ?? 'GET'
      requested.push({ method, path: url.pathname })
      if (url.pathname === '/api/admin/users') {
        return success({ items: [], page: 0, size: 17, totalElements: 0, totalPages: 0 })
      }
      if (url.pathname === '/api/admin/ai-usage/summary') {
        return success({ daily: [], features: [{ callCount: 4, feature: 'TURN', inputTokens: 10, outputTokens: 20, reasoningTokens: 30 }] })
      }
      if (url.pathname === '/api/admin/ai-usage/users') {
        return success({ items: [] })
      }
      if (url.pathname === '/api/admin/xai/overview' || (url.pathname === '/api/admin/xai/sync' && method === 'POST')) {
        return success({ available: true, averageDailyCost7d: '4.85', currentMonthCostUsd: '72.75', fetchedAt: '2026-09-20T08:00:00Z', lastSuccessfulSyncAt: '2026-09-20T08:00:00Z', postpaidLimitUsd: '300.00', postpaidRemainingUsd: '227.25', prepaidAvailableUsd: '105.00', prepaidBalanceUsd: '125.00', prepaidUsedThisPeriodUsd: '20.00', projectedDepletionAt: '2026-12-01T08:00:00Z', riskLevel: 'WARNING', stale: false, totalAvailableUsd: '332.25' })
      }
      if (url.pathname === '/api/admin/xai/credits') {
        return success({ available: true, fetchedAt: '2026-09-20T08:00:00Z', lastSuccessfulSyncAt: '2026-09-20T08:00:00Z', postpaidLimitUsd: '300.00', postpaidRemainingUsd: '227.25', postpaidUsedUsd: '72.75', prepaidBalanceUsd: '125.00', stale: false })
      }
      if (url.pathname === '/api/admin/xai/status') {
        return success({ available: true, lastFailureAt: null, lastSuccessfulSyncAt: '2026-09-20T08:00:00Z', recentErrorClassification: null })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <ResponsiveViewportProvider>
        <TestAuthProvider>
          <MemoryRouter initialEntries={['/?tab=ai-usage']}><AdminPage /></MemoryRouter>
        </TestAuthProvider>
      </ResponsiveViewportProvider>,
    )

    expect(await screen.findByText('$332.25')).toBeInTheDocument()
    expect(screen.getByText(/선불 잔액 \$105\.00/)).toBeInTheDocument()
    expect(screen.queryByText('잔액, 이번 달 비용과 소진 위험을 확인합니다.')).not.toBeInTheDocument()
    expect(screen.getByText('잔액 주의').querySelector('svg')).not.toBeInTheDocument()
    expect(await screen.findByRole('img', { name: '기능별 AI 호출 가로 막대 차트' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '후불 한도 사용률' })).toHaveAttribute('aria-valuenow', '24.25')

    fireEvent.click(screen.getByRole('button', { name: 'AI 관리 새로고침' }))
    await waitFor(() => expect(requested.filter(({ method, path }) => method === 'POST' && path === '/api/admin/xai/sync')).toHaveLength(1))
    expect(screen.queryByText('AI 사용량과 비용 정보를 최신 상태로 동기화했습니다.')).not.toBeInTheDocument()
  })
})

function countRequests(paths: string[], path: string) {
  return paths.filter((requestedPath) => requestedPath === path).length
}

function success(data: unknown) {
  return new Response(JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
