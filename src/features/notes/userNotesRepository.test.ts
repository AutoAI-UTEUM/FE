import { describe, expect, it, vi } from 'vitest'

import type { ApiSuccess, PagedResponse } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'
import { createUserNotesRepository } from './userNotesRepository'

interface NoteDto {
  content: string
  createdAt: string
  id: number
  title: string
  updatedAt: string
}

function notes(start: number, count: number): NoteDto[] {
  return Array.from({ length: count }, (_, index) => {
    const id = start + index + 1
    return {
      content: `content-${id}`,
      createdAt: '2026-10-01T00:00:00Z',
      id,
      title: `note-${id}`,
      updatedAt: '2026-10-01T00:00:00Z',
    }
  })
}

function page(
  pageIndex: number,
  items: NoteDto[],
  totalElements: number,
  totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / 100),
): PagedResponse<NoteDto> {
  return { items, page: pageIndex, size: 100, totalElements, totalPages }
}

function success<T>(data: T): ApiSuccess<T> {
  return { data, message: '정상', success: true }
}

function pagedRequest(totalElements: number) {
  return vi.fn(async (path: string) => {
    const pageIndex = Number(new URL(path, 'https://example.test').searchParams.get('page'))
    const start = pageIndex * 100
    return success(
      page(
        pageIndex,
        notes(start, Math.min(100, totalElements - start)),
        totalElements,
      ),
    )
  })
}

describe('user notes repository pagination', () => {
  it.each([0, 1, 100, 101, 251])(
    'loads all %i manual notes in stable server order',
    async (count) => {
      const request = pagedRequest(count)
      const repository = createUserNotesRepository(request as AuthenticatedRequest)

      const result = await repository.list()

      expect(result).toHaveLength(count)
      expect(result.map((note) => note.id)).toEqual(
        Array.from({ length: count }, (_, index) => String(index + 1)),
      )
      expect(request).toHaveBeenCalledTimes(Math.max(1, Math.ceil(count / 100)))
      expect(request).toHaveBeenLastCalledWith(
        `/api/user-notes?page=${Math.max(0, Math.ceil(count / 100) - 1)}&size=100`,
        { signal: undefined },
      )
    },
  )

  it('loads every wrong-answer page using the same bounded contract', async () => {
    const request = vi.fn(async (path: string) => {
      const pageIndex = Number(new URL(path, 'https://example.test').searchParams.get('page'))
      const count = pageIndex === 0 ? 100 : 1
      return success({
        items: Array.from({ length: count }, (_, index) => {
          const id = pageIndex * 100 + index + 1
          return {
            createdAt: '2026-10-01T00:00:00Z',
            id,
            quizResultRef: `submission:${id}`,
            updatedAt: '2026-10-01T00:00:00Z',
          }
        }),
        page: pageIndex,
        size: 100,
        totalElements: 101,
        totalPages: 2,
      })
    })
    const repository = createUserNotesRepository(request as AuthenticatedRequest)

    await expect(repository.listWrongAnswers()).resolves.toHaveLength(101)
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/wrong-answer-notes?page=1&size=100',
      { signal: undefined },
    )
  })

  it('rejects a later-page failure instead of exposing the first page as complete', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(success(page(0, notes(0, 100), 101)))
      .mockRejectedValueOnce(new Error('second page failed'))
    const repository = createUserNotesRepository(request as AuthenticatedRequest)

    await expect(repository.list()).rejects.toThrow('second page failed')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('rejects duplicate ids and invalid or unbounded page metadata', async () => {
    const duplicateRequest = vi.fn()
      .mockResolvedValueOnce(success(page(0, notes(0, 100), 101)))
      .mockResolvedValueOnce(success(page(1, notes(0, 1), 101)))
    const unboundedRequest = vi.fn().mockResolvedValue(
      success(page(0, [], 0, 1_001)),
    )

    await expect(
      createUserNotesRepository(duplicateRequest as AuthenticatedRequest).list(),
    ).rejects.toMatchObject({ code: 'INVALID_PAGE_RESPONSE' })
    await expect(
      createUserNotesRepository(unboundedRequest as AuthenticatedRequest).list(),
    ).rejects.toMatchObject({ code: 'INVALID_PAGE_RESPONSE' })
    expect(unboundedRequest).toHaveBeenCalledOnce()
  })

  it('stops before the next page when its owner aborts', async () => {
    const controller = new AbortController()
    const request = vi.fn(async () => {
      controller.abort()
      return success(page(0, notes(0, 100), 101))
    })
    const repository = createUserNotesRepository(request as AuthenticatedRequest)

    await expect(repository.list(controller.signal)).rejects.toThrow()
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith(
      '/api/user-notes?page=0&size=100',
      { signal: controller.signal },
    )
  })
})
