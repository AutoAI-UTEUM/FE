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
const quiz = (id: number) => ({ quizId: id, title: `Quiz ${id}`, quizType: 'MCQ' })
const page = (ids: number[], index = 0, totalPages = 1) => success({ items: ids.map(session), page: index, size: 20, totalElements: ids.length, totalPages })
function view() { return <MemoryRouter><LearnerReviewQuizzesPage /></MemoryRouter> }

describe('review quiz collection recovery', () => {
  it('distinguishes a successful empty result from failed quiz reads', async () => {
    auth.apiRequest.mockImplementation(async (path: string) => path.includes('?') ? page([1]) : success({ quizzes: [] }))
    render(view())
    expect(await screen.findByText('저장된 복습 퀴즈가 없습니다')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('shows all failures and retries only GET reads to recover', async () => {
    let fail = true
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (path.includes('?')) return page([1, 2])
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
    expect(auth.apiRequest.mock.calls.filter(([path]) => path.includes('?'))).toHaveLength(1)
    expect(auth.apiRequest.mock.calls.every(([, options]) => !options?.method)).toBe(true)
  })
  it('retains successful quizzes while retrying only failed sessions, and prevents repeated retry clicks', async () => {
    let release!: (value: unknown) => void
    let reads = 0
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (path.includes('?')) return page([1, 2])
      if (path.includes('/1/')) return success({ quizzes: [quiz(1)] })
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
    expect(auth.apiRequest.mock.calls.filter(([path]) => path.includes('/1/'))).toHaveLength(1)
    expect(reads).toBe(2)
  })
  it('loads later session pages, skips deleted sessions, and bounds quiz concurrency', async () => {
    let active = 0
    let peak = 0
    auth.apiRequest.mockImplementation(async (path: string) => {
      if (path.includes('page=0')) return page(Array.from({ length: 20 }, (_, i) => i + 1), 0, 2)
      if (path.includes('page=1')) return success({ ...page([21], 1, 2).data, items: [session(21), { ...session(22), status: 'DELETED' }] })
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
      if (path.includes('page=0')) return page([1], 0, 2)
      if (path.includes('page=1')) { if (fail) throw new Error('session page failed'); return page([2], 1, 2) }
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
      if (path.includes('?')) return page([auth.user.id])
      if (path.includes('/1/')) { oldSignal = options?.signal ?? undefined; return new Promise((resolve) => { release = resolve }) }
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
      return path.includes('?') ? page([1]) : success({ quizzes: [quiz(1)] })
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
      if (path.includes('?')) return page([1])
      if (attempts++ === 0) throw new Error('500')
      return new Promise((resolve) => { release = resolve })
    })
    const rendered = render(view())
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(release).toBeDefined())
    auth.apiRequest = vi.fn().mockImplementation(async (path: string) => path.includes('?') ? page([2]) : success({ quizzes: [quiz(2)] }))
    rendered.rerender(view())
    expect(await screen.findByText('Quiz 2')).toBeInTheDocument()
    await act(async () => release(success({ quizzes: [quiz(1)] })))
    expect(screen.queryByText('Quiz 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

})
