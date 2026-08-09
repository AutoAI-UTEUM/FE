import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../auth'
import { createClassroomsRepository } from './classroomsRepository'

describe('classrooms repository', () => {
  it('maps classroom lists and sends the documented create body', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { items: [classroomDto], page: 0, size: 20, totalElements: 1, totalPages: 1 } })
      .mockResolvedValueOnce({ data: classroomDto })
    const repository = createClassroomsRepository(request as AuthenticatedRequest)

    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ id: '12', name: '자료구조', weekCount: 15 }),
    ])
    await repository.create({ color: 'BLUE', endDate: '2026-11-15', name: '자료구조', startDate: '2026-08-03' })

    expect(request).toHaveBeenNthCalledWith(1, '/api/classrooms?page=0&size=100&sort=RECENT', expect.any(Object))
    expect(request).toHaveBeenNthCalledWith(2, '/api/classrooms', expect.objectContaining({
      body: expect.objectContaining({ color: 'BLUE', endDate: '2026-11-15', startDate: '2026-08-03' }),
      method: 'POST',
    }))
  })

  it('sends only public partial-update fields', async () => {
    const request = vi.fn().mockResolvedValue({ data: classroomDto })
    const repository = createClassroomsRepository(request as AuthenticatedRequest)
    await repository.update('12', { description: '', name: '새 이름' })
    expect(request).toHaveBeenCalledWith('/api/classrooms/12', {
      body: { description: '', name: '새 이름' },
      method: 'PATCH',
    })
  })

  it('sends the classroom name when permanently deleting a classroom', async () => {
    const request = vi.fn().mockResolvedValue({ data: null })
    const repository = createClassroomsRepository(request as AuthenticatedRequest)

    await repository.deletePermanently('12', ' 자료구조 ')

    expect(request).toHaveBeenCalledWith('/api/classrooms/12/permanent', {
      body: { confirmName: '자료구조' },
      method: 'DELETE',
    })
  })

  it('maps legacy notices to global and sends an explicit week when supported', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { items: [{ classroomId: 12, content: '내용', createdAt: '2026-08-01', noticeId: 7, publishedAt: '2026-08-01', title: '공지', updatedAt: '2026-08-01' }] } })
      .mockResolvedValueOnce({ data: { classroomId: 12, content: '내용', createdAt: '2026-08-01', noticeId: 8, publishedAt: '2026-08-01', title: '주차 공지', updatedAt: '2026-08-01', weekNumber: 3 } })
    const repository = createClassroomsRepository(request as AuthenticatedRequest)

    await expect(repository.listNotices('12')).resolves.toEqual([expect.objectContaining({ id: '7', weekNumber: null })])
    await expect(repository.createNotice('12', { content: '내용', title: '주차 공지', weekNumber: 3 })).resolves.toEqual(expect.objectContaining({ id: '8', weekNumber: 3 }))
    expect(request).toHaveBeenNthCalledWith(2, '/api/classrooms/12/notices', {
      body: { content: '내용', title: '주차 공지', weekNumber: 3 },
      method: 'POST',
    })
  })
})

const classroomDto = {
  classroomId: 12,
  color: 'BLUE',
  endDate: '2026-11-15',
  instructorName: '박교수',
  learnerCount: 42,
  name: '자료구조',
  pendingRequestCount: 3,
  progressRate: 62,
  startDate: '2026-08-03',
  status: 'ACTIVE',
  weekCount: 15,
}
