import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VerifyEmailPage } from './VerifyEmailPage'

const mocks = vi.hoisted(() => ({
  token: null as string | null,
  user: { id: 11, email: 'signed-in@example.invalid', emailVerification: 'PENDING', emailVerificationRequired: true },
  confirm: vi.fn(), refresh: vi.fn(), request: vi.fn(),
}))
vi.mock('../../features/auth', () => ({ useAuth: () => ({
  user: mocks.user, isAuthenticated: true, refreshCurrentUser: mocks.refresh, apiRequest: mocks.request,
}) }))
vi.mock('../../features/auth/emailVerificationRepository', () => ({
  confirmEmailVerification: mocks.confirm, requestEmailVerification: mocks.request,
}))
vi.mock('../../features/auth/emailLinkToken', () => ({
  readEmailLinkToken: () => mocks.token, readEmailLinkIssue: () => null,
  clearEmailLinkToken: () => { mocks.token = null },
}))

beforeEach(() => {
  vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', 'be-auth-ee69e425-v1')
  mocks.token = null
  mocks.user = { id: 11, email: 'signed-in@example.invalid', emailVerification: 'PENDING', emailVerificationRequired: true }
  mocks.refresh.mockResolvedValue(mocks.user)
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllEnvs() })
const show = () => render(<MemoryRouter initialEntries={['/verify-email']}><VerifyEmailPage /></MemoryRouter>)
function expectLoginOnly() {
  expect(screen.getByRole('heading', { name: '이메일 인증 완료' })).toBeInTheDocument()
  expect(screen.getAllByRole('link')).toHaveLength(1)
  expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
}

it('shows only login when the current account explicitly reports VERIFIED and required=false', () => {
  mocks.user = { ...mocks.user, emailVerification: 'VERIFIED', emailVerificationRequired: false }
  show()
  expectLoginOnly()
  expect(mocks.confirm).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
})

it.each(['PENDING', 'UNKNOWN'])('does not treat %s/required=false as verified', (state) => {
  mocks.user = { ...mocks.user, emailVerification: state, emailVerificationRequired: false }
  show()
  expect(screen.queryByRole('heading', { name: '이메일 인증 완료' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '확인 이메일 다시 요청' })).toBeInTheDocument()
})

it('keeps confirmed-link success even if refreshing a different pending signed-in account fails', async () => {
  mocks.token = 'A'.repeat(43)
  mocks.confirm.mockResolvedValue(undefined)
  show()
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled())
  mocks.refresh.mockRejectedValue(new Error('synthetic self lookup unavailable'))
  fireEvent.click(screen.getByRole('button', { name: '이메일 확인하기' }))
  await waitFor(expectLoginOnly)
  expect(mocks.user.emailVerification).toBe('PENDING')
  expect(mocks.confirm).toHaveBeenCalledTimes(1)
  expect(screen.queryByText(/요청을 완료하지 못했습니다/)).not.toBeInTheDocument()
})

it('a verified signed-in account cannot turn a pending or failed other-account link into success', async () => {
  mocks.user = { ...mocks.user, emailVerification: 'VERIFIED', emailVerificationRequired: false }
  mocks.token = 'A'.repeat(43)
  let reject!: (error: Error) => void
  mocks.confirm.mockImplementation(() => new Promise((_, fail) => { reject = fail }))
  show()
  fireEvent.click(screen.getByRole('button', { name: '이메일 확인하기' }))
  expect(screen.queryByRole('heading', { name: '이메일 인증 완료' })).not.toBeInTheDocument()
  await act(async () => reject(new Error('synthetic invalid link')))
  expect(screen.queryByRole('heading', { name: '이메일 인증 완료' })).not.toBeInTheDocument()
  expect(screen.getByText(/요청을 완료하지 못했습니다/)).toBeInTheDocument()
})

it('does not show completion while readiness is OFF, even with a verified current account', () => {
  vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', '')
  mocks.user = { ...mocks.user, emailVerification: 'VERIFIED', emailVerificationRequired: false }
  show()
  expect(screen.queryByRole('heading', { name: '이메일 인증 완료' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('이메일 확인 기능을 준비 중입니다.')
  expect(mocks.refresh).not.toHaveBeenCalled()
})
