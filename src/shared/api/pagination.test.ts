import { describe, expect, it, vi } from 'vitest'

import type { PagedResponse } from './contracts'
import { fetchAllPages } from './pagination'

interface Item {
  id: number
  label: string
}

function makeItems(start: number, count: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    id: start + index,
    label: `fixture-${start + index}`,
  }))
}

function page(
  pageIndex: number,
  items: Item[],
  totalElements: number,
  totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / 100),
): PagedResponse<Item> {
  return { items, page: pageIndex, size: 100, totalElements, totalPages }
}

describe('fetchAllPages', () => {
  it.each([
    { count: 0, expectedCalls: 1 },
    { count: 100, expectedCalls: 1 },
    { count: 101, expectedCalls: 2 },
    { count: 200, expectedCalls: 2 },
  ])('loads all $count records with $expectedCalls sequential request(s)', async ({ count, expectedCalls }) => {
    let activeRequests = 0
    let maxActiveRequests = 0
    const loadPage = vi.fn(async (pageIndex: number) => {
      activeRequests += 1
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
      await Promise.resolve()
      const start = pageIndex * 100
      const response = page(pageIndex, makeItems(start, Math.min(100, count - start)), count)
      activeRequests -= 1
      return response
    })

    const result = await fetchAllPages({ getKey: (item: Item) => item.id, loadPage })

    expect(result).toHaveLength(count)
    expect(loadPage).toHaveBeenCalledTimes(expectedCalls)
    expect(maxActiveRequests).toBe(1)
  })

  it('rejects a follow-up failure without returning a partial list', async () => {
    const loadPage = vi.fn()
      .mockResolvedValueOnce(page(0, makeItems(0, 100), 101))
      .mockRejectedValueOnce(new Error('500'))

    await expect(fetchAllPages({ getKey: (item: Item) => item.id, loadPage }))
      .rejects.toThrow('500')
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('does not request another page after abort, even when the request ignores the signal', async () => {
    const controller = new AbortController()
    const loadPage = vi.fn(async () => {
      controller.abort()
      return page(0, makeItems(0, 100), 200)
    })

    await expect(fetchAllPages({
      getKey: (item: Item) => item.id,
      loadPage,
      signal: controller.signal,
    })).rejects.toThrow()
    expect(loadPage).toHaveBeenCalledOnce()
  })

  it('rejects duplicate records instead of returning an incomplete list', async () => {
    const loadPage = vi.fn()
      .mockResolvedValueOnce(page(0, makeItems(1, 100), 200))
      .mockResolvedValueOnce(page(1, makeItems(100, 100), 200))

    await expect(fetchAllPages({ getKey: (item: Item) => item.id, loadPage }))
      .rejects.toMatchObject({ code: 'INVALID_PAGE_RESPONSE' })
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('rejects truncated follow-up pages and metadata drift', async () => {
    const truncatedPage = vi.fn()
      .mockResolvedValueOnce(page(0, makeItems(0, 100), 200))
      .mockResolvedValueOnce(page(1, [], 200))
    const driftingMetadata = vi.fn()
      .mockResolvedValueOnce(page(0, makeItems(0, 100), 200))
      .mockResolvedValueOnce(page(1, makeItems(100, 100), 300, 3))

    await expect(fetchAllPages({ getKey: (item: Item) => item.id, loadPage: truncatedPage }))
      .rejects.toMatchObject({ code: 'INVALID_PAGE_RESPONSE' })
    await expect(fetchAllPages({ getKey: (item: Item) => item.id, loadPage: driftingMetadata }))
      .rejects.toMatchObject({ code: 'INVALID_PAGE_RESPONSE' })
  })

  it.each([NaN, Infinity, -1, 1.5, 1_001])('rejects invalid totalPages %s', async (totalPages) => {
    const loadPage = vi.fn().mockResolvedValue(page(0, [], 0, totalPages))

    await expect(fetchAllPages({ getKey: (item: Item) => item.id, loadPage }))
      .rejects.toMatchObject({ code: 'INVALID_PAGE_RESPONSE' })
    expect(loadPage).toHaveBeenCalledOnce()
  })

  it('rejects repeated pages and inconsistent totals', async () => {
    const repeatedPage = vi.fn()
      .mockResolvedValueOnce(page(0, makeItems(0, 100), 101))
      .mockResolvedValueOnce(page(0, makeItems(100, 1), 101))
    const inconsistentTotal = vi.fn().mockResolvedValue(page(0, [], 101, 1))

    await expect(fetchAllPages({ getKey: (item: Item) => item.id, loadPage: repeatedPage }))
      .rejects.toMatchObject({ code: 'INVALID_PAGE_RESPONSE' })
    await expect(fetchAllPages({ getKey: (item: Item) => item.id, loadPage: inconsistentTotal }))
      .rejects.toMatchObject({ code: 'INVALID_PAGE_RESPONSE' })
  })
})
