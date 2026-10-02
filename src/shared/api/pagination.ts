import { ApiClientError } from './ApiClientError'
import type { PagedResponse } from './contracts'

const MAX_ALL_PAGES = 1_000

interface FetchAllPagesOptions<T> {
  getKey: (item: T) => PropertyKey
  loadPage: (page: number) => Promise<PagedResponse<T>>
  signal?: AbortSignal
}

type PageSnapshot = Pick<PagedResponse<unknown>, 'size' | 'totalElements' | 'totalPages'>

/**
 * Reads a bounded snapshot of a paginated endpoint sequentially.
 *
 * The first response fixes the number of pages to read so concurrent inserts
 * cannot extend the loop. Results are only returned after every page succeeds.
 */
export async function fetchAllPages<T>({
  getKey,
  loadPage,
  signal,
}: FetchAllPagesOptions<T>): Promise<T[]> {
  const readPage = async (page: number, snapshot?: PageSnapshot) => {
    signal?.throwIfAborted()
    const response = await loadPage(page)
    signal?.throwIfAborted()
    validatePage(response, page, snapshot)
    return response
  }

  const first = await readPage(0)
  const snapshot: PageSnapshot = {
    size: first.size,
    totalElements: first.totalElements,
    totalPages: first.totalPages,
  }
  const items = new Map<PropertyKey, T>()
  addItems(items, first.items, getKey)

  for (let page = 1; page < first.totalPages; page += 1) {
    const response = await readPage(page, snapshot)
    addItems(items, response.items, getKey)
  }

  if (items.size !== first.totalElements) throw invalidPageResponse()
  return [...items.values()]
}

function addItems<T>(
  destination: Map<PropertyKey, T>,
  items: T[],
  getKey: (item: T) => PropertyKey,
) {
  for (const item of items) {
    const key = getKey(item)
    if (destination.has(key)) throw invalidPageResponse()
    destination.set(key, item)
  }
}

function validatePage<T>(
  response: PagedResponse<T>,
  expectedPage: number,
  snapshot?: PageSnapshot,
) {
  const validMetadata =
    Array.isArray(response.items) &&
    Number.isSafeInteger(response.page) &&
    response.page === expectedPage &&
    Number.isSafeInteger(response.size) &&
    response.size > 0 &&
    Number.isSafeInteger(response.totalElements) &&
    response.totalElements >= 0 &&
    Number.isSafeInteger(response.totalPages) &&
    response.totalPages >= 0 &&
    response.totalPages <= MAX_ALL_PAGES

  const calculatedTotalPages = validMetadata && response.totalElements > 0
    ? Math.ceil(response.totalElements / response.size)
    : 0
  const expectedItemCount = validMetadata
    ? Math.min(
        response.size,
        Math.max(0, response.totalElements - expectedPage * response.size),
      )
    : -1
  const validBounds = validMetadata &&
    response.totalPages === calculatedTotalPages &&
    response.items.length === expectedItemCount &&
    (response.totalPages === 0 || expectedPage < response.totalPages) &&
    (!snapshot || (
      response.size === snapshot.size &&
      response.totalElements === snapshot.totalElements &&
      response.totalPages === snapshot.totalPages
    ))

  if (!validBounds) throw invalidPageResponse()
}

function invalidPageResponse() {
  return new ApiClientError({
    code: 'INVALID_PAGE_RESPONSE',
    message: '목록을 불러오지 못했습니다. 다시 시도해 주세요.',
  })
}
