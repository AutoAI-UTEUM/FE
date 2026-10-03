import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
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

interface ScheduleFixture {
  endsAt: string
  hasTime: boolean
  kind: 'NOTICE_PUBLISH' | 'PERSONAL'
  scheduleId: string
  startsAt: string
  title: string
}

function schedule(overrides: Partial<ScheduleFixture> = {}): ScheduleFixture {
  const startsAt = new Date().toISOString()
  return {
    endsAt: startsAt,
    hasTime: true,
    kind: 'PERSONAL',
    scheduleId: '1',
    startsAt,
    title: '확인할 일정',
    ...overrides,
  }
}

type ListResponse = ApiSuccess<{ items: ReturnType<typeof schedule>[] }>

function page() {
  return <MemoryRouter><ToastProvider><InstructorCalendarPage /></ToastProvider></MemoryRouter>
}

function routedPage() {
  return (
    <MemoryRouter initialEntries={['/calendar']}>
      <ToastProvider>
        <Link to="/other">다른 페이지로 이동</Link>
        <Routes>
          <Route element={<InstructorCalendarPage />} path="/calendar" />
          <Route element={<h1>다른 페이지</h1>} path="/other" />
        </Routes>
      </ToastProvider>
    </MemoryRouter>
  )
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

describe('InstructorCalendarPage mutation safety', () => {
  it('unlocks a failed create for retry after StrictMode effect replay', async () => {
    let createAttempts = 0
    auth.apiRequest.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method !== 'POST') return Promise.resolve(success({ items: [] }))
      createAttempts += 1
      return createAttempts === 1
        ? Promise.reject(new Error('StrictMode 합성 실패'))
        : Promise.resolve(success(schedule({ title: 'StrictMode 재시도 일정' })))
    })
    render(<StrictMode>{page()}</StrictMode>)
    await screen.findByText('등록된 일정이 없습니다.')
    fireEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    fireEvent.change(screen.getByRole('textbox', { name: '일정 이름' }), { target: { value: 'StrictMode 재시도 일정' } })
    fireEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(await screen.findByText('StrictMode 합성 실패')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '추가' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '추가' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 추가' })).not.toBeInTheDocument())
    expect(createAttempts).toBe(2)
  })

  it('locks create in the same tick, blocks pending close, preserves input after failure, and retries once', async () => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => ([{}] as unknown as DOMRectList),
    )
    const firstCreate = deferred<ApiSuccess<ScheduleFixture>>()
    const retryCreate = deferred<ApiSuccess<ScheduleFixture>>()
    auth.apiRequest
      .mockResolvedValueOnce(success({ items: [] }))
      .mockReturnValueOnce(firstCreate.promise)
      .mockReturnValueOnce(retryCreate.promise)
    render(page())
    await screen.findByText('등록된 일정이 없습니다.')
    const opener = screen.getByRole('button', { name: '일정 추가' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: '일정 추가' })
    const titleInput = within(dialog).getByRole('textbox', { name: '일정 이름' })
    fireEvent.change(titleInput, { target: { value: '재시도할 일정' } })

    const form = dialog.querySelector('form')!
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })

    expect(auth.apiRequest).toHaveBeenCalledTimes(2)
    expect(within(dialog).getByRole('button', { name: '저장 중' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '일정 추가 닫기' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeDisabled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.mouseDown(dialog)
    expect(screen.getByRole('dialog', { name: '일정 추가' })).toBeInTheDocument()

    await act(async () => firstCreate.reject(new Error('합성 생성 실패')))
    expect(await screen.findByText('합성 생성 실패')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '일정 이름' })).toHaveValue('재시도할 일정')
    expect(screen.getByRole('button', { name: '추가' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '추가' }))
    expect(auth.apiRequest).toHaveBeenCalledTimes(3)
    await act(async () => retryCreate.resolve(success(schedule({ title: '재시도할 일정' }))))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 추가' })).not.toBeInTheDocument())
    expect(screen.getByText('일정을 추가했습니다.')).toBeInTheDocument()
  })

  it('locks delete in the same tick, blocks pending actions, keeps details on failure, and retries', async () => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => ([{}] as unknown as DOMRectList),
    )
    const firstDelete = deferred<ApiSuccess<null>>()
    const retryDelete = deferred<ApiSuccess<null>>()
    auth.apiRequest
      .mockResolvedValueOnce(success({ items: [schedule({ title: '삭제 재시도 일정' })] }))
      .mockReturnValueOnce(firstDelete.promise)
      .mockReturnValueOnce(retryDelete.promise)
    render(page())
    const opener = (await screen.findAllByRole('button', { name: /삭제 재시도 일정,/ }))[0]
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: '삭제 재시도 일정' })
    const deleteButton = within(dialog).getByRole('button', { name: '일정 삭제' })

    act(() => {
      fireEvent.click(deleteButton)
      fireEvent.click(deleteButton)
    })

    expect(auth.apiRequest).toHaveBeenCalledTimes(2)
    expect(within(dialog).getByRole('button', { name: '삭제 중' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '일정 상세 닫기' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: '일정 수정' })).toBeDisabled()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.mouseDown(dialog)
    expect(screen.getByRole('dialog', { name: '삭제 재시도 일정' })).toBeInTheDocument()

    await act(async () => firstDelete.reject(new Error('합성 삭제 실패')))
    expect(await screen.findByText('합성 삭제 실패')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '삭제 재시도 일정' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '일정 삭제' }))
    expect(auth.apiRequest).toHaveBeenCalledTimes(3)
    await act(async () => retryDelete.resolve(success(null)))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '삭제 재시도 일정' })).not.toBeInTheDocument())
    expect(screen.getByText('일정을 삭제했습니다.')).toBeInTheDocument()
  })

  it.each(['success', 'failure'])('ignores a route-left create %s without leaking a toast', async (outcome) => {
    const pending = deferred<ApiSuccess<ScheduleFixture>>()
    auth.apiRequest
      .mockResolvedValueOnce(success({ items: [] }))
      .mockReturnValueOnce(pending.promise)
    render(routedPage())
    await screen.findByText('등록된 일정이 없습니다.')
    fireEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    fireEvent.change(screen.getByRole('textbox', { name: '일정 이름' }), { target: { value: '떠난 일정' } })
    fireEvent.click(screen.getByRole('button', { name: '추가' }))
    fireEvent.click(screen.getByRole('link', { name: '다른 페이지로 이동' }))
    expect(await screen.findByRole('heading', { name: '다른 페이지' })).toBeInTheDocument()

    await act(async () => {
      if (outcome === 'success') pending.resolve(success(schedule({ title: '떠난 일정' })))
      else pending.reject(new Error('떠난 요청 실패'))
    })
    expect(screen.queryByText('일정을 추가했습니다.')).not.toBeInTheDocument()
    expect(screen.queryByText('떠난 요청 실패')).not.toBeInTheDocument()
  })
})

