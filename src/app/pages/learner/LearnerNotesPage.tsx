import { ChevronDown, FileText, Pencil, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../../features/auth'
import { createNotesRepository, type Note } from '../../../features/notes'
import {
  createSessionsRepository,
  type LearningSession,
} from '../../../features/sessions'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import {
  Button,
  ButtonLink,
  EmptyState,
  MarkdownContent,
  PageContainer,
  PageHeader,
  useToast,
} from '../../../shared/ui'
import { sessionDetailPath } from '../../routes'

interface LearnerNoteItem {
  note: Note
  session: LearningSession
}

interface NotePreview {
  body: string
  title: string
}

function getNotePreview(content: string): NotePreview {
  const lines = content.split(/\r?\n/)
  const titleLineIndex = lines.findIndex((line) => line.trim())
  if (titleLineIndex < 0) return { body: '', title: '제목 없는 노트' }

  const titleLine = lines[titleLineIndex].trim()
  const title = titleLine
    .replace(/^#{1,6}\s+/, '')
    .replace(/\s+#+$/, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .trim()

  return {
    body: [...lines.slice(0, titleLineIndex), ...lines.slice(titleLineIndex + 1)]
      .join('\n')
      .trim(),
    title: title || '제목 없는 노트',
  }
}

export function LearnerNotesPage() {
  usePageTitle('내 노트')
  const { apiRequest } = useAuth()
  const { show: showToast } = useToast()
  const sessionsRepository = useMemo(
    () => createSessionsRepository(apiRequest),
    [apiRequest],
  )
  const notesRepository = useMemo(
    () => createNotesRepository(apiRequest),
    [apiRequest],
  )
  const [items, setItems] = useState<LearnerNoteItem[]>([])
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  async function load() {
    setIsLoading(true)
    setError(null)
    try {
      const sessions = (await sessionsRepository.list()).filter(
        (session) => session.status !== 'DELETED',
      )
      const notesBySession = await Promise.all(
        sessions.map(async (session) => ({
          notes: await notesRepository.listForSession(session.id).catch(() => []),
          session,
        })),
      )
      setItems(
        notesBySession.flatMap(({ notes, session }) =>
          notes.map((note) => ({ note, session })),
        ),
      )
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    sessionsRepository
      .list()
      .then((sessions) =>
        Promise.all(
          sessions
            .filter((session) => session.status !== 'DELETED')
            .map(async (session) => ({
              notes: await notesRepository.listForSession(session.id).catch(() => []),
              session,
            })),
        ),
      )
      .then((notesBySession) => {
        if (!cancelled) {
          setItems(
            notesBySession.flatMap(({ notes, session }) =>
              notes.map((note) => ({ note, session })),
            ),
          )
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [notesRepository, sessionsRepository])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR')
    if (!normalized) return items
    return items.filter(
      ({ note, session }) =>
        note.content.toLocaleLowerCase('ko-KR').includes(normalized) ||
        session.materialTitle.toLocaleLowerCase('ko-KR').includes(normalized),
    )
  }, [items, query])

  async function saveNote(noteId: string) {
    if (!editingContent.trim() || isSaving) return
    setIsSaving(true)
    try {
      const updated = await notesRepository.update(noteId, editingContent.trim())
      setItems((current) =>
        current.map((item) =>
          item.note.id === noteId ? { ...item, note: updated } : item,
        ),
      )
      setEditingId(null)
      showToast('노트를 수정했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteNote(noteId: string) {
    if (!window.confirm('이 노트를 삭제할까요?')) return
    try {
      await notesRepository.delete(noteId)
      setItems((current) => current.filter((item) => item.note.id !== noteId))
      showToast('노트를 삭제했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  function toggleNote(noteId: string) {
    setExpandedNoteIds((current) => {
      const next = new Set(current)
      if (next.has(noteId)) next.delete(noteId)
      else next.add(noteId)
      return next
    })
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <label className="relative w-full min-w-56 sm:w-72">
            <span className="sr-only">노트 검색</span>
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 -translate-y-1/2 text-stone-400"
              size={14}
            />
            <input
              className="h-10 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-9 type-body outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="노트 검색"
              value={query}
            />
            {query ? (
              <button
                aria-label="검색어 지우기"
                className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100"
                onClick={() => setQuery('')}
                type="button"
              >
                <X size={13} />
              </button>
            ) : null}
          </label>
        }
        title="내 노트"
        titleAccessory={<p className="type-caption text-stone-400">{items.length}개</p>}
      />

      {isLoading ? (
        <p className="py-16 text-center type-body text-stone-500" role="status">
          노트를 불러오는 중입니다.
        </p>
      ) : null}
      {error ? (
        <EmptyState
          action={<Button onClick={() => void load()}>다시 시도</Button>}
          description={error}
          title="노트를 불러오지 못했습니다"
        />
      ) : null}
      {!isLoading && !error && filteredItems.length === 0 ? (
        <EmptyState
          description={
            query.trim()
              ? '다른 검색어로 다시 찾아보세요.'
              : '학습 중 저장한 AI 답변과 메모가 이곳에 모입니다.'
          }
          title={query.trim() ? '일치하는 노트가 없습니다' : '저장한 노트가 없습니다'}
        />
      ) : null}

      {!error && filteredItems.length > 0 ? (
        <section aria-label="저장한 노트" className="grid gap-3 lg:grid-cols-2">
          {filteredItems.map(({ note, session }) => {
            const preview = getNotePreview(note.content)
            const isExpanded = expandedNoteIds.has(note.id)
            const isEditing = editingId === note.id
            const contentId = `note-content-${note.id}`

            return (
              <article
                className="min-w-0 rounded-lg border border-stone-200 bg-white"
                key={note.id}
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-3">
                  <div className="mr-auto min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p
                        className="min-w-0 truncate type-control font-bold text-stone-900"
                        title={session.materialTitle}
                      >
                        {session.materialTitle}
                      </p>
                      {note.pageNumber ? (
                        <span className="shrink-0 type-micro text-stone-400">
                          {note.pageNumber}페이지
                        </span>
                      ) : null}
                    </div>
                    {!note.sourceMessageId ? (
                      <p className="mt-0.5 type-micro text-stone-400">내 메모</p>
                    ) : null}
                  </div>
                  <ButtonLink
                    className="!min-h-7 !gap-1 !rounded-md !px-2 !py-1 type-micro"
                    size="sm"
                    to={sessionDetailPath(session.id)}
                    variant="secondary"
                  >
                    <FileText aria-hidden="true" size={12} />
                    자료로 이동
                  </ButtonLink>
                  {isEditing ? (
                    <>
                      <Button
                        onClick={() => setEditingId(null)}
                        size="sm"
                        variant="ghost"
                      >
                        취소
                      </Button>
                      <Button
                        disabled={!editingContent.trim() || isSaving}
                        onClick={() => void saveNote(note.id)}
                        size="sm"
                      >
                        저장
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        aria-label="노트 수정"
                        className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                        onClick={() => {
                          setEditingId(note.id)
                          setEditingContent(note.content)
                        }}
                        type="button"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        aria-label="노트 삭제"
                        className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => void deleteNote(note.id)}
                        type="button"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>

                {isEditing ? (
                  <div className="p-4">
                    <textarea
                      aria-label="노트 내용 수정"
                      autoFocus
                      className="min-h-40 w-full resize-y rounded-lg border border-stone-300 p-3 type-body leading-6 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                      onChange={(event) => setEditingContent(event.target.value)}
                      value={editingContent}
                    />
                  </div>
                ) : (
                  <div>
                    <button
                      aria-controls={contentId}
                      aria-expanded={isExpanded}
                      aria-label={`${preview.title} 노트 ${
                        isExpanded ? '접기' : '펼치기'
                      }`}
                      className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-stone-50"
                      onClick={() => toggleNote(note.id)}
                      type="button"
                    >
                      <span className="min-w-0 flex-1 truncate type-body font-bold text-stone-900">
                        {preview.title}
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`shrink-0 text-stone-400 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                        size={16}
                      />
                    </button>
                    <div id={contentId}>
                      {isExpanded && preview.body ? (
                        <MarkdownContent
                          className="border-t border-stone-100 px-4 py-4 text-stone-700"
                          content={preview.body}
                        />
                      ) : null}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </section>
      ) : null}
    </PageContainer>
  )
}
