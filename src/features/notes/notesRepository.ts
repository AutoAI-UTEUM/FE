import type { PagedResponse } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'

export interface Note {
  content: string
  id: string
  pageNumber?: number
  sourceMessageId?: string
}

interface NoteDto {
  content: string
  noteId: number
  pageNumber?: number
  sourceMessageId?: number
}

export function createNotesRepository(request: AuthenticatedRequest) {
  return {
    async listForMaterial(materialId: string, signal?: AbortSignal) {
      const { data } = await request<PagedResponse<NoteDto>>(`/api/materials/${encodeURIComponent(materialId)}/notes?page=0&size=100`, { signal })
      return data.items.map(mapNote)
    },
    async listForSession(sessionId: string, signal?: AbortSignal) {
      const { data } = await request<PagedResponse<NoteDto>>(`/api/sessions/${encodeURIComponent(sessionId)}/notes?page=0&size=100`, { signal })
      return data.items.map(mapNote)
    },
    async createForSession(sessionId: string, input: { content: string; pageNumber?: number; sourceMessageId?: number }) {
      const { data } = await request<NoteDto>(`/api/sessions/${encodeURIComponent(sessionId)}/notes`, { body: input, method: 'POST' })
      return mapNote(data)
    },
    async update(noteId: string, content: string) {
      const { data } = await request<NoteDto>(`/api/notes/${encodeURIComponent(noteId)}`, { body: { content }, method: 'PATCH' })
      return mapNote(data)
    },
    async delete(noteId: string) { await request(`/api/notes/${encodeURIComponent(noteId)}`, { method: 'DELETE' }) },
  }
}

function mapNote(value: NoteDto): Note { return { content: value.content, id: String(value.noteId), pageNumber: value.pageNumber, sourceMessageId: value.sourceMessageId === undefined ? undefined : String(value.sourceMessageId) } }
