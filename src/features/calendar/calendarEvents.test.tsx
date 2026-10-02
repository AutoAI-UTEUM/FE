import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApiSuccess } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'
import { useCalendarEvents } from './calendarEvents'

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

function schedule(scheduleId: string) {
  return {
    endsAt: '2026-10-02T10:00:00Z',
    hasTime: true,
    kind: 'PERSONAL' as const,
    scheduleId,
    startsAt: '2026-10-02T09:00:00Z',
    title: `일정 ${scheduleId}`,
  }
}

type ListResponse = ApiSuccess<{ items: ReturnType<typeof schedule>[] }>

describe('useCalendarEvents', () => {
  it('distinguishes the initial load from a successful empty result, including owner ID zero', async () => {
    const pending = deferred<ListResponse>()
    const request = vi.fn().mockReturnValue(pending.promise)
    const { result } = renderHook(() => useCalendarEvents(0, request as AuthenticatedRequest))

    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: false, isLoading: true })
    await act(async () => pending.resolve(success({ items: [] })))
    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: true, isLoading: false })
  })

  it('clears an initial failure on retry and displays the successful response', async () => {
    const error = new Error('서버에 연결할 수 없습니다.')
    const pending = deferred<ListResponse>()
    const request = vi.fn().mockRejectedValueOnce(error).mockReturnValueOnce(pending.promise)
    const { result } = renderHook(() => useCalendarEvents('owner', request as AuthenticatedRequest))
    await waitFor(() => expect(result.current.error).toBe(error))
    expect(result.current).toMatchObject({ events: [], hasLoaded: false, isLoading: false })

    act(() => result.current.reload())
    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: false, isLoading: true })
    await act(async () => pending.resolve(success({ items: [schedule('retry')] })))
    expect(result.current).toMatchObject({ error: null, hasLoaded: true, isLoading: false })
    expect(result.current.events[0].id).toBe('remote-retry')
  })

  it('preserves known events during a reload and failure, then accepts a truly empty response', async () => {
    const pending = deferred<ListResponse>()
    const request = vi.fn()
      .mockResolvedValueOnce(success({ items: [schedule('cached')] }))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(success({ items: [] }))
    const { result } = renderHook(() => useCalendarEvents('owner', request as AuthenticatedRequest))
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))

    act(() => result.current.reload())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.events[0].id).toBe('remote-cached')
    await act(async () => pending.reject(new Error('새로고침 실패')))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.hasLoaded).toBe(true)
    expect(result.current.events[0].id).toBe('remote-cached')

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: true })
  })

  it('ignores an older successful response when a newer reload is still pending', async () => {
    const older = deferred<ListResponse>()
    const newer = deferred<ListResponse>()
    const request = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const { result } = renderHook(() => useCalendarEvents('owner', request as AuthenticatedRequest))
    const firstSignal = request.mock.calls[0][1].signal as AbortSignal
    act(() => result.current.reload())
    expect(firstSignal.aborted).toBe(true)

    await act(async () => older.resolve(success({ items: [schedule('stale')] })))
    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: false, isLoading: true })
    await act(async () => newer.resolve(success({ items: [schedule('current')] })))
    expect(result.current.events[0].id).toBe('remote-current')
  })

  it.each(['success', 'failure'])('invalidates an older %s synchronously when reload is batched with its reply', async (outcome) => {
    const older = deferred<ListResponse>()
    const newer = deferred<ListResponse>()
    const request = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const { result } = renderHook(() => useCalendarEvents('owner', request as AuthenticatedRequest))

    await act(async () => {
      result.current.reload()
      if (outcome === 'success') older.resolve(success({ items: [schedule('stale')] }))
      else older.reject(new Error('stale failure'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(request).toHaveBeenCalledTimes(2)
    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: false, isLoading: true })
    await act(async () => newer.resolve(success({ items: [schedule('current')] })))
    expect(result.current.events[0].id).toBe('remote-current')
  })

  it('ignores an older rejection after the latest reload succeeds', async () => {
    const older = deferred<ListResponse>()
    const request = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(success({ items: [schedule('current')] }))
    const { result } = renderHook(() => useCalendarEvents('owner', request as AuthenticatedRequest))
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    await act(async () => older.reject(new Error('stale failure')))
    expect(result.current.error).toBeNull()
    expect(result.current.events[0].id).toBe('remote-current')
  })

  it('clears prior-owner events and ignores that owner’s late response', async () => {
    const oldReload = deferred<ListResponse>()
    const newLoad = deferred<ListResponse>()
    const request = vi.fn()
      .mockResolvedValueOnce(success({ items: [schedule('owner-a')] }))
      .mockReturnValueOnce(oldReload.promise)
      .mockReturnValueOnce(newLoad.promise)
    const { result, rerender } = renderHook(({ owner }) => useCalendarEvents(owner, request as AuthenticatedRequest), {
      initialProps: { owner: 'a' },
    })
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    act(() => result.current.reload())
    rerender({ owner: 'b' })
    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: false, isLoading: true })

    await act(async () => oldReload.resolve(success({ items: [schedule('late-owner-a')] })))
    expect(result.current).toMatchObject({ events: [], isLoading: true })
    await act(async () => newLoad.resolve(success({ items: [schedule('owner-b')] })))
    expect(result.current.events[0].id).toBe('remote-owner-b')
  })

  it('discards events and errors when the owner or request disappears', async () => {
    const request = vi.fn().mockResolvedValue(success({ items: [schedule('private')] }))
    const { result, rerender } = renderHook(({ owner, authenticatedRequest }: {
      owner: string | undefined
      authenticatedRequest: AuthenticatedRequest | undefined
    }) => useCalendarEvents(owner, authenticatedRequest), {
      initialProps: { owner: 'owner' as string | undefined, authenticatedRequest: request as AuthenticatedRequest | undefined },
    })
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    rerender({ owner: undefined, authenticatedRequest: request as AuthenticatedRequest })
    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: false, isLoading: false })
    rerender({ owner: 'owner', authenticatedRequest: request as AuthenticatedRequest })
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    rerender({ owner: 'owner', authenticatedRequest: undefined })
    expect(result.current).toMatchObject({ error: null, events: [], hasLoaded: false, isLoading: false })
  })

  it('keeps same-owner events during request replacement without accepting the stale request', async () => {
    const pending = deferred<ListResponse>()
    const firstRequest = vi.fn().mockResolvedValue(success({ items: [schedule('cached')] }))
    const nextRequest = vi.fn().mockReturnValue(pending.promise)
    const { result, rerender } = renderHook(({ request }) => useCalendarEvents('owner', request), {
      initialProps: { request: firstRequest as AuthenticatedRequest },
    })
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    rerender({ request: nextRequest as AuthenticatedRequest })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.events[0].id).toBe('remote-cached')
    await act(async () => pending.reject(new Error('temporary failure')))
    expect(result.current.events[0].id).toBe('remote-cached')
  })

  it('aborts on unmount and ignores a transport that resolves after cancellation', async () => {
    const pending = deferred<ListResponse>()
    const request = vi.fn().mockReturnValue(pending.promise)
    const { result, unmount } = renderHook(() => useCalendarEvents('owner', request as AuthenticatedRequest))
    const signal = request.mock.calls[0][1].signal as AbortSignal
    const beforeUnmount = result.current
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(success({ items: [schedule('late')] })))
    expect(result.current).toBe(beforeUnmount)
  })

  it('synchronizes mutations only with subscribers for the same owner', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(success({ items: [] }))
      .mockResolvedValueOnce(success({ items: [] }))
      .mockResolvedValueOnce(success({ items: [] }))
      .mockResolvedValueOnce(success(schedule('created')))
    const first = renderHook(() => useCalendarEvents('a', request as AuthenticatedRequest))
    const sameOwner = renderHook(() => useCalendarEvents('a', request as AuthenticatedRequest))
    const otherOwner = renderHook(() => useCalendarEvents('b', request as AuthenticatedRequest))
    await waitFor(() => expect(otherOwner.result.current.hasLoaded).toBe(true))
    await act(async () => { await first.result.current.addEvent(schedule('created')) })
    expect(first.result.current.events[0].id).toBe('remote-created')
    expect(sameOwner.result.current.events[0].id).toBe('remote-created')
    expect(otherOwner.result.current.events).toEqual([])
  })

  it.each(['success', 'failure'])('cancels a late mutation %s after its owner changes', async (outcome) => {
    const pending = deferred<ApiSuccess<ReturnType<typeof schedule>>>()
    const request = vi.fn()
      .mockResolvedValueOnce(success({ items: [] }))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(success({ items: [] }))
    const { result, rerender, unmount } = renderHook(({ owner }) => useCalendarEvents(owner, request as AuthenticatedRequest), {
      initialProps: { owner: 'a' },
    })
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    const mutation = result.current.addEvent(schedule('late'))
    const rejected = expect(mutation).rejects.toMatchObject({ name: 'AbortError' })
    rerender({ owner: 'b' })
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    await act(async () => {
      if (outcome === 'success') pending.resolve(success(schedule('late')))
      else pending.reject(new Error('late mutation error'))
      await rejected
    })
    expect(result.current.events).toEqual([])
    const addAfterUnmount = result.current.addEvent
    unmount()
    await expect(addAfterUnmount(schedule('later'))).rejects.toMatchObject({ name: 'AbortError' })
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('does not let a pending list overwrite successful create, update, or delete results', async () => {
    const pending = deferred<ListResponse>()
    const request = vi.fn()
      .mockResolvedValueOnce(success({ items: [schedule('existing'), schedule('deleted')] }))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(success(schedule('created')))
      .mockResolvedValueOnce(success({ ...schedule('existing'), title: '수정된 일정' }))
      .mockResolvedValueOnce(success(null))
    const { result } = renderHook(() => useCalendarEvents('owner', request as AuthenticatedRequest))
    await waitFor(() => expect(result.current.hasLoaded).toBe(true))
    const [existing, deleted] = result.current.events
    act(() => result.current.reload())
    await act(async () => {
      await result.current.addEvent(schedule('created'))
      await result.current.updateEvent(existing, { title: '수정된 일정' })
      await result.current.removeEvent(deleted)
    })
    await act(async () => pending.resolve(success({ items: [schedule('existing'), schedule('deleted')] })))
    expect(result.current.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'remote-created' }),
      expect.objectContaining({ id: 'remote-existing', title: '수정된 일정' }),
    ]))
    expect(result.current.events).toHaveLength(2)
  })
})
