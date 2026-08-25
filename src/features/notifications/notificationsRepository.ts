import type { PagedResponse } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'

export type AppNotificationType =
  | 'JOIN_REQUEST_PROCESSED'
  | 'JOIN_REQUEST_RECEIVED'
  | 'MATERIAL_UPLOADED'
  | 'NOTICE_PUBLISHED'

export interface AppNotificationLink {
  classroomId?: string
  joinRequestId?: string
  materialId?: string
  noticeId?: string
}

export interface AppNotification {
  body: string
  createdAt: string
  id: string
  link: AppNotificationLink
  readAt?: string
  title: string
  type: AppNotificationType
}

interface NotificationDto {
  body: string
  createdAt: string
  link?: Record<string, unknown> | null
  notificationId: number | string
  readAt?: string | null
  title: string
  type: AppNotificationType
}

export interface NotificationsRepository {
  delete: (notificationId: string, signal?: AbortSignal) => Promise<void>
  list: (signal?: AbortSignal) => Promise<AppNotification[]>
  markRead: (notificationId: string, signal?: AbortSignal) => Promise<AppNotification>
}

export function createNotificationsRepository(
  request: AuthenticatedRequest,
): NotificationsRepository {
  return {
    async delete(notificationId, signal) {
      await request(
        `/api/users/me/notifications/${encodeURIComponent(notificationId)}`,
        { method: 'DELETE', signal },
      )
    },
    async list(signal) {
      const { data } = await request<PagedResponse<NotificationDto>>(
        '/api/users/me/notifications?page=0&size=20',
        { signal },
      )
      return data.items.map(mapNotification)
    },
    async markRead(notificationId, signal) {
      const { data } = await request<NotificationDto>(
        `/api/users/me/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'PATCH', signal },
      )
      return mapNotification(data)
    },
  }
}

function mapNotification(value: NotificationDto): AppNotification {
  return {
    body: value.body,
    createdAt: value.createdAt,
    id: String(value.notificationId),
    link: {
      classroomId: mapId(value.link?.classroomId),
      joinRequestId: mapId(value.link?.joinRequestId),
      materialId: mapId(value.link?.materialId),
      noticeId: mapId(value.link?.noticeId),
    },
    readAt: value.readAt ?? undefined,
    title: value.title,
    type: value.type,
  }
}

function mapId(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined
}
