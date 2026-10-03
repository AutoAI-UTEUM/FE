import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../../../features/auth'
import { LearnerReviewQuizzesPage } from './LearnerReviewQuizzesPage'

const auth = vi.hoisted(() => ({ user: { id: 1, role: 'LEARNER' }, apiRequest: vi.fn() }))
vi.mock('../../../features/auth', () => ({ useAuth: () => auth }))
afterEach(cleanup)
beforeEach(() => { auth.user = { id: 1, role: 'LEARNER' }; auth.apiRequest = vi.fn() })
const success = <T,>(data: T) => ({ data, message: '', success: true as const })
const session = (id: number) => ({ sessionId: id, materialId: id, currentPage: 1, status: 'ACTIVE' })
const quiz = (id: number | string, createdAt?: string) => ({ createdAt, quizId: id, title: `Quiz ${id}`, quizType: 'MCQ' })
const page = (ids: number[], index = 0, totalPages = 1) => success({ items: ids.map(session), page: index, size: 20, totalElements: ids.length, totalPages })
const historyPage = (ids: Array<number | string>, index: number, totalElements: number) => success({
  hasNext: index + 1 < Math.ceil(totalElements / 100),
  page: index,
  quizzes: ids.map((id) => quiz(id, '2026-10-03T00:00:00Z')),
  size: 100,
  totalElements,
  totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / 100),
})
const apiUrl = (path: string) => new URL(path, 'https://example.test')
const isSessionListPath = (path: string) => apiUrl(path).pathname === '/api/sessions'
function view() { return <MemoryRouter><LearnerReviewQuizzesPage /></MemoryRouter> }

