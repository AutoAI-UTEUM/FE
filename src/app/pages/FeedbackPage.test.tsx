import { useState, type PropsWithChildren } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, type AuthUser, useAuth } from '../../features/auth'
import { ToastProvider } from '../../shared/ui'
import { TestAuthProvider } from '../../test/TestAuthProvider'
import { apiSuccess, installApiFixtureServer } from '../../test/apiFixtureServer'
import { FeedbackPage } from './FeedbackPage'

type ApiFixtureOverride = (
  request: Request,
) => Response | Promise<Response | undefined> | undefined

let apiOverride: ApiFixtureOverride | undefined

beforeEach(() => {
  apiOverride = undefined
  installApiFixtureServer((request) => apiOverride?.(request))
})

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('FeedbackPage', () => {
  it('submits feedback from its own page', async () => {
    render(
      <TestAuthProvider>
        <MemoryRouter>
          <FeedbackPage />
        </MemoryRouter>
      </TestAuthProvider>,
    )

    fireEvent.change(screen.getByLabelText('분류'), { target: { value: 'BUG' } })
    fireEvent.change(screen.getByLabelText('내용'), {
      target: { value: '피드백 화면에서 문제가 발생합니다.' },
    })
    fireEvent.click(screen.getByRole('button', { name: '보내기' }))

    expect(await screen.findByText('피드백을 보냈습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('내용')).toHaveValue('')
    const feedbackCall = vi.mocked(globalThis.fetch).mock.calls.find(([input]) =>
      String(input instanceof Request ? input.url : input).endsWith('/api/feedback'))
    expect(feedbackCall?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(feedbackCall?.[1]?.body))).toMatchObject({
      category: 'BUG',
      clientVersion: '0.1.0',
      message: '피드백 화면에서 문제가 발생합니다.',
      pageUrl: expect.any(String),
    })
  })

  it('omits sensitive query parameters and fragments from pageUrl', async () => {
    window.history.replaceState({}, '', '/feedback?access_token=secret#private-fragment')

    renderFeedbackPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'URL privacy' } })
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)

    expect(await screen.findByText('피드백을 보냈습니다.')).toBeInTheDocument()
    const payload = getFeedbackPayload()
    expect(payload.pageUrl).toBe(`${window.location.origin}/feedback`)
    expect(payload.pageUrl).not.toContain('secret')
    expect(payload.pageUrl).not.toContain('private-fragment')
  })

  it('coalesces duplicate submissions dispatched in the same tick', async () => {
    const response = createDeferred<Response>()
    apiOverride = (request) => request.url.endsWith('/api/feedback')
      ? response.promise
      : undefined

    renderFeedbackPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Send once' } })
    const form = screen.getByRole('textbox').closest('form')!

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(getFeedbackCalls()).toHaveLength(1)
    response.resolve(apiSuccess({ createdAt: '2026-10-03T00:00:00Z', feedbackId: 1 }))
    expect(await screen.findByText('피드백을 보냈습니다.')).toBeInTheDocument()
  })

  it('keeps a draft edited while an earlier submission is pending', async () => {
    const response = createDeferred<Response>()
    apiOverride = (request) => request.url.endsWith('/api/feedback')
      ? response.promise
      : undefined

    renderFeedbackPage()
    const message = screen.getByRole('textbox')
    fireEvent.change(message, { target: { value: 'Submitted draft' } })
    fireEvent.submit(message.closest('form')!)
    fireEvent.change(message, { target: { value: 'New unsent draft' } })
    fireEvent.change(message, { target: { value: 'Submitted draft' } })

    response.resolve(apiSuccess({ createdAt: '2026-10-03T00:00:00Z', feedbackId: 1 }))
    expect(await screen.findByText('피드백을 보냈습니다.')).toBeInTheDocument()
    expect(message).toHaveValue('Submitted draft')
  })

  it('keeps one submission scope when the same account receives its id', async () => {
    const response = createDeferred<Response>()
    apiOverride = (request) => request.url.endsWith('/api/feedback')
      ? response.promise
      : undefined

    render(
      <AuthProvider initialUser={{ email: 'learner@example.com', name: 'learner', role: 'LEARNER' }}>
        <ToastProvider>
          <MemoryRouter>
            <IdentityHydrationHarness>
              <FeedbackPage />
            </IdentityHydrationHarness>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>,
    )
    const message = screen.getByRole('textbox')
    fireEvent.change(message, { target: { value: 'Same account draft' } })
    fireEvent.submit(message.closest('form')!)
    fireEvent.click(screen.getByRole('button', { name: 'Hydrate account id' }))

    expect(screen.getByRole('button', { name: '전송 중' })).toBeDisabled()
    fireEvent.submit(message.closest('form')!)
    expect(getFeedbackCalls()).toHaveLength(1)

    response.resolve(apiSuccess({ createdAt: '2026-10-03T00:00:00Z', feedbackId: 1 }))
    expect(await screen.findByText('피드백을 보냈습니다.')).toBeInTheDocument()
    expect(message).toHaveValue('')
  })

  it('ignores a response from the previous account', async () => {
    const accountAResponse = createDeferred<Response>()
    const accountBResponse = createDeferred<Response>()
    let requestCount = 0
    apiOverride = (request) => {
      if (!request.url.endsWith('/api/feedback')) return undefined
      requestCount += 1
      return requestCount === 1 ? accountAResponse.promise : accountBResponse.promise
    }

    render(
      <TestAuthProvider>
        <MemoryRouter>
          <AccountSwitchHarness>
            <FeedbackPage />
          </AccountSwitchHarness>
        </MemoryRouter>
      </TestAuthProvider>,
    )
    const message = screen.getByRole('textbox')
    fireEvent.change(message, { target: { value: 'Account A draft' } })
    fireEvent.submit(message.closest('form')!)
    fireEvent.click(screen.getByRole('button', { name: 'Switch account' }))
    fireEvent.change(message, { target: { value: 'Account B draft' } })
    await waitFor(() => expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled())
    fireEvent.submit(message.closest('form')!)
    expect(getFeedbackCalls()).toHaveLength(2)

    await act(async () => {
      accountAResponse.resolve(apiSuccess({ createdAt: '2026-10-03T00:00:00Z', feedbackId: 1 }))
      await accountAResponse.promise
    })

    expect(message).toHaveValue('Account B draft')
    expect(screen.queryByText('피드백을 보냈습니다.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전송 중' })).toBeDisabled()
    fireEvent.submit(message.closest('form')!)
    expect(getFeedbackCalls()).toHaveLength(2)

    accountBResponse.resolve(apiSuccess({ createdAt: '2026-10-03T00:00:01Z', feedbackId: 2 }))
    expect(await screen.findByText('피드백을 보냈습니다.')).toBeInTheDocument()
    expect(message).toHaveValue('')
  })

  it('does not apply a response after the feedback page unmounts', async () => {
    const response = createDeferred<Response>()
    apiOverride = (request) => request.url.endsWith('/api/feedback')
      ? response.promise
      : undefined

    render(
      <TestAuthProvider>
        <MemoryRouter>
          <FeedbackUnmountHarness />
        </MemoryRouter>
      </TestAuthProvider>,
    )
    const message = screen.getByRole('textbox')
    fireEvent.change(message, { target: { value: 'Unmounted draft' } })
    fireEvent.submit(message.closest('form')!)
    fireEvent.click(screen.getByRole('button', { name: 'Unmount feedback' }))

    await act(async () => {
      response.resolve(apiSuccess({ createdAt: '2026-10-03T00:00:00Z', feedbackId: 1 }))
      await response.promise
    })

    expect(screen.queryByText('피드백을 보냈습니다.')).not.toBeInTheDocument()
  })
})

