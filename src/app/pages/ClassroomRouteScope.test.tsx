import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import type { ReactElement } from 'react'

import { AuthProvider } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { ClassroomDetailPage } from './ClassroomDetailPage'
import { ClassroomWorkspaceLayout } from './classroom/ClassroomWorkspaceLayout'
import { InstructorClassroomEditPage } from './instructor/InstructorClassroomEditPage'
import { InstructorLearningStatusPage } from './instructor/InstructorLearningStatusPage'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function success(data: unknown) {
  return new Response(JSON.stringify({ success: true, message: '정상', data }), { headers: { 'Content-Type': 'application/json' } })
}
function classroom(id: number) {
  return { classroomId: id, name: `Class ${id}`, startDate: '2026-08-03', endDate: '2026-11-15', status: 'ACTIVE', weekCount: 1, learnerCount: 0, instructorName: 'Teacher', color: 'BLUE', progressRate: 0, pendingRequestCount: 0 }
}
function emptyStudentPage() {
  return { items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 }
}
function fallback(path: string) {
  if (path === '/api/classrooms') return success({ items: [classroom(12), classroom(13)] })
  if (/\/classrooms\/\d+$/.test(path)) return success(classroom(Number(path.split('/').at(-1))))
  if (path.endsWith('/invite-code')) return success({ inviteCode: 'CODE' })
  return success({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })
}
function setup(element: ReactElement, initial = '/classrooms/12', workspace = false) {
  const router = createMemoryRouter([{ path: '/classrooms/:classroomId', element: workspace ? <ClassroomWorkspaceLayout /> : element, children: workspace ? [{ index: true, element }] : undefined }], { initialEntries: [initial] })
  render(<AuthProvider initialUser={{ id: 7, email: 'teacher@example.com', name: 'Teacher', role: 'INSTRUCTOR' }}><ToastProvider><RouterProvider router={router} /></ToastProvider></AuthProvider>)
  return router
}
const pages = [
  ['workspace', <ClassroomWorkspaceLayout />],
  ['detail', <ClassroomDetailPage />],
  ['settings', <InstructorClassroomEditPage />],
  ['learning', <InstructorLearningStatusPage />],
] as const

