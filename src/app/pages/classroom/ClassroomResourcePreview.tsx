import {
  ArrowLeft,
  Bot,
  Download,
  ExternalLink,
  File,
  FileText,
  Image,
  Link as LinkIcon,
  Pencil,
  Send,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { ClassroomWeek } from '../../../features/classrooms'
import { Badge, Button } from '../../../shared/ui'
import type { ClassroomResourcePreviewValue } from './classroomContentModel'

export type { ClassroomResourcePreviewValue } from './classroomContentModel'

export type ClassroomResourceUploadInput =
  | { file: File; title: string; type: 'FILE'; weekNumber: number | null }
  | { title: string; type: 'LINK'; url: string; weekNumber: number | null }

const MAX_RESOURCE_FILE_BYTES = 45 * 1024 * 1024

export function ClassroomResourceUploadDialog({
  initialWeekNumber,
  isUploading = false,
  onClose,
  onUpload,
  weeks,
}: {
  initialWeekNumber?: number
  isUploading?: boolean
  onClose: () => void
  onUpload: (resource: ClassroomResourceUploadInput) => Promise<boolean>
  weeks: ClassroomWeek[]
}) {
  const orderedWeeks = useMemo(
    () => [...weeks].sort((left, right) => left.weekNumber - right.weekNumber),
    [weeks],
  )
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [weekNumber, setWeekNumber] = useState<number | null>(
    initialWeekNumber ?? orderedWeeks[0]?.weekNumber ?? 1,
  )
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const titleError = title.trim() ? null : '자료 제목을 입력하세요.'
  const fileError = file && file.size > MAX_RESOURCE_FILE_BYTES
    ? '파일은 최대 45MB까지 업로드할 수 있습니다.'
    : null
  const urlError = mode === 'link' && url ? validateWebUrl(url) : null
  const canPreview = !titleError && !fileError && (mode === 'file' ? Boolean(file) : Boolean(url) && !urlError)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  function selectFile(nextFile: File | null) {
    setFile(nextFile)
    if (nextFile) setTitle(removeFileExtension(nextFile.name))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canPreview || isUploading) return

    if (mode === 'link') {
      await onUpload({
        title: title.trim(),
        type: 'LINK',
        url: normalizeWebUrl(url),
        weekNumber,
      })
      return
    }

    if (!file) return
    await onUpload({
      file,
      title: title.trim(),
      type: 'FILE',
      weekNumber,
    })
  }

  return (
    <div
      aria-label="자료 업로드"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="dialog"
    >
      <form className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-dialog-title font-bold text-stone-950">자료 업로드</h2>
          <button
            aria-label="자료 업로드 닫기"
            className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={17} />
          </button>
        </div>

        <div aria-label="자료 유형" className="mt-5 grid grid-cols-2 rounded-lg bg-stone-100 p-1" role="group">
          <button
            aria-pressed={mode === 'file'}
            className={modeButtonClass(mode === 'file')}
            onClick={() => setMode('file')}
            type="button"
          >
            <File aria-hidden="true" size={14} />
            파일
          </button>
          <button
            aria-pressed={mode === 'link'}
            className={modeButtonClass(mode === 'link')}
            onClick={() => setMode('link')}
            type="button"
          >
            <LinkIcon aria-hidden="true" size={14} />
            웹 링크
          </button>
        </div>

        <label className="mt-4 block type-control font-semibold text-stone-800">
          주차 선택
          <select
            className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body"
            onChange={(event) => setWeekNumber(event.target.value ? Number(event.target.value) : null)}
            value={weekNumber ?? ''}
          >
            <option value="">전체 항목</option>
            {orderedWeeks.map((week) => (
              <option key={week.id} value={week.weekNumber}>
                {week.weekNumber}주차 · {week.title}
              </option>
            ))}
          </select>
        </label>

        {mode === 'file' ? (
          <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 text-center text-stone-600 hover:border-brand-300 hover:bg-brand-50/40">
            <Upload aria-hidden="true" size={20} />
            <span className="mt-2 max-w-full truncate type-body font-semibold">
              {file?.name ?? '파일 선택'}
            </span>
            <input
              aria-label="업로드할 자료 파일"
              className="sr-only"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
        ) : (
          <label className="mt-4 block type-control font-semibold text-stone-800">
            웹 주소
            <input
              aria-invalid={Boolean(urlError)}
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://"
              type="url"
              value={url}
            />
          </label>
        )}
        {fileError ? <p className="mt-2 type-caption font-medium text-rose-700" role="alert">{fileError}</p> : null}
        {urlError ? <p className="mt-2 type-caption font-medium text-rose-700" role="alert">{urlError}</p> : null}

        <label className="mt-4 block type-control font-semibold text-stone-800">
          자료 제목
          <input
            aria-invalid={Boolean(titleError)}
            className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="자료 제목을 입력하세요."
            value={title}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose} variant="secondary">취소</Button>
          <Button disabled={!canPreview || isUploading} type="submit">
            {isUploading ? '업로드 중' : '업로드'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export function ClassroomResourcePreviewPanel({
  canManage = false,
  onDelete,
  onEdit,
  onClose,
  resource,
  weekTitle,
}: {
  canManage?: boolean
  onDelete?: () => void
  onEdit?: () => void
  onClose: () => void
  resource: ClassroomResourcePreviewValue
  weekTitle?: string
}) {
  return (
    <article className="flex h-full min-h-[600px] flex-col overflow-hidden rounded-lg border border-stone-200 bg-white">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-stone-200 px-4 sm:px-5">
        <button
          aria-label="콘텐츠 목록으로 돌아가기"
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100"
          onClick={onClose}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate type-section-title font-bold text-stone-950">{resource.title}</h2>
            <Badge tone="neutral">자료</Badge>
          </div>
          <p className="truncate type-caption text-stone-500">
            {weekTitle ?? (resource.weekNumber === null ? '전체 항목' : `${resource.weekNumber}주차`)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {resource.source.kind === 'file' && resource.source.objectUrl ? (
            <a
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-200 px-2.5 type-caption font-semibold text-stone-700 hover:bg-stone-50"
              download={resource.source.fileName}
              href={resource.source.objectUrl}
            >
              <Download aria-hidden="true" size={13} />
              다운로드
            </a>
          ) : null}
          {canManage && onEdit ? <Button onClick={onEdit} size="sm" variant="secondary"><Pencil size={13} />수정</Button> : null}
          {canManage && onDelete ? <Button onClick={onDelete} size="sm" variant="secondary"><Trash2 size={13} />삭제</Button> : null}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ResourceViewer resource={resource} />
        <aside aria-label="자료 질문" className="flex min-h-[360px] min-w-0 flex-col border-t border-stone-200 bg-white lg:min-h-0 lg:border-t-0 lg:border-l">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-stone-200 px-4">
            <Bot aria-hidden="true" className="text-brand-700" size={17} />
            <h3 className="type-body font-bold text-stone-950">자료 질문</h3>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
            <div>
              <span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Bot aria-hidden="true" size={19} />
              </span>
              <p className="mt-3 type-body font-semibold text-stone-700">일반 자료 질문 미지원</p>
              <p className="mt-1 type-caption text-stone-400">AI 질문이 필요한 자료는 PDF 수업으로 등록해 주세요.</p>
            </div>
          </div>
          <div className="shrink-0 border-t border-stone-200 p-3">
            <div className="flex items-end gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
              <textarea
                aria-label="자료 질문 입력"
                className="min-h-8 flex-1 resize-none bg-transparent px-1 py-1 type-body text-stone-500 outline-none"
                disabled
                placeholder="자료에 대해 질문..."
                rows={1}
              />
              <button
                aria-label="자료 질문 보내기"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-stone-300 text-white"
                disabled
                type="button"
              >
                <Send aria-hidden="true" size={15} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </article>
  )
}

export function ClassroomResourceEditDialog({
  onClose,
  onSave,
  resource,
  weeks,
}: {
  onClose: () => void
  onSave: (input: { title: string; weekNumber: number | null }) => Promise<boolean>
  resource: ClassroomResourcePreviewValue
  weeks: ClassroomWeek[]
}) {
  const [title, setTitle] = useState(resource.title)
  const [weekNumber, setWeekNumber] = useState<number | null>(resource.weekNumber)
  const [isSaving, setIsSaving] = useState(false)
  const orderedWeeks = useMemo(
    () => [...weeks].sort((left, right) => left.weekNumber - right.weekNumber),
    [weeks],
  )

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isSaving, onClose])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim() || isSaving) return
    setIsSaving(true)
    try {
      if (await onSave({ title: title.trim(), weekNumber })) onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      aria-label="일반 자료 수정"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose() }}
      role="dialog"
    >
      <form className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-dialog-title font-bold text-stone-950">일반 자료 수정</h2>
          <button aria-label="일반 자료 수정 닫기" className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100" disabled={isSaving} onClick={onClose} type="button"><X size={17} /></button>
        </div>
        <label className="mt-5 block type-control font-semibold text-stone-800">
          주차 선택
          <select className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body" onChange={(event) => setWeekNumber(event.target.value ? Number(event.target.value) : null)} value={weekNumber ?? ''}>
            <option value="">전체 항목</option>
            {orderedWeeks.map((week) => <option key={week.id} value={week.weekNumber}>{week.weekNumber}주차 · {week.title}</option>)}
          </select>
        </label>
        <label className="mt-4 block type-control font-semibold text-stone-800">
          자료 제목
          <input className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" maxLength={200} onChange={(event) => setTitle(event.target.value)} value={title} />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={isSaving} onClick={onClose} variant="secondary">취소</Button>
          <Button disabled={!title.trim() || isSaving} type="submit">{isSaving ? '저장 중' : '저장'}</Button>
        </div>
      </form>
    </div>
  )
}

