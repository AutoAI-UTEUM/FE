import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

const activeClassroom = {
  classroomId: 11,
  color: 'BLUE',
  endDate: '2026-11-15',
  instructorName: '김강사',
  name: '자료구조',
  startDate: '2026-08-03',
  status: 'ACTIVE',
  weekCount: 15,
}

function joinRequest(requestId: number, name: string, classroomId = 11) {
  return {
    classroomId,
    learner: { email: `${name}@example.com`, name, userId: requestId + 100 },
    requestedAt: `2026-08-14T${requestId % 24}:00:00Z`,
    requestId,
    status: 'PENDING',
  }
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

  it('reloads and clears loading when the selected tab is clicked again', async () => {
    let requestListCount = 0
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess(paged([activeClassroom]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/11/join-requests') {
        requestListCount += 1
        return apiSuccess(paged([joinRequest(201, '김학습')]))
      }
      return undefined
    })
    renderPage()
    await screen.findByText('김학습')

    fireEvent.click(screen.getAllByRole('tab')[0])

    await waitFor(() => expect(requestListCount).toBe(2))
    await waitFor(() => expect(screen.queryByText('입장 정보를 불러오는 중입니다.')).not.toBeInTheDocument())
  })

  it('locks a request against batch processing while its individual action is pending', async () => {
    const response = deferred<Response>()
    let processCount = 0
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess(paged([activeClassroom]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/11/join-requests') {
        return apiSuccess(paged([joinRequest(201, '김학습')]))
      }
      if (request.method === 'POST' && url.pathname.endsWith('/approve')) {
        processCount += 1
        return response.promise
      }
      return undefined
    })
    renderPage()
    const requestCheckbox = await screen.findByRole('checkbox', { name: '김학습 요청 선택' })
    fireEvent.click(requestCheckbox)
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(processCount).toBe(1))

    const batchButton = screen.getByRole('button', { name: '선택 승인' })
    expect(batchButton).toBeDisabled()
    fireEvent.click(batchButton)
    expect(processCount).toBe(1)

    await act(async () => response.resolve(apiSuccess(null)))
  })

  it('reports batch successes, failures, and skips separately and keeps failures selected', async () => {
    const completedClassroom = { ...activeClassroom, classroomId: 13, name: '종료 강의', status: 'COMPLETED' }
    const secondClassroom = { ...activeClassroom, classroomId: 12, name: '운영체제' }
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess(paged([activeClassroom, secondClassroom, completedClassroom]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/11/join-requests') {
        return apiSuccess(paged([joinRequest(201, '성공학생')]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/12/join-requests') {
        return apiSuccess(paged([joinRequest(202, '실패학생', 12)]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/13/join-requests') {
        return apiSuccess(paged([joinRequest(203, '건너뜀학생', 13)]))
      }
      if (request.method === 'POST' && url.pathname.includes('/202/approve')) {
        return new Response(JSON.stringify({ message: 'failed' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        })
      }
      if (request.method === 'POST' && url.pathname.endsWith('/approve')) return apiSuccess(null)
      return undefined
    })
    renderPage()
    await screen.findByText('성공학생')
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 요청 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 승인' }))

    expect(await screen.findByText('1건을 승인했습니다.')).toBeInTheDocument()
    expect(screen.getByText('1건을 처리하지 못했습니다. 실패한 요청을 선택한 상태로 유지했습니다.')).toBeInTheDocument()
    expect(screen.getByText('1건을 건너뛰었습니다.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '실패학생 요청 선택' })).toBeChecked())
    expect(screen.getByRole('checkbox', { name: '성공학생 요청 선택' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: '건너뜀학생 요청 선택' })).not.toBeChecked()
  })

  it('prunes a retained failed selection when it is no longer pending after reload', async () => {
    let processed = false
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess(paged([activeClassroom]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/11/join-requests') {
        return apiSuccess(paged(processed
          ? [joinRequest(203, '미선택학생')]
          : [joinRequest(201, '성공학생'), joinRequest(202, '실패학생'), joinRequest(203, '미선택학생')]))
      }
      if (request.method === 'POST' && url.pathname.includes('/202/approve')) {
        processed = true
        return new Response(JSON.stringify({ message: 'failed' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        })
      }
      if (request.method === 'POST' && url.pathname.includes('/201/approve')) return apiSuccess(null)
      return undefined
    })
    renderPage()
    fireEvent.click(await screen.findByRole('checkbox', { name: '성공학생 요청 선택' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '실패학생 요청 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 승인' }))

    await screen.findByText('미선택학생')
    await waitFor(() => expect(screen.getByRole('button', { name: '선택 승인' })).toBeDisabled())
    expect(screen.getByRole('checkbox', { name: '미선택학생 요청 선택' })).not.toBeChecked()
  })

  it('shows keyboard focus and disables selection while the request is processing', async () => {
    const response = deferred<Response>()
    installApiFixtureServer((request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/api/classrooms') {
        return apiSuccess(paged([activeClassroom]))
      }
      if (request.method === 'GET' && url.pathname === '/api/classrooms/11/join-requests') {
        return apiSuccess(paged([joinRequest(201, '김학습')]))
      }
      if (request.method === 'POST' && url.pathname.endsWith('/approve')) return response.promise
      return undefined
    })
    renderPage()
    const checkbox = await screen.findByRole('checkbox', { name: '김학습 요청 선택' })
    checkbox.focus()
    expect(checkbox).toHaveFocus()
    expect(checkbox.nextElementSibling).toHaveClass('peer-focus-visible:ring-2')
    checkbox.click()
    expect(checkbox).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(checkbox).toBeDisabled())
    checkbox.click()
    expect(checkbox).toBeChecked()

    await act(async () => response.resolve(apiSuccess(null)))
  })
})