function renderFeedbackPage() {
  return render(
    <TestAuthProvider>
      <MemoryRouter>
        <FeedbackPage />
      </MemoryRouter>
    </TestAuthProvider>,
  )
}

function getFeedbackCalls() {
  return vi.mocked(globalThis.fetch).mock.calls.filter(([input]) =>
    String(input instanceof Request ? input.url : input).endsWith('/api/feedback'))
}

function getFeedbackPayload() {
  const feedbackCall = getFeedbackCalls()[0]
  return JSON.parse(String(feedbackCall?.[1]?.body)) as { pageUrl: string }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function AccountSwitchHarness({ children }: PropsWithChildren) {
  const { updateUser } = useAuth()
  const accountB: AuthUser = {
    email: 'account-b@example.com',
    id: 2,
    name: 'Account B',
    role: 'LEARNER',
  }
  return (
    <>
      <button onClick={() => updateUser(accountB)} type="button">Switch account</button>
      {children}
    </>
  )
}

function IdentityHydrationHarness({ children }: PropsWithChildren) {
  const { updateUser } = useAuth()
  return (
    <>
      <button
        onClick={() => updateUser({
          email: 'learner@example.com',
          id: 1,
          name: 'learner',
          role: 'LEARNER',
        })}
        type="button"
      >
        Hydrate account id
      </button>
      {children}
    </>
  )
}

function FeedbackUnmountHarness() {
  const [isMounted, setIsMounted] = useState(true)
  return (
    <>
      <button onClick={() => setIsMounted(false)} type="button">Unmount feedback</button>
      {isMounted ? <FeedbackPage /> : null}
    </>
  )
}
