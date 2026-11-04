import { BroadcastChannel as NativeBroadcastChannel, threadId } from 'node:worker_threads'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTH_RESTORE_TIMEOUT_MS, AuthProvider } from './AuthProvider'
import {
  AUTH_SESSION_CHANNEL_NAME,
  type AuthCoordinatorMessage,
} from './AuthRefreshCoordinator'
import type { AuthUser } from './authContext'
import type { AccessGrant } from './authRepository'
import { useAuth } from './useAuth'

const repository = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('./authRepository', () => ({ getAuthRepository: () => repository }))

const user: AuthUser = { id: 1, name: '학습자', email: 'learner@example.com', role: 'LEARNER' }
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
const channels: NativeBroadcastChannel[] = []

class TestBroadcastChannel extends NativeBroadcastChannel {
  constructor(name: string) {
    // Native channels cross Vitest worker boundaries; isolate this suite from
    // unrelated providers without replacing their asynchronous delivery.
    super(`auth-provider-test-${process.pid}-${threadId}-${name}`)
  }
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
  // Real asynchronous BroadcastChannel delivery; the normal provider suite disables it.
  vi.stubGlobal('BroadcastChannel', TestBroadcastChannel)
  repository.refresh.mockResolvedValue(grant())
  repository.getMe.mockResolvedValue(user)
  repository.logout.mockResolvedValue(undefined)
  let tail = Promise.resolve()
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: <T,>(_name: string, task: () => Promise<T>) => {
        const result = tail.then(task)
        tail = result.then(() => undefined, () => undefined)
        return result
      },
    },
  })
})

