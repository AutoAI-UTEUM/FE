import { describe, expect, it, vi } from 'vitest'

import type { ApiSuccess } from '../shared/api'
import type { AuthenticatedRequest } from './auth'
import { createCalendarRepository } from './calendar'
import { createClassroomsRepository } from './classrooms'

describe('2026-08-04 API additions', () => {
  it('connects personal schedule create, update, and delete', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(success({
        endsAt: '2026-08-05T10:00:00Z',
        hasTime: true,
        kind: 'PERSONAL',
        scheduleId: 'schedule-1',
        startsAt: '2026-08-05T09:00:00Z',
        title: '면담',
      }))
      .mockResolvedValueOnce(success({
        endsAt: '2026-08-05T11:00:00Z',
        hasTime: true,
        kind: 'PERSONAL',
        scheduleId: 'schedule-1',
        startsAt: '2026-08-05T09:00:00Z',
        title: '면담 변경',
      }))
      .mockResolvedValueOnce(success(null))
    const repository = createCalendarRepository(request as AuthenticatedRequest)

    const created = await repository.create({
      endsAt: '2026-08-05T10:00:00Z',
      hasTime: true,
      startsAt: '2026-08-05T09:00:00Z',
      title: '면담',
    })
    await repository.update(created.backendId, { title: '면담 변경' })
    await repository.remove(created.backendId)

    expect(request).toHaveBeenNthCalledWith(1, '/api/users/me/schedule', {
      body: {
        endsAt: '2026-08-05T10:00:00Z',
        hasTime: true,
        startsAt: '2026-08-05T09:00:00Z',
        title: '면담',
      },
      method: 'POST',
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/users/me/schedule/schedule-1', {
      body: { title: '면담 변경' },
      method: 'PATCH',
    })
    expect(request).toHaveBeenNthCalledWith(3, '/api/users/me/schedule/schedule-1', {
      method: 'DELETE',
    })
  })

  it('connects classroom analytics, week state/order, and student management', async () => {
    const week = {
      averageProgressRate: 21,
      displayOrder: 1,
      materials: [],
      status: 'BREAK',
      title: '휴강',
      weekId: 91,
      weekNumber: 1,
    }
    const request = vi.fn()
      .mockResolvedValueOnce(success({ ...week }))
      .mockResolvedValueOnce(success({ items: [week] }))
      .mockResolvedValueOnce(success({
        aiQuestionCountLast7Days: 11,
        averageProgressRate: 42,
        inactiveLearnerCountLast7Days: 3,
        lastUpdatedAt: '2026-08-04T12:00:00Z',
        learnerCount: 20,
        materials: [{ averageProgressRate: 38, materialId: 10, title: '자료.pdf', viewerCount: 15, viewRate: 75 }],
        questionsByPage: [{ materialId: 10, pageNumber: 3, questionCount: 8 }],
      }))
      .mockResolvedValueOnce(success({
        items: [{ affiliation: '서울대학교', email: 'student@example.com', joinedAt: '2026-08-01T00:00:00Z', name: '학습자', status: 'ACTIVE', studentId: 7 }],
        page: 0, size: 100, totalElements: 1, totalPages: 1,
      }))
      .mockResolvedValueOnce(success(null))
    const repository = createClassroomsRepository(request as AuthenticatedRequest)

    await expect(repository.changeWeekStatus('12', '91', 'BREAK')).resolves.toMatchObject({ id: '91', status: 'BREAK' })
    await repository.reorderWeeks('12', ['91'])
    await expect(repository.getAnalytics('12')).resolves.toMatchObject({ materials: [{ id: '10' }], questionsByPage: [{ materialId: '10' }] })
    await expect(repository.listStudents('12', { query: '학습', sort: 'LOW_PROGRESS' })).resolves.toMatchObject([{ id: '7', name: '학습자' }])
    await repository.removeStudent('12', '7')

    expect(request).toHaveBeenNthCalledWith(1, '/api/classrooms/12/weeks/91/status', { body: { status: 'BREAK' }, method: 'PATCH' })
    expect(request).toHaveBeenNthCalledWith(2, '/api/classrooms/12/weeks/reorder', { body: { orderedWeekIds: [91] }, method: 'PATCH' })
    expect(request).toHaveBeenNthCalledWith(3, '/api/classrooms/12/analytics', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(4, '/api/classrooms/12/students?page=0&size=100&q=%ED%95%99%EC%8A%B5&sort=LOW_PROGRESS', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(5, '/api/classrooms/12/students/7', { method: 'DELETE' })
  })

  it('sends the expanded classroom date update contract', async () => {
    const request = vi.fn().mockResolvedValue(success({
      classroomId: 12,
      color: 'BLUE',
      endDate: '2026-11-22',
      instructorName: '강의자',
      name: '자료구조',
      startDate: '2026-08-10',
      status: 'ACTIVE',
      weekCount: 15,
    }))
    const repository = createClassroomsRepository(request as AuthenticatedRequest)

    await repository.update('12', {
      endDate: '2026-11-22',
      shiftWeekReleaseDates: true,
      startDate: '2026-08-10',
    })

    expect(request).toHaveBeenCalledWith('/api/classrooms/12', {
      body: {
        endDate: '2026-11-22',
        shiftWeekReleaseDates: true,
        startDate: '2026-08-10',
      },
      method: 'PATCH',
    })
  })
})

function success<T>(data: T): ApiSuccess<T> {
  return { data, message: 'ok', success: true }
}
