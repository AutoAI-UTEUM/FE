import {
  ChevronLeft,
  ChevronRight,
  Download,
  List,
  Minus,
  MoveHorizontal,
  MoveVertical,
  PanelLeftOpen,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Link } from 'react-router-dom'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

import { cx } from '../../shared/lib/cx'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface SessionPageViewerProps {
  backTo?: string
  currentPage: number
  file?: Blob | null
  fileError?: string | null
  isPending?: boolean
  materialTitle?: string
  onMovePage: (page: number) => void
  onOpenResources?: () => void
  totalPages: number
}

type PageFitMode = 'page' | 'height' | 'width'

export function SessionPageViewer({
  backTo,
  currentPage,
  file,
  fileError,
  isPending = false,
  materialTitle,
  onMovePage,
  onOpenResources,
  totalPages,
}: SessionPageViewerProps) {
  const [zoom, setZoom] = useState(100)
  const [pageWidth, setPageWidth] = useState(560)
  const [pageAspectRatio, setPageAspectRatio] = useState(1 / Math.sqrt(2))
  const [pageFitMode, setPageFitMode] = useState<PageFitMode>('page')
  const [isOutlineVisible, setIsOutlineVisible] = useState(false)
  const viewerRef = useRef<HTMLElement | null>(null)
  const pageContainerRef = useRef<HTMLDivElement | null>(null)
  const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0
  const viewerGridClassName = cx(
    'grid min-h-0 flex-1',
    isOutlineVisible
      ? 'grid-cols-[144px_minmax(0,1fr)] sm:grid-cols-[152px_minmax(0,1fr)]'
      : 'grid-cols-[minmax(0,1fr)]',
  )

  useEffect(() => {
    const container = pageContainerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return

    const updatePageWidth = () => {
      if (container.clientWidth < 220 || container.clientHeight < 280) return
      const availableWidth = container.clientWidth - 48
      const availableHeight = container.clientHeight - 48
      const fittedWidth = pageFitMode === 'width'
        ? availableWidth
        : pageFitMode === 'height'
          ? availableHeight * pageAspectRatio
          : Math.min(availableWidth, availableHeight * pageAspectRatio)
      setPageWidth(Math.max(220, fittedWidth))
    }
    updatePageWidth()
    const observer = new ResizeObserver(updatePageWidth)
    observer.observe(container)
    window.addEventListener('resize', updatePageWidth)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePageWidth)
    }
  }, [pageAspectRatio, pageFitMode])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      if (isEditableTarget(event.target) || isResizeHandle(event.target)) return

      const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
      const isNext = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      if ((!isPrevious && !isNext) || isPending) return

      const nextPage = isPrevious ? currentPage - 1 : currentPage + 1
      if (nextPage < 1 || nextPage > totalPages) return
      event.preventDefault()
      onMovePage(nextPage)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPage, isPending, onMovePage, totalPages])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    function handleWheel(event: WheelEvent) {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return
      event.preventDefault()
      setZoom((value) => clampZoom(value + (event.deltaY < 0 ? 10 : -10)))
    }

    viewer.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewer.removeEventListener('wheel', handleWheel)
  }, [])

  function downloadOriginal() {
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = getDownloadFileName(materialTitle)
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  function applyPageFit(mode: Exclude<PageFitMode, 'page'>) {
    setZoom(100)
    setPageFitMode(mode)
  }

  return (
    <section aria-label="PDF 뷰어" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-y-0 border-stone-200 bg-white" ref={viewerRef}>
      <div className="flex h-13 shrink-0 items-center gap-3 border-b border-stone-200 px-4">
        {backTo ? (
          <Link
            aria-label="주차 페이지로"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            title="주차 페이지로"
            to={backTo}
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </Link>
        ) : null}
        <h2 className="hidden min-w-0 truncate type-body font-semibold text-stone-950 sm:block">
          {materialTitle ?? '학습 자료'}
        </h2>
        <span className="shrink-0 type-caption text-stone-400">
          {currentPage} / {totalPages}쪽
        </span>
        <div
          aria-label={`학습 진행률 ${currentPage} / ${totalPages}쪽`}
          className="hidden h-1 w-24 shrink-0 overflow-hidden rounded-full bg-stone-200 md:block"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-brand-600 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {onOpenResources ? (
            <ToolbarButton
              icon={PanelLeftOpen}
              label="자료 목록"
              onClick={onOpenResources}
              showLabel={false}
            />
          ) : null}
          <div className="flex h-8 items-center gap-1 rounded-lg border border-stone-200 px-1.5">
            <ToolbarIconButton
              icon={Minus}
              label="축소"
              onClick={() => setZoom((value) => clampZoom(value - 10))}
            />
            <span className="min-w-10 text-center type-caption font-medium text-stone-600">
              {zoom}%
            </span>
            <ToolbarIconButton
              icon={Plus}
              label="확대"
              onClick={() => setZoom((value) => clampZoom(value + 10))}
            />
          </div>
          <ToolbarButton
            icon={MoveVertical}
            isActive={pageFitMode === 'height'}
            label="높이 맞춤"
            onClick={() => applyPageFit('height')}
            showLabel={false}
          />
          <ToolbarButton
            icon={MoveHorizontal}
            isActive={pageFitMode === 'width'}
            label="너비 맞춤"
            onClick={() => applyPageFit('width')}
            showLabel={false}
          />
          <ToolbarButton
            icon={List}
            isActive={isOutlineVisible}
            label="목차"
            onClick={() => setIsOutlineVisible((visible) => !visible)}
            showLabel={false}
          />
          <ToolbarButton
            disabled={!file}
            icon={Download}
            label="원본 내려받기"
            onClick={downloadOriginal}
            showLabel={false}
          />
        </div>
      </div>

      {file ? (
        <Document
          className={viewerGridClassName}
          error={<DocumentState isError message="PDF 문서를 열지 못했습니다." />}
          file={file}
          loading={<DocumentState message="PDF 문서를 준비하는 중입니다." />}
        >
          {isOutlineVisible ? (
            <PageOutline
              currentPage={currentPage}
              isPending={isPending}
              onMovePage={onMovePage}
              renderThumbnails
              totalPages={totalPages}
            />
          ) : null}
          <div
            className="relative flex min-h-0 items-center justify-center overflow-hidden bg-white p-6"
            ref={pageContainerRef}
          >
              <Page
                className="overflow-hidden rounded-sm bg-white shadow-[0_2px_14px_rgba(0,0,0,0.08)]"
                pageNumber={currentPage}
                onLoadSuccess={(page) => {
                  const viewport = page.getViewport({ scale: 1 })
                  setPageAspectRatio(viewport.width / viewport.height)
                }}
                renderAnnotationLayer
                renderTextLayer
                width={pageWidth * (zoom / 100)}
              />
            <PageNavigation
              currentPage={currentPage}
              isPending={isPending}
              onMovePage={onMovePage}
              totalPages={totalPages}
            />
          </div>
        </Document>
      ) : (
        <div className={viewerGridClassName}>
          {isOutlineVisible ? (
            <PageOutline
              currentPage={currentPage}
              isPending={isPending}
              onMovePage={onMovePage}
              totalPages={totalPages}
            />
          ) : null}
          <div
            className="relative flex min-h-0 items-center justify-center overflow-hidden bg-white p-6"
            ref={pageContainerRef}
          >
            <ViewerState
              isError={file === null}
              message={
                file === undefined
                  ? 'PDF 원본을 불러오는 중입니다.'
                  : (fileError ?? 'PDF 원본을 표시할 수 없습니다.')
              }
            />
            <PageNavigation
              currentPage={currentPage}
              isPending={isPending}
              onMovePage={onMovePage}
              totalPages={totalPages}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function PageNavigation({
  currentPage,
  isPending,
  onMovePage,
  totalPages,
}: {
  currentPage: number
  isPending: boolean
  onMovePage: (page: number) => void
  totalPages: number
}) {
  return (
    <div className="absolute right-4 bottom-4 z-40 flex items-center gap-1 rounded-lg border border-stone-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:bg-stone-100/95">
      <ToolbarButton
        disabled={isPending || currentPage <= 1}
        icon={ChevronLeft}
        label="이전"
        onClick={() => onMovePage(currentPage - 1)}
        showLabel={false}
      />
      <ToolbarButton
        disabled={isPending || currentPage >= totalPages}
        icon={ChevronRight}
        label="다음"
        onClick={() => onMovePage(currentPage + 1)}
        showLabel={false}
      />
    </div>
  )
}

function PageOutline({
  currentPage,
  isPending,
  onMovePage,
  renderThumbnails = false,
  totalPages,
}: {
  currentPage: number
  isPending: boolean
  onMovePage: (page: number) => void
  renderThumbnails?: boolean
  totalPages: number
}) {
  return (
    <nav
      aria-label="자료 페이지"
      className="grid content-start gap-2 overflow-y-auto border-r border-stone-200 bg-stone-50 p-2 [scrollbar-gutter:stable]"
    >
      {Array.from({ length: totalPages }, (_, index) => index + 1).map(
        (pageNumber) => (
          <button
            aria-label={`${pageNumber}쪽으로 이동`}
            className={cx(
              'flex w-full flex-col items-center rounded-md border p-1.5 transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
              'disabled:cursor-not-allowed disabled:opacity-60',
              pageNumber === currentPage
                ? 'border-brand-600 bg-brand-50 text-brand-800'
                : 'border-stone-200 bg-white text-stone-400 hover:border-stone-300 hover:text-stone-600',
            )}
            disabled={isPending}
            key={pageNumber}
            onClick={() => onMovePage(pageNumber)}
            type="button"
          >
            <span className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-sm bg-white shadow-sm">
              {renderThumbnails ? (
                <Page
                  devicePixelRatio={1}
                  pageNumber={pageNumber}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  width={88}
                />
              ) : (
                <span className="h-full w-full animate-pulse bg-stone-100" />
              )}
            </span>
            <span className="mt-1 type-micro font-semibold">{pageNumber}</span>
          </button>
        ),
      )}
    </nav>
  )
}

function DocumentState({
  isError = false,
  message,
}: {
  isError?: boolean
  message: string
}) {
  return (
    <div className="col-span-full flex min-h-0 items-center justify-center bg-white p-6">
      <ViewerState isError={isError} message={message} />
    </div>
  )
}

function ViewerState({
  isError = false,
  message,
}: {
  isError?: boolean
  message: string
}) {
  return (
    <div
      className={cx(
        'flex h-full max-h-[36rem] min-h-64 w-full max-w-md items-center justify-center rounded-sm border bg-white px-6 text-center type-body shadow-sm',
        isError
          ? 'border-rose-200 text-rose-700'
          : 'border-stone-200 text-stone-500',
      )}
      role={isError ? 'alert' : 'status'}
    >
      {message}
    </div>
  )
}

function ToolbarIconButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className="flex size-5.5 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={13} />
    </button>
  )
}

function ToolbarButton({
  disabled = false,
  icon: Icon,
  isActive = false,
  label,
  onClick,
  showLabel = true,
}: {
  disabled?: boolean
  icon: LucideIcon
  isActive?: boolean
  label: string
  onClick?: () => void
  showLabel?: boolean
}) {
  return (
    <button
      aria-label={disabled ? `${label} (사용 불가)` : label}
      aria-pressed={disabled ? undefined : isActive}
      className={cx(
        'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 type-caption font-medium hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:bg-transparent',
        isActive
          ? 'border-brand-200 bg-brand-50 text-brand-700'
          : 'border-stone-200 text-stone-600',
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" size={13} />
      {showLabel ? <span className="hidden sm:inline">{label}</span> : null}
    </button>
  )
}

function getDownloadFileName(materialTitle: string | undefined): string {
  const title = materialTitle?.trim() || 'material.pdf'
  return /\.(pdf|pptx?)$/i.test(title) ? title : `${title}.pdf`
}

function clampZoom(value: number): number {
  return Math.min(200, Math.max(50, value))
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || Boolean(target.closest('input, textarea, select'))
}

function isResizeHandle(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('[role="separator"]'))
}