describe('review quiz collection recovery', () => {
  it('distinguishes a successful empty result from failed quiz reads', async () => {
    auth.apiRequest.mockImplementation(async (path: string) => isSessionListPath(path) ? page([1]) : success({ quizzes: [] }))
    render(view())
    expect(await screen.findByText('저장된 복습 퀴즈가 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('shows all failures and retries only GET reads to recover', async () => {
    let fail = true
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (isSessionListPath(path)) return page([1, 2])
      if (fail) throw new Error('500')
      return success({ quizzes: [quiz(Number(path.split('/')[3]))] })
    })
    render(view())
    expect(await screen.findByRole('alert')).toHaveTextContent('복습 퀴즈를 불러오지 못했습니다')
    expect(screen.queryByText('저장된 복습 퀴즈가 없습니다')).not.toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('Quiz 1')).toBeInTheDocument()
    expect(screen.getByText('Quiz 2')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(auth.apiRequest.mock.calls.filter(([path]) => isSessionListPath(path))).toHaveLength(1)
    expect(auth.apiRequest.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  })
  it('retains successful quizzes while retrying only failed sessions, and prevents repeated retry clicks', async () => {
    let release!: (value: unknown) => void
    let reads = 0
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (isSessionListPath(path)) return page([1, 2])
      if (apiUrl(path).pathname === '/api/sessions/1/quizzes') return success({ quizzes: [quiz(1)] })
      if (reads++ === 0) throw new Error('500')
      return new Promise((resolve) => { release = resolve })
    })
    render(view())
    expect(await screen.findByRole('alert')).toHaveTextContent('일부 복습 퀴즈')
    expect(screen.getByText('Quiz 1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오는 중' }))
    expect(screen.getByText('Quiz 1')).toBeInTheDocument()
    await act(async () => release(success({ quizzes: [quiz(2)] })))
    expect(await screen.findByText('Quiz 2')).toBeInTheDocument()
    expect(auth.apiRequest.mock.calls.filter(([path]) => apiUrl(path).pathname === '/api/sessions/1/quizzes')).toHaveLength(1)
    expect(reads).toBe(2)
  })
  it('discards a failed later page, preserves peer sessions, and retries from page zero', async () => {
    let sessionTwoStarts = 0
    auth.apiRequest.mockImplementation(async (path: string) => {
      const url = apiUrl(path)
      if (isSessionListPath(path)) return page([1, 2])
      if (url.pathname === '/api/sessions/1/quizzes') return success({ quizzes: [quiz(1)] })
      if (url.pathname !== '/api/sessions/2/quizzes') throw new Error(`unexpected path: ${path}`)
      const historyIndex = Number(url.searchParams.get('page') ?? 0)
      if (historyIndex === 0) {
        sessionTwoStarts += 1
        return historyPage([300], 0, 201)
      }
      if (historyIndex === 1) return historyPage([200], 1, 201)
      if (sessionTwoStarts === 1) throw new Error('page 2 failed')
      return historyPage([100], 2, 201)
    })

    render(view())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Quiz 1')).toBeInTheDocument()
    expect(screen.queryByText('Quiz 300')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('Quiz 100')).toBeInTheDocument()
    expect(screen.getByText('Quiz 300')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(sessionTwoStarts).toBe(2)
    expect(auth.apiRequest.mock.calls.filter(([path]) => apiUrl(path).pathname === '/api/sessions/1/quizzes')).toHaveLength(1)
  })
  it('orders equal timestamps by arbitrarily large quiz ids without numeric precision loss', async () => {
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (isSessionListPath(path)) return page([1])
      return success({ quizzes: [
        quiz('2', '2026-10-03T00:00:00Z'),
        quiz('9007199254740992', '2026-10-03T00:00:00Z'),
        quiz('10', '2026-10-03T00:00:00Z'),
        quiz('9007199254740993', '2026-10-03T00:00:00Z'),
      ] })
    })

    render(view())
    await screen.findByText('Quiz 9007199254740993')
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringContaining('Quiz 9007199254740993'),
      expect.stringContaining('Quiz 9007199254740992'),
      expect.stringContaining('Quiz 10'),
      expect.stringContaining('Quiz 2'),
    ])
  })
  it('loads later session pages, skips deleted sessions, and bounds quiz concurrency', async () => {
    let active = 0
    let peak = 0
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (isSessionListPath(path) && apiUrl(path).searchParams.get('page') === '0') return page(Array.from({ length: 20 }, (_, i) => i + 1), 0, 2)
      if (isSessionListPath(path) && apiUrl(path).searchParams.get('page') === '1') return success({ ...page([21], 1, 2).data, items: [session(21), { ...session(22), status: 'DELETED' }] })
      active++; peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      return success({ quizzes: path.includes('/21/') ? [quiz(21)] : [] })
    })
    render(view())
    expect(await screen.findByText('Quiz 21')).toBeInTheDocument()
    expect(peak).toBeLessThanOrEqual(4)
    expect(auth.apiRequest.mock.calls.some(([path]) => path.includes('/22/'))).toBe(false)
  })
  it('does not show false empty when session pagination fails and retries the list', async () => {
    let fail = true
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (isSessionListPath(path) && apiUrl(path).searchParams.get('page') === '0') return page([1], 0, 2)
      if (isSessionListPath(path) && apiUrl(path).searchParams.get('page') === '1') { if (fail) throw new Error('session page failed'); return page([2], 1, 2) }
      return success({ quizzes: [quiz(2)] })
    })
    render(view())
    expect(await screen.findByText('복습 퀴즈를 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText('저장된 복습 퀴즈가 없습니다')).not.toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect((await screen.findAllByText('Quiz 2')).length).toBeGreaterThan(0)
  })
  it('isolates account changes and aborts the old request, even if its late response ignores abort', async () => {
    let release!: (value: unknown) => void
    let oldSignal: AbortSignal | undefined
    auth.apiRequest.mockImplementation(async (path: string, options: Parameters<AuthenticatedRequest>[1]) => {
      if (isSessionListPath(path)) return page([auth.user.id])
      if (apiUrl(path).pathname === '/api/sessions/1/quizzes') { oldSignal = options?.signal ?? undefined; return new Promise((resolve) => { release = resolve }) }
      return success({ quizzes: [quiz(2)] })
    })
    const rendered = render(view())
    await waitFor(() => expect(release).toBeDefined())
    auth.user = { id: 2, role: 'LEARNER' }
    rendered.rerender(view())
    expect(await screen.findByText('Quiz 2')).toBeInTheDocument()
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => release(success({ quizzes: [quiz(1)] })))
    expect(screen.queryByText('Quiz 1')).not.toBeInTheDocument()
  })
  it('clears previously loaded items immediately on account changes', async () => {
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (auth.user.id === 2) return new Promise(() => {})
      return isSessionListPath(path) ? page([1]) : success({ quizzes: [quiz(1)] })
    })
    const rendered = render(view())
    expect(await screen.findByText('Quiz 1')).toBeInTheDocument()
    auth.user = { id: 2, role: 'LEARNER' }
    rendered.rerender(view())
    expect(screen.queryByText('Quiz 1')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
  it('ignores old retry responses when the request scope changes', async () => {
    let release!: (value: unknown) => void
    let attempts = 0
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (isSessionListPath(path)) return page([1])
      if (attempts++ === 0) throw new Error('500')
      return new Promise((resolve) => { release = resolve })
    })
    const rendered = render(view())
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(release).toBeDefined())
    auth.apiRequest = vi.fn().mockImplementation(async (path: string) => isSessionListPath(path) ? page([2]) : success({ quizzes: [quiz(2)] }))
    rendered.rerender(view())
    expect(await screen.findByText('Quiz 2')).toBeInTheDocument()
    await act(async () => release(success({ quizzes: [quiz(1)] })))
    expect(screen.queryByText('Quiz 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

})
