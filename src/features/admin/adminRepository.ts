import type { AuthenticatedRequest } from '../auth'

export type AdminUserRole = 'ADMIN' | 'INSTRUCTOR' | 'LEARNER'
export type AdminUserStatus = 'ACTIVE' | 'DELETED'
export type AdminSort = 'RECENT' | 'NAME'

export interface AdminUserSummary {
  id: number
  email: string
  name: string
  role: AdminUserRole
  status: AdminUserStatus
  authProvider: string
  createdAt: string
}

export interface AdminUserDetail extends AdminUserSummary {
  affiliation?: string | null
  consentedAt?: string | null
}

export interface AdminClassroomSummary {
  id: number
  name: string
  instructor: { id: number; name: string }
  memberCount: number
  status: string
  createdAt: string
}

export interface AdminClassroomMember {
  userId: number
  name: string
  role: string
  joinedAt: string
}

export interface AdminClassroomDetail extends AdminClassroomSummary {
  members: AdminClassroomMember[]
}

export interface AdminPageResult<T> {
  items: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface AiUsageDaily {
  date: string
  callCount: number
  successCount: number
  failCount: number
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
}

export interface AiUsageFeature {
  feature: string
  callCount: number
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
}

export interface AiUsageSummary {
  daily: AiUsageDaily[]
  features: AiUsageFeature[]
}

export interface AiUsageUser {
  userId: number
  email: string
  name: string
  status: AdminUserStatus
  callCount: number
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
}

export interface AdminRepository {
  getUser: (userId: number, signal?: AbortSignal) => Promise<AdminUserDetail>
  listUsers: (filters: {
    q?: string
    role?: AdminUserRole
    status?: AdminUserStatus
    sort?: AdminSort
    page?: number
    size?: number
  }, signal?: AbortSignal) => Promise<AdminPageResult<AdminUserSummary>>
  getClassroom: (classroomId: number, signal?: AbortSignal) => Promise<AdminClassroomDetail>
  listClassrooms: (filters: {
    sort?: AdminSort
    page?: number
    size?: number
  }, signal?: AbortSignal) => Promise<AdminPageResult<AdminClassroomSummary>>
  getAiUsageSummary: (range: { from: string; to: string }, signal?: AbortSignal) => Promise<AiUsageSummary>
  getAiUsageUsers: (range: { from: string; to: string; limit?: number }, signal?: AbortSignal) => Promise<AiUsageUser[]>
}

export function createAdminRepository(request: AuthenticatedRequest): AdminRepository {
  return {
    async getUser(userId, signal) {
      const response = await request<AdminUserDetail>(`/api/admin/users/${userId}`, { signal })
      return response.data
    },
    async listUsers(filters, signal) {
      const response = await request<AdminPageResult<AdminUserSummary>>(
        `/api/admin/users?${toQuery({ q: filters.q, role: filters.role, status: filters.status, sort: filters.sort, page: filters.page, size: filters.size })}`,
        { signal },
      )
      return response.data
    },
    async getClassroom(classroomId, signal) {
      const response = await request<AdminClassroomDetail>(`/api/admin/classrooms/${classroomId}`, { signal })
      return response.data
    },
    async listClassrooms(filters, signal) {
      const response = await request<AdminPageResult<AdminClassroomSummary>>(
        `/api/admin/classrooms?${toQuery({ sort: filters.sort, page: filters.page, size: filters.size })}`,
        { signal },
      )
      return response.data
    },
    async getAiUsageSummary(range, signal) {
      const response = await request<AiUsageSummary>(
        `/api/admin/ai-usage/summary?${toQuery({ from: range.from, to: range.to })}`,
        { signal },
      )
      return response.data
    },
    async getAiUsageUsers(range, signal) {
      const response = await request<{ items: AiUsageUser[] } | AiUsageUser[]>(
        `/api/admin/ai-usage/users?${toQuery({ from: range.from, to: range.to, limit: range.limit })}`,
        { signal },
      )
      return Array.isArray(response.data) ? response.data : response.data.items
    },
  }
}

function toQuery<T extends object>(values: T): string {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  return query.toString()
}
