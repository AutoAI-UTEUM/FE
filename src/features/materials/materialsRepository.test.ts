import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../auth'
import { createMaterialsRepository } from './materialsRepository'

const materialDto = {
  activeSessionId: 50,
  createdAt: '2026-10-01T00:00:00Z',
  materialId: 21,
  pageCount: 12,
  processingStatus: 'READY',
  title: '21번째 자료.pdf',
}

describe('materials pagination repository', () => {
  it('requests one bounded page and preserves pagination metadata and mapped records', async () => {
    const request = vi.fn().mockResolvedValue({
      data: { items: [materialDto], page: 1, size: 20, totalElements: 21, totalPages: 2 },
    })
    const signal = new AbortController().signal
    const repository = createMaterialsRepository(request as AuthenticatedRequest)

    await expect(repository.listPage(1, signal)).resolves.toEqual({
      items: [expect.objectContaining({ activeSessionId: '50', id: '21', pageCount: 12, status: 'READY' })],
      page: 1, size: 20, totalElements: 21, totalPages: 2,
    })
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/materials?page=1&size=20', { signal })
  })

  it('keeps list and refreshStatuses compatible with existing first-page array callers', async () => {
    const request = vi.fn().mockResolvedValue({
      data: { items: [materialDto], page: 0, size: 20, totalElements: 45, totalPages: 3 },
    })
    const signal = new AbortController().signal
    const repository = createMaterialsRepository(request as AuthenticatedRequest)

    await expect(repository.list(signal)).resolves.toEqual([expect.objectContaining({ id: '21' })])
    await expect(repository.refreshStatuses(signal)).resolves.toEqual([expect.objectContaining({ id: '21' })])
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenNthCalledWith(1, '/api/materials?page=0&size=20', { signal })
    expect(request).toHaveBeenNthCalledWith(2, '/api/materials?page=0&size=20', { signal })
  })

  it('preserves an empty page and defaults to page zero without eager requests', async () => {
    const data = { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }
    const request = vi.fn().mockResolvedValue({ data })
    const repository = createMaterialsRepository(request as AuthenticatedRequest)

    await expect(repository.listPage()).resolves.toEqual(data)
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/materials?page=0&size=20', { signal: undefined })
  })

  it.each([-1, 0.5, NaN, Infinity])('rejects invalid page %s without a request', async (page) => {
    const request = vi.fn()
    const repository = createMaterialsRepository(request as AuthenticatedRequest)

    await expect(repository.listPage(page)).rejects.toThrow(RangeError)
    expect(request).not.toHaveBeenCalled()
  })

  it('propagates page failures so callers can retry the same page', async () => {
    const error = new Error('temporarily unavailable')
    const request = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({
      data: { items: [materialDto], page: 1, size: 20, totalElements: 21, totalPages: 2 },
    })
    const repository = createMaterialsRepository(request as AuthenticatedRequest)

    await expect(repository.listPage(1)).rejects.toBe(error)
    await expect(repository.listPage(1)).resolves.toMatchObject({ page: 1, totalElements: 21 })
    expect(request).toHaveBeenCalledTimes(2)
  })
})
