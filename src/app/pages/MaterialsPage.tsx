import {
  ArrowUpRight,
  FileText,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  useMemo,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react'

import {
  createMaterialsRepository,
  getMaterialFailureMessage,
  getMaterialStatusLabel,
  MAX_MATERIAL_TITLE_LENGTH,
  RenameMaterialDialog,
  validateMaterialUpload,
  validateMaterialTitle,
  type MaterialStatus,
  type StudyMaterial,
} from '../../features/materials'
import { useAuth } from '../../features/auth'
import { ApiClientError, getRequestErrorMessage } from '../../shared/api'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  PageContainer,
  SkeletonRows,
  PageHeader,
  useToast,
} from '../../shared/ui'
import { formatDate, formatFileSize } from '../../shared/lib/format'
import { useMaterialsList } from '../../features/materials/useMaterialsList'
import { materialViewerPath, sessionDetailPath } from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'

export function MaterialsPage() {
  usePageTitle('자료')
  const { show: showToast } = useToast()
  const { apiRequest } = useAuth()
  const repository = useMemo(
    () => createMaterialsRepository(apiRequest),
    [apiRequest],
  )
  const list = useMaterialsList(repository)
  const { data: { items: materials, page, size, totalElements, totalPages }, isLoading, isStale, error: loadError } = list
  const [isDropActive, setIsDropActive] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [materialTitle, setMaterialTitle] = useState('')
  const [renamingMaterial, setRenamingMaterial] = useState<StudyMaterial | null>(null)
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(
    null,
  )
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mutationControllerRef = useRef<AbortController | null>(null)
  const uploadControllerRef = useRef<AbortController | null>(null)
  const uploadAttemptRef = useRef(0)
  const deleteInFlightRef = useRef(false)
  const uploadInFlightRef = useRef(false)
  const readyCount = useMemo(
    () => materials.filter((material) => material.status === 'READY').length,
    [materials],
  )

  useEffect(() => {
    const controller = new AbortController()
    mutationControllerRef.current = controller
    return () => {
      controller.abort()
      uploadAttemptRef.current += 1
      uploadControllerRef.current?.abort()
    }
  }, [repository])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (uploadInFlightRef.current) return
    const file = event.target.files?.[0] ?? null
    acceptFile(file)
    event.target.value = ''
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDropActive(false)
    if (uploadInFlightRef.current) return
    acceptFile(event.dataTransfer.files?.[0] ?? null)
  }

  function acceptFile(file: File | null) {
    const validationError = validateMaterialUpload(file)
    setUploadError(validationError)

    if (validationError || !file) {
      setSelectedFile(null)
      setSelectedFileName(null)
      setMaterialTitle('')
      return
    }

    setSelectedFile(file)
    setSelectedFileName(file.name)
    setMaterialTitle(file.name)
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (uploadInFlightRef.current) return

    const fileError = validateMaterialUpload(selectedFile)
    const titleError = validateMaterialTitle(materialTitle)
    const validationError = fileError ?? titleError
    setUploadError(validationError)
    if (validationError || !selectedFile) return

    const controller = new AbortController()
    const signal = controller.signal
    const attempt = uploadAttemptRef.current + 1
    uploadAttemptRef.current = attempt
    uploadControllerRef.current = controller
    uploadInFlightRef.current = true
    setIsUploading(true)
    try {
      const nextMaterial = await repository.upload(selectedFile, {
        signal,
        title: materialTitle.trim(),
      })
      if (signal.aborted || uploadAttemptRef.current !== attempt) return
      list.uploaded(nextMaterial)
      setSelectedFile(null)
      setSelectedFileName(null)
      setMaterialTitle('')
      showToast('업로드를 시작했습니다. 처리 상태를 확인하세요.', 'success')
    } catch (error) {
      if (!signal.aborted && uploadAttemptRef.current === attempt) {
        setUploadError(getRequestErrorMessage(error))
      }
    } finally {
      if (uploadAttemptRef.current === attempt) {
        uploadControllerRef.current = null
        uploadInFlightRef.current = false
        setIsUploading(false)
      }
    }
  }

  function cancelUpload() {
    if (!uploadInFlightRef.current) return
    uploadAttemptRef.current += 1
    uploadControllerRef.current?.abort()
    uploadControllerRef.current = null
    uploadInFlightRef.current = false
    setIsUploading(false)
    setUploadError(
      '브라우저의 업로드 요청을 중단했습니다. 서버 처리 여부는 목록을 새로고침해 확인하세요.',
    )
  }

  async function handleDelete(material: StudyMaterial) {
    if (deleteInFlightRef.current) return
    if (!window.confirm(`'${material.title}' 자료를 삭제할까요?`)) return

    const signal = mutationControllerRef.current?.signal
    if (!signal || signal.aborted) return
    deleteInFlightRef.current = true
    setDeletingMaterialId(material.id)
    try {
      await repository.delete(material.id, signal)
      if (signal.aborted) return
      list.deleted(material.id)
      showToast('자료를 삭제했습니다.', 'success')
    } catch (error) {
      if (signal.aborted) return
      if (
        error instanceof ApiClientError &&
        error.code === 'MATERIAL_HAS_ACTIVE_SESSION'
      ) {
        showToast(
          '진행 중인 학습 세션이 있어 삭제할 수 없습니다. 세션을 완료하거나 삭제한 뒤 다시 시도하세요.',
          'danger',
        )
      } else {
        showToast(getRequestErrorMessage(error), 'danger')
      }
    } finally {
      deleteInFlightRef.current = false
      if (!signal.aborted) setDeletingMaterialId(null)
    }
  }

  async function handleRename(title: string): Promise<boolean> {
    const signal = mutationControllerRef.current?.signal
    if (!renamingMaterial || !signal || signal.aborted) return false
    try {
      const renamed = await repository.rename(renamingMaterial.id, title, signal)
      if (signal.aborted) return false
      list.renamed(renamed)
      showToast('자료 이름을 변경했습니다.', 'success')
      return true
    } catch (error) {
      if (!signal.aborted) showToast(getRequestErrorMessage(error), 'danger')
      return false
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="자료"
        actions={
          <>
            <Badge tone="success">현재 페이지 준비 완료 {readyCount}</Badge>
            <Badge tone="neutral">{isStale ? (isLoading ? '전체 확인 중' : '전체 확인 필요') : `전체 ${totalElements}`}</Badge>
          </>
        }
      />

      <form className="overflow-hidden rounded-xl border border-stone-200 bg-white" onSubmit={submitUpload}>
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="type-section-title font-bold text-stone-950">PDF 업로드</h2>
            <p className="mt-1 type-body text-stone-500">45MB 이하 PDF 파일 · PPT/PPTX는 PDF로 변환 후 업로드</p>
          </div>
          <Button disabled={isLoading} onClick={list.refresh} type="button" variant="secondary">
            <RefreshCw aria-hidden="true" size={15} />
            처리 상태 새로고침
          </Button>
        </div>

        <div
          aria-label="PDF 업로드 드롭 영역"
          className={[
            'm-4 flex min-h-24 flex-col justify-center rounded-lg border border-dashed px-4 py-4 sm:m-5 sm:flex-row sm:items-center sm:justify-between',
            isDropActive ? 'border-brand-500 bg-brand-50' : 'border-stone-300 bg-stone-50',
          ].join(' ')}
          onDragLeave={() => setIsDropActive(false)}
          onDragOver={(event) => {
            event.preventDefault()
            if (!uploadInFlightRef.current) setIsDropActive(true)
          }}
          onDrop={handleDrop}
        >
          <input
            aria-label="PDF 파일"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={isUploading}
            id="material-upload"
            onChange={handleFileChange}
            ref={fileInputRef}
            type="file"
          />
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500">
              <Upload aria-hidden="true" size={17} />
            </span>
            <div className="min-w-0">
              <p className="type-body font-semibold text-stone-800">
                파일을 끌어 놓거나 선택하세요.
              </p>
              <label
                className="mt-1 block truncate type-caption text-stone-500"
                htmlFor="material-upload"
              >
                {selectedFileName ?? '선택된 파일 없음'}
              </label>
            </div>
          </div>
          <Button
            className="mt-3 shrink-0 sm:mt-0"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload aria-hidden="true" size={15} />
            PDF 선택
          </Button>
        </div>

        <div className="mx-4 mb-4 flex flex-col gap-3 sm:mx-5 sm:mb-5 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 type-control font-semibold text-stone-700">
            자료 제목
            <input
              aria-invalid={Boolean(materialTitle && validateMaterialTitle(materialTitle))}
              className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body text-stone-950 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              disabled={!selectedFile || isUploading}
              maxLength={MAX_MATERIAL_TITLE_LENGTH}
              onChange={(event) => {
                setMaterialTitle(event.target.value)
                setUploadError(null)
              }}
              placeholder="자료 제목을 입력하세요."
              value={materialTitle}
            />
          </label>
          <div className="flex shrink-0 gap-2">
            {isUploading ? (
              <Button onClick={cancelUpload} type="button" variant="secondary">
                업로드 취소
              </Button>
            ) : null}
            <Button
              disabled={!selectedFile || Boolean(validateMaterialTitle(materialTitle)) || isUploading}
              type="submit"
            >
              <Upload aria-hidden="true" size={15} />
              {isUploading ? '업로드 중' : '업로드'}
            </Button>
          </div>
        </div>

        {uploadError ? (
          <p className="mx-4 mb-4 type-body font-medium text-rose-700 sm:mx-5 sm:mb-5" role="alert">
            {uploadError}
          </p>
        ) : null}
      </form>

      <section aria-busy={isLoading} aria-label="업로드된 자료" className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-4 sm:px-5">
          <h2 className="type-section-title font-bold text-stone-950">업로드된 자료</h2>
          <span className="type-caption font-medium text-stone-500">{isStale ? '자료 수 확인 필요' : `전체 ${totalElements}개 자료`}</span>
        </div>

        <div className="hidden grid-cols-[minmax(0,1fr)_120px_140px_230px] gap-4 border-b border-stone-200 bg-stone-50 px-5 py-2 type-caption font-bold text-stone-500 lg:grid">
          <span>자료</span>
          <span>상태</span>
          <span>업로드</span>
          <span className="text-right">작업</span>
        </div>

        {isLoading && materials.length === 0 ? (
          <SkeletonRows count={3} />
        ) : loadError && materials.length === 0 ? (
          <ErrorState
            title="자료를 불러오지 못했습니다."
            description={loadError.message}
            action={
              <Button disabled={isLoading} onClick={list.retry} type="button">
                다시 시도
              </Button>
            }
          />
        ) : materials.length === 0 ? (
          <EmptyState
            title="등록된 자료가 없습니다."
            description="위 업로드 영역에서 첫 PDF 자료를 추가하세요."
          />
        ) : (
        <div className="divide-y divide-stone-200">
          {materials.map((material) => (
            <article
              className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_120px_140px_230px] lg:items-center"
              key={material.id}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-500">
                  <FileText aria-hidden="true" size={17} />
                </span>
                <div className="min-w-0">
                  <h3 className="break-words type-body font-bold text-stone-950">
                    {material.title}
                  </h3>
                  <p className="mt-1 type-caption text-stone-500">
                    {material.fileSizeBytes
                      ? formatFileSize(material.fileSizeBytes)
                      : '파일 크기 정보 없음'}
                    {material.pageCount ? ` · ${material.pageCount}쪽` : ''}
                  </p>
                  {material.status === 'FAILED' ? (
                    <p className="mt-2 type-caption font-medium text-rose-700">
                      {getMaterialFailureMessage(material.failureReason)}
                      {material.traceId ? (
                        <span className="ml-1 font-normal text-rose-500">
                          문의 코드 {material.traceId}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {material.activeSessionId ? (
                    <div className="mt-2">
                      <p className="type-caption font-semibold text-amber-800">
                        진행 중인 학습 세션이 있습니다.
                      </p>
                      <ButtonLink
                        className="mt-1"
                        size="sm"
                        to={sessionDetailPath(material.activeSessionId)}
                        variant="ghost"
                      >
                        세션으로 이동
                        <ArrowUpRight aria-hidden="true" size={14} />
                      </ButtonLink>
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <StatusBadge status={material.status} />
              </div>
              <p className="type-caption text-stone-500">
                <span className="mr-2 font-semibold text-stone-700 lg:hidden">업로드</span>
                {formatDate(material.createdAt)}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                <ButtonLink
                  size="sm"
                  to={materialViewerPath(material.id)}
                  variant="secondary"
                >
                  PDF 열기
                </ButtonLink>
                <Button
                  aria-label={`${material.title} 이름 변경`}
                  onClick={() => setRenamingMaterial(material)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Pencil aria-hidden="true" size={15} />
                </Button>
                <Button
                  aria-label={`${material.title} 삭제`}
                  disabled={deletingMaterialId !== null}
                  onClick={() => void handleDelete(material)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" size={15} />
                </Button>
              </div>
            </article>
          ))}
        </div>
        )}
        {loadError && materials.length > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 sm:px-5" role="alert">
            <p className="type-body text-rose-700">{loadError.message}</p>
            <Button disabled={isLoading} onClick={list.retry} size="sm" type="button" variant="secondary">
              다시 시도
            </Button>
          </div>
        ) : null}
        {isLoading && materials.length > 0 ? (
          <p className="px-5 py-2 type-caption text-stone-500" role="status">자료를 불러오는 중...</p>
        ) : null}
        <nav aria-label="자료 페이지" className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-4 py-3 type-caption text-stone-500 sm:px-5">
          <span>{isStale ? '새로고침 후 자료 수를 확인할 수 있습니다.' : `${materials.length === 0 ? 0 : page * size + 1}-${materials.length === 0 ? 0 : page * size + materials.length} / ${totalElements}개`}</span>
          <div className="flex items-center gap-2">
            <Button aria-label="이전 페이지" disabled={isLoading || isStale || page <= 0} onClick={() => void list.loadPage(page - 1)} size="sm" type="button" variant="secondary">이전</Button>
            <span>{isStale ? '페이지 확인 필요' : `${totalPages === 0 ? 0 : page + 1} / ${totalPages} 페이지`}</span>
            <Button aria-label="다음 페이지" disabled={isLoading || isStale || page + 1 >= totalPages} onClick={() => void list.loadPage(page + 1)} size="sm" type="button" variant="secondary">다음</Button>
          </div>
        </nav>
      </section>
      {renamingMaterial ? (
        <RenameMaterialDialog
          initialTitle={renamingMaterial.title}
          onClose={() => setRenamingMaterial(null)}
          onSave={handleRename}
        />
      ) : null}
    </PageContainer>
  )
}

function StatusBadge({ status }: { status: MaterialStatus }) {
  return <Badge tone={statusTone[status]}>{getMaterialStatusLabel(status)}</Badge>
}

const statusTone: Record<MaterialStatus, 'danger' | 'success' | 'warning'> = {
  FAILED: 'danger',
  PROCESSING: 'warning',
  READY: 'success',
}
