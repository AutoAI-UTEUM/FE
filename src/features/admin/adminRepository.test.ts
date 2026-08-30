import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../auth'
import { createAdminRepository } from './adminRepository'

describe('admin repository', () => {
  it('uses only the documented read endpoints and query values', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { items: [], page: 1, size: 20, totalElements: 0, totalPages: 0 } })
      .mockResolvedValueOnce({ data: { id: 7 } })
      .mockResolvedValueOnce({ data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } })
      .mockResolvedValueOnce({ data: { id: 12, members: [] } })
      .mockResolvedValueOnce({ data: { daily: [], features: [] } })
      .mockResolvedValueOnce({ data: { items: [] } })
    const repository = createAdminRepository(request as AuthenticatedRequest)

    await repository.listUsers({ page: 1, q: 'kim', role: 'LEARNER', size: 20, sort: 'NAME', status: 'ACTIVE' })
    await repository.getUser(7)
    await repository.listClassrooms({ page: 0, size: 20, sort: 'RECENT' })
    await repository.getClassroom(12)
    await repository.getAiUsageSummary({ from: '2026-08-24', to: '2026-08-30' })
    await repository.getAiUsageUsers({ from: '2026-08-24', limit: 20, to: '2026-08-30' })

    expect(request).toHaveBeenNthCalledWith(1, '/api/admin/users?q=kim&role=LEARNER&status=ACTIVE&sort=NAME&page=1&size=20', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(2, '/api/admin/users/7', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(3, '/api/admin/classrooms?sort=RECENT&page=0&size=20', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(4, '/api/admin/classrooms/12', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(5, '/api/admin/ai-usage/summary?from=2026-08-24&to=2026-08-30', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(6, '/api/admin/ai-usage/users?from=2026-08-24&to=2026-08-30&limit=20', { signal: undefined })
    expect(request.mock.calls.every(([path]) => path.startsWith('/api/admin/'))).toBe(true)
  })
})
