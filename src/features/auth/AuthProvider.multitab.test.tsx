import { BroadcastChannel as NativeBroadcastChannel, threadId } from 'node:worker_threads'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider } from './AuthProvider'
import { AUTH_SESSION_CHANNEL_NAME } from './AuthRefreshCoordinator'
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
})

describe('AuthProvider with asynchronous BroadcastChannel', () => {
  it('accepts logout from a newer tab whose local revision is lower', async () => {
    const first = renderHook(useAuth, { wrapper: ({ children }) => <AuthProvider initialUser={user}>{children}</AuthProvider> })
    const beforeGrant = first.result.current
    const sender = new TestBroadcastChannel(AUTH_SESSION_CHANNEL_NAME)
    channels.push(sender)
    sender.postMessage({ type: 'REFRESH_SUCCEEDED', grant: grant(), receivedAt: Date.now() + 1, revision: 50, userId: 1 })
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
    sender.postMessage({ type: 'REFRESH_SUCCEEDED', grant: { ...grant(), accessToken: 'new-account-token' }, receivedAt: Date.now() + 1, revision: 3, userId: 2 })
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
    sender.postMessage({ type: 'REFRESH_SUCCEEDED', grant: { ...grant(), accessToken: 'renewed-token' }, receivedAt: Date.now() + 1, revision: 3, userId: 1 })
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
