import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ResetPasswordPage } from './AuthCapabilityPages'
import { ForgotPasswordPage } from './ForgotPasswordPage'

const repository = vi.hoisted(() => ({
  confirmPasswordReset: vi.fn(),
  requestPasswordReset: vi.fn(),
}))
vi.mock('../../features/auth', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../features/auth')>(),
  getAuthRepository: () => repository,
}))

beforeEach(() => {
  vi.stubEnv('VITE_API_CAPABILITIES', 'password-reset')
  repository.confirmPasswordReset.mockResolvedValue('새 비밀번호로 로그인해 주세요.')
  repository.requestPasswordReset.mockResolvedValue('등록된 이메일이면 재설정 안내를 발송했습니다.')
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

function renderPage(entry = '/reset-password?token=original-token', strict = false, state?: unknown) {
  const url = new URL(entry, 'http://localhost')
  const router = createMemoryRouter([
    { path: '/reset-password', element: <ResetPasswordPage /> },
    { path: '/forgot-password', element: <ForgotPasswordPage /> },
    { path: '/previous', element: <p>이전 화면</p> },
    { path: '/login', element: <p>로그인 화면</p> },
  ], { initialEntries: ['/previous', { pathname: url.pathname, search: url.search, hash: url.hash, state }], initialIndex: 1 })
  const view = render(strict ? <StrictMode><RouterProvider router={router} /></StrictMode> : <RouterProvider router={router} />)
  return { ...view, router }
}

function fillPasswords(value = 'new-password-1') {
  fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value } })
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value } })
}

function submitForm(buttonName: string) {
  fireEvent.submit(screen.getByRole('button', { name: buttonName }).closest('form')!)
}

