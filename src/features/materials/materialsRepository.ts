import { ApiClientError, type PagedResponse } from '../../shared/api'
import type {
  AuthenticatedRawRequest,
  AuthenticatedRequest,
} from '../auth'
import type {
  MaterialFailureReason,
  MaterialOverview,
  MaterialOverviewStatus,
  MaterialStatus,
  StudyMaterial,
} from './materialTypes'

interface MaterialDto {
  activeSessionId?: number | string | null
  createdAt: string
  failureReason?: MaterialFailureReason | null
  fileSizeBytes?: number | null
  materialId: number | string
  pageCount?: number | null
  processingStatus: MaterialStatus
  title: string
  traceId?: string | null
}

interface MaterialOverviewDto {
  content?: string | null
  materialId: number | string
  status: MaterialOverviewStatus
  updatedAt?: string | null
}

export const MATERIALS_PAGE_SIZE = 20

export interface MaterialsRepository {
  delete: (materialId: string, signal?: AbortSignal) => Promise<void>
  getById: (
    materialId: string,
    signal?: AbortSignal,
  ) => Promise<StudyMaterial | null>
  getFile: (
    materialId: string,
    signal?: AbortSignal,
  ) => Promise<Blob>
  getOverview: (
    materialId: string,
    signal?: AbortSignal,
  ) => Promise<MaterialOverview | null>
  list: (signal?: AbortSignal) => Promise<StudyMaterial[]>
  listPage: (page?: number, signal?: AbortSignal) => Promise<PagedResponse<StudyMaterial>>
  refreshStatuses: (signal?: AbortSignal) => Promise<StudyMaterial[]>
  rename: (
    materialId: string,
    title: string,
    signal?: AbortSignal,
  ) => Promise<StudyMaterial>
  upload: (
    file: File,
    options: {
      classroomId?: string
      signal?: AbortSignal
      title: string
      weekNumber?: number
    },
  ) => Promise<StudyMaterial>
}

export function createMaterialsRepository(
  request: AuthenticatedRequest,
  rawRequest?: AuthenticatedRawRequest,
): MaterialsRepository {
  return {
    async delete(materialId, signal) {
      await request<unknown>(
        `/api/materials/${encodeURIComponent(materialId)}`,
        { method: 'DELETE', signal },
      )
    },
    async getById(materialId, signal) {
      try {
        const { data } = await request<MaterialDto>(
          `/api/materials/${encodeURIComponent(materialId)}`,
          { signal },
        )
        return mapMaterial(data)
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    async getFile(materialId, signal) {
      if (!rawRequest) {
        throw new ApiClientError({
          code: 'PDF_UNAVAILABLE',
          message: 'PDF 원본 요청을 사용할 수 없습니다.',
        })
      }
      const response = await rawRequest(
        `/api/materials/${encodeURIComponent(materialId)}/file`,
        {
          headers: { Accept: 'application/pdf' },
          signal,
        },
      )
      const contentType = response.headers.get('Content-Type') ?? ''
      if (!contentType.toLowerCase().includes('application/pdf')) {
        throw new ApiClientError({
          code: 'INVALID_PDF_RESPONSE',
          message: '서버가 PDF 파일을 반환하지 않았습니다.',
          status: response.status,
        })
      }
      return response.blob()
    },
    async getOverview(materialId, signal) {
      try {
        const { data } = await request<MaterialOverviewDto>(
          `/api/materials/${encodeURIComponent(materialId)}/overview`,
          { signal },
        )
        return mapMaterialOverview(data)
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    async list(signal) {
      return (await requestMaterials(request, 0, signal)).items
    },
    async listPage(page = 0, signal) {
      return requestMaterials(request, page, signal)
    },
    async refreshStatuses(signal) {
      return (await requestMaterials(request, 0, signal)).items
    },
    async rename(materialId, title, signal) {
      const { data } = await request<MaterialDto>(
        `/api/materials/${encodeURIComponent(materialId)}`,
        {
          body: { title: title.trim() },
          method: 'PATCH',
          signal,
        },
      )
      return mapMaterial(data)
    },
    async upload(file, options) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', options.title.trim())
      if (options?.classroomId && options.weekNumber) {
        formData.append('classroomId', options.classroomId)
        formData.append('weekNumber', String(options.weekNumber))
      }

      const { data } = await request<MaterialDto>('/api/materials', {
        body: formData,
        method: 'POST',
        signal: options?.signal,
      })
      return mapMaterial(data)
    },
  }
}

async function requestMaterials(
  request: AuthenticatedRequest,
  page: number,
  signal?: AbortSignal,
): Promise<PagedResponse<StudyMaterial>> {
  if (!Number.isSafeInteger(page) || page < 0) {
    throw new RangeError('Material page must be a non-negative safe integer.')
  }
  const { data } = await request<PagedResponse<MaterialDto>>(
    `/api/materials?page=${page}&size=${MATERIALS_PAGE_SIZE}`,
    { signal },
  )
  return { ...data, items: data.items.map(mapMaterial) }
}

function mapMaterial(material: MaterialDto): StudyMaterial {
  return {
    activeSessionId:
      material.activeSessionId === null || material.activeSessionId === undefined
        ? undefined
        : String(material.activeSessionId),
    createdAt: material.createdAt,
    failureReason: material.failureReason ?? undefined,
    fileSizeBytes: material.fileSizeBytes ?? undefined,
    id: String(material.materialId),
    pageCount: material.pageCount ?? undefined,
    status: material.processingStatus,
    title: material.title,
    traceId: material.traceId ?? undefined,
  }
}

function mapMaterialOverview(overview: MaterialOverviewDto): MaterialOverview {
  return {
    content: overview.content ?? undefined,
    materialId: String(overview.materialId),
    status: overview.status,
    updatedAt: overview.updatedAt ?? undefined,
  }
}
