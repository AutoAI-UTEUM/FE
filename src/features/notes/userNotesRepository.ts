import type { PagedResponse } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'

/**
 * 기존 AI 노트(/api/notes)와 별개인 수동 노트·오답 노트 API.
 * /api/notes의 PATCH·DELETE가 이미 쓰이고 있어 서버가 경로를 분리했다.
 */
export interface UserNote {
  content: string
  createdAt: string
  id: string
  materialId?: number | null
  pageNumber?: number | null
  title: string
  updatedAt: string
}

export interface UserNoteInput {
  /** 같은 (userId, clientId) 재전송은 새 노트를 만들지 않고 기존 노트를 돌려준다. */
  clientId?: string
  content: string
  materialId?: number
  pageNumber?: number
  title: string
}

export interface WrongAnswerNote {
  createdAt: string
  id: string
  memo?: string | null
  /** 서버가 퀴즈 제출·문항에서 만들어 준다. 요청으로는 보내지 않는다. */
  questionSnapshot?: unknown
  quizResultRef: string
  updatedAt: string
}

export interface NoteImportRequest {
  notes: Array<{
    clientId: string
    content: string
    createdAt?: string
    materialId?: number
    pageNumber?: number
    title: string
  }>
  wrongAnswers: Array<{ clientId: string; memo?: string; quizResultRef: string }>
}

export interface NoteImportResult {
  failed: Array<{ clientId: string; reason: string }>
  imported: number
  skipped: number
}

interface UserNoteDto extends Omit<UserNote, 'id'> {
  id: number
}

interface WrongAnswerNoteDto extends Omit<WrongAnswerNote, 'id'> {
  id: number
}

/** 서버 기본값은 50, 최대 100이다. */
const PAGE_SIZE = 100

export function createUserNotesRepository(request: AuthenticatedRequest) {
  return {
    async list(signal?: AbortSignal): Promise<UserNote[]> {
      const { data } = await request<PagedResponse<UserNoteDto>>(
        `/api/user-notes?page=0&size=${PAGE_SIZE}`,
        { signal },
      )
      return data.items.map(mapUserNote)
    },

    async create(input: UserNoteInput): Promise<UserNote> {
      const { data } = await request<UserNoteDto>('/api/user-notes', {
        body: input,
        method: 'POST',
      })
      return mapUserNote(data)
    },

    async update(
      noteId: string,
      patch: Partial<Pick<UserNote, 'content' | 'pageNumber' | 'title'>>,
    ): Promise<UserNote> {
      const { data } = await request<UserNoteDto>(
        `/api/user-notes/${encodeURIComponent(noteId)}`,
        { body: patch, method: 'PATCH' },
      )
      return mapUserNote(data)
    },

    async remove(noteId: string): Promise<void> {
      await request(`/api/user-notes/${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
      })
    },

    async listWrongAnswers(signal?: AbortSignal): Promise<WrongAnswerNote[]> {
      const { data } = await request<PagedResponse<WrongAnswerNoteDto>>(
        `/api/wrong-answer-notes?page=0&size=${PAGE_SIZE}`,
        { signal },
      )
      return data.items.map(mapWrongAnswerNote)
    },

    /** quizResultRef는 퀴즈 제출 응답의 `submissionId:questionId`다. 시험 제출은 범위 밖이다. */
    async createWrongAnswer(input: {
      clientId?: string
      memo?: string
      quizResultRef: string
    }): Promise<WrongAnswerNote> {
      const { data } = await request<WrongAnswerNoteDto>(
        '/api/wrong-answer-notes',
        { body: input, method: 'POST' },
      )
      return mapWrongAnswerNote(data)
    },

    async updateWrongAnswer(
      noteId: string,
      memo: string | null,
    ): Promise<WrongAnswerNote> {
      const { data } = await request<WrongAnswerNoteDto>(
        `/api/wrong-answer-notes/${encodeURIComponent(noteId)}`,
        { body: { memo }, method: 'PATCH' },
      )
      return mapWrongAnswerNote(data)
    },

    async removeWrongAnswer(noteId: string): Promise<void> {
      await request(`/api/wrong-answer-notes/${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
      })
    },

    /** 항목별 독립 트랜잭션이라 일부 실패가 나머지를 되돌리지 않는다. 배열당 200건, 분당 5회. */
    async importLocal(body: NoteImportRequest): Promise<NoteImportResult> {
      const { data } = await request<NoteImportResult>(
        '/api/user-notes/import',
        { body, method: 'POST' },
      )
      return { failed: data.failed ?? [], imported: data.imported, skipped: data.skipped }
    },
  }
}

function mapUserNote(value: UserNoteDto): UserNote {
  return { ...value, id: String(value.id) }
}

function mapWrongAnswerNote(value: WrongAnswerNoteDto): WrongAnswerNote {
  return { ...value, id: String(value.id) }
}

export const NOTE_IMPORT_BATCH_LIMIT = 200
