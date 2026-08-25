import { ArrowLeft, ChevronDown, FileText, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
import { routes, sessionDetailPath } from '../../routes'

const NotionBlockEditor = lazy(
  () => import('../../../shared/ui/NotionBlockEditor'),
)

interface SessionNoteItem {
  kind: 'session'
  note: Note
  session: LearningSession
}

interface ManualNote {
  content: string
  createdAt: string
  document?: string
  id: string
  updatedAt: string
}

type LearnerNoteItem = ManualNoteItem | SessionNoteItem

interface ManualNoteItem {
  kind: 'manual'
  note: ManualNote
}

interface NotePreview {
  body: string
  title: string
}

interface LearnerNoteGroup {
  id: string
  items: LearnerNoteItem[]
  label: string
  session?: LearningSession
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
    .replace(/^:::\s*toggle\s+/, '')
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
  const { apiRequest, user } = useAuth()
  const { show: showToast } = useToast()
  const sessionsRepository = useMemo(
    () => createSessionsRepository(apiRequest),
    [apiRequest],
  )
  const notesRepository = useMemo(
    () => createNotesRepository(apiRequest),
    [apiRequest],
  )
  const manualNotesStorageKey = useMemo(
    () => getManualNotesStorageKey(user?.id ?? user?.email ?? 'anonymous'),
    [user?.email, user?.id],
  )
  const [sessionItems, setSessionItems] = useState<SessionNoteItem[]>([])
  const [manualNotes, setManualNotes] = useState<ManualNote[]>(() =>
    readManualNotes(manualNotesStorageKey),
  )
  const [query, setQuery] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [editingDocument, setEditingDocument] = useState<string | undefined>()
  const [expandedNoteKeys, setExpandedNoteKeys] = useState<Set<string>>(
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
      setSessionItems(
        notesBySession.flatMap(({ notes, session }) =>
          notes.map((note): SessionNoteItem => ({ kind: 'session', note, session })),
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
          setSessionItems(
            notesBySession.flatMap(({ notes, session }) =>
              notes.map((note): SessionNoteItem => ({ kind: 'session', note, session })),
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

  const allItems = useMemo<LearnerNoteItem[]>(
    () => [
      ...manualNotes.map((note): ManualNoteItem => ({ kind: 'manual', note })),
      ...sessionItems,
    ],
    [manualNotes, sessionItems],
  )

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ko-KR')
    if (!normalized) return allItems
    return allItems.filter((item) => {
      const content = getNoteContent(item).toLocaleLowerCase('ko-KR')
      const source = getNoteSourceLabel(item).toLocaleLowerCase('ko-KR')
      return content.includes(normalized) || source.includes(normalized)
    })
  }, [allItems, query])
  const groupedItems = useMemo(
    () => groupNoteItems(filteredItems),
    [filteredItems],
  )

  function persistManualNotes(updater: (current: ManualNote[]) => ManualNote[]) {
    setManualNotes((current) => {
      const next = updater(current)
      window.localStorage.setItem(manualNotesStorageKey, JSON.stringify(next))
      return next
    })
  }

  async function saveNote(item: LearnerNoteItem) {
    if (!editingContent.trim() || isSaving) return
    setIsSaving(true)
    try {
      if (item.kind === 'manual') {
        const updatedAt = new Date().toISOString()
        persistManualNotes((current) =>
          current.map((note) =>
            note.id === item.note.id
              ? {
                  ...note,
                  content: editingContent.trim(),
                  document: editingDocument,
                  updatedAt,
                }
              : note,
          ),
        )
      } else {
        const updated = await notesRepository.update(item.note.id, editingContent.trim())
        setSessionItems((current) =>
          current.map((currentItem) =>
            currentItem.note.id === item.note.id
              ? { ...currentItem, note: updated }
              : currentItem,
          ),
        )
      }
      setEditingKey(null)
      showToast('노트를 수정했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteNote(item: LearnerNoteItem) {
    if (!window.confirm('이 노트를 삭제할까요?')) return
    try {
      if (item.kind === 'manual') {
        persistManualNotes((current) =>
          current.filter((note) => note.id !== item.note.id),
        )
      } else {
        await notesRepository.delete(item.note.id)
        setSessionItems((current) =>
          current.filter((currentItem) => currentItem.note.id !== item.note.id),
        )
      }
      showToast('노트를 삭제했습니다.', 'success')
    } catch (requestError) {
      showToast(getRequestErrorMessage(requestError), 'danger')
    }
  }

  function toggleNote(noteKey: string) {
    setExpandedNoteKeys((current) => {
      const next = new Set(current)
      if (next.has(noteKey)) next.delete(noteKey)
      else next.add(noteKey)
      return next
    })
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
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
            <ButtonLink to={routes.newNote}>
              <Plus aria-hidden="true" size={15} />
              새 노트
            </ButtonLink>
          </div>
        }
        title="내 노트"
        titleAccessory={<p className="type-caption text-stone-400">{allItems.length}개</p>}
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
          action={!query.trim() ? <ButtonLink to={routes.newNote}>새 노트 작성</ButtonLink> : undefined}
          description={
            query.trim()
              ? '다른 검색어로 다시 찾아보세요.'
              : '학습 중 저장한 AI 답변과 직접 작성한 노트가 이곳에 모입니다.'
          }
          title={query.trim() ? '일치하는 노트가 없습니다' : '저장한 노트가 없습니다'}
        />
      ) : null}

      {!error && filteredItems.length > 0 ? (
        <section aria-label="저장한 노트" className="grid gap-3 lg:grid-cols-2">
          {groupedItems.map((group) => (
            <article
              aria-label={`${group.label} 노트 모음`}
              className="min-w-0 self-start overflow-hidden rounded-lg border border-stone-200 bg-white"
              key={group.id}
            >
              <header className="flex min-h-14 items-center gap-3 border-b border-stone-200 bg-stone-50/70 px-4 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm ring-1 ring-stone-200">
                  <FileText aria-hidden="true" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate type-body font-bold text-stone-950" title={group.label}>
                    {group.label}
                  </h2>
                  <p className="type-micro text-stone-400">노트 {group.items.length}개</p>
                </div>
                {group.session ? (
                    <ButtonLink
                      className="!min-h-7 !gap-1 !rounded-md !px-2 !py-1 type-micro"
                      size="sm"
                      to={sessionDetailPath(group.session.id)}
                      variant="secondary"
                    >
                      <FileText aria-hidden="true" size={12} />
                      자료로 이동
                    </ButtonLink>
                  ) : null}
              </header>
              <div className="divide-y divide-stone-100">
                {group.items.map((item) => {
                  const noteKey = getNoteKey(item)
                  const content = getNoteContent(item)
                  const preview = getNotePreview(content)
                  const isExpanded = expandedNoteKeys.has(noteKey)
                  const isEditing = editingKey === noteKey
                  const contentId = `note-content-${noteKey}`
                  const noteMeta = item.kind === 'manual'
                    ? '직접 작성'
                    : [
                        item.note.pageNumber ? `${item.note.pageNumber}페이지` : null,
                        item.note.sourceMessageId ? 'AI 답변 저장' : '내 메모',
                      ].filter(Boolean).join(' · ')

                  return (
                    <section key={noteKey}>
                      <div className="flex min-w-0 items-center gap-2 px-4 py-3">
                        {isEditing ? (
                          <div className="min-w-0 flex-1">
                            <p className="truncate type-control font-bold text-stone-900">{preview.title}</p>
                            <p className="mt-0.5 type-micro text-stone-400">{noteMeta}</p>
                          </div>
                        ) : (
                          <button
                            aria-controls={contentId}
                            aria-expanded={isExpanded}
                            aria-label={`${preview.title} 노트 ${isExpanded ? '접기' : '펼치기'}`}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 text-left"
                            onClick={() => toggleNote(noteKey)}
                            type="button"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate type-control font-bold text-stone-900">{preview.title}</span>
                              <span className="mt-0.5 block type-micro text-stone-400">{noteMeta}</span>
                            </span>
                            <ChevronDown
                              aria-hidden="true"
                              className={`shrink-0 text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              size={15}
                            />
                          </button>
                        )}
                        {isEditing ? (
                          <>
                            <Button
                              onClick={() => setEditingKey(null)}
                              size="sm"
                              variant="ghost"
                            >
                              취소
                            </Button>
                            <Button
                              disabled={!editingContent.trim() || isSaving}
                              onClick={() => void saveNote(item)}
                              size="sm"
                            >
                              저장
                            </Button>
                          </>
                        ) : (
                          <>
                            <button
                              aria-label="노트 수정"
                              className="flex size-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                              onClick={() => {
                                setEditingKey(noteKey)
                                setEditingContent(content)
                                setEditingDocument(
                                  item.kind === 'manual' ? item.note.document : undefined,
                                )
                              }}
                              type="button"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              aria-label="노트 삭제"
                              className="flex size-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => void deleteNote(item)}
                              type="button"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="border-t border-stone-100 p-4">
                          <Suspense fallback={<EditorLoadingState />}>
                            <NotionBlockEditor
                              ariaLabel="노트 내용 수정"
                              initialDocument={
                                item.kind === 'manual' ? item.note.document : undefined
                              }
                              initialValue={content}
                              key={noteKey}
                              onChange={(markdown, document) => {
                                setEditingContent(markdown)
                                setEditingDocument(document)
                              }}
                            />
                          </Suspense>
                        </div>
                      ) : (
                        <div id={contentId}>
                          {isExpanded && preview.body ? (
                            <MarkdownContent
                              className="border-t border-stone-100 px-4 py-4 text-stone-700"
                              content={preview.body}
                            />
                          ) : null}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </article>
          ))}
        </section>
      ) : null}

    </PageContainer>
  )
}

export function LearnerNoteCreatePage() {
  usePageTitle('새 노트 작성')
  const navigate = useNavigate()
  const { user } = useAuth()
  const { show: showToast } = useToast()
  const storageKey = useMemo(
    () => getManualNotesStorageKey(user?.id ?? user?.email ?? 'anonymous'),
    [user?.email, user?.id],
  )
  const [content, setContent] = useState('# 새 노트\n\n')
  const [document, setDocument] = useState<string | undefined>()

  function saveNote() {
    if (!content.trim()) return
    const now = new Date().toISOString()
    const note: ManualNote = {
      content: content.trim(),
      createdAt: now,
      document,
      id: createClientId(),
      updatedAt: now,
    }
    window.localStorage.setItem(
      storageKey,
      JSON.stringify([note, ...readManualNotes(storageKey)]),
    )
    showToast('노트를 추가했습니다.', 'success')
    navigate(routes.notes)
  }

  return (
    <PageContainer>
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink to={routes.notes} variant="secondary">
              <ArrowLeft aria-hidden="true" size={15} />
              목록으로
            </ButtonLink>
            <Button disabled={!content.trim()} onClick={saveNote}>
              저장
            </Button>
          </div>
        }
        title="새 노트 작성"
        titleAccessory={
          <p className="type-caption text-stone-400">
            제목, 토글, 구분선, 목록을 사용해 자유롭게 정리하세요.
          </p>
        }
      />
      <section className="min-h-[calc(100dvh-13rem)] rounded-lg border border-stone-200 bg-white p-5">
        <Suspense fallback={<EditorLoadingState />}>
          <NotionBlockEditor
            ariaLabel="새 노트 내용"
            className="min-h-[calc(100dvh-16rem)]"
            initialDocument={document}
            initialValue={content}
            key="manual-note-composer"
            onChange={(markdown, nextDocument) => {
              setContent(markdown)
              setDocument(nextDocument)
            }}
          />
        </Suspense>
      </section>
    </PageContainer>
  )
}

function EditorLoadingState() {
  return (
    <div
      className="flex min-h-[420px] items-center justify-center rounded-lg border border-stone-200 bg-stone-50 type-body text-stone-500"
      role="status"
    >
      편집기를 불러오는 중입니다.
    </div>
  )
}

function getNoteKey(item: LearnerNoteItem): string {
  return `${item.kind}-${item.note.id}`
}

function getNoteContent(item: LearnerNoteItem): string {
  return item.note.content
}

function getNoteSourceLabel(item: LearnerNoteItem): string {
  return item.kind === 'manual' ? '개인 노트' : item.session.materialTitle
}

function groupNoteItems(items: LearnerNoteItem[]): LearnerNoteGroup[] {
  const groups = new Map<string, LearnerNoteGroup>()

  items.forEach((item) => {
    const groupId = item.kind === 'manual'
      ? 'manual'
      : `material-${item.session.materialId ?? item.session.materialTitle}`
    const current = groups.get(groupId)
    if (current) {
      current.items.push(item)
      return
    }
    groups.set(groupId, {
      id: groupId,
      items: [item],
      label: getNoteSourceLabel(item),
      session: item.kind === 'session' ? item.session : undefined,
    })
  })

  return [...groups.values()]
}

function getManualNotesStorageKey(userId: string | number): string {
  return `edupilot:manual-notes:${String(userId)}`
}

function readManualNotes(storageKey: string): ManualNote[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter(isManualNote)
  } catch {
    return []
  }
}

function isManualNote(value: unknown): value is ManualNote {
  if (typeof value !== 'object' || value === null) return false
  const note = value as Partial<ManualNote>
  return typeof note.id === 'string'
    && typeof note.content === 'string'
    && typeof note.createdAt === 'string'
    && typeof note.updatedAt === 'string'
}

function createClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
