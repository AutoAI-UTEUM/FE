import { describe, expect, it, vi } from 'vitest'
import type { AuthenticatedRequest } from '../auth'
import { createSessionsRepository } from './sessionsRepository'

const session = (id: number) => ({ sessionId: id, materialId: id, currentPage: 1, status: 'ACTIVE' })
const page = (index: number, ids: number[], totalPages = 1) => ({ success: true, message: '', data: { page: index, size: 20, items: ids.map(session), totalPages, totalElements: 40 } })
describe('session pagination', () => {
  it('uses the initial total bound and de-duplicates sessions across shifting pages', async () => {
    const request = vi.fn().mockResolvedValueOnce(page(0, [1, 2], 2)).mockResolvedValueOnce(page(1, [2, 3], 100))
    const sessions = await createSessionsRepository(request as AuthenticatedRequest).list()
    expect(sessions.map(({ id }) => id)).toEqual(['1', '2', '3'])
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls[1][0]).toBe('/api/sessions?page=1&size=20')
  })
  it('stops with a visible error instead of returning an incomplete list after a page failure', async () => {
    const request = vi.fn().mockResolvedValueOnce(page(0, [1], 2)).mockRejectedValueOnce(new Error('500'))
    await expect(createSessionsRepository(request as AuthenticatedRequest).list()).rejects.toThrow('500')
  })
  it.each([NaN, Infinity, -1, 1.5])('rejects invalid totalPages %s', async (total) => {
    const request = vi.fn().mockResolvedValue(page(0, [], total))
    await expect(createSessionsRepository(request as AuthenticatedRequest).list()).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('rejects repeated server pages instead of silently truncating', async () => {
    const request = vi.fn().mockResolvedValue(page(0, [1], 2))
    await expect(createSessionsRepository(request as AuthenticatedRequest).list()).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('does not request additional pages once aborted, even if a response ignores abort', async () => {
    const controller = new AbortController()
    const request = vi.fn().mockImplementation(async () => { controller.abort(); return page(0, [1], 3) })
    await expect(createSessionsRepository(request as AuthenticatedRequest).list(controller.signal)).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(1)
  })
})