function ResourceViewer({ resource }: { resource: ClassroomResourcePreviewValue }) {
  if (resource.source.kind === 'link') {
    return (
      <section aria-label="웹 링크 뷰어" className="flex min-h-[360px] items-center justify-center bg-stone-50 p-6 text-center">
        <div className="max-w-md">
          <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-white text-brand-700 shadow-sm ring-1 ring-stone-200">
            <LinkIcon aria-hidden="true" size={22} />
          </span>
          <p className="mt-4 break-all type-body text-stone-600">{resource.source.url}</p>
          <a
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 type-control font-semibold text-white hover:bg-brand-700"
            href={resource.source.url}
            rel="noreferrer"
            target="_blank"
          >
            새 탭에서 열기
            <ExternalLink aria-hidden="true" size={14} />
          </a>
        </div>
      </section>
    )
  }

  if (resource.source.previewKind === 'image' && resource.source.objectUrl) {
    return (
      <section aria-label="이미지 뷰어" className="flex min-h-[360px] items-center justify-center overflow-auto bg-stone-100 p-4">
        <img alt={resource.title} className="max-h-full max-w-full object-contain" src={resource.source.objectUrl} />
      </section>
    )
  }

  if (resource.source.previewKind === 'pdf' && resource.source.objectUrl) {
    return (
      <section aria-label="PDF 자료 뷰어" className="min-h-[520px] bg-stone-100 p-2">
        <iframe className="h-full min-h-[500px] w-full border-0 bg-white" src={resource.source.objectUrl} title={`${resource.title} PDF 미리보기`} />
      </section>
    )
  }

  const Icon = resource.source.previewKind === 'image' ? Image : FileText
  return (
    <section aria-label="문서 자료 뷰어" className="flex min-h-[360px] items-center justify-center bg-stone-50 p-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto flex size-12 items-center justify-center rounded-lg bg-white text-stone-600 shadow-sm ring-1 ring-stone-200">
          <Icon aria-hidden="true" size={22} />
        </span>
        <p className="mt-4 break-all type-body font-semibold text-stone-800">{resource.source.fileName}</p>
        <p className="mt-1 type-caption text-stone-400">{formatFileSize(resource.source.fileSize)}</p>
      </div>
    </section>
  )
}

function removeFileExtension(value: string): string {
  return value.replace(/\.[^.]+$/, '')
}

function normalizeWebUrl(value: string): string {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function validateWebUrl(value: string): string | null {
  try {
    const parsed = new URL(normalizeWebUrl(value))
    return parsed.hostname ? null : '유효한 웹 주소를 입력하세요.'
  } catch {
    return '유효한 웹 주소를 입력하세요.'
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function modeButtonClass(active: boolean): string {
  return `flex h-9 items-center justify-center gap-2 rounded-md type-control font-semibold ${active ? 'bg-white text-brand-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`
}
