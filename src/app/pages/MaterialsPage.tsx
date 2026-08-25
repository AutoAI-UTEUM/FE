import {
  ArrowUpRight,
  FileText,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  useCallback,
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
import { usePolling } from '../../shared/state'
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
  const [materials, setMaterials] = useState<StudyMaterial[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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
  const materialMutationVersionRef = useRef(0)
  const uploadInFlightRef = useRef(false)
  const readyCount = useMemo(
    () => materials.filter((material) => material.status === 'READY').length,
    [materials],
  )

  useEffect(() => {
    const controller = new AbortController()
    const mutationVersion = materialMutationVersionRef.current

    repository
      .list(controller.signal)
      .then((nextMaterials) => {
        if (mutationVersion !== materialMutationVersionRef.current) return
        setMaterials(nextMaterials)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(getRequestErrorMessage(error))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [repository])

  const refreshInBackground = useCallback(async () => {
    try {
      const nextMaterials = await repository.refreshStatuses()
      setMaterials((current) => mergeServerMaterials(nextMaterials, current))
    } catch {
      // 백그라운드 폴링 실패는 무시 — 에러는 수동 새로고침에서만 표시
    }
  }, [repository])

  usePolling(
    materials.some((material) => material.status === 'PROCESSING'),
    refreshInBackground,
  )

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    acceptFile(file)
    event.target.value = ''
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDropActive(false)
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

    uploadInFlightRef.current = true
    setIsUploading(true)
    try {
      const nextMaterial = await repository.upload(selectedFile, {
        title: materialTitle.trim(),
      })
      materialMutationVersionRef.current += 1
      setMaterials((current) => [nextMaterial, ...current])
      setSelectedFile(null)
      setSelectedFileName(null)
      setMaterialTitle('')
      showToast('업로드를 시작했습니다. 처리 상태를 확인하세요.', 'success')
    } catch (error) {
      setUploadError(getRequestErrorMessage(error))
    } finally {
      uploadInFlightRef.current = false
      setIsUploading(false)
    }
  }

  async function refreshProcessingStatuses() {
    try {
      const nextMaterials = await repository.refreshStatuses()
      setMaterials((current) => mergeServerMaterials(nextMaterials, current))
      setLoadError(null)
    } catch (error) {
      setLoadError(getRequestErrorMessage(error))
    }
  }

  async function handleDelete(material: StudyMaterial) {
    if (deletingMaterialId) return
    if (!window.confirm(`'${material.title}' 자료를 삭제할까요?`)) return

    setDeletingMaterialId(material.id)
    try {
      await repository.delete(material.id)
      materialMutationVersionRef.current += 1
      setMaterials((current) =>
        current.filter((item) => item.id !== material.id),
      )
      showToast('자료를 삭제했습니다.', 'success')
    } catch (error) {
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
      setDeletingMaterialId(null)
    }
  }

  async function handleRename(title: string): Promise<boolean> {
    if (!renamingMaterial) return false
    try {
      const renamed = await repository.rename(renamingMaterial.id, title)
      materialMutationVersionRef.current += 1
      setMaterials((current) => current.map((item) => item.id === renamed.id ? { ...item, title: renamed.title } : item))
      showToast('자료 이름을 변경했습니다.', 'success')
      return true
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
      return false
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="자료"
        actions={
          <>
            <Badge tone="success">준비 완료 {readyCount}</Badge>
            <Badge tone="neutral">전체 {materials.length}</Badge>
          </>
        }
      />

      <form className="overflow-hidden rounded-xl border border-stone-200 bg-white" onSubmit={submitUpload}>
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="type-section-title font-bold text-stone-950">PDF 업로드</h2>
            <p className="mt-1 type-body text-stone-500">45MB 이하 PDF 파일 · PPT/PPTX는 PDF로 변환 후 업로드</p>
          </div>
          <Button onClick={refreshProcessingStatuses} type="button" variant="secondary">
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
            setIsDropActive(true)
          }}
          onDrop={handleDrop}
        >
          <input
            aria-label="PDF 파일"
            accept="application/pdf,.pdf"
            className="sr-only"
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
          <Button
            className="shrink-0"
            disabled={!selectedFile || Boolean(validateMaterialTitle(materialTitle)) || isUploading}
            type="submit"
          >
            <Upload aria-hidden="true" size={15} />
            {isUploading ? '업로드 중' : '업로드'}
          </Button>
        </div>

        {uploadError ? (
          <p className="mx-4 mb-4 type-body font-medium text-rose-700 sm:mx-5 sm:mb-5" role="alert">
            {uploadError}
          </p>
        ) : null}
      </form>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-4 sm:px-5">
          <h2 className="type-section-title font-bold text-stone-950">업로드된 자료</h2>
          <span className="type-caption font-medium text-stone-500">{materials.length}개 자료</span>
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
            description={loadError}
            action={
              <Button onClick={refreshProcessingStatuses} type="button">
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
                  disabled={deletingMaterialId === material.id}
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

function mergeServerMaterials(
  serverMaterials: StudyMaterial[],
  currentMaterials: StudyMaterial[],
): StudyMaterial[] {
  const serverIds = new Set(serverMaterials.map((material) => material.id))
  const pendingUploads = currentMaterials.filter(
    (material) => material.status === 'PROCESSING' && !serverIds.has(material.id),
  )
  return [...pendingUploads, ...serverMaterials]
}

function StatusBadge({ status }: { status: MaterialStatus }) {
  return <Badge tone={statusTone[status]}>{getMaterialStatusLabel(status)}</Badge>
}

const statusTone: Record<MaterialStatus, 'danger' | 'success' | 'warning'> = {
  FAILED: 'danger',
  PROCESSING: 'warning',
  READY: 'success',
}
