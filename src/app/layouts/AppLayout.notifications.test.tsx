import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthContextValue, AuthenticatedRequest, AuthUser } from '../../features/auth'
import { AuthContext } from '../../features/auth/authContext'
import { AppLayout } from './AppLayout'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AppLayout notification reconciliation', () => {
  it('restores only the failed delete when concurrent deletes settle differently', async () => {
    const deleteX = deferred<unknown>()
    const deleteY = deferred<unknown>()
    const items = [notification('x', 'Delete X'), notification('y', 'Delete Y')]
    const apiRequest = vi.fn((path: string, options?: { method?: string }) => {
      if (isNotificationList(path)) return Promise.resolve(listSuccess(items))
      if (options?.method === 'DELETE' && path.endsWith('/x')) return deleteX.promise
      if (options?.method === 'DELETE' && path.endsWith('/y')) return deleteY.promise
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest

    renderLayout(apiRequest)
    await openNotifications(2)

    fireEvent.click(screen.getByLabelText(/Delete X/))
    fireEvent.click(screen.getByLabelText(/Delete Y/))
    expect(screen.queryByText('Delete X')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete Y')).not.toBeInTheDocument()

    await act(async () => {
      deleteY.resolve(success(null))
      await deleteY.promise
      deleteX.reject(new Error('delete failed'))
      await deleteX.promise.catch(() => undefined)
    })

    expect(await screen.findByText('Delete X')).toBeInTheDocument()
    expect(screen.queryByText('Delete Y')).not.toBeInTheDocument()
  })

  it('rolls back a failed read, exposes reload failure retry, and ignores repeated clicks', async () => {
    const item = notification('read', 'Read failure')
    let listCalls = 0
    let markReadCalls = 0
    const apiRequest = vi.fn((path: string, options?: { method?: string }) => {
      if (isNotificationList(path)) {
        listCalls += 1
        return listCalls === 3
          ? Promise.reject(new Error('reload failed'))
          : Promise.resolve(listSuccess([item]))
      }
      if (options?.method === 'PATCH') {
        markReadCalls += 1
        return Promise.reject(new Error('read failed'))
      }
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest

    renderLayout(apiRequest)
    const panel = await openNotifications(1)
    const markAllButton = within(panel).getAllByRole('button')[0]

    fireEvent.click(markAllButton)
    fireEvent.click(markAllButton)

    await waitFor(() => expect(markReadCalls).toBe(1))
    await waitFor(() => expect(notificationTrigger()).toHaveAttribute('aria-label', expect.stringContaining('1')))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('button')).toBeInTheDocument()

    fireEvent.click(within(alert).getByRole('button'))
    await waitFor(() => expect(listCalls).toBe(4))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(notificationTrigger()).toHaveAttribute('aria-label', expect.stringContaining('1'))
  })

  it('keeps successful mark-all items read while rolling back only rejected items', async () => {
    const items = [
      notification('read-ok', 'Read success'),
      notification('read-failed', 'Read rejected'),
    ]
    let listCalls = 0
    const apiRequest = vi.fn((path: string, options?: { method?: string }) => {
      if (isNotificationList(path)) {
        listCalls += 1
        return listCalls === 3
          ? Promise.reject(new Error('reload failed'))
          : Promise.resolve(listSuccess(items))
      }
      if (options?.method === 'PATCH' && path.includes('/read-ok/')) {
        return Promise.resolve(success({ ...items[0], readAt: '2026-10-02T00:01:00Z' }))
      }
      if (options?.method === 'PATCH' && path.includes('/read-failed/')) {
        return Promise.reject(new Error('read failed'))
      }
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest

    renderLayout(apiRequest)
    const panel = await openNotifications(2)
    fireEvent.click(within(panel).getAllByRole('button')[0])

    await waitFor(() => expect(listCalls).toBe(3))
    await waitFor(() => expect(notificationTrigger()).toHaveAttribute('aria-label', expect.stringContaining('1')))
    expect(unreadIndicator('Read success')).not.toBeInTheDocument()
    expect(unreadIndicator('Read rejected')).toBeInTheDocument()
  })

  it('rolls back a rejected mark-all item without waiting for another read request', async () => {
    const items = [
      notification('rejected-now', 'Rejected now'),
      notification('still-pending', 'Still pending'),
    ]
    const pendingRead = deferred<unknown>()
    let listCalls = 0
    const apiRequest = vi.fn((path: string, options?: { method?: string }) => {
      if (isNotificationList(path)) {
        listCalls += 1
        return Promise.resolve(listSuccess(listCalls >= 3
          ? [items[0], { ...items[1], readAt: '2026-10-02T00:01:00Z' }]
          : items))
      }
      if (options?.method === 'PATCH' && path.includes('/rejected-now/')) {
        return Promise.reject(new Error('read failed'))
      }
      if (options?.method === 'PATCH' && path.includes('/still-pending/')) {
        return pendingRead.promise
      }
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest

    renderLayout(apiRequest)
    const panel = await openNotifications(2)
    fireEvent.click(within(panel).getAllByRole('button')[0])

    await waitFor(() => expect(notificationTrigger()).toHaveAttribute('aria-label', expect.stringContaining('1')))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(unreadIndicator('Rejected now')).toBeInTheDocument()
    expect(unreadIndicator('Still pending')).not.toBeInTheDocument()
    expect(listCalls).toBe(2)

    await act(async () => {
      pendingRead.resolve(success({ ...items[1], readAt: '2026-10-02T00:01:00Z' }))
      await pendingRead.promise
    })
    await waitFor(() => expect(listCalls).toBe(3))
  })

  it('lets delete supersede an in-flight read for the same notification', async () => {
    const item = notification('read-then-delete', 'Read then delete')
    let readSignal: AbortSignal | undefined
    let deleteCalls = 0
    const apiRequest = vi.fn((path: string, options?: { method?: string; signal?: AbortSignal }) => {
      if (isNotificationList(path)) return Promise.resolve(listSuccess([item]))
      if (options?.method === 'PATCH') {
        readSignal = options.signal
        return rejectWhenAborted(options.signal)
      }
      if (options?.method === 'DELETE') {
        deleteCalls += 1
        return Promise.resolve(success(null))
      }
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest

    renderLayout(apiRequest)
    const panel = await openNotifications(1)
    fireEvent.click(within(panel).getAllByRole('button')[0])
    await waitFor(() => expect(readSignal).toBeDefined())
    fireEvent.click(screen.getByLabelText(/Read then delete/))

    await waitFor(() => expect(deleteCalls).toBe(1))
    expect(readSignal?.aborted).toBe(true)
    expect(screen.queryByText('Read then delete')).not.toBeInTheDocument()
  })

  it('restores unread state when delete fails after superseding an in-flight read', async () => {
    const item = notification('read-then-delete-fails', 'Read then delete fails')
    let readSignal: AbortSignal | undefined
    let deleteCalls = 0
    const apiRequest = vi.fn((path: string, options?: { method?: string; signal?: AbortSignal }) => {
      if (isNotificationList(path)) return Promise.resolve(listSuccess([item]))
      if (options?.method === 'PATCH') {
        readSignal = options.signal
        return rejectWhenAborted(options.signal)
      }
      if (options?.method === 'DELETE') {
        deleteCalls += 1
        return Promise.reject(new Error('delete failed'))
      }
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest

    renderLayout(apiRequest)
    const panel = await openNotifications(1)
    fireEvent.click(within(panel).getAllByRole('button')[0])
    await waitFor(() => expect(readSignal).toBeDefined())
    fireEvent.click(screen.getByLabelText(/Read then delete fails/))

    await waitFor(() => expect(deleteCalls).toBe(1))
    expect(readSignal?.aborted).toBe(true)
    expect(await screen.findByText('Read then delete fails')).toBeInTheDocument()
    await waitFor(() => expect(notificationTrigger()).toHaveAttribute('aria-label', expect.stringContaining('1')))
    expect(unreadIndicator('Read then delete fails')).toBeInTheDocument()
  })

  it('rolls back an opened notification when both read and recovery reload fail', async () => {
    const item = notification('open-failed', 'Open failure')
    let listCalls = 0
    let markReadCalls = 0
    const apiRequest = vi.fn((path: string, options?: { method?: string }) => {
      if (isNotificationList(path)) {
        listCalls += 1
        return listCalls >= 3
          ? Promise.reject(new Error('reload failed'))
          : Promise.resolve(listSuccess([item]))
      }
      if (options?.method === 'PATCH') {
        markReadCalls += 1
        return Promise.reject(new Error('read failed'))
      }
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest

    renderLayout(apiRequest)
    await openNotifications(1)
    const openButton = screen.getByText('Open failure').closest('button')
    if (!openButton) throw new Error('Open notification button was not rendered.')
    fireEvent.click(openButton)

    await waitFor(() => expect(markReadCalls).toBe(1))
    await waitFor(() => expect(notificationTrigger()).toHaveAttribute('aria-label', expect.stringContaining('1')))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(notificationTrigger())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('reload failed')
    expect(within(alert).getByRole('button')).toBeInTheDocument()
    expect(unreadIndicator('Open failure')).toBeInTheDocument()
  })

  it('loads the new owner and ignores a late list response from the previous owner', async () => {
    const ownerAList = deferred<unknown>()
    const ownerBItem = notification('shared', 'Owner B')
    let listCalls = 0
    const apiRequest = vi.fn((path: string) => {
      if (!isNotificationList(path)) return Promise.reject(new Error(`Unexpected request: ${path}`))
      listCalls += 1
      if (listCalls === 1) return ownerAList.promise
      return Promise.resolve(listSuccess([ownerBItem]))
    }) as unknown as AuthenticatedRequest
    const view = renderLayout(apiRequest, user(1, 'owner-a@example.com'))

    view.rerender(layout(apiRequest, user(2, 'owner-b@example.com')))
    await waitFor(() => expect(listCalls).toBe(2))
    await openNotifications(1)
    expect(await screen.findByText('Owner B')).toBeInTheDocument()

    await act(async () => {
      ownerAList.resolve(listSuccess([notification('shared', 'Owner A')]))
      await ownerAList.promise
    })

    expect(screen.queryByText('Owner A')).not.toBeInTheDocument()
    expect(screen.getByText('Owner B')).toBeInTheDocument()
  })

  it('aborts an old owner mutation before loading notifications for the new owner', async () => {
    const ownerAItem = notification('shared', 'Owner A mutation')
    const ownerBItem = notification('shared', 'Owner B after abort')
    let ownerAReadSignal: AbortSignal | undefined
    let listCalls = 0
    const apiRequest = vi.fn((path: string, options?: { method?: string; signal?: AbortSignal }) => {
      if (isNotificationList(path)) {
        listCalls += 1
        return Promise.resolve(listSuccess(listCalls <= 2 ? [ownerAItem] : [ownerBItem]))
      }
      if (options?.method === 'PATCH') {
        ownerAReadSignal = options.signal
        return rejectWhenAborted(options.signal)
      }
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest
    const view = renderLayout(apiRequest, user(1, 'owner-a@example.com'))
    const panel = await openNotifications(1)
    fireEvent.click(within(panel).getAllByRole('button')[0])
    await waitFor(() => expect(ownerAReadSignal).toBeDefined())

    view.rerender(layout(apiRequest, user(2, 'owner-b@example.com')))

    await waitFor(() => expect(ownerAReadSignal?.aborted).toBe(true))
    await waitFor(() => expect(listCalls).toBe(3))
    expect(await screen.findByText('Owner B after abort')).toBeInTheDocument()
    expect(screen.queryByText('Owner A mutation')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not let a stale refresh reinsert an item while its delete is pending', async () => {
    const item = notification('refresh', 'Refresh race')
    const staleRefresh = deferred<unknown>()
    const pendingDelete = deferred<unknown>()
    let listCalls = 0
    const apiRequest = vi.fn((path: string, options?: { method?: string }) => {
      if (isNotificationList(path)) {
        listCalls += 1
        return listCalls === 3
          ? staleRefresh.promise
          : Promise.resolve(listSuccess([item]))
      }
      if (options?.method === 'DELETE') return pendingDelete.promise
      return Promise.reject(new Error(`Unexpected request: ${options?.method ?? 'GET'} ${path}`))
    }) as unknown as AuthenticatedRequest

    renderLayout(apiRequest)
    await openNotifications(1)
    fireEvent.click(screen.getByLabelText(/Refresh race/))
    expect(screen.queryByText('Refresh race')).not.toBeInTheDocument()

    fireEvent.click(notificationTrigger())
    fireEvent.click(notificationTrigger())
    await waitFor(() => expect(listCalls).toBe(3))
    await act(async () => {
      staleRefresh.resolve(listSuccess([item]))
      await staleRefresh.promise
    })

    expect(screen.queryByText('Refresh race')).not.toBeInTheDocument()
    await act(async () => {
      pendingDelete.resolve(success(null))
      await pendingDelete.promise
    })
    expect(screen.queryByText('Refresh race')).not.toBeInTheDocument()
  })
})

function renderLayout(
  apiRequest: AuthenticatedRequest,
  currentUser = user(1, 'owner@example.com'),
) {
  return render(layout(apiRequest, currentUser))
}

function layout(apiRequest: AuthenticatedRequest, currentUser: AuthUser) {
  const value: AuthContextValue = {
    apiRequest,
    checkEmailAvailability: vi.fn(),
    clearGoogleSignup: vi.fn(),
    isAuthenticated: true,
    isInitializing: false,
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    logoutReason: null,
    pendingGoogleIdToken: null,
    prepareGoogleSignup: vi.fn(),
    rawApiRequest: vi.fn(),
    setExamInProgress: vi.fn(),
    signup: vi.fn(),
    updateUser: vi.fn(),
    user: currentUser,
    withdraw: vi.fn(),
  }

  return (
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={['/classrooms']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/classrooms" element={<main>Classrooms</main>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

async function openNotifications(unreadCount: number) {
  await waitFor(() => {
    expect(notificationTrigger()).toHaveAttribute(
      'aria-label',
      expect.stringContaining(String(unreadCount)),
    )
  })
  fireEvent.click(notificationTrigger())
  return screen.findByRole('dialog')
}

function notificationTrigger() {
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')
  if (!trigger) throw new Error('Notification trigger was not rendered.')
  return trigger
}

function unreadIndicator(title: string) {
  return screen.getByText(title).parentElement?.querySelector('[aria-label="읽지 않음"]') ?? null
}

function isNotificationList(path: string) {
  return path === '/api/users/me/notifications?page=0&size=20'
}

function user(id: number, email: string): AuthUser {
  return { email, id, name: email, role: 'LEARNER' }
}

function notification(id: string, title: string) {
  return {
    body: `${title} body`,
    createdAt: '2026-10-02T00:00:00Z',
    link: {},
    notificationId: id,
    readAt: null as string | null,
    title,
    type: 'NOTICE_PUBLISHED' as const,
  }
}

function listSuccess(items: ReturnType<typeof notification>[]) {
  return success({
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: 1,
  })
}

function success<T>(data: T) {
  return { data, message: 'OK', success: true as const }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function rejectWhenAborted(signal?: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    if (!signal) {
      reject(new Error('Expected an abort signal.'))
      return
    }
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true },
    )
  })
}
