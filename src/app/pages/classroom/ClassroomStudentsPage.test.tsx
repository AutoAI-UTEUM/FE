import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '../../../features/auth'
import { ToastProvider } from '../../../shared/ui'
import { ClassroomStudentsPage } from './ClassroomStudentsPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ClassroomStudentsPage', () => {
  it('renders API students and filters inactive learners', async () => {
    stubApi()
    renderPage()

    expect(await screen.findByRole('heading', { name: '자료구조' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '학습현황' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '리포트' })).toHaveAttribute('href', '/classrooms/12/reports')
    expect(screen.getByText('김학습')).toBeInTheDocument()
    expect(screen.getByText('박미활동')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '수강생 정렬' })).toHaveValue('RECENT_ACTIVITY')
    fireEvent.change(screen.getByRole('combobox', { name: '수강생 정렬' }), { target: { value: 'NAME' } })
    expect(screen.getByRole('combobox', { name: '수강생 정렬' })).toHaveValue('NAME')

    fireEvent.click(screen.getByRole('button', { name: '7일 이상 미활동 1' }))
    expect(screen.queryByText('김학습')).not.toBeInTheDocument()
    expect(screen.getByText('박미활동')).toBeInTheDocument()
  })

  it('removes a student after confirmation', async () => {
    const removed: string[] = []
    stubApi(removed)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    fireEvent.click(await screen.findByLabelText('김학습 관리 메뉴'))
    fireEvent.click(screen.getAllByRole('button', { name: '강의실에서 제외' })[0])

    await waitFor(() => expect(removed).toEqual(['9']))
    expect(screen.queryByText('김학습')).not.toBeInTheDocument()
  })

  it('uses server-side name search and low-progress sorting', async () => {
    const requested: string[] = []
    stubApi([], requested)
    renderPage()
    await screen.findByText('김학습')

    fireEvent.change(screen.getByPlaceholderText('이름 검색'), { target: { value: '김' } })
    fireEvent.change(screen.getByRole('combobox', { name: '수강생 정렬' }), { target: { value: 'LOW_PROGRESS' } })

    await waitFor(() => expect(requested.some((url) => url.includes('q=%EA%B9%80') && url.includes('sort=LOW_PROGRESS'))).toBe(true))
  })
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/classrooms/12/students']}>
      <AuthProvider initialUser={{ email: 'instructor@example.com', id: 7, name: '강의자', role: 'INSTRUCTOR' }}>
        <ToastProvider><Routes><Route element={<ClassroomStudentsPage />} path="/classrooms/:classroomId/students" /></Routes></ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function stubApi(removed: string[] = [], requested: string[] = []) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost')
    requested.push(url.toString())
    const method = input instanceof Request ? input.method : (init?.method ?? 'GET')
    if (url.pathname === '/api/classrooms/12') return success(classroomFixture)
    if (url.pathname === '/api/classrooms/12/notices') return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
    if (url.pathname === '/api/classrooms/12/students' && method === 'GET') return success({
      items: [
        { affiliation: '서울대학교', aiQuestionCountLast7Days: 4, averageProgressRate: 62, email: 'learner@example.com', joinedAt: '2026-08-02T01:00:00Z', lastActiveAt: new Date().toISOString(), name: '김학습', status: 'ACTIVE', studentId: 9 },
        { affiliation: 'KAIST', aiQuestionCountLast7Days: 0, averageProgressRate: 12, email: 'inactive@example.com', joinedAt: '2026-07-10T01:00:00Z', lastActiveAt: '2026-07-20T08:00:00Z', name: '박미활동', status: 'ACTIVE', studentId: 10 },
      ],
      page: 0,
      size: 100,
      totalElements: 2,
      totalPages: 1,
    })
    if (url.pathname.startsWith('/api/classrooms/12/students/') && method === 'DELETE') {
      removed.push(url.pathname.split('/').at(-1) ?? '')
      return success(null)
    }
    return new Response(null, { status: 404 })
  })
}

const classroomFixture = {
  classroomId: 12,
  color: 'BLUE',
  description: '자료구조 강의실',
  endDate: '2026-11-15',
  instructorName: '박교수',
  inviteCode: '7QK4-MZ2A',
  learnerCount: 2,
  name: '자료구조',
  pendingRequestCount: 1,
  progressRate: 38,
  startDate: '2026-08-03',
  status: 'ACTIVE',
  weekCount: 15,
}

function success(data: unknown): Response {
  return new Response(JSON.stringify({ data, message: 'ok', success: true }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
}