afterEach(() => {
  cleanup()
  channels.splice(0).forEach((channel) => channel.close())
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
  vi.resetAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('AuthProvider with asynchronous BroadcastChannel', () => {
  it('accepts logout from a newer tab whose local revision is lower', async () => {
    const first = renderHook(useAuth, { wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider> })
    const beforeGrant = first.result.current
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    sender.postMessage({ type: 'REFRESH_SUCCEEDED', cause: 'refresh', grant: grant(), receivedAt: Date.now() + 1, revision: 50, userId: 1 })
    await waitFor(() => expect(first.result.current).not.toBe(beforeGrant))

    const second = renderHook(useAuth, { wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider> })
    await act(() => second.result.current.logout())

    await waitFor(() => expect(first.result.current.isAuthenticated).toBe(false))
    expect(second.result.current.isAuthenticated).toBe(false)
    expect(first.result.current.logoutReason).toBe('manual')
  })

  it('finishes both bootstraps when the first tab broadcasts while the second getMe is pending', async () => {
    const firstUser = deferred<AuthUser>()
    const secondUser = deferred<AuthUser>()
    repository.getMe.mockImplementationOnce(() => firstUser.promise).mockImplementationOnce(() => secondUser.promise)
    const first = renderHook(useAuth, { wrapper: AuthProvider })
    const second = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(repository.getMe).toHaveBeenCalledTimes(2))
    expect(repository.refresh).toHaveBeenCalledTimes(1)

    // Observe the actual beginSession broadcast before releasing the slower getMe.
    const delivered = nextBroadcast()
    await act(async () => { firstUser.resolve(user); await delivered })
    await waitFor(() => expect(first.result.current.isAuthenticated).toBe(true))
    await act(async () => { secondUser.resolve(user) })

    await waitFor(() => expect(second.result.current.isInitializing).toBe(false))
    expect(second.result.current.isAuthenticated).toBe(true)
    expect(second.result.current.user).toEqual(user)
  })

  it('verifies a replacement grant instead of restoring the previous account', async () => {
    const oldUser = deferred<AuthUser>()
    const newUser = { ...user, id: 2, name: '다른 학습자' }
    repository.getMe.mockImplementationOnce(() => oldUser.promise).mockResolvedValueOnce(newUser)
    const restoring = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(repository.getMe).toHaveBeenCalledOnce())
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    const delivered = nextBroadcast()
    sender.postMessage({ type: 'REFRESH_SUCCEEDED', cause: 'session-start', grant: { ...grant(), accessToken: 'new-account-token' }, receivedAt: Date.now() + 1, revision: 3, userId: 2 })
    await delivered
    await act(async () => { oldUser.resolve(user) })

    await waitFor(() => expect(restoring.result.current.isInitializing).toBe(false))
    expect(repository.getMe).toHaveBeenLastCalledWith('new-account-token', expect.any(AbortSignal))
    expect(restoring.result.current.user).toEqual(newUser)
  })

  it('retries identity lookup with the replacement grant when the old token is rejected', async () => {
    const oldUser = deferred<AuthUser>()
    repository.getMe.mockImplementationOnce(() => oldUser.promise).mockResolvedValueOnce(user)
    const restoring = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(repository.getMe).toHaveBeenCalledOnce())
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    const delivered = nextBroadcast()
    sender.postMessage({ type: 'REFRESH_SUCCEEDED', cause: 'refresh', grant: { ...grant(), accessToken: 'renewed-token' }, receivedAt: Date.now() + 1, revision: 3, userId: 1 })
    await delivered
    await act(async () => { oldUser.reject(new Error('Previous token expired')) })

    await waitFor(() => expect(restoring.result.current.isInitializing).toBe(false))
    expect(repository.getMe).toHaveBeenLastCalledWith('renewed-token', expect.any(AbortSignal))
    expect(restoring.result.current.isAuthenticated).toBe(true)
  })

  it('does not restore a pending getMe after a logout broadcast', async () => {
    const pendingUser = deferred<AuthUser>()
    repository.getMe.mockImplementation(() => pendingUser.promise)
    const restoring = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(repository.getMe).toHaveBeenCalledOnce())
    const active = renderHook(useAuth, { wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider> })
    await act(() => active.result.current.logout())
    await waitFor(() => expect(restoring.result.current.logoutReason).toBe('manual'))
    await act(async () => { pendingUser.resolve(user) })
    await waitFor(() => expect(restoring.result.current.isInitializing).toBe(false))
    expect(restoring.result.current.isAuthenticated).toBe(false)
  })

  it('does not end another user session when receiving a logout', async () => {
    const first = renderHook(useAuth, { wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider> })
    const second = renderHook(useAuth, { wrapper: ({ children }) => <AuthProvider initialUser={{ ...user, id: 2 }}>{children}</AuthProvider> })
    const delivered = nextBroadcast()
    await act(async () => { await second.result.current.logout(); await delivered })
    expect(first.result.current.isAuthenticated).toBe(true)
  })

  it('hides the current identity for a legacy different-user grant without trusting it', async () => {
    const active = renderHook(useAuth, {
      wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider>,
    })
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      grant: { ...grant(), accessToken: 'legacy-other-user-token' },
      receivedAt: Date.now() + 1,
      revision: 3,
      userId: 2,
    })

    await waitFor(() => expect(active.result.current.user).toBeNull())
    expect(active.result.current.isAuthenticated).toBe(false)
    expect(repository.getMe).not.toHaveBeenCalledWith(
      'legacy-other-user-token',
      expect.any(AbortSignal),
    )
  })

  it('does not apply an unidentified refresh grant to an established session', async () => {
    const activeUser = { ...user, id: 2, name: 'Other learner' }
    const active = renderHook(useAuth, {
      wrapper: ({ children }) => <AuthProvider initialUser={activeUser}>{children}</AuthProvider>,
    })
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    const delivered = nextBroadcast()

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      cause: 'refresh',
      grant: { ...grant(), accessToken: 'unidentified-old-account-token' },
      receivedAt: Date.now() + 1,
      revision: 3,
    })
    await delivered
    await new Promise((resolve) => setTimeout(resolve, 25))

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: {}, message: 'ok', success: true })),
    )
    await active.result.current.apiRequest('/api/account-b-follow-up')

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-access-token')
    expect(active.result.current.user).toEqual(activeUser)
  })

  it('does not let a late previous-account refresh replace a pending account switch', async () => {
    const replacementUser = deferred<AuthUser>()
    const nextUser = { ...user, id: 2, name: '다른 학습자' }
    repository.getMe.mockImplementation((accessToken: string) => {
      if (accessToken === 'new-account-token') return replacementUser.promise
      return Promise.resolve(user)
    })
    const active = renderHook(useAuth, {
      wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider>,
    })
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    const switchedAt = Date.now() + 1

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      cause: 'session-start',
      grant: { ...grant(), accessToken: 'new-account-token' },
      receivedAt: switchedAt,
      revision: 3,
      userId: 2,
    })
    await waitFor(() => expect(repository.getMe).toHaveBeenCalledWith(
      'new-account-token',
      expect.any(AbortSignal),
    ))
    expect(active.result.current.user).toBeNull()

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      cause: 'refresh',
      grant: { ...grant(), accessToken: 'late-old-account-token' },
      receivedAt: switchedAt + 1,
      revision: 4,
      userId: 1,
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      replacementUser.resolve(nextUser)
    })

    await waitFor(() => expect(active.result.current.user).toEqual(nextUser))
    expect(repository.getMe).not.toHaveBeenCalledWith(
      'late-old-account-token',
      expect.any(AbortSignal),
    )

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      cause: 'refresh',
      grant: { ...grant(), accessToken: 'late-old-after-switch-token' },
      receivedAt: switchedAt + 2,
      revision: 5,
      userId: 1,
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })

    expect(active.result.current.user).toEqual(nextUser)
    expect(repository.getMe).not.toHaveBeenCalledWith(
      'late-old-after-switch-token',
      expect.any(AbortSignal),
    )
  })

  it('does not let a previous-account logout cancel a pending account switch', async () => {
    const replacementUser = deferred<AuthUser>()
    const nextUser = { ...user, id: 2, name: 'Other learner' }
    repository.getMe.mockImplementation((accessToken: string) => {
      if (accessToken === 'new-account-token') return replacementUser.promise
      return Promise.resolve(user)
    })
    const active = renderHook(useAuth, {
      wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider>,
    })
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    const delivered = nextBroadcast()

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      cause: 'session-start',
      grant: { ...grant(), accessToken: 'new-account-token' },
      receivedAt: Date.now() + 1,
      revision: 3,
      userId: 2,
    })
    await delivered
    await waitFor(() => expect(repository.getMe).toHaveBeenCalledWith(
      'new-account-token',
      expect.any(AbortSignal),
    ))

    sender.postMessage({
      reason: 'manual',
      revision: 4,
      type: 'SESSION_ENDED',
      userId: 1,
    })
    await new Promise((resolve) => setTimeout(resolve, 25))
    await act(async () => { replacementUser.resolve(nextUser) })

    await waitFor(() => expect(active.result.current.user).toEqual(nextUser))
    expect(active.result.current.isAuthenticated).toBe(true)
  })

  it('accepts a newer account switch while a replacement identity is pending', async () => {
    const pendingSecondUser = deferred<AuthUser>()
    const thirdUser = { ...user, id: 3, name: 'Third learner' }
    repository.getMe.mockImplementation((accessToken: string) => {
      if (accessToken === 'second-account-token') return pendingSecondUser.promise
      if (accessToken === 'third-account-token') return Promise.resolve(thirdUser)
      return Promise.resolve(user)
    })
    const active = renderHook(useAuth, {
      wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider>,
    })
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      cause: 'session-start',
      grant: { ...grant(), accessToken: 'second-account-token' },
      receivedAt: Date.now() + 1,
      revision: 3,
      userId: 2,
    })
    await waitFor(() => expect(repository.getMe).toHaveBeenCalledWith(
      'second-account-token',
      expect.any(AbortSignal),
    ))

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      cause: 'session-start',
      grant: { ...grant(), accessToken: 'third-account-token' },
      receivedAt: Date.now() + 2,
      revision: 4,
      userId: 3,
    })

    await waitFor(() => expect(active.result.current.user).toEqual(thirdUser))
    await act(async () => { pendingSecondUser.resolve({ ...user, id: 2 }) })
    expect(active.result.current.user).toEqual(thirdUser)
  })

  it('ends initialization when replacement identity lookup times out', async () => {
    const replacementUser = deferred<AuthUser>()
    repository.getMe.mockImplementation((accessToken: string) => {
      if (accessToken === 'new-account-token') return replacementUser.promise
      return Promise.resolve(user)
    })
    let restoreTimeout: (() => void) | null = null
    const active = renderHook(useAuth, {
      wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider>,
    })
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    vi.spyOn(window, 'setTimeout').mockImplementationOnce((handler, timeout) => {
      expect(timeout).toBe(AUTH_RESTORE_TIMEOUT_MS)
      if (typeof handler === 'function') restoreTimeout = handler
      return 999 as never
    })
    const delivered = nextBroadcast()

    sender.postMessage({
      type: 'REFRESH_SUCCEEDED',
      cause: 'session-start',
      grant: { ...grant(), accessToken: 'new-account-token' },
      receivedAt: Date.now() + 1,
      revision: 3,
      userId: 2,
    })
    await delivered
    await waitFor(() => expect(repository.getMe).toHaveBeenCalledWith(
      'new-account-token',
      expect.any(AbortSignal),
    ))
    expect(active.result.current.isInitializing).toBe(true)
    expect(restoreTimeout).not.toBeNull()

    await act(async () => { restoreTimeout?.(); await Promise.resolve() })

    await waitFor(() => expect(active.result.current.isInitializing).toBe(false))
    expect(active.result.current.isAuthenticated).toBe(false)
    expect(active.result.current.logoutReason).toBe('session-expired')
  })

  it.each([
    ['JSON request without a signal', 'json', false],
    ['JSON request with a signal', 'json', true],
    ['raw request without a signal', 'raw', false],
    ['raw request with a signal', 'raw', true],
  ] as const)(
    'does not retry an account A POST with account B credentials: %s',
    async (_label, requestKind, withSignal) => {
      const nextUser = { ...user, id: 2, name: 'Other learner' }
      repository.getMe.mockImplementation((accessToken: string) =>
        Promise.resolve(
          accessToken === 'new-account-token' ? nextUser : user,
        ),
      )
      const active = renderHook(useAuth, { wrapper: AuthProvider })
      await waitFor(() => expect(active.result.current.user).toEqual(user))

      const firstResponse = deferred<Response>()
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementationOnce(() => firstResponse.promise)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ data: {}, message: 'ok', success: true }),
            { status: 200 },
          ),
        )
      const controller = new AbortController()
      const signal = withSignal ? controller.signal : undefined
      const request =
        requestKind === 'json'
          ? active.result.current.apiRequest('/api/cross-account', {
              body: { owner: 'account-a' },
              method: 'POST',
              signal,
            })
          : active.result.current.rawApiRequest('/api/cross-account', {
              body: JSON.stringify({ owner: 'account-a' }),
              method: 'POST',
              signal,
            })

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
      channels.push(sender)
      const delivered = nextBroadcast()
      sender.postMessage({
        type: 'REFRESH_SUCCEEDED',
        cause: 'session-start',
        grant: { ...grant(), accessToken: 'new-account-token' },
        receivedAt: Date.now() + 1,
        revision: 3,
        userId: 2,
      })
      await delivered
      await waitFor(() => expect(active.result.current.user).toEqual(nextUser))

      firstResponse.resolve(expiredResponse())

      await expect(request).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' })
      expect(fetchMock).toHaveBeenCalledOnce()
      expect(repository.refresh).toHaveBeenCalledOnce()
      const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
      expect(firstHeaders.get('Authorization')).toBe('Bearer shared-token')
    },
  )

  it('keeps same-account concurrent refreshes deduplicated and retries each request once', async () => {
    repository.refresh
      .mockResolvedValueOnce(grant())
      .mockResolvedValueOnce({ ...grant(), accessToken: 'renewed-token' })
    const active = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(active.result.current.user).toEqual(user))

    const callsByPath = new Map<string, number>()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      const count = (callsByPath.get(url) ?? 0) + 1
      callsByPath.set(url, count)
      if (count === 1) return Promise.resolve(expiredResponse())
      return Promise.resolve(
        new Response(
          JSON.stringify({ data: {}, message: 'ok', success: true }),
          { status: 200 },
        ),
      )
    })
    const controller = new AbortController()

    const [jsonResult, rawResult] = await Promise.all([
      active.result.current.apiRequest('/api/same-account-json', {
        body: { value: 1 },
        method: 'POST',
      }),
      active.result.current.rawApiRequest('/api/same-account-raw', {
        body: JSON.stringify({ value: 2 }),
        method: 'POST',
        signal: controller.signal,
      }),
    ])

    expect(jsonResult).toMatchObject({ success: true })
    expect(rawResult.status).toBe(200)
    expect(repository.refresh).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    for (const url of [
      'http://localhost:8080/api/same-account-json',
      'http://localhost:8080/api/same-account-raw',
    ]) {
      expect(callsByPath.get(url)).toBe(2)
    }
    for (const [, init] of fetchMock.mock.calls.slice(2)) {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer renewed-token')
    }
  })

  it('does not refresh or retry an in-flight request after logout', async () => {
    const active = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(active.result.current.user).toEqual(user))

    const firstResponse = deferred<Response>()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => firstResponse.promise)
    const request = active.result.current.apiRequest('/api/logout-race', {
      body: { value: 1 },
      method: 'POST',
    })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    await act(() => active.result.current.logout())
    firstResponse.resolve(expiredResponse())

    await expect(request).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(repository.refresh).toHaveBeenCalledOnce()
    expect(active.result.current.isAuthenticated).toBe(false)
    expect(active.result.current.logoutReason).toBe('manual')
  })

  it.each(['json', 'raw'] as const)(
    'does not apply or publish an account A refresh that resolves after an account B switch: %s',
    async (requestKind) => {
      const lateRefresh = deferred<AccessGrant>()
      repository.refresh
        .mockResolvedValueOnce(grant())
        .mockImplementationOnce(() => lateRefresh.promise)
      const nextUser = { ...user, id: 2, name: 'Other learner' }
      repository.getMe.mockImplementation((accessToken: string) =>
        Promise.resolve(
          accessToken === 'new-account-token' ? nextUser : user,
        ),
      )
      const active = renderHook(useAuth, { wrapper: AuthProvider })
      await waitFor(() => expect(active.result.current.user).toEqual(user))

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(expiredResponse())
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ data: {}, message: 'ok', success: true }),
            { status: 200 },
          ),
        )
      const request =
        requestKind === 'json'
          ? active.result.current.apiRequest('/api/late-refresh', {
              body: { owner: 'account-a' },
              method: 'POST',
            })
          : active.result.current.rawApiRequest('/api/late-refresh', {
              body: JSON.stringify({ owner: 'account-a' }),
              method: 'POST',
            })
      await waitFor(() => expect(repository.refresh).toHaveBeenCalledTimes(2))

      const observed: AuthCoordinatorMessage[] = []
      const observer = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
      observer.onmessage = (event) => {
        observed.push(event.data as AuthCoordinatorMessage)
      }
      channels.push(observer)
      const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
      channels.push(sender)
      const delivered = nextBroadcast()
      sender.postMessage({
        type: 'REFRESH_SUCCEEDED',
        cause: 'session-start',
        grant: { ...grant(), accessToken: 'new-account-token' },
        receivedAt: Date.now() + 1,
        revision: 3,
        userId: 2,
      })
      await delivered
      await waitFor(() => expect(active.result.current.user).toEqual(nextUser))

      lateRefresh.resolve({ ...grant(), accessToken: 'late-account-a-token' })
      await expect(request).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' })
      await new Promise((resolve) => setTimeout(resolve, 25))

      await active.result.current.apiRequest('/api/account-b-follow-up', {
        method: 'POST',
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const followUpHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
      expect(followUpHeaders.get('Authorization')).toBe(
        'Bearer new-account-token',
      )
      expect(
        observed.filter(
          (message) =>
            message.type === 'REFRESH_SUCCEEDED' &&
            message.grant.accessToken === 'late-account-a-token',
        ),
      ).toHaveLength(0)
    },
  )

  it('does not apply or publish a refresh that resolves after a logout broadcast', async () => {
    const lateRefresh = deferred<AccessGrant>()
    repository.refresh
      .mockResolvedValueOnce(grant())
      .mockImplementationOnce(() => lateRefresh.promise)
    const active = renderHook(useAuth, { wrapper: AuthProvider })
    await waitFor(() => expect(active.result.current.user).toEqual(user))

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(expiredResponse())
    const request = active.result.current.apiRequest('/api/logout-refresh-race', {
      body: { owner: 'account-a' },
      method: 'POST',
    })
    await waitFor(() => expect(repository.refresh).toHaveBeenCalledTimes(2))

    const observed: AuthCoordinatorMessage[] = []
    const observer = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    observer.onmessage = (event) => {
      observed.push(event.data as AuthCoordinatorMessage)
    }
    channels.push(observer)
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    const delivered = nextBroadcast()
    sender.postMessage({
      reason: 'manual',
      revision: 3,
      type: 'SESSION_ENDED',
      userId: 1,
    })
    await delivered
    await waitFor(() => expect(active.result.current.isAuthenticated).toBe(false))

    lateRefresh.resolve({ ...grant(), accessToken: 'late-after-logout-token' })
    await expect(request).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' })
    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(active.result.current.isAuthenticated).toBe(false)
    expect(
      observed.filter(
        (message) =>
          message.type === 'REFRESH_SUCCEEDED' &&
          message.grant.accessToken === 'late-after-logout-token',
      ),
    ).toHaveLength(0)
  })
})

function nextBroadcast() {
  const observer = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
  channels.push(observer)
  return new Promise<void>((resolve) => {
    observer.onmessage = () => { observer.close(); resolve() }
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function grant(): AccessGrant {
  return { accessToken: 'shared-token', expiresIn: 3600, session: {
    absoluteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    idleExpiresAt: new Date(Date.now() + 7_200_000).toISOString(),
    idleTimeoutSeconds: 7200,
  } }
}

function expiredResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'TOKEN_EXPIRED',
        details: [],
        message: 'Token expired.',
      },
      success: false,
    }),
    { status: 401 },
  )
}
