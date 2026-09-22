import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('sorts every member column in both directions across fetched pages', async () => {
    const members = [
      { id: 2, name: '나', email: 'z@example.com', role: 'LEARNER', status: 'DELETED', lastActiveAt: '2026-09-20T00:00:00Z' },
      { id: 1, name: '가', email: 'a@example.com', role: 'INSTRUCTOR', status: 'ACTIVE', lastActiveAt: '2026-09-21T00:00:00Z' },
    ].map((member) => ({ ...member, authProvider: 'LOCAL', createdAt: '2026-09-01T00:00:00Z' }))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname !== '/api/admin/users') return new Response(null, { status: 404 })
      const page = Number(url.searchParams.get('page'))
      return success({ items: [members[page]], page, size: 100, totalElements: 2, totalPages: 2 })
    })
    render(<ResponsiveViewportProvider><TestAuthProvider><MemoryRouter><AdminPage /></MemoryRouter></TestAuthProvider></ResponsiveViewportProvider>)
    const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(screen.queryByRole('combobox', { name: '정렬' })).not.toBeInTheDocument()
    for (const label of ['회원 · ID', '이메일', '역할', '최근 활동', '상태']) {
      const first = screen.getByRole('button', { name: new RegExp(`^${label} .* 정렬$`) })
      fireEvent.click(first)
      await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(`^${label} .* 정렬$`) })).toHaveAttribute('aria-pressed', 'true'))
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} .* 정렬$`) }))
      await waitFor(() => expect(screen.getByRole('button', { name: new RegExp(`^${label} .* 정렬$`) })).toHaveAttribute('aria-pressed', 'true'))
    }
    fireEvent.click(screen.getByRole('button', { name: '이메일 오름차순 정렬' }))
    await waitFor(() => expect(rows()[0]).toHaveTextContent('a@example.com'))
    fireEvent.click(screen.getByRole('button', { name: '이메일 내림차순 정렬' }))
    await waitFor(() => expect(rows()[0]).toHaveTextContent('z@example.com'))
  })

  it('sorts classroom owner, created date, size and status in both directions', async () => {
    const classrooms = [
      { id: 2, name: '나 강의', instructor: { id: 2, name: '나 선생' }, memberCount: 9, status: 'DELETED', createdAt: '2026-09-20T00:00:00Z' },
      { id: 1, name: '가 강의', instructor: { id: 1, name: '가 선생' }, memberCount: 2, status: 'ACTIVE', createdAt: '2026-09-21T00:00:00Z' },
    ]
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname !== '/api/admin/classrooms') return new Response(null, { status: 404 })
      const page = Number(url.searchParams.get('page'))
      return success({ items: [classrooms[page]], page, size: 100, totalElements: 2, totalPages: 2 })
    })
    render(<ResponsiveViewportProvider><TestAuthProvider><MemoryRouter initialEntries={['/?tab=classrooms']}><AdminPage /></MemoryRouter></TestAuthProvider></ResponsiveViewportProvider>)
    const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
    await waitFor(() => expect(rows()).toHaveLength(2))
    for (const label of ['강의실 · ID', '개설자', '생성일', '수강 인원', '상태']) {
      const button = () => screen.getByRole('button', { name: new RegExp(`^${label} .* 정렬$`) })
      fireEvent.click(button())
      await waitFor(() => expect(button()).toHaveAttribute('aria-pressed', 'true'))
      fireEvent.click(button())
      await waitFor(() => expect(button()).toHaveAttribute('aria-pressed', 'true'))
    }
    fireEvent.click(screen.getByRole('button', { name: '수강 인원 오름차순 정렬' }))
    await waitFor(() => expect(rows()[0]).toHaveTextContent('2명'))
    fireEvent.click(screen.getByRole('button', { name: '수강 인원 내림차순 정렬' }))
    await waitFor(() => expect(rows()[0]).toHaveTextContent('9명'))
  })
  it('shows week-over-week change for every member metric without changing totals during search', async () => {
    const now = new Date()
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()
    const members = [
      { id: 1, role: 'INSTRUCTOR', createdAt: daysAgo(30), lastActiveAt: daysAgo(20) },
      { id: 2, role: 'LEARNER', createdAt: daysAgo(30), lastActiveAt: daysAgo(20) },
      { id: 3, role: 'INSTRUCTOR', createdAt: daysAgo(2), lastActiveAt: daysAgo(1) },
      { id: 4, role: 'LEARNER', createdAt: daysAgo(2), lastActiveAt: daysAgo(1) },
    ].map((member) => ({ ...member, authProvider: 'LOCAL', email: `member${member.id}@example.com`, name: `회원${member.id}`, status: 'ACTIVE' }))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname !== '/api/admin/users') return new Response(null, { status: 404 })
      return success({ items: url.searchParams.has('q') ? [members[0]] : members, page: 0, size: 100, totalElements: url.searchParams.has('q') ? 1 : 4, totalPages: 1 })
    })

    render(<ResponsiveViewportProvider><TestAuthProvider><MemoryRouter><AdminPage /></MemoryRouter></TestAuthProvider></ResponsiveViewportProvider>)

    expect(await screen.findByText('+2')).toBeInTheDocument()
    expect(screen.getAllByText('+1')).toHaveLength(2)
    expect(screen.getByText('+50%p')).toBeInTheDocument()
    expect(screen.getByText('주간 활성', { selector: 'p' }).parentElement?.querySelector('.type-metric-compact')).toHaveTextContent('%')
    expect(screen.getByText('+50%p').previousElementSibling?.querySelector('svg path')).toHaveAttribute('d', 'M8 13V3m-4 4 4-4 4 4')
    expect(screen.getByText('+50%p').closest('[title]')).toHaveAttribute('title', expect.stringContaining('참고값'))
    expect(screen.getAllByText('지난주 대비')).toHaveLength(4)
    fireEvent.change(screen.getByPlaceholderText('이름 또는 이메일 검색'), { target: { value: '회원1' } })
    fireEvent.submit(screen.getByPlaceholderText('이름 또는 이메일 검색').closest('form')!)
    await waitFor(() => expect(screen.getByText('1–1 / 1')).toBeInTheDocument())
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

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
    expect(screen.getByText('주간 활성', { selector: 'p' }).parentElement).toHaveTextContent('100%')
    expect(await screen.findByRole('img', { name: '최근 7일 누적 전체 회원 수' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '최근 7일 누적 강의자 수' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '최근 7일 누적 학습자 수' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '최근 7일 마지막 활동일별 회원 수' })).toBeInTheDocument()
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
        return success({ available: true, averageDailyCost7d: '4.85', currentMonthCostUsd: '72.75', fetchedAt: '2026-09-20T08:00:00Z', lastSuccessfulSyncAt: '2026-09-20T08:00:00Z', postpaidLimitUsd: '300.00', postpaidRemainingUsd: '227.25', prepaidBalanceUsd: '125.00', projectedDepletionAt: '2026-12-01T08:00:00Z', riskLevel: 'WARNING', stale: false, totalAvailableUsd: '352.25' })
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

    expect(await screen.findByText('$352.25')).toBeInTheDocument()
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