describe('InstructorCalendarPage dialog accessibility and schedule validation', () => {
  it('traps focus in both dialogs, closes on Escape, and restores each opener', async () => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
      () => ([{}] as unknown as DOMRectList),
    )
    auth.apiRequest.mockResolvedValue(success({ items: [schedule({ title: '포커스 일정' })] }))
    render(page())
    const addOpener = await screen.findByRole('button', { name: '일정 추가' })
    addOpener.focus()
    fireEvent.click(addOpener)
    const composer = screen.getByRole('dialog', { name: '일정 추가' })
    const titleInput = within(composer).getByRole('textbox', { name: '일정 이름' })
    const composerClose = within(composer).getByRole('button', { name: '일정 추가 닫기' })
    const cancel = within(composer).getByRole('button', { name: '취소' })
    expect(titleInput).toHaveFocus()
    composerClose.focus()
    fireEvent.keyDown(composerClose, { key: 'Tab', shiftKey: true })
    expect(cancel).toHaveFocus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(composerClose).toHaveFocus()
    fireEvent.keyDown(composer, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 추가' })).not.toBeInTheDocument())
    expect(addOpener).toHaveFocus()

    const detailOpener = screen.getAllByRole('button', { name: /포커스 일정,/ })[0]
    detailOpener.focus()
    fireEvent.click(detailOpener)
    const detail = screen.getByRole('dialog', { name: '포커스 일정' })
    const detailClose = within(detail).getByRole('button', { name: '일정 상세 닫기' })
    const detailDelete = within(detail).getByRole('button', { name: '일정 삭제' })
    expect(detailClose).toHaveFocus()
    fireEvent.keyDown(detailClose, { key: 'Tab', shiftKey: true })
    expect(detailDelete).toHaveFocus()
    fireEvent.keyDown(detailDelete, { key: 'Tab' })
    expect(detailClose).toHaveFocus()
    fireEvent.keyDown(detail, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '포커스 일정' })).not.toBeInTheDocument())
    expect(detailOpener).toHaveFocus()
  })

  it('validates deleted and reversed duration dates, submits an all-day range, and displays it', async () => {
    const created = schedule({
      endsAt: new Date('2026-10-13T23:59:59').toISOString(),
      hasTime: false,
      scheduleId: 'all-day',
      startsAt: new Date('2026-10-12T00:00:00').toISOString(),
      title: '종일 기간 일정',
    })
    auth.apiRequest
      .mockResolvedValueOnce(success({ items: [] }))
      .mockResolvedValueOnce(success(created))
    render(page())
    await screen.findByText('등록된 일정이 없습니다.')
    fireEvent.click(screen.getByRole('button', { name: '일정 추가' }))
    const dialog = screen.getByRole('dialog', { name: '일정 추가' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: '일정 이름' }), { target: { value: '종일 기간 일정' } })
    fireEvent.click(within(dialog).getByRole('switch', { name: '기간' }))
    fireEvent.click(within(dialog).getByRole('switch', { name: '시간' }))
    const start = within(dialog).getByLabelText('시작')
    const end = within(dialog).getByLabelText('종료일')
    fireEvent.change(start, { target: { value: '2026-10-12' } })
    fireEvent.change(end, { target: { value: '2026-10-10' } })
    expect(screen.getByText('종료 시각은 시작 시각보다 빠를 수 없습니다.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '추가' })).toBeDisabled()

    fireEvent.change(end, { target: { value: '' } })
    expect(screen.getByText('종료 날짜를 입력해 주세요.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '추가' })).toBeDisabled()
    fireEvent.change(end, { target: { value: '2026-10-13' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '추가' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 추가' })).not.toBeInTheDocument())

    const createCall = auth.apiRequest.mock.calls[1]
    expect(createCall[0]).toBe('/api/users/me/schedule')
    expect(createCall[1]).toMatchObject({
      body: {
        endsAt: new Date('2026-10-13T23:59:59').toISOString(),
        hasTime: false,
        startsAt: new Date('2026-10-12T00:00:00').toISOString(),
        title: '종일 기간 일정',
      },
      method: 'POST',
    })
    const eventButton = screen.getAllByRole('button', { name: /종일 기간 일정,/ })[0]
    fireEvent.click(eventButton)
    const details = screen.getByRole('dialog', { name: '종일 기간 일정' })
    expect(details).toHaveTextContent('종일')
    expect(details).toHaveTextContent('2026. 10. 12.')
    expect(details).toHaveTextContent('2026. 10. 13.')
  })

  it('keeps valid date values when editing and saving an existing all-day range', async () => {
    const existing = schedule({
      endsAt: new Date('2026-10-13T23:59:59').toISOString(),
      hasTime: false,
      scheduleId: 'all-day-edit',
      startsAt: new Date('2026-10-12T00:00:00').toISOString(),
      title: '편집할 종일 일정',
    })
    auth.apiRequest
      .mockResolvedValueOnce(success({ items: [existing] }))
      .mockResolvedValueOnce(success({ ...existing, title: '수정된 종일 일정' }))
    render(page())
    fireEvent.click((await screen.findAllByRole('button', { name: /편집할 종일 일정,/ }))[0])
    fireEvent.click(screen.getByRole('button', { name: '일정 수정' }))
    const editor = screen.getByRole('dialog', { name: '일정 수정' })
    expect(within(editor).getByLabelText('시작')).toHaveValue('2026-10-12')
    expect(within(editor).getByLabelText('종료일')).toHaveValue('2026-10-13')
    fireEvent.change(within(editor).getByRole('textbox', { name: '일정 이름' }), { target: { value: '수정된 종일 일정' } })
    fireEvent.click(within(editor).getByRole('button', { name: '변경 저장' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '일정 수정' })).not.toBeInTheDocument())
    expect(auth.apiRequest.mock.calls[1]).toEqual([
      '/api/users/me/schedule/all-day-edit',
      expect.objectContaining({
        body: {
          endsAt: new Date('2026-10-13T23:59:59').toISOString(),
          hasTime: false,
          startsAt: new Date('2026-10-12T00:00:00').toISOString(),
          title: '수정된 종일 일정',
        },
        method: 'PATCH',
      }),
    ])
  })

  it('displays a single timed event once instead of repeating the same timestamp as a range', async () => {
    const startsAt = new Date('2026-10-14T09:30:00').toISOString()
    auth.apiRequest.mockResolvedValue(success({ items: [schedule({
      endsAt: startsAt,
      hasTime: true,
      scheduleId: 'single-timed',
      startsAt,
      title: '단일 시간 일정',
    })] }))
    render(page())
    fireEvent.click((await screen.findAllByRole('button', { name: /단일 시간 일정,/ }))[0])
    const details = screen.getByRole('dialog', { name: '단일 시간 일정' })
    const timeLabel = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(startsAt))
    expect(details).toHaveTextContent(timeLabel)
    expect(details).not.toHaveTextContent(`${timeLabel} - ${timeLabel}`)
  })

  it('allows only personal event mutation controls and preserves NOTICE permissions', async () => {
    auth.apiRequest.mockResolvedValue(success({ items: [
      schedule({ scheduleId: 'personal', title: '개인 일정' }),
      schedule({ kind: 'NOTICE_PUBLISH', scheduleId: 'notice', title: '공지 일정' }),
    ] }))
    render(page())
    const noticeButton = (await screen.findAllByRole('button', { name: /공지 일정,/ }))[0]
    fireEvent.click(noticeButton)
    expect(screen.getByRole('dialog', { name: '공지 일정' })).toHaveTextContent('강의실 일정은 주차 또는 공지에서 관리합니다.')
    expect(screen.queryByRole('button', { name: '일정 수정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '일정 삭제' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '일정 상세 닫기' }))

    fireEvent.click(screen.getAllByRole('button', { name: /개인 일정,/ })[0])
    expect(screen.getByRole('button', { name: '일정 수정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '일정 삭제' })).toBeInTheDocument()
  })
})
