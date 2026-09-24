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

  it('connects recent activity sorting and the one-time password reset response', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } })
      .mockResolvedValueOnce({ data: { message: '로그인 후 변경하세요.', temporaryPassword: 'Temporary1234' } })
    const repository = createAdminRepository(request as AuthenticatedRequest)

    await repository.listUsers({ page: 0, size: 20, sort: 'RECENT_ACTIVITY_DESC' })
    await expect(repository.resetUserPassword(7)).resolves.toEqual({ message: '로그인 후 변경하세요.', temporaryPassword: 'Temporary1234' })

    expect(request).toHaveBeenNthCalledWith(1, '/api/admin/users?sort=RECENT_ACTIVITY_DESC&page=0&size=20', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(2, '/api/admin/users/7/password-reset', { method: 'POST', signal: undefined })
  })

  it('unwraps infrastructure responses and sends the documented query', async () => {
    const metrics = { available: true, env: 'prod', range: '6h' }
    const cost = { available: true, currency: 'USD' }
    const app = { available: true, uptimeSeconds: 120 }
    const request = vi.fn()
      .mockResolvedValueOnce({ data: metrics })
      .mockResolvedValueOnce({ data: cost })
      .mockResolvedValueOnce({ data: app })
    const repository = createAdminRepository(request as AuthenticatedRequest)
    const controller = new AbortController()

    await expect(repository.getInfraMetrics(
      { env: 'prod', range: '6h' },
      controller.signal,
    )).resolves.toBe(metrics)
    await expect(repository.getInfraCost(controller.signal)).resolves.toBe(cost)
    await expect(repository.getInfraApp(controller.signal)).resolves.toBe(app)

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/admin/infra/metrics?env=prod&range=6h',
      { cache: 'no-store', signal: controller.signal },
    )
    expect(request).toHaveBeenNthCalledWith(
      2,
      '/api/admin/infra/cost',
      { cache: 'no-store', signal: controller.signal },
    )
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/api/admin/infra/app',
      { cache: 'no-store', signal: controller.signal },
    )
  })

  it('connects the administrator xAI monitoring and manual sync endpoints', async () => {
    const overview = { available: true, prepaidAvailableUsd: '225.00', totalAvailableUsd: '250.00' }
    const credits = { available: true, prepaidAvailableUsd: '225.00', prepaidBalanceUsd: '250.00' }
    const status = { available: true, recentErrorClassification: null }
    const request = vi.fn()
      .mockResolvedValueOnce({ data: overview })
      .mockResolvedValueOnce({ data: credits })
      .mockResolvedValueOnce({ data: status })
      .mockResolvedValueOnce({ data: overview })
    const repository = createAdminRepository(request as AuthenticatedRequest)
    const controller = new AbortController()

    await expect(repository.getXaiOverview(controller.signal)).resolves.toBe(overview)
    await expect(repository.getXaiCredits(controller.signal)).resolves.toBe(credits)
    await expect(repository.getXaiStatus(controller.signal)).resolves.toBe(status)
    await expect(repository.syncXai(controller.signal)).resolves.toBe(overview)

    expect(request).toHaveBeenNthCalledWith(1, '/api/admin/xai/overview', { cache: 'no-store', signal: controller.signal })
    expect(request).toHaveBeenNthCalledWith(2, '/api/admin/xai/credits', { cache: 'no-store', signal: controller.signal })
    expect(request).toHaveBeenNthCalledWith(3, '/api/admin/xai/status', { cache: 'no-store', signal: controller.signal })
    expect(request).toHaveBeenNthCalledWith(4, '/api/admin/xai/sync', { method: 'POST', signal: controller.signal })
  })
})
