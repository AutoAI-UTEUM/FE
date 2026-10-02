import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { JOIN_REQUESTS_CHANGED_EVENT, type Classroom, type JoinRequest } from '../../features/classrooms'
import { ToastProvider } from '../../shared/ui'
import { EntranceRequestsPage } from './EntranceRequestsPage'

const mocks = vi.hoisted(() => {
  const apiA = vi.fn()
  return {
    apiA,
    auth: { apiRequest: apiA, user: { id: 1 } },
    repoA: {
      list: vi.fn(),
      listJoinRequests: vi.fn(),
      listStudents: vi.fn(),
      processJoinRequest: vi.fn(),
      removeStudent: vi.fn(),
    },
    repoB: {
      list: vi.fn(),
      listJoinRequests: vi.fn(),
      listStudents: vi.fn(),
      processJoinRequest: vi.fn(),
      removeStudent: vi.fn(),
    },
  }
})

vi.mock('../../features/auth', () => ({ useAuth: () => mocks.auth }))
vi.mock('../../features/classrooms', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../features/classrooms')>(),
  createClassroomsRepository: () => mocks.auth.user.id === 1 ? mocks.repoA : mocks.repoB,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function classroom(id: string, name: string): Classroom {
  return {
    color: 'BLUE',
    endDate: '2026-11-15',
    id,
    instructorName: '김강사',
    learnerCount: 0,
    name,
    pendingRequestCount: 1,
    progressRate: 0,
    startDate: '2026-08-03',
    status: 'ACTIVE',
    weekCount: 15,
  }
}

function request(id: string, classroomId: string, name: string): JoinRequest {
  return {
    classroomId,
    classroomName: name,
    learner: { email: `${id}@example.com`, id, name },
    requestedAt: '2026-08-14T09:00:00Z',
    requestId: id,
    status: 'PENDING',
  }
}

function Page({ entry = '/entrance-requests' }: { entry?: string }) {
  return <ToastProvider><MemoryRouter initialEntries={[entry]}><EntranceRequestsPage /></MemoryRouter></ToastProvider>
}

beforeEach(() => {
  mocks.auth.apiRequest = mocks.apiA
  mocks.auth.user = { id: 1 }
  mocks.repoA.list.mockReset().mockResolvedValue([classroom('a', 'A 강의실')])
  mocks.repoA.listJoinRequests.mockReset().mockResolvedValue([request('101', 'a', 'A 학생')])
  mocks.repoA.listStudents.mockReset().mockResolvedValue([])
  mocks.repoA.processJoinRequest.mockReset().mockResolvedValue(undefined)
  mocks.repoA.removeStudent.mockReset().mockResolvedValue(undefined)
  mocks.repoB.list.mockReset().mockResolvedValue([classroom('b', 'B 강의실')])
  mocks.repoB.listJoinRequests.mockReset().mockResolvedValue([request('202', 'b', 'B 학생')])
  mocks.repoB.listStudents.mockReset().mockResolvedValue([])
  mocks.repoB.processJoinRequest.mockReset().mockResolvedValue(undefined)
  mocks.repoB.removeStudent.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('EntranceRequestsPage account scope', () => {
  it('does not load the new account with old classroom ids or publish a late old-account completion', async () => {
    const oldProcess = deferred<void>()
    mocks.repoA.processJoinRequest.mockReturnValueOnce(oldProcess.promise)
    const changed = vi.fn()
    window.addEventListener(JOIN_REQUESTS_CHANGED_EVENT, changed)
    const view = render(<Page />)
    await screen.findByText('A 학생')
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(mocks.repoA.processJoinRequest).toHaveBeenCalledOnce())

    mocks.auth.user = { id: 2 }
    view.rerender(<Page />)
    await screen.findByText('B 학생')
    expect(mocks.repoB.listJoinRequests).toHaveBeenCalledWith('b', 'PENDING', expect.any(AbortSignal))
    expect(mocks.repoB.listJoinRequests).not.toHaveBeenCalledWith('a', expect.anything(), expect.anything())

    await act(async () => oldProcess.resolve())
    expect(changed).not.toHaveBeenCalled()
    expect(screen.getByText('B 학생')).toBeInTheDocument()
    window.removeEventListener(JOIN_REQUESTS_CHANGED_EVENT, changed)
  })

  it('ignores an old-account list response even when the repository ignores abort', async () => {
    const oldRequests = deferred<JoinRequest[]>()
    mocks.repoA.listJoinRequests.mockReturnValueOnce(oldRequests.promise)
    const view = render(<Page />)
    await waitFor(() => expect(mocks.repoA.listJoinRequests).toHaveBeenCalledOnce())

    mocks.auth.user = { id: 2 }
    view.rerender(<Page />)
    await screen.findByText('B 학생')

    await act(async () => oldRequests.resolve([request('101', 'a', 'A 학생')]))
    expect(screen.queryByText('A 학생')).not.toBeInTheDocument()
    expect(screen.getByText('B 학생')).toBeInTheDocument()
  })

  it('does not publish a request completion after leaving the route', async () => {
    const oldProcess = deferred<void>()
    mocks.repoA.processJoinRequest.mockReturnValueOnce(oldProcess.promise)
    const changed = vi.fn()
    window.addEventListener(JOIN_REQUESTS_CHANGED_EVENT, changed)
    const view = render(<Page />)
    await screen.findByText('A 학생')
    fireEvent.click(screen.getByRole('button', { name: '승인' }))
    await waitFor(() => expect(mocks.repoA.processJoinRequest).toHaveBeenCalledOnce())

    view.unmount()
    await act(async () => oldProcess.resolve())

    expect(changed).not.toHaveBeenCalled()
    window.removeEventListener(JOIN_REQUESTS_CHANGED_EVENT, changed)
  })

  it('ignores a late student removal after the account changes', async () => {
    const oldRemoval = deferred<void>()
    mocks.repoA.listStudents.mockResolvedValueOnce([student('9', 'A 학생')])
    mocks.repoB.listStudents.mockResolvedValueOnce([student('10', 'B 학생')])
    mocks.repoA.removeStudent.mockReturnValueOnce(oldRemoval.promise)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const view = render(<Page entry="/entrance-requests?tab=students" />)
    await screen.findByText('A 학생')
    fireEvent.click(screen.getByRole('button', { name: '제외' }))
    await waitFor(() => expect(mocks.repoA.removeStudent).toHaveBeenCalledOnce())

    mocks.auth.user = { id: 2 }
    view.rerender(<Page entry="/entrance-requests?tab=students" />)
    await screen.findByText('B 학생')
    await act(async () => oldRemoval.resolve())

    expect(screen.getByText('B 학생')).toBeInTheDocument()
    expect(screen.queryByText('학습자를 강의실에서 제외했습니다.')).not.toBeInTheDocument()
  })
})

function student(id: string, name: string) {
  return {
    aiQuestionCountLast7Days: 0,
    email: `${id}@example.com`,
    id,
    joinedAt: '2026-08-14T09:00:00Z',
    name,
    status: 'ACTIVE',
  }
}