describe('reset token and request lifecycle', () => {
  it('replaces the token URL while preserving unrelated query values, hash and router state', async () => {
    const { router } = renderPage('/reset-password?source=mail&token=a%2Bb%2Fc&source=mobile#password', false, { from: 'mail' })
    await waitFor(() => expect(router.state.location.search).toBe('?source=mail&source=mobile'))
    expect(router.state.location.pathname).toBe('/reset-password')
    expect(router.state.location.hash).toBe('#password')
    expect(router.state.location.state).toEqual({ from: 'mail' })
    expect(repository.confirmPasswordReset).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)

    fillPasswords()
    submitForm('비밀번호 변경')
    await screen.findByRole('heading', { name: '비밀번호 변경 완료' })
    expect(repository.confirmPasswordReset).toHaveBeenCalledWith('a+b/c', 'new-password-1', expect.any(AbortSignal))
    await act(() => router.navigate(-1))
    expect(screen.getByText('이전 화면')).toBeInTheDocument()
  })

  it('retains the captured token under StrictMode effect replay', async () => {
    const { router } = renderPage('/reset-password?token=strict-token', true)
    await waitFor(() => expect(router.state.location.search).toBe(''))
    fillPasswords()
    submitForm('비밀번호 변경')
    await screen.findByRole('heading', { name: '비밀번호 변경 완료' })
    expect(repository.confirmPasswordReset).toHaveBeenCalledExactlyOnceWith('strict-token', 'new-password-1', expect.any(AbortSignal))
  })

  it.each(['token=', 'token=%20%20', 'token=&token=other-token'])('scrubs unusable token parameters without submitting: %s', async (query) => {
    const { router } = renderPage(`/reset-password?${query}&source=mail#help`)
    await waitFor(() => expect(router.state.location.search).toBe('?source=mail'))
    expect(router.state.location.hash).toBe('#help')
    expect(screen.getByRole('heading', { name: '비밀번호를 재설정할 수 없습니다' })).toBeInTheDocument()
    expect(repository.confirmPasswordReset).not.toHaveBeenCalled()
  })

  it('removes every token parameter and keeps the existing first-token parsing behavior', async () => {
    const { router } = renderPage('/reset-password?token=first&token=second&keep=1')
    await waitFor(() => expect(router.state.location.search).toBe('?keep=1'))
    fillPasswords()
    submitForm('비밀번호 변경')
    await screen.findByRole('heading', { name: '비밀번호 변경 완료' })
    expect(repository.confirmPasswordReset).toHaveBeenCalledWith('first', 'new-password-1', expect.any(AbortSignal))
  })

  it('scrubs tokens even while the feature is disabled without enabling requests', async () => {
    vi.stubEnv('VITE_API_CAPABILITIES', '')
    const { router } = renderPage()
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByRole('heading', { name: '현재 이용할 수 없습니다' })).toBeInTheDocument()
    expect(repository.confirmPasswordReset).not.toHaveBeenCalled()
  })

  it('requires reopening the email link after a cleaned route is remounted', async () => {
    const first = renderPage()
    await waitFor(() => expect(first.router.state.location.search).toBe(''))
    first.unmount()
    renderPage('/reset-password')
    expect(screen.getByRole('heading', { name: '비밀번호를 재설정할 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByText(/새로고침하면 링크를 다시 열어야 합니다/)).toBeInTheDocument()
    expect(repository.confirmPasswordReset).not.toHaveBeenCalled()
  })

  it('prevents duplicate reset submissions and allows retry after a server failure', async () => {
    const pending = deferred<string>()
    repository.confirmPasswordReset.mockImplementationOnce(() => pending.promise)
    renderPage()
    fillPasswords()
    const form = screen.getByRole('button', { name: '비밀번호 변경' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(repository.confirmPasswordReset).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('새 비밀번호')).toBeDisabled()
    await act(async () => { pending.reject(new Error('Network failure')) })
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeEnabled()
    fireEvent.submit(form)
    await screen.findByRole('heading', { name: '비밀번호 변경 완료' })
    expect(repository.confirmPasswordReset).toHaveBeenCalledTimes(2)
  })

  it('does not acquire the submission guard for an invalid password', async () => {
    renderPage()
    fillPasswords('short')
    submitForm('비밀번호 변경')
    expect(repository.confirmPasswordReset).not.toHaveBeenCalled()
    fillPasswords()
    submitForm('비밀번호 변경')
    await screen.findByRole('heading', { name: '비밀번호 변경 완료' })
    expect(repository.confirmPasswordReset).toHaveBeenCalledTimes(1)
  })

  it('a newer email link aborts the old request, resets the form and ignores late responses', async () => {
    const oldRequest = deferred<string>()
    const newRequest = deferred<string>()
    repository.confirmPasswordReset.mockImplementationOnce(() => oldRequest.promise).mockImplementationOnce(() => newRequest.promise)
    const { router } = renderPage()
    fillPasswords()
    submitForm('비밀번호 변경')
    const oldSignal = repository.confirmPasswordReset.mock.calls[0][2] as AbortSignal
    await act(() => router.navigate('/reset-password?token=new-token&source=mail#new'))
    expect(oldSignal.aborted).toBe(true)
    expect(screen.getByLabelText('새 비밀번호')).toHaveValue('')
    expect(screen.getByLabelText('새 비밀번호 확인')).toHaveValue('')
    expect(router.state.location.search).toBe('?source=mail')
    expect(router.state.location.hash).toBe('#new')
    fillPasswords('changed-password-2')
    const form = screen.getByRole('button', { name: '비밀번호 변경' }).closest('form')!
    fireEvent.submit(form)
    await act(async () => { oldRequest.resolve('Old success must be ignored') })
    expect(screen.queryByText('Old success must be ignored')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '변경 중' })).toBeDisabled()
    fireEvent.submit(form)
    expect(repository.confirmPasswordReset).toHaveBeenCalledTimes(2)
    expect(repository.confirmPasswordReset).toHaveBeenLastCalledWith('new-token', 'changed-password-2', expect.any(AbortSignal))
    await act(async () => { newRequest.resolve('New success') })
    expect(screen.getByText('New success')).toBeInTheDocument()
  })

  it('does not reuse another email link credential after Back or Forward', async () => {
    const pending = deferred<string>()
    repository.confirmPasswordReset.mockImplementationOnce(() => pending.promise)
    const { router } = renderPage('/reset-password?token=account-A&source=A', true)
    await waitFor(() => expect(router.state.location.search).toBe('?source=A'))
    await act(() => router.navigate('/reset-password?token=account-B&source=B'))
    fillPasswords()
    submitForm('비밀번호 변경')
    const signal = repository.confirmPasswordReset.mock.calls[0][2] as AbortSignal
    expect(repository.confirmPasswordReset).toHaveBeenCalledWith('account-B', 'new-password-1', signal)

    await act(() => router.navigate(-1))
    expect(router.state.location.search).toBe('?source=A')
    expect(signal.aborted).toBe(true)
    expect(screen.getByRole('heading', { name: '비밀번호를 재설정할 수 없습니다' })).toBeInTheDocument()
    await act(async () => { pending.resolve('Ignored B response') })
    expect(screen.queryByText('Ignored B response')).not.toBeInTheDocument()
    await act(() => router.navigate(1))
    expect(router.state.location.search).toBe('?source=B')
    expect(screen.getByRole('heading', { name: '비밀번호를 재설정할 수 없습니다' })).toBeInTheDocument()
    expect(repository.confirmPasswordReset).toHaveBeenCalledTimes(1)
  })

  it('aborts reset submission on unmount without rendering a late failure', async () => {
    const pending = deferred<string>()
    repository.confirmPasswordReset.mockImplementationOnce(() => pending.promise)
    const { unmount } = renderPage()
    fillPasswords()
    submitForm('비밀번호 변경')
    const signal = repository.confirmPasswordReset.mock.calls[0][2] as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { pending.reject(new Error('Late failure')) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('reset email submission lifecycle', () => {
  it('prevents duplicate mail requests and releases the guard for retry', async () => {
    const pending = deferred<string>()
    repository.requestPasswordReset.mockImplementationOnce(() => pending.promise)
    renderPage('/forgot-password')
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'learner@example.com' } })
    const form = screen.getByRole('button', { name: '재설정 링크 보내기' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(repository.requestPasswordReset).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('이메일')).toBeDisabled()
    await act(async () => { pending.reject(new Error('Network failure')) })
    await screen.findByRole('alert')
    fireEvent.submit(form)
    expect(await screen.findByRole('status')).toHaveTextContent('등록된 이메일이면 재설정 안내를 발송했습니다.')
    expect(repository.requestPasswordReset).toHaveBeenCalledTimes(2)
  })

  it('aborts mail submission on route exit and ignores its late response', async () => {
    const pending = deferred<string>()
    repository.requestPasswordReset.mockImplementationOnce(() => pending.promise)
    const { router } = renderPage('/forgot-password')
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'learner@example.com' } })
    submitForm('재설정 링크 보내기')
    const signal = repository.requestPasswordReset.mock.calls[0][1] as AbortSignal
    await act(() => router.navigate('/login'))
    expect(signal.aborted).toBe(true)
    await act(async () => { pending.resolve('Late success') })
    expect(screen.queryByText('Late success')).not.toBeInTheDocument()
    expect(screen.getByText('로그인 화면')).toBeInTheDocument()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}
