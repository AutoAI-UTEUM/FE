import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { ExamsPage } from './ExamsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
        return success({ items: [examFixture], page: 0, size: 100, totalElements: 1, totalPages: 1 })
      }
      if (url.pathname === '/api/classrooms/13/exams') {
        return success({ items: [{ ...examFixture, classroomId: 13, examId: 31, title: '알고리즘 중간 시험' }], page: 0, size: 100, totalElements: 1, totalPages: 1 })
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
    expect(requestedPaths).toContain('/api/classrooms/12/exams')
    expect(requestedPaths).toContain('/api/classrooms/13/exams')
    expect(screen.queryByLabelText('강의실 선택')).not.toBeInTheDocument()
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

    expect(await screen.findByRole('heading', { name: '시험 만들기' })).toBeInTheDocument()
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
})

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

const examFixture = {
  allowRetake: false,
  classroomId: 12,
  createdAt: '2026-08-01T00:00:00Z',
  examId: 30,
  mySubmission: null,
  publishedAt: '2026-08-02T00:00:00Z',
  questionCount: 4,
  questions: [],
  status: 'PUBLISHED',
  title: '자료구조 확인 시험',
  totalScore: 10,
  updatedAt: '2026-08-03T00:00:00Z',
  weekNumber: 2,
}

function success(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: '요청이 성공했습니다.', success: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
