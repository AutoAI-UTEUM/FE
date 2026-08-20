import { describe, expect, it, vi } from 'vitest'

import type { ApiSuccess } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'
import { createNotificationsRepository } from './notificationsRepository'

describe('notifications repository', () => {
  it('connects list, read, and delete endpoints and normalizes resource ids', async () => {
    const dto = {
      body: '3주차 공지를 확인해 주세요.',
      createdAt: '2026-08-14T03:00:00Z',
      link: { classroomId: 30, noticeId: 70 },
      notificationId: 100,
      readAt: null,
      title: '중간고사 안내',
      type: 'NOTICE_PUBLISHED' as const,
    }
    const request = vi.fn()
      .mockResolvedValueOnce(success({
        items: [dto],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      }))
      .mockResolvedValueOnce(success({
        ...dto,
        readAt: '2026-08-14T03:01:00Z',
      }))
      .mockResolvedValueOnce(success(null))
    const repository = createNotificationsRepository(
      request as AuthenticatedRequest,
    )

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({
        id: '100',
        link: expect.objectContaining({ classroomId: '30', noticeId: '70' }),
        readAt: undefined,
      }),
    ])
    await expect(repository.markRead('100')).resolves.toMatchObject({
      id: '100',
      readAt: '2026-08-14T03:01:00Z',
    })
    await repository.delete('100')

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/users/me/notifications?page=0&size=20',
      { signal: undefined },
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/users/me/notifications/100/read',
      { method: 'PATCH', signal: undefined },
    )
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/api/users/me/notifications/100',
      { method: 'DELETE', signal: undefined },
    )
  })
})

function success<T>(data: T): ApiSuccess<T> {
  return { data, message: 'OK', success: true }
}
