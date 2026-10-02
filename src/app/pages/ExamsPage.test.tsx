import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { ExamsPage } from './ExamsPage'
import { instructorExamListItem, learnerExamListItem } from '../../test/examListFixtures'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('ExamsPage creation entry', () => {
  it('shows learner exams from every joined classroom on the global exams route', async () => {
    const requestedPaths: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      requestedPaths.push(url.pathname)
      if (url.pathname === '/api/classrooms') {
        return success({ items: [classroomFixture, secondClassroomFixture], page: 0, size: 100, totalElements: 2, totalPages: 1 })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        return success({ items: [learnerExamListItem], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      }
      if (url.pathname === '/api/classrooms/13/exams') {
        return success({ items: [{ ...learnerExamListItem, examId: 31, latestSubmission: null, title: '알고리즘 중간 시험' }], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/exams']}>
        <AuthProvider initialUser={{ email: 'learner@example.com', id: 8, name: '학습자', role: 'LEARNER' }}>
          <ToastProvider>
            <Routes>
              <Route element={<ExamsPage />} path="/exams" />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('자료구조 확인 시험')).toBeInTheDocument()
    expect(screen.getByText('알고리즘 중간 시험')).toBeInTheDocument()
    expect(screen.getByText(/자료구조 · 2주차/)).toBeInTheDocument()
    expect(screen.getByText(/알고리즘 · 2주차/)).toBeInTheDocument()
    expect(screen.getByText('응시 완료')).toBeInTheDocument()
    expect(screen.getByText('10 / 200점')).toBeInTheDocument()
    expect(screen.queryByText('5점')).not.toBeInTheDocument()
    expect(screen.queryByText(/0문항/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /자료구조 확인 시험/ })).toHaveAttribute('href', '/classrooms/12/exams/30')
    expect(screen.getByRole('link', { name: /알고리즘 중간 시험/ })).toHaveAttribute('href', '/classrooms/13/exams/31')
    expect(requestedPaths.filter((path) => path.startsWith('/api/exams/'))).toEqual([])
    expect(requestedPaths).toContain('/api/classrooms/12/exams')
    expect(requestedPaths).toContain('/api/classrooms/13/exams')
    expect(screen.queryByLabelText('강의실 선택')).not.toBeInTheDocument()
    expect(screen.queryByText('내 강의실 전체')).not.toBeInTheDocument()
    const statusSelect = screen.getByRole('combobox', { name: '시험 상태 필터' })
    expect(statusSelect).toHaveValue('')
    expect(statusSelect.closest('[data-page-toolbar="filters"]')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '시험 상태 필터' })).not.toBeInTheDocument()
  })

  it.each([
    ['zero raw score', { ...learnerExamListItem.latestSubmission, score: 0, normalizedScore: 0 }, '0 / 200점', '응시 완료'],
    ['normalized-only score', { ...learnerExamListItem.latestSubmission, score: null, maxScore: null }, '5%', '응시 완료'],
    ['missing graded score', { ...learnerExamListItem.latestSubmission, score: null, maxScore: null, normalizedScore: null }, '점수 확인 필요', '응시 완료'],
    ['latest submitted attempt', { attemptNo: 3, submissionId: 302, status: 'SUBMITTED', score: null, maxScore: null, normalizedScore: null }, null, '제출 완료'],
    ['latest failed attempt', { attemptNo: 3, submissionId: 302, status: 'GRADING_FAILED', score: null, maxScore: null, normalizedScore: null }, null, '채점 확인 필요'],
    ['no submission', null, null, null],
  ])('renders %s without inventing points or older results', async (_case, latestSubmission, scoreLabel, statusLabel) => {
    mockExamLists([{ ...learnerExamListItem, latestSubmission }])
    renderExamList('/classrooms/12/exams', 'LEARNER')

    const card = await screen.findByRole('link', { name: /자료구조 확인 시험/ })
    if (scoreLabel) expect(within(card).getByText(scoreLabel)).toBeInTheDocument()
    expect(card).toHaveAttribute('href', '/classrooms/12/exams/30')
    expect(card).not.toHaveTextContent('0문항')
    expect(within(card).queryByText('0점')).not.toBeInTheDocument()
    if (statusLabel) expect(within(card).getByText(statusLabel)).toBeInTheDocument()
    if (latestSubmission?.status !== 'GRADED') {
      expect(within(card).queryByText('응시 완료')).not.toBeInTheDocument()
      expect(within(card).queryByText(/%|\d+ \/ \d+점/)).not.toBeInTheDocument()
    }
  })

  it.each([
    [0, 0, '2주차 · 0문항 · 0점'],
    [4, 20, '2주차 · 4문항 · 20점'],
    [undefined, undefined, '2주차'],
    [null, null, '2주차'],
  ])('only displays known count and total (%s, %s)', async (questionCount, totalScore, metadata) => {
    mockExamLists([{ ...learnerExamListItem, questionCount, totalScore, latestSubmission: null }])
    renderExamList('/classrooms/12/exams', 'LEARNER')

    const card = await screen.findByRole('link', { name: /자료구조 확인 시험/ })
    expect(within(card).getByText(metadata)).toBeInTheDocument()
    if (totalScore == null) expect(card).not.toHaveTextContent(/점/)
    if (questionCount == null) expect(card).not.toHaveTextContent(/문항/)
  })

  it('renders the instructor list contract without fabricated questions', async () => {
    mockExamLists([instructorExamListItem])
    renderExamList('/classrooms/12/exams', 'INSTRUCTOR')

    const card = await screen.findByRole('link', { name: /알고리즘 중간 시험/ })
    expect(card).toHaveAttribute('href', '/classrooms/12/exams/31')
    expect(card).toHaveTextContent('20점')
    expect(card).not.toHaveTextContent('0문항')
  })

  it('opens the composer with the requested classroom week', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms') {
        return success({ items: [classroomFixture], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12/exams?create=1&weekNumber=3']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes>
              <Route element={<ExamsPage />} path="/classrooms/:classroomId/exams" />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    const composerTitle = await screen.findByRole('heading', { name: '시험 만들기' })
    expect(composerTitle).toBeInTheDocument()
    expect(composerTitle.closest('form')).toHaveClass('max-h-[calc(100dvh-3rem)]', 'overflow-y-auto', 'overscroll-contain', '[scrollbar-gutter:stable]')
    expect(screen.getByLabelText('강의실 선택')).toHaveValue('12')
    expect(screen.getByLabelText('주차 (선택)')).toHaveValue(3)
  })

  it('reloads exams when the instructor selects another classroom', async () => {
    const requestedPaths: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      requestedPaths.push(url.pathname)
      if (url.pathname === '/api/classrooms') {
        return success({ items: [classroomFixture, secondClassroomFixture], page: 0, size: 100, totalElements: 2, totalPages: 1 })
      }
      if (url.pathname === '/api/classrooms/12/exams' || url.pathname === '/api/classrooms/13/exams') {
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      return new Response(null, { status: 404 })
    })

    render(
      <MemoryRouter initialEntries={['/classrooms/12/exams']}>
        <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
          <ToastProvider>
            <Routes>
              <Route element={<ExamsPage />} path="/classrooms/:classroomId/exams" />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    )

    const classroomSelect = await screen.findByLabelText('강의실 선택')
    fireEvent.change(classroomSelect, { target: { value: '13' } })

    await waitFor(() => expect(requestedPaths).toContain('/api/classrooms/13/exams'))
    expect(screen.getByLabelText('강의실 선택')).toHaveValue('13')
  })

  it('reloads when an instructor selects the active status filter again', async () => {
    const requestedStatuses: Array<string | null> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms') {
        return success({ items: [classroomFixture], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        requestedStatuses.push(url.searchParams.get('status'))
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      return new Response(null, { status: 404 })
    })
    renderExamList('/classrooms/12/exams', 'INSTRUCTOR')

    const draftFilter = await screen.findByRole('button', { name: '초안' })
    fireEvent.click(draftFilter)
    await waitFor(() => expect(requestedStatuses).toEqual([null, 'DRAFT']))
    await waitFor(() => expect(screen.queryByText('시험을 불러오는 중입니다.')).not.toBeInTheDocument())

    fireEvent.click(draftFilter)

    await waitFor(() => expect(requestedStatuses).toEqual([null, 'DRAFT', 'DRAFT']))
    expect(screen.queryByText('시험을 불러오는 중입니다.')).not.toBeInTheDocument()
  })

  it('offers an explicit retry after an exam list error', async () => {
    let examRequests = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms') {
        return success({ items: [classroomFixture], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        examRequests += 1
        if (examRequests === 1) {
          return new Response(JSON.stringify({
            error: { code: 'SERVER_ERROR', message: '시험 목록 오류' },
            success: false,
          }), { headers: { 'Content-Type': 'application/json' }, status: 500 })
        }
        return success({ items: [instructorExamListItem], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      }
      return new Response(null, { status: 404 })
    })
    renderExamList('/classrooms/12/exams', 'INSTRUCTOR')

    expect(await screen.findByRole('heading', { name: '시험을 불러오지 못했습니다' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('알고리즘 중간 시험')).toBeInTheDocument()
    expect(examRequests).toBe(2)
  })

  it('ignores a late response from a previously selected filter', async () => {
    const draftResponse = deferred<Response>()
    const publishedResponse = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
      if (url.pathname === '/api/classrooms') {
        return success({ items: [classroomFixture], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      }
      if (url.pathname === '/api/classrooms/12/exams') {
        if (url.searchParams.get('status') === 'DRAFT') return draftResponse.promise
        if (url.searchParams.get('status') === 'PUBLISHED') return publishedResponse.promise
        return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
      }
      return new Response(null, { status: 404 })
    })
    renderExamList('/classrooms/12/exams', 'INSTRUCTOR')

    const draftFilter = await screen.findByRole('button', { name: '초안' })
    fireEvent.click(draftFilter)
    await waitFor(() => expect(draftFilter).toHaveAttribute('aria-pressed', 'true'))
    fireEvent.click(screen.getByRole('button', { name: '공개' }))

    publishedResponse.resolve(success({
      items: [{ ...instructorExamListItem, examId: 41, status: 'PUBLISHED', title: '게시된 시험' }],
      page: 0,
      size: 100,
      totalElements: 1,
      totalPages: 1,
    }))
    expect(await screen.findByText('게시된 시험')).toBeInTheDocument()

    draftResponse.resolve(success({
      items: [{ ...instructorExamListItem, examId: 42, status: 'DRAFT', title: '늦게 도착한 초안' }],
      page: 0,
      size: 100,
      totalElements: 1,
      totalPages: 1,
    }))
    await waitFor(() => expect(screen.getByText('게시된 시험')).toBeInTheDocument())
    expect(screen.queryByText('늦게 도착한 초안')).not.toBeInTheDocument()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

const classroomFixture = {
  classroomId: 12,
  color: 'BLUE',
  description: '자료구조 강의실',
  endDate: '2026-11-15',
  instructorName: '박교수',
  inviteCode: '7QK4-MZ2A',
  learnerCount: 42,
  name: '자료구조',
  pendingRequestCount: 0,
  progressRate: 38,
  startDate: '2026-08-03',
  status: 'ACTIVE',
  weekCount: 15,
}

const secondClassroomFixture = {
  ...classroomFixture,
  classroomId: 13,
  name: '알고리즘',
}

function success(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

function mockExamLists(items: unknown[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
    if (url.pathname === '/api/classrooms') return success({ items: [classroomFixture], page: 0, size: 100, totalElements: 1, totalPages: 1 })
    if (url.pathname === '/api/classrooms/12/exams') return success({ items, page: 0, size: 100, totalElements: items.length, totalPages: 1 })
    return new Response(null, { status: 404 })
  })
}

function renderExamList(path: string, role: 'LEARNER' | 'INSTRUCTOR') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialUser={{ email: 'user@example.com', id: 8, name: '사용자', role }}>
        <ToastProvider>
          <Routes><Route element={<ExamsPage />} path="/classrooms/:classroomId/exams" /></Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}
