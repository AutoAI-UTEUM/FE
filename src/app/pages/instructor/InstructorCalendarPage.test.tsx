import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthUser } from '../../../features/auth'
import type { ApiSuccess } from '../../../shared/api'
import { ToastProvider } from '../../../shared/ui'
import { InstructorCalendarPage } from './InstructorCalendarPage'

const auth = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  user: { email: 'instructor@example.com', id: 1, name: '강의자', role: 'INSTRUCTOR' } as AuthUser,
}))

vi.mock('../../../features/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../features/auth')>(),
  useAuth: () => auth,
}))

beforeEach(() => {
  auth.apiRequest = vi.fn()
  auth.user = { email: 'instructor@example.com', id: 1, name: '강의자', role: 'INSTRUCTOR' }
})

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function success<T>(data: T): ApiSuccess<T> {
  return { data, message: 'ok', success: true }
}

function schedule() {
  const startsAt = new Date().toISOString()
  return { endsAt: startsAt, hasTime: true, kind: 'PERSONAL', scheduleId: '1', startsAt, title: '확인할 일정' }
}

type ListResponse = ApiSuccess<{ items: ReturnType<typeof schedule>[] }>

function page() {
  return <MemoryRouter><ToastProvider><InstructorCalendarPage /></ToastProvider></MemoryRouter>
}

function expectNoEmptyMessage() {
  expect(screen.queryByText('등록된 일정이 없습니다.')).not.toBeInTheDocument()
  expect(screen.queryByText('예정된 일정이 없습니다')).not.toBeInTheDocument()
}

describe('InstructorCalendarPage request states', () => {
  it('announces loading instead of an empty calendar, then shows loaded events', async () => {
    const pending = deferred<ListResponse>()
    auth.apiRequest.mockReturnValue(pending.promise)
    render(page())
    expect(within(screen.getByRole('region', { name: '캘린더 본문' })).getByRole('status')).toHaveTextContent('일정을 불러오는 중입니다.')
    expectNoEmptyMessage()
    expect(screen.queryByRole('region', { name: '월간 캘린더' })).not.toBeInTheDocument()

    await act(async () => pending.resolve(success({ items: [schedule()] })))
    expect(within(screen.getByRole('region', { name: '캘린더 본문' })).queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '월간 캘린더' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /확인할 일정,/ }).length).toBeGreaterThan(0)
  })

  it('shows an accessible failure and retries without claiming the calendar is empty', async () => {
    const retry = deferred<ListResponse>()
    auth.apiRequest.mockRejectedValueOnce(new Error('서버에 연결할 수 없습니다.')).mockReturnValueOnce(retry.promise)
    render(page())
    fireEvent.change(screen.getByRole('combobox', { name: '캘린더 보기' }), { target: { value: 'list' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('일정을 불러오지 못했습니다')
    expect(screen.getByRole('alert')).toHaveTextContent('서버에 연결할 수 없습니다.')
    expectNoEmptyMessage()

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(within(screen.getByRole('region', { name: '캘린더 본문' })).getByRole('status')).toHaveTextContent('일정을 불러오는 중입니다.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expectNoEmptyMessage()
    await act(async () => retry.resolve(success({ items: [] })))
    expect(within(screen.getByRole('region', { name: '캘린더 본문' })).queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('등록된 일정이 없습니다.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '예정된 일정이 없습니다' })).toBeInTheDocument()
    expect(auth.apiRequest).toHaveBeenCalledTimes(2)
  })

  it('retains existing events and marks them as stale when a same-owner refresh fails', async () => {
    auth.apiRequest.mockResolvedValueOnce(success({ items: [schedule()] }))
    const { rerender } = render(page())
    await screen.findAllByRole('button', { name: /확인할 일정,/ })
    const pending = deferred<ListResponse>()
    auth.apiRequest = vi.fn().mockReturnValue(pending.promise)
    rerender(page())
    expect(within(screen.getByRole('region', { name: '캘린더 본문' })).getByRole('status')).toHaveTextContent('기존 일정을 표시하고 있습니다.')
    expect(screen.getAllByRole('button', { name: /확인할 일정,/ }).length).toBeGreaterThan(0)
    await act(async () => pending.reject(new Error('일시적인 연결 오류')))
    expect(screen.getByRole('alert')).toHaveTextContent('마지막으로 불러온 일정을 표시하고 있습니다.')
    expect(screen.getAllByRole('button', { name: /확인할 일정,/ }).length).toBeGreaterThan(0)
    expectNoEmptyMessage()
  })

  it('clears private events and open details as soon as the session owner changes', async () => {
    auth.apiRequest.mockResolvedValueOnce(success({ items: [schedule()] }))
    const { rerender } = render(page())
    const buttons = await screen.findAllByRole('button', { name: /확인할 일정,/ })
    fireEvent.click(buttons[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const pending = deferred<ListResponse>()
    auth.apiRequest.mockReturnValue(pending.promise)
    auth.user = { ...auth.user, email: 'next@example.com', id: 2 }
    rerender(page())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('확인할 일정')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '캘린더 본문' })).getByRole('status')).toHaveTextContent('일정을 불러오는 중입니다.')
    expectNoEmptyMessage()
    await act(async () => pending.resolve(success({ items: [] })))
    await waitFor(() => expect(screen.getByText('등록된 일정이 없습니다.')).toBeInTheDocument())
  })

  it.each(['success', 'failure'])('does not show an old-owner mutation %s in the next owner’s toast', async (outcome) => {
    const pending = deferred<ApiSuccess<ReturnType<typeof schedule>>>()
    auth.apiRequest
      .mockResolvedValueOnce(success({ items: [] }))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(success({ items: [] }))
    const { rerender } = render(page())
    await screen.findByText('등록된 일정이 없습니다.')
    fireEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    fireEvent.change(screen.getByLabelText('일정 이름'), { target: { value: '비공개 일정' } })
    fireEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(auth.apiRequest).toHaveBeenCalledTimes(2)

    auth.user = { ...auth.user, email: 'next@example.com', id: 2 }
    rerender(page())
    await screen.findByText('등록된 일정이 없습니다.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => {
      if (outcome === 'success') pending.resolve(success(schedule()))
      else pending.reject(new Error('이전 사용자의 비공개 오류'))
    })
    expect(screen.queryByText('이전 사용자의 비공개 오류')).not.toBeInTheDocument()
    expect(screen.queryByText('일정을 추가했습니다.')).not.toBeInTheDocument()
    expect(screen.queryByText('확인할 일정')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('keeps the genuine empty state after a successful initial response', async () => {
    auth.apiRequest.mockResolvedValueOnce(success({ items: [] }))
    render(page())
    await screen.findByText('등록된 일정이 없습니다.')
    fireEvent.change(screen.getByRole('combobox', { name: '캘린더 보기' }), { target: { value: 'list' } })
    expect(screen.getByRole('heading', { name: '예정된 일정이 없습니다' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '캘린더 본문' })).queryByRole('status')).not.toBeInTheDocument()
  })
})
