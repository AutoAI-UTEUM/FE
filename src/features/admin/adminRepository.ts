import type { AuthenticatedRequest } from '../auth'

export type AdminUserRole = 'ADMIN' | 'INSTRUCTOR' | 'LEARNER'
export type AdminUserStatus = 'ACTIVE' | 'DELETED'
export type AdminSort = 'RECENT' | 'NAME'
export type AdminUserSort = AdminSort | 'RECENT_ACTIVITY_ASC' | 'RECENT_ACTIVITY_DESC'

export interface AdminUserSummary {
  id: number
  email: string
  name: string
  role: AdminUserRole
  status: AdminUserStatus
  authProvider: string
  createdAt: string
  lastActiveAt?: string | null
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

export type XaiRiskLevel = 'NORMAL' | 'WARNING' | 'CRITICAL'
export type XaiManagementFailureType = 'CONFIGURATION_ERROR' | 'TEMPORARY_FAILURE'

export interface AdminXaiOverview {
  prepaidBalanceUsd: string | null
  currentMonthCostUsd: string | null
  postpaidLimitUsd: string | null
  postpaidRemainingUsd: string | null
  totalAvailableUsd: string | null
  averageDailyCost7d: string | null
  projectedDepletionAt: string | null
  riskLevel: XaiRiskLevel | null
  fetchedAt: string | null
  lastSuccessfulSyncAt: string | null
  stale: boolean | null
  available: boolean
}

export interface AdminXaiCredits {
  prepaidBalanceUsd: string | null
  postpaidLimitUsd: string | null
  postpaidUsedUsd: string | null
  postpaidRemainingUsd: string | null
  fetchedAt: string | null
  lastSuccessfulSyncAt: string | null
  stale: boolean | null
  available: boolean
}

export interface AdminXaiStatus {
  available: boolean
  lastSuccessfulSyncAt: string | null
  lastFailureAt: string | null
  recentErrorClassification: XaiManagementFailureType | null
}

export type InfraEnv = 'prod' | 'dev'
export type InfraRange = '1h' | '6h' | '24h' | '7d'

export interface InfraPoint {
  t: string
  v: number | null
}

export interface InfraMetrics {
  available: boolean
  stale?: boolean
  reason?: string
  env?: InfraEnv
  range?: InfraRange
  from?: string
  to?: string
  periodSeconds?: number
  series?: {
    cpu: InfraPoint[]
    netIn: InfraPoint[]
    netOut: InfraPoint[]
    mem: InfraPoint[]
    disk: InfraPoint[]
    status: InfraPoint[]
  }
  latest?: {
    cpu: number | null
    mem: number | null
    disk: number | null
    status: number | null
  }
}

export interface InfraCost {
  available: boolean
  stale?: boolean
  reason?: string
  currency?: string
  monthToDate?: {
    total: number
    byService: Array<{ service: string; amount: number }>
  }
  daily?: Array<{ date: string; total: number }>
  updatedAt?: string
  note?: string
}

export interface InfraApp {
  available: boolean
  jvm: {
    heapUsedBytes: number
    heapMaxBytes: number
    heapCommittedBytes: number
    liveThreads: number
    gcCount: number
  }
  http: {
    requestCount: number
    serverErrorCount: number
    averageResponseTimeMs: number | null
  }
  db: {
    activeConnections: number
    idleConnections: number
    maxConnections: number
  }
  uptimeSeconds: number
  aiService: { status: 'UP' | 'DOWN' | string; checkedAt: string | null }
}

export interface AdminRepository {
  getInfraMetrics: (params: { env: InfraEnv; range: InfraRange }, signal?: AbortSignal) => Promise<InfraMetrics>
  getInfraCost: (signal?: AbortSignal) => Promise<InfraCost>
  getInfraApp: (signal?: AbortSignal) => Promise<InfraApp>
  getUser: (userId: number, signal?: AbortSignal) => Promise<AdminUserDetail>
  resetUserPassword: (userId: number, signal?: AbortSignal) => Promise<{ message: string; temporaryPassword: string }>
  listUsers: (filters: {
    q?: string
    role?: AdminUserRole
    status?: AdminUserStatus
    sort?: AdminUserSort
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
  getXaiOverview: (signal?: AbortSignal) => Promise<AdminXaiOverview>
  getXaiCredits: (signal?: AbortSignal) => Promise<AdminXaiCredits>
  getXaiStatus: (signal?: AbortSignal) => Promise<AdminXaiStatus>
  syncXai: (signal?: AbortSignal) => Promise<AdminXaiOverview>
}

export function createAdminRepository(request: AuthenticatedRequest): AdminRepository {
  return {
    async getInfraMetrics(params, signal) {
      const response = await request<InfraMetrics>(
        `/api/admin/infra/metrics?${toQuery(params)}`,
        { cache: 'no-store', signal },
      )
      return response.data
    },
    async getInfraCost(signal) {
      const response = await request<InfraCost>('/api/admin/infra/cost', { cache: 'no-store', signal })
      return response.data
    },
    async getInfraApp(signal) {
      const response = await request<InfraApp>('/api/admin/infra/app', { cache: 'no-store', signal })
      return response.data
    },
    async getUser(userId, signal) {
      const response = await request<AdminUserDetail>(`/api/admin/users/${userId}`, { signal })
      return response.data
    },
    async resetUserPassword(userId, signal) {
      const response = await request<{ message: string; temporaryPassword: string }>(
        `/api/admin/users/${userId}/password-reset`,
        { method: 'POST', signal },
      )
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
    async getXaiOverview(signal) {
      const response = await request<AdminXaiOverview>('/api/admin/xai/overview', {
        cache: 'no-store',
        signal,
      })
      return response.data
    },
    async getXaiCredits(signal) {
      const response = await request<AdminXaiCredits>('/api/admin/xai/credits', {
        cache: 'no-store',
        signal,
      })
      return response.data
    },
    async getXaiStatus(signal) {
      const response = await request<AdminXaiStatus>('/api/admin/xai/status', {
        cache: 'no-store',
        signal,
      })
      return response.data
    },
    async syncXai(signal) {
      const response = await request<AdminXaiOverview>('/api/admin/xai/sync', {
        method: 'POST',
        signal,
      })
      return response.data
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
