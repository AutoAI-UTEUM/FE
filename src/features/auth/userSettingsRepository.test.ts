import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRawRequest, AuthenticatedRequest } from './authContext'
import { createUserSettingsRepository } from './userSettingsRepository'

describe('user settings repository', () => {
  it('updates profile and preferences through their documented endpoints', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ data: { affiliation: '서울대학교', email: 'user@example.com', id: 1, name: '김학습', role: 'LEARNER' } })
      .mockResolvedValueOnce({ data: { aiAnswerStyle: 'DETAILED', newMaterialNotification: true, studyReminder: false } })
    const rawRequest = vi.fn() as unknown as AuthenticatedRawRequest
    const repository = createUserSettingsRepository(request as AuthenticatedRequest, rawRequest)

    await expect(repository.updateProfile({ affiliation: '서울대학교', name: '김학습' })).resolves.toMatchObject({ affiliation: '서울대학교', id: 1 })
    await repository.updatePreferences({ aiAnswerStyle: 'DETAILED', newMaterialNotification: true, studyReminder: false })

    expect(request).toHaveBeenNthCalledWith(1, '/api/users/me', { body: { affiliation: '서울대학교', name: '김학습' }, method: 'PATCH' })
    expect(request).toHaveBeenNthCalledWith(2, '/api/users/me/preferences', { body: { aiAnswerStyle: 'DETAILED', newMaterialNotification: true, studyReminder: false }, method: 'PATCH' })
  })
})
