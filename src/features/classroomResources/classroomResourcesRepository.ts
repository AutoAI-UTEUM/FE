import type { PagedResponse } from '../../shared/api'
import { ApiClientError } from '../../shared/api'
import type {
  AuthenticatedRawRequest,
  AuthenticatedRequest,
} from '../auth'

export type ClassroomResourceType = 'FILE' | 'LINK'

export interface ClassroomResourceRecord {
  contentType?: string
  createdAt: string
  fileName?: string
  id: string
  sizeBytes?: number
  title: string
  type: ClassroomResourceType
  url?: string
  weekNumber: number | null
}

export type CreateClassroomResourceInput =
  | { file: File; title: string; type: 'FILE'; weekNumber: number | null }
  | { title: string; type: 'LINK'; url: string; weekNumber: number | null }

export interface UpdateClassroomResourceInput {
  title?: string
  weekNumber?: number | null
}

interface ClassroomResourceDto {
  contentType?: string | null
  createdAt: string
  fileName?: string | null
  resourceId: number | string
  sizeBytes?: number | null
  title: string
  type: ClassroomResourceType
  url?: string | null
  weekNumber?: number | null
}

export interface ClassroomResourcesRepository {
  create: (
    classroomId: string,
    input: CreateClassroomResourceInput,
    signal?: AbortSignal,
  ) => Promise<ClassroomResourceRecord>
  delete: (resourceId: string, signal?: AbortSignal) => Promise<void>
  getFile: (resourceId: string, signal?: AbortSignal) => Promise<Blob>
  list: (
    classroomId: string,
    weekNumber?: number | null,
    signal?: AbortSignal,
  ) => Promise<ClassroomResourceRecord[]>
  update: (
    resourceId: string,
    input: UpdateClassroomResourceInput,
    signal?: AbortSignal,
  ) => Promise<ClassroomResourceRecord>
}

export function createClassroomResourcesRepository(
  request: AuthenticatedRequest,
  rawRequest?: AuthenticatedRawRequest,
): ClassroomResourcesRepository {
  return {
    async create(classroomId, input, signal) {
      const path = `/api/classrooms/${encodeURIComponent(classroomId)}/resources`
      if (input.type === 'LINK') {
        const { data } = await request<ClassroomResourceDto>(path, {
          body: {
            title: input.title.trim(),
            url: input.url,
            weekNumber: input.weekNumber ?? undefined,
          },
          method: 'POST',
          signal,
        })
        return mapResource(data)
      }

      const formData = new FormData()
      formData.append('file', input.file)
      formData.append('title', input.title.trim())
      if (input.weekNumber !== null) {
        formData.append('weekNumber', String(input.weekNumber))
      }
      const { data } = await request<ClassroomResourceDto>(path, {
        body: formData,
        method: 'POST',
        signal,
      })
      return mapResource(data)
    },
    async delete(resourceId, signal) {
      await request<unknown>(`/api/resources/${encodeURIComponent(resourceId)}`, {
        method: 'DELETE',
        signal,
      })
    },
    async getFile(resourceId, signal) {
      if (!rawRequest) {
        throw new ApiClientError({
          code: 'RESOURCE_FILE_UNAVAILABLE',
          message: '자료 파일 요청을 사용할 수 없습니다.',
        })
      }
      const response = await rawRequest(
        `/api/resources/${encodeURIComponent(resourceId)}/file`,
        { signal },
      )
      return response.blob()
    },
    async list(classroomId, weekNumber, signal) {
      const query = new URLSearchParams({ page: '0', size: '100' })
      if (weekNumber !== undefined && weekNumber !== null) {
        query.set('weekNumber', String(weekNumber))
      }
      const { data } = await request<PagedResponse<ClassroomResourceDto>>(
        `/api/classrooms/${encodeURIComponent(classroomId)}/resources?${query}`,
        { signal },
      )
      return data.items.map(mapResource)
    },
    async update(resourceId, input, signal) {
      const titlePresent = Object.prototype.hasOwnProperty.call(input, 'title')
      const weekNumberPresent = Object.prototype.hasOwnProperty.call(input, 'weekNumber')
      const { data } = await request<ClassroomResourceDto>(
        `/api/resources/${encodeURIComponent(resourceId)}`,
        {
          body: {
            title: titlePresent ? input.title?.trim() : undefined,
            titlePresent,
            weekNumber: weekNumberPresent ? input.weekNumber : undefined,
            weekNumberPresent,
          },
          method: 'PATCH',
          signal,
        },
      )
      return mapResource(data)
    },
  }
}

function mapResource(resource: ClassroomResourceDto): ClassroomResourceRecord {
  return {
    contentType: resource.contentType ?? undefined,
    createdAt: resource.createdAt,
    fileName: resource.fileName ?? undefined,
    id: String(resource.resourceId),
    sizeBytes: resource.sizeBytes ?? undefined,
    title: resource.title,
    type: resource.type,
    url: resource.url ?? undefined,
    weekNumber: resource.weekNumber ?? null,
  }
}
