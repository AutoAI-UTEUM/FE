import type { AuthenticatedRequest } from '../auth'

export type DocumentChatRole = 'ASSISTANT' | 'USER'
export type DocumentChatMode = 'document' | 'quiz'

export interface DocumentChatHistoryItem { content: string; role: DocumentChatRole }
export interface DocumentChatWarning { message: string; type: string }
export interface DocumentChatResponse { answer: string; warnings: DocumentChatWarning[] }
interface DocumentChatResponseDto { answer: string; warnings?: DocumentChatWarning[] | null }

export interface DocumentChatRepository {
  ask: (materialId: string, mode: DocumentChatMode, question: string, history: DocumentChatHistoryItem[], signal?: AbortSignal) => Promise<DocumentChatResponse>
}

export function createDocumentChatRepository(request: AuthenticatedRequest): DocumentChatRepository {
  return {
    async ask(materialId, mode, question, history, signal) {
      const endpoint = mode === 'quiz' ? 'quiz-chat' : 'doc-chat'
      const { data } = await request<DocumentChatResponseDto>(
        `/api/materials/${encodeURIComponent(materialId)}/${endpoint}`,
        { body: { history: history.slice(-50), question }, method: 'POST', signal },
      )
      return { answer: data.answer, warnings: data.warnings ?? [] }
    },
  }
}
