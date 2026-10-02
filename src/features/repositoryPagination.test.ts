import { describe, expect, it, vi } from 'vitest'

import type { PagedResponse } from '../shared/api'
import type { AuthenticatedRequest } from './auth'
import { createClassroomsRepository } from './classrooms'
import { createReportsRepository } from './reports'

function paged<T>(page: number, items: T[], totalElements: number) {
  return {
    data: {
      items,
      page,
      size: 100,
      totalElements,
      totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / 100),
    } satisfies PagedResponse<T>,
  }
}

function requestedPage(path: string) {
  return Number(new URL(path, 'https://fixture.invalid').searchParams.get('page'))
}

describe('repository pagination', () => {
  it('loads and maps all classroom students beyond the first 100', async () => {
    const students = Array.from({ length: 101 }, (_, index) => ({
      email: `student-${index + 1}@fixture.invalid`,
      joinedAt: '2026-01-01T00:00:00Z',
      name: `fixture-student-${index + 1}`,
      status: 'ACTIVE',
      studentId: index + 1,
    }))
    const request = vi.fn(async (path: string) => {
      const page = requestedPage(path)
      return paged(page, students.slice(page * 100, (page + 1) * 100), students.length)
    })

    const result = await createClassroomsRepository(request as unknown as AuthenticatedRequest)
      .listStudents('classroom/12', { query: ' fixture ', sort: 'NAME' })

    expect(result).toHaveLength(101)
    expect(result.at(-1)?.id).toBe('101')
    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/classrooms/classroom%2F12/students?page=0&size=100&q=fixture&sort=NAME',
      { signal: undefined },
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/classrooms/classroom%2F12/students?page=1&size=100&q=fixture&sort=NAME',
      { signal: undefined },
    )
  })

  it('loads all 200 join requests with the requested status', async () => {
    const requests = Array.from({ length: 200 }, (_, index) => ({
      requestedAt: '2026-01-01T00:00:00Z',
      requestId: index + 1,
      status: 'PENDING' as const,
    }))
    const request = vi.fn(async (path: string) => {
      const page = requestedPage(path)
      return paged(page, requests.slice(page * 100, (page + 1) * 100), requests.length)
    })

    const result = await createClassroomsRepository(request as unknown as AuthenticatedRequest)
      .listJoinRequests('12', 'PENDING')

    expect(result).toHaveLength(200)
    expect(result.at(-1)?.requestId).toBe('200')
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/classrooms/12/join-requests?status=PENDING&page=1&size=100',
      { signal: undefined },
    )
  })

  it('loads and maps all report students beyond the first 100', async () => {
    const students = Array.from({ length: 101 }, (_, index) => ({
      email: `report-student-${index + 1}@fixture.invalid`,
      name: `fixture-report-student-${index + 1}`,
      studentId: index + 1,
    }))
    const request = vi.fn(async (path: string) => {
      const page = requestedPage(path)
      return paged(page, students.slice(page * 100, (page + 1) * 100), students.length)
    })

    const result = await createReportsRepository(request as unknown as AuthenticatedRequest)
      .listStudents('classroom/12')

    expect(result).toHaveLength(101)
    expect(result.at(-1)?.id).toBe('101')
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/classrooms/classroom%2F12/students?page=1&size=100',
      { signal: undefined },
    )
  })

  it('propagates a follow-up page failure without returning report students', async () => {
    const students = Array.from({ length: 100 }, (_, index) => ({
      email: `report-student-${index + 1}@fixture.invalid`,
      name: `fixture-report-student-${index + 1}`,
      studentId: index + 1,
    }))
    const request = vi.fn()
      .mockResolvedValueOnce(paged(0, students, 101))
      .mockRejectedValueOnce(new Error('follow-up 500'))

    await expect(createReportsRepository(request as unknown as AuthenticatedRequest)
      .listStudents('12')).rejects.toThrow('follow-up 500')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('forwards abort and stops before a second join-request page', async () => {
    const controller = new AbortController()
    const requests = Array.from({ length: 100 }, (_, index) => ({
      requestedAt: '2026-01-01T00:00:00Z',
      requestId: index + 1,
      status: 'PENDING' as const,
    }))
    const request = vi.fn(async () => {
      controller.abort()
      return paged(0, requests, 200)
    })

    await expect(createClassroomsRepository(request as unknown as AuthenticatedRequest)
      .listJoinRequests('12', 'PENDING', controller.signal)).rejects.toThrow()
    expect(request).toHaveBeenCalledWith(
      '/api/classrooms/12/join-requests?status=PENDING&page=0&size=100',
      { signal: controller.signal },
    )
    expect(request).toHaveBeenCalledOnce()
  })
})
