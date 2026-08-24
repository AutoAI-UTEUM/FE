import type { AuthenticatedRawRequest, AuthenticatedRequest, AuthUser } from './authContext'

export type AiAnswerStyle = 'CONCISE' | 'NORMAL' | 'DETAILED'

export interface UserPreferences {
  aiAnswerStyle: AiAnswerStyle
  newMaterialNotification: boolean
  studyReminder: boolean
}

interface UserDto {
  affiliation?: string
  avatarUrl?: string
  email: string
  id: number
  learningEmailOptIn?: boolean
  name: string
  role?: string
}

export function createUserSettingsRepository(request: AuthenticatedRequest, rawRequest: AuthenticatedRawRequest) {
  return {
    async updateProfile(input: { affiliation: string; name: string }) {
      const { data } = await request<UserDto>('/api/users/me', { body: input, method: 'PATCH' })
      return mapUser(data)
    },
    async getPreferences(signal?: AbortSignal) {
      const { data } = await request<UserPreferences>('/api/users/me/preferences', { signal })
      return data
    },
    async updatePreferences(input: UserPreferences) {
      const { data } = await request<UserPreferences>('/api/users/me/preferences', {
        body: {
          aiAnswerStyle: input.aiAnswerStyle,
          newMaterialNotification: input.newMaterialNotification,
          studyReminder: input.studyReminder,
        },
        method: 'PATCH',
      })
      return data
    },
    async getAvatar(signal?: AbortSignal) {
      const response = await rawRequest('/api/users/me/avatar', { signal })
      return response.blob()
    },
    async uploadAvatar(file: File) {
      const body = new FormData(); body.append('file', file)
      await request<{ avatarUrl: string }>('/api/users/me/avatar', { body, method: 'POST' })
    },
    async deleteAvatar() { await request('/api/users/me/avatar', { method: 'DELETE' }) },
  }
}

function mapUser(value: UserDto): AuthUser {
  return {
    email: value.email,
    id: value.id,
    name: value.name,
    ...(value.affiliation !== undefined ? { affiliation: value.affiliation } : {}),
    ...(value.avatarUrl !== undefined ? { avatarUrl: value.avatarUrl } : {}),
    ...(value.learningEmailOptIn !== undefined
      ? { learningEmailOptIn: value.learningEmailOptIn }
      : {}),
    ...(value.role !== undefined ? { role: value.role } : {}),
  }
}
