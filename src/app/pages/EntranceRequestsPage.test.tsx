import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TestAuthProvider } from '../../test/TestAuthProvider'
import { apiSuccess, installApiFixtureServer } from '../../test/apiFixtureServer'
import { EntranceRequestsPage } from './EntranceRequestsPage'

beforeEach(() => {
  installApiFixtureServer()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function paged<T>(items: T[]) {
  return { items, page: 0, size: 100, totalElements: items.length, totalPages: 1 }
}

function renderPage() {
  return render(
    <TestAuthProvider>
      <MemoryRouter initialEntries={['/entrance-requests']}>
        <EntranceRequestsPage />
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

describe('EntranceRequestsPage', () => {
  it('lists requests from every classroom and processes selected requests together', async () => {
    const processedPaths: string[] = []
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess(paged([
          {
            classroomId: 11,
            color: 'BLUE',
            endDate: '2026-11-15',
            instructorName: '강의자',
            name: '자료구조',
            startDate: '2026-08-03',
            status: 'ACTIVE',
            weekCount: 15,
          },
          {
            classroomId: 12,
            color: 'GREEN',
            endDate: '2026-11-15',
            instructorName: '강의자',
            name: '운영체제',
            startDate: '2026-08-03',
            status: 'ACTIVE',
            weekCount: 15,
          },
        ]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/11/join-requests') {
        return apiSuccess(paged([{
          classroomId: 11,
          learner: { email: 'kim@example.com', name: '김학습', userId: 101 },
          requestedAt: '2026-08-14T09:00:00Z',
          requestId: 201,
          status: 'PENDING',
        }]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/12/join-requests') {
        return apiSuccess(paged([{
          classroomId: 12,
          learner: { email: 'lee@example.com', name: '이학습', userId: 102 },
          requestedAt: '2026-08-14T10:00:00Z',
          requestId: 202,
          status: 'PENDING',
        }]))
      }
      if (request.method === 'POST' && url.pathname.endsWith('/approve')) {
        processedPaths.push(url.pathname)
        return apiSuccess(null)
      }
      return undefined
    })

    renderPage()

    expect(await screen.findByText('자료구조')).toBeInTheDocument()
    expect(screen.getByText('운영체제')).toBeInTheDocument()
    expect(screen.getByText('김학습')).toBeInTheDocument()
    expect(screen.getByText('이학습')).toBeInTheDocument()
    expect(screen.queryByLabelText('강의실 선택')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('전체 요청 선택'))
    fireEvent.click(screen.getByRole('button', { name: '선택 승인' }))

    await waitFor(() => expect(processedPaths).toEqual([
      '/api/classrooms/12/join-requests/202/approve',
      '/api/classrooms/11/join-requests/201/approve',
    ]))
  })
})