describe('classroom route ownership', () => {
  it.each(pages)('%s immediately hides A while B is loading', async (_name, page) => {
    const pending = deferred<Response>()
    const requested: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      requested.push(path)
      if (path === '/api/classrooms/13' || path === '/api/classrooms/13/students') return pending.promise
      return fallback(path)
    })
    const router = setup(page)
    expect(await screen.findByRole('heading', { name: 'Class 12' })).toBeInTheDocument()
    await act(() => router.navigate('/classrooms/13'))
    expect(screen.queryByRole('heading', { name: 'Class 12' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument()
    await waitFor(() => expect(requested.some((path) => path.startsWith('/api/classrooms/13'))).toBe(true))
    await act(async () => pending.resolve(success(_name === 'learning' ? emptyStudentPage() : classroom(13))))
    expect(await screen.findByRole('heading', { name: 'Class 13' })).toBeInTheDocument()
  })

  it.each(pages)('%s ignores an A response that arrives after B', async (_name, page) => {
    const pending = deferred<Response>()
    const requested: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      requested.push(path)
      if (path === '/api/classrooms/12' || path === '/api/classrooms/12/students') return pending.promise
      return fallback(path)
    })
    const router = setup(page)
    await waitFor(() => expect(requested.some((path) => path.startsWith('/api/classrooms/12'))).toBe(true))
    await act(() => router.navigate('/classrooms/13'))
    expect(await screen.findByRole('heading', { name: 'Class 13' })).toBeInTheDocument()
    await act(async () => pending.resolve(success(_name === 'learning' ? emptyStudentPage() : classroom(12))))
    expect(screen.getByRole('heading', { name: 'Class 13' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Class 12' })).not.toBeInTheDocument()
  })

  it('does not use the first classroom for an unknown learning route', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => fallback(new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname))
    setup(<InstructorLearningStatusPage />, '/classrooms/999')
    expect(await screen.findByText('학습 현황을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Class 12' })).not.toBeInTheDocument()
  })

  it('does not navigate back to A or show a success toast when an A save finishes on B', async () => {
    const pending = deferred<Response>()
    let started = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      if (path === '/api/classrooms/12' && init?.method === 'PATCH') { started = true; return pending.promise }
      return fallback(path)
    })
    const router = setup(<InstructorClassroomEditPage />)
    await screen.findByRole('textbox', { name: '강의실 이름' })
    fireEvent.change(screen.getByRole('textbox', { name: '강의실 이름' }), { target: { value: 'A edited' } })
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate('/classrooms/13'))
    await screen.findByRole('heading', { name: 'Class 13' })
    await act(async () => pending.resolve(success(classroom(12))))
    expect(router.state.location.pathname).toBe('/classrooms/13')
    expect(screen.queryByText('강의실 정보를 저장했습니다.')).not.toBeInTheDocument()
  })

  it.each(pages)('%s recovers a failed load only through an explicit retry', async (_name, page) => {
    let fail = true
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      if (fail && (path === '/api/classrooms/12' || path === '/api/classrooms/12/students')) throw new Error('offline')
      return fallback(path)
    })
    setup(page)
    const retry = await screen.findByRole('button', { name: '다시 시도' })
    expect(screen.queryByRole('heading', { name: 'Class 12' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument()
    fail = false
    fireEvent.click(retry)
    expect(await screen.findByRole('heading', { name: 'Class 12' })).toBeInTheDocument()
  })

  it('keeps a failed learning refresh explicit and recovers without substituting another classroom', async () => {
    let fail = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      if (fail && path.endsWith('/students')) throw new Error('offline')
      return fallback(path)
    })
    setup(<InstructorLearningStatusPage />)
    await screen.findByRole('heading', { name: 'Class 12' })
    fail = true
    fireEvent.click(screen.getByRole('button', { name: '수강생 목록 새로고침' }))
    expect(await screen.findByText('학습 현황을 불러오지 못했습니다')).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: 'Class 12' })).toBeInTheDocument()
  })

  it('retains confirmed content with a visible retry after a failed background refresh', async () => {
    let fail = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      if (path.endsWith('/weeks')) {
        if (fail) throw new Error('offline')
        return success({ items: [{ title: 'Confirmed week', weekId: 1, weekNumber: 1, status: 'PUBLISHED', materials: [] }] })
      }
      return fallback(path)
    })
    setup(<ClassroomDetailPage />)
    await screen.findByText('Confirmed week')
    fail = true
    fireEvent.focus(window)
    expect(await screen.findByRole('button', { name: '재시도' })).toBeInTheDocument()
    expect(screen.getByText('Confirmed week')).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '재시도' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '재시도' })).not.toBeInTheDocument())
  })

  it.each(['save', 'delete', 'rejection'])('ignores a pending notice %s when the route changes', async (action) => {
    const pending = deferred<Response>()
    const notice = { noticeId: 70, title: 'A notice', content: 'A content', weekNumber: null, published: true, publishedAt: '2026-08-03T00:00:00Z' }
    let started = false
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      if (path === '/api/classrooms/12/notices/70') { started = true; return pending.promise }
      if (path === '/api/classrooms/12/notices' && (!init?.method || init.method === 'GET')) return success({ items: [notice] })
      return fallback(path)
    })
    const router = setup(<ClassroomDetailPage />, '/classrooms/12?panel=notice-edit-70')
    await screen.findByRole('textbox', { name: '공지 제목' })
    fireEvent.click(screen.getByRole('button', { name: action === 'delete' ? '삭제' : '변경사항 저장' }))
    await waitFor(() => expect(started).toBe(true))
    await act(() => router.navigate('/classrooms/13?filter=notice'))
    await screen.findByRole('heading', { name: 'Class 13' })
    await act(async () => pending.resolve(action === 'rejection'
      ? new Response(JSON.stringify({ success: false, error: { code: 'FAILED', message: 'A-only failure', details: [] } }), { status: 500 })
      : success(notice)))
    expect(router.state.location.pathname + router.state.location.search).toBe('/classrooms/13?filter=notice')
    expect(screen.queryByText('A notice')).not.toBeInTheDocument()
    expect(screen.queryByText('A-only failure')).not.toBeInTheDocument()
    expect(screen.queryByText(/공지를 (수정|삭제)했습니다/)).not.toBeInTheDocument()
  })


  it('resets the real workspace outlet and its notice draft on navigation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => fallback(new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname))
    const router = setup(<ClassroomDetailPage />, '/classrooms/12?panel=notice-new', true)
    fireEvent.change(await screen.findByRole('textbox', { name: '공지 제목' }), { target: { value: 'Unsaved A draft' } })
    await act(() => router.navigate('/classrooms/13?panel=notice-new'))
    expect(await screen.findByRole('textbox', { name: '공지 제목' })).toHaveValue('')
    expect(screen.queryByDisplayValue('Unsaved A draft')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Class 13' })).toBeInTheDocument()
  })

  it('does not let an older resource refresh failure replace a newer success', async () => {
    const pending = deferred<Response>()
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      if (path.endsWith('/weeks')) {
        calls += 1
        if (calls === 2) return pending.promise
        return success({ items: [{ title: calls === 1 ? 'Initial week' : 'Latest week', weekId: 1, weekNumber: 1, status: 'PUBLISHED', materials: [] }] })
      }
      return fallback(path)
    })
    setup(<ClassroomDetailPage />)
    await screen.findByText('Initial week')
    fireEvent.focus(window)
    await waitFor(() => expect(calls).toBe(2))
    fireEvent.focus(window)
    await screen.findByText('Latest week')
    await act(async () => pending.resolve(new Response(null, { status: 500 })))
    expect(screen.getByText('Latest week')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재시도' })).not.toBeInTheDocument()
  })


  it('finishes all submitted A settings updates after navigation without affecting B', async () => {
    const pending = deferred<Response>()
    const mutations: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://localhost').pathname
      if (init?.method === 'PATCH') {
        mutations.push(path)
        if (path === '/api/classrooms/12') return pending.promise
        return success({ title: 'Edited A week', weekNumber: 1, materials: [] })
      }
      if (path === '/api/classrooms/12/weeks') return success({ items: [{ title: 'Original A week', weekId: 1, weekNumber: 1, status: 'PUBLISHED', materials: [] }] })
      return fallback(path)
    })
    const router = setup(<InstructorClassroomEditPage />)
    fireEvent.change(await screen.findByRole('textbox', { name: '강의실 이름' }), { target: { value: 'Edited A' } })
    fireEvent.change(screen.getByRole('textbox', { name: '1주차 이름' }), { target: { value: 'Edited A week' } })
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }))
    await waitFor(() => expect(mutations).toEqual(['/api/classrooms/12']))
    await act(() => router.navigate('/classrooms/13'))
    await screen.findByRole('heading', { name: 'Class 13' })
    await act(async () => pending.resolve(success(classroom(12))))
    expect(mutations).toEqual(['/api/classrooms/12', '/api/classrooms/12/weeks/1'])
    expect(router.state.location.pathname).toBe('/classrooms/13')
    expect(screen.queryByText('강의실 정보를 저장했습니다.')).not.toBeInTheDocument()
  })

})
