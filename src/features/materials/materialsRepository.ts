import { ApiClientError, type PagedResponse } from '../../shared/api'
import type {
  AuthenticatedRawRequest,
  AuthenticatedRequest,
} from '../auth'
import type {
  MaterialFailureReason,
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
  list: (signal?: AbortSignal) => Promise<StudyMaterial[]>
  refreshStatuses: (signal?: AbortSignal) => Promise<StudyMaterial[]>
  upload: (
    file: File,
    options?: { classroomId?: string; signal?: AbortSignal; weekNumber?: number },
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
    async list(signal) {
      return requestMaterials(request, signal)
    },
    async refreshStatuses(signal) {
      return requestMaterials(request, signal)
    },
    async upload(file, options) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', file.name)
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
  signal?: AbortSignal,
): Promise<StudyMaterial[]> {
  const { data } = await request<PagedResponse<MaterialDto>>(
    '/api/materials?page=0&size=20',
    { signal },
  )
  return data.items.map(mapMaterial)
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
