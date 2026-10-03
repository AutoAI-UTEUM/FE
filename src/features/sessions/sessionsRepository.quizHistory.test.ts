import { describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'
import { createSessionsRepository } from './sessionsRepository'

const success = <T,>(data: T) => ({ data, message: '', success: true as const })
const quiz = (quizId: number | string, createdAt = '2026-10-03T00:00:00Z') => ({
  createdAt,
  page: 7,
  quizId,
  quizType: 'MCQ',
  title: `Quiz ${quizId}`,
})
const paged = (
  page: number,
  quizzes: ReturnType<typeof quiz>[],
  totalElements: number,
  overrides: Record<string, unknown> = {},
) => success({
  hasNext: page + 1 < Math.ceil(totalElements / 100),
  page,
  quizzes,
  size: 100,
  totalElements,
  totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / 100),
  ...overrides,
})

describe('session quiz history pagination', () => {
  it('keeps listQuizzes as a single-page read even when pagination metadata is present', async () => {
    const request = vi.fn().mockResolvedValue(paged(0, [quiz(1)], 101))
    const repository = createSessionsRepository(request as AuthenticatedRequest)

    await expect(repository.listQuizzes('10')).resolves.toEqual([
      expect.objectContaining({ quizId: '1' }),
    ])
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/sessions/10/quizzes', {
      signal: undefined,
    })
  })

  it('keeps metadata-free legacy responses to one queryless request', async () => {
    const request = vi.fn().mockResolvedValue(success({ items: [quiz('legacy')] }))
    const repository = createSessionsRepository(request as AuthenticatedRequest)

    await expect(repository.listQuizHistory('session / 1')).resolves.toEqual([
      expect.objectContaining({ page: 7, quizId: 'legacy' }),
    ])
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('/api/sessions/session%20%2F%201/quizzes', {
      signal: undefined,
    })
  })

  it('follows complete metadata, tolerates moving totals, and de-duplicates offset repeats', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(paged(0, [quiz('90071992547409931'), quiz('8')], 101))
      .mockResolvedValueOnce(paged(1, [quiz('8'), quiz('7')], 201, { hasNext: true }))
      .mockResolvedValueOnce(paged(2, [quiz('6')], 201))
    const repository = createSessionsRepository(request as AuthenticatedRequest)

    await expect(repository.listQuizHistory('10')).resolves.toEqual([
      expect.objectContaining({ quizId: '90071992547409931' }),
      expect.objectContaining({ quizId: '8' }),
      expect.objectContaining({ quizId: '7' }),
      expect.objectContaining({ quizId: '6' }),
    ])
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/sessions/10/quizzes',
      '/api/sessions/10/quizzes?page=1&size=100',
      '/api/sessions/10/quizzes?page=2&size=100',
    ])
  })

  it('does not infer another page from a full legacy response', async () => {
    const quizzes = Array.from({ length: 100 }, (_, index) => quiz(index + 1))
    const request = vi.fn().mockResolvedValue(success({ quizzes }))

    await expect(createSessionsRepository(request as AuthenticatedRequest).listQuizHistory('10'))
      .resolves.toHaveLength(100)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['partial metadata', success({ page: 0, quizzes: [quiz(1)] })],
    ['wrong page', paged(1, [quiz(1)], 1)],
    ['zero size', paged(0, [quiz(1)], 1, { size: 0 })],
    ['oversized page', paged(0, [quiz(1)], 1, { size: 101 })],
    ['non-boolean hasNext', paged(0, [quiz(1)], 101, { hasNext: 'true' })],
  ])('rejects %s instead of returning a partial history', async (_label, response) => {
    const request = vi.fn().mockResolvedValue(response)

    await expect(createSessionsRepository(request as AuthenticatedRequest).listQuizHistory('10'))
      .rejects.toMatchObject({ code: 'INVALID_QUIZ_HISTORY_PAGE' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['500', new ApiClientError({ code: 'SERVER_ERROR', message: '500', status: 500 })],
    ['429', new ApiClientError({ code: 'RATE_LIMITED', message: '429', status: 429 })],
    ['network', new TypeError('Failed to fetch')],
  ])('fails the whole session history when page 2 returns %s', async (_label, error) => {
    const request = vi.fn()
      .mockResolvedValueOnce(paged(0, [quiz(3)], 201))
      .mockResolvedValueOnce(paged(1, [quiz(2)], 201))
      .mockRejectedValueOnce(error)

    await expect(createSessionsRepository(request as AuthenticatedRequest).listQuizHistory('10'))
      .rejects.toBe(error)
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('does not issue another page request after an ignored abort', async () => {
    const controller = new AbortController()
    const request = vi.fn().mockImplementation(async () => {
      controller.abort()
      return paged(0, [quiz(1)], 101)
    })

    await expect(createSessionsRepository(request as AuthenticatedRequest)
      .listQuizHistory('10', controller.signal)).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('fails at the explicit page cap instead of hiding a truncated success', async () => {
    const request = vi.fn().mockImplementation(async (path: string) => {
      const url = new URL(path, 'https://example.test')
      const page = Number(url.searchParams.get('page') ?? 0)
      return paged(page, [], 10_001)
    })

    await expect(createSessionsRepository(request as AuthenticatedRequest).listQuizHistory('10'))
      .rejects.toMatchObject({ code: 'INVALID_QUIZ_HISTORY_PAGE' })
    expect(request).toHaveBeenCalledTimes(100)
  })
})
