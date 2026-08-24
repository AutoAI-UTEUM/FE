import type { AuthenticatedRequest } from '../auth'

export type DocumentChatMode = 'material' | 'quiz'
export type DocumentChatRole = 'ASSISTANT' | 'USER'

export interface DocumentChatHistoryMessage {
  content: string
  role: DocumentChatRole
}

export interface DocumentChatWarning {
  message: string
  type: string
}

export interface DocumentChatResponse {
  answer: string
  warnings: DocumentChatWarning[]
}

interface DocumentChatResponseDto {
  answer: string
  warnings?: Array<{
    message?: string
    type?: string
  }>
}

export interface DocumentChatRepository {
  ask: (
    materialId: string,
    mode: DocumentChatMode,
    question: string,
    history: DocumentChatHistoryMessage[],
    signal?: AbortSignal,
  ) => Promise<DocumentChatResponse>
}

export function createDocumentChatRepository(
  request: AuthenticatedRequest,
): DocumentChatRepository {
  return {
    async ask(materialId, mode, question, history, signal) {
      const endpoint = mode === 'quiz' ? 'quiz-chat' : 'doc-chat'
      const { data } = await request<DocumentChatResponseDto>(
        `/api/materials/${encodeURIComponent(materialId)}/${endpoint}`,
        {
          body: {
            history: history.slice(-50),
            question: question.trim(),
          },
          method: 'POST',
          signal,
        },
      )

      return {
        answer: data.answer,
        warnings: (data.warnings ?? []).map((warning) => ({
          message: warning.message?.trim() || '일부 문맥이 제외되었습니다.',
          type: warning.type?.trim() || 'UNKNOWN',
        })),
      }
    },
  }
}
