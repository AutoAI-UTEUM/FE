import { Archive, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { isInstructorRole, useAuth } from '../../features/auth'
import { createClassroomsRepository, rememberClassroomId, type Classroom, type ClassroomNotice, type ClassroomNoticeInput, type ClassroomWeek } from '../../features/classrooms'
import { createExamsRepository, type Exam } from '../../features/exams'
import { createMaterialsRepository, getMaterialFailureMessage, MAX_MATERIAL_TITLE_LENGTH, RenameMaterialDialog, validateMaterialTitle, validateMaterialUpload } from '../../features/materials'
import { createSessionsRepository } from '../../features/sessions'
import { getRequestErrorMessage } from '../../shared/api'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { usePolling } from '../../shared/state'
import { Button, EmptyState, useToast } from '../../shared/ui'
import { examDetailPath, sessionDetailPath } from '../routes'
import { ClassroomContentPanel, ClassroomContentRail } from './classroom/ClassroomContentView'
import { ExamContentPanel, NoticeContentPanel, NoticeDetailPanel } from './classroom/ClassroomContentPanels'
import {
  ClassroomResourcePreviewPanel,
  ClassroomResourceUploadDialog,
  type ClassroomResourcePreviewValue,
} from './classroom/ClassroomResourcePreview'
import { buildClassroomContent, filterClassroomContent, getGlobalClassroomContent, type ClassroomContentFilter, type ClassroomResource } from './classroom/classroomContentModel'
import { ClassroomWorkspaceContainer } from './classroom/ClassroomWorkspaceContainer'
import { ClassroomHeaderInfoBar, ClassroomWorkspaceHeader } from './classroom/ClassroomWorkspaceHeader'

type ResourceKey = 'exams' | 'notices' | 'weeks'

export function ClassroomDetailPage() {
  usePageTitle('강의실 콘텐츠')
  const { classroomId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { apiRequest, rawApiRequest, user } = useAuth()
  const { show: showToast } = useToast()
  const classroomsRepository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const examsRepository = useMemo(() => createExamsRepository(apiRequest), [apiRequest])
  const materialsRepository = useMemo(() => createMaterialsRepository(apiRequest, rawApiRequest), [apiRequest, rawApiRequest])
  const sessionsRepository = useMemo(() => createSessionsRepository(apiRequest), [apiRequest])
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [weeks, setWeeks] = useState<ClassroomWeek[]>([])
  const [notices, setNotices] = useState<ClassroomNotice[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [classroomError, setClassroomError] = useState<string | null>(null)
  const [resourceErrors, setResourceErrors] = useState<Partial<Record<ResourceKey, string>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadTargetWeek, setUploadTargetWeek] = useState<number | null>(null)
  const [uploadInitialFile, setUploadInitialFile] = useState<File | null>(null)
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false)
  const [isResourceUploadDialogOpen, setIsResourceUploadDialogOpen] = useState(false)
  const [resourceTargetWeek, setResourceTargetWeek] = useState<number | null>(null)
  const [resourcePreview, setResourcePreview] = useState<ClassroomResourcePreviewValue | null>(null)
  const [resources, setResources] = useState<ClassroomResource[]>([])
  const [draggingWeek, setDraggingWeek] = useState<number | null>(null)
  const [pendingMaterial, setPendingMaterial] = useState<{ id: string; title: string; weekNumber: number } | null>(null)
  const [openingMaterialId, setOpeningMaterialId] = useState<string | null>(null)
  const [renamingMaterial, setRenamingMaterial] = useState<{ id: string; title: string } | null>(null)
  const materialRefreshInFlightRef = useRef(false)
  const resourceObjectUrlsRef = useRef(new Set<string>())
  const resourceSequenceRef = useRef(0)
  const uploadInFlightRef = useRef(false)
  const isInstructor = isInstructorRole(user?.role)
  const isReadOnly = classroom?.status === 'COMPLETED'
  const canManage = isInstructor && !isReadOnly

  const loadResource = useCallback(async (key: ResourceKey) => {
    try {
      if (key === 'weeks') {
        const loadedWeeks = await classroomsRepository.listWeeks(classroomId)
        setWeeks(sortWeeks(loadedWeeks))
      }
      if (key === 'notices') setNotices(await classroomsRepository.listNotices(classroomId))
      if (key === 'exams') setExams(await examsRepository.list(classroomId))
      setResourceErrors((current) => ({ ...current, [key]: undefined }))
    } catch (error) {
      setResourceErrors((current) => ({ ...current, [key]: getRequestErrorMessage(error) }))
    }
  }, [classroomId, classroomsRepository, examsRepository])

  const load = useCallback(async () => {
    setIsLoading(true)
    setClassroomError(null)
    try {
      const nextClassroom = await classroomsRepository.get(classroomId)
      setClassroom(nextClassroom)
      await Promise.all([loadResource('weeks'), loadResource('notices'), loadResource('exams')])
    } catch (error) {
      setClassroomError(getRequestErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [classroomId, classroomsRepository, loadResource])

  useEffect(() => {
    if (classroomId) rememberClassroomId(classroomId)
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [classroomId, load])

  useEffect(() => () => {
    resourceObjectUrlsRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
  }, [])

  useEffect(() => {
    function refreshVisibleContent() {
      if (document.visibilityState === 'visible') {
        void Promise.all([
          loadResource('weeks'),
          loadResource('notices'),
          loadResource('exams'),
        ])
      }
    }

    window.addEventListener('focus', refreshVisibleContent)
    document.addEventListener('visibilitychange', refreshVisibleContent)
    return () => {
      window.removeEventListener('focus', refreshVisibleContent)
      document.removeEventListener('visibilitychange', refreshVisibleContent)
    }
  }, [loadResource])

  const refreshWeekMaterials = useCallback(async (materialId?: string) => {
    if (materialRefreshInFlightRef.current) return
    const expectedId = materialId ?? pendingMaterial?.id
    materialRefreshInFlightRef.current = true
    try {
      const nextWeeks = sortWeeks(await classroomsRepository.listWeeks(classroomId))
      setWeeks(nextWeeks)
      const uploadedMaterial = expectedId
        ? nextWeeks.flatMap((week) => week.materials).find((material) => material.id === expectedId)
        : undefined
      if (uploadedMaterial?.status === 'READY') {
        setPendingMaterial((current) => current?.id === expectedId ? null : current)
        showToast('수업 생성이 완료되었습니다. 바로 학습할 수 있습니다.', 'success')
      }
      if (uploadedMaterial?.status === 'FAILED') {
        setPendingMaterial((current) => current?.id === expectedId ? null : current)
        let failureMessage = getMaterialFailureMessage()
        try {
          const detail = expectedId ? await materialsRepository.getById(expectedId) : null
          failureMessage = getMaterialFailureMessage(detail?.failureReason)
          if (detail?.traceId) failureMessage += ` 추적 ID: ${detail.traceId}`
        } catch {
          // The generic failure message remains available if detail lookup fails.
        }
        showToast(failureMessage, 'danger')
      }
    } catch {
      // The visible retry control handles background refresh failures.
    } finally {
      materialRefreshInFlightRef.current = false
    }
  }, [classroomId, classroomsRepository, materialsRepository, pendingMaterial, showToast])

  usePolling(
    Boolean(pendingMaterial) || weeks.some((week) => week.materials.some((material) => material.status === 'PROCESSING')),
    () => void refreshWeekMaterials(),
    3000,
  )

  const selectedWeekNumber = resolveSelectedWeek(searchParams.get('week'), classroom, weeks)
  const filter = parseFilter(searchParams.get('filter'))
  const panel = searchParams.get('panel')

  const content = useMemo(
    () => buildClassroomContent(weeks, notices, exams, resources),
    [exams, notices, resources, weeks],
  )
  const globalItems = useMemo(() => getGlobalClassroomContent(content, filter), [content, filter])
  const visibleItems = useMemo(() => filterClassroomContent(content, selectedWeekNumber, filter), [content, filter, selectedWeekNumber])
  const editingNoticeId = panel?.startsWith('notice-edit-')
    ? panel.slice('notice-edit-'.length)
    : null
  const viewingNoticeId = panel?.startsWith('notice-')
    && panel !== 'notice-new'
    && !panel.startsWith('notice-edit-')
    ? panel.slice('notice-'.length)
    : null
  const selectedNoticeId = editingNoticeId ?? viewingNoticeId
  const selectedNotice = selectedNoticeId
    ? notices.find((notice) => notice.id === selectedNoticeId) ?? null
    : null
  const selectedExam = panel?.startsWith('exam-') && panel !== 'exam-new'
    ? exams.find((exam) => exam.id === panel.slice('exam-'.length)) ?? null
    : null
  const editingNotice = panel === 'notice-new' || Boolean(editingNoticeId && selectedNotice)
  const viewingNotice = Boolean(viewingNoticeId && selectedNotice)
  const editingExam = panel === 'exam-new' || Boolean(selectedExam)

  function updateQuery(updates: Record<string, string | null>, replace = false) {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      Object.entries(updates).forEach(([key, value]) => value === null ? params.delete(key) : params.set(key, value))
      return params
    }, { replace })
  }

  async function uploadMaterial(file: File, title: string, weekNumber: number): Promise<boolean> {
    if (!canManage || uploadInFlightRef.current) return false
    const validationError = validateMaterialUpload(file) ?? validateMaterialTitle(title)
    if (validationError) {
      showToast(validationError, 'danger')
      return false
    }
    uploadInFlightRef.current = true
    setIsUploading(true)
    try {
      const material = await materialsRepository.upload(file, { classroomId, title, weekNumber })
      const uploadMessage = material.status === 'FAILED'
        ? `${getMaterialFailureMessage(material.failureReason)}${material.traceId ? ` 문의 코드 ${material.traceId}` : ''}`
        : '수업 생성을 시작했습니다. 처리가 완료되면 학습자 화면에 반영됩니다.'
      showToast(uploadMessage, material.status === 'FAILED' ? 'danger' : 'success')
      if (material.status === 'PROCESSING') {
        setPendingMaterial({ id: material.id, title: material.title, weekNumber })
      }
      await refreshWeekMaterials(material.status === 'PROCESSING' ? material.id : undefined)
      return material.status !== 'FAILED'
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
      return false
    } finally {
      uploadInFlightRef.current = false
      setIsUploading(false)
    }
  }

  async function openMaterial(materialId: string) {
    if (openingMaterialId) return
    setOpeningMaterialId(materialId)
    try {
      const session = await sessionsRepository.create(materialId)
      navigate(sessionDetailPath(session.id))
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
      setOpeningMaterialId(null)
    }
  }

  async function removeMaterial(weekNumber: number, materialId: string, title: string) {
    if (!canManage || !window.confirm(`'${title}' 자료를 ${weekNumber}주차에서 제거할까요?`)) return
    try {
      await classroomsRepository.detachMaterial(classroomId, weekNumber, materialId)
      await loadResource('weeks')
      showToast('주차에서 자료를 제거했습니다.', 'success')
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
    }
  }

  async function renameMaterial(title: string): Promise<boolean> {
    if (!canManage || !renamingMaterial) return false
    try {
      const renamed = await materialsRepository.rename(renamingMaterial.id, title)
      setWeeks((current) => current.map((week) => ({
        ...week,
        materials: week.materials.map((material) => material.id === renamed.id
          ? { ...material, title: renamed.title }
          : material),
      })))
      showToast('자료 이름을 변경했습니다.', 'success')
      return true
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
      return false
    }
  }

  async function saveNotice(input: ClassroomNoticeInput, noticeId?: string) {
    try {
      const saved = noticeId
        ? await classroomsRepository.updateNotice(classroomId, noticeId, input)
        : await classroomsRepository.createNotice(classroomId, input)
      setNotices((items) => noticeId ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items])
      updateQuery({ panel: `notice-${saved.id}` }, true)
      showToast(noticeId ? '공지를 수정했습니다.' : '공지를 등록했습니다.', 'success')
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
    }
  }

  async function deleteNotice(notice: ClassroomNotice) {
    if (!window.confirm(`'${notice.title}' 공지를 삭제할까요?`)) return
    try {
      await classroomsRepository.deleteNotice(classroomId, notice.id)
      setNotices((items) => items.filter((item) => item.id !== notice.id))
      updateQuery({ panel: null }, true)
      showToast('공지를 삭제했습니다.', 'success')
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
    }
  }

  if (isLoading && !classroom) return <ClassroomWorkspaceContainer><p className="py-16 text-center type-body text-stone-500" role="status">강의실 콘텐츠를 불러오는 중입니다.</p></ClassroomWorkspaceContainer>
  if (classroomError || !classroom) return <ClassroomWorkspaceContainer><EmptyState action={<Button onClick={() => void load()} variant="secondary">다시 시도</Button>} description={classroomError ?? '강의실 정보를 확인할 수 없습니다.'} title="강의실을 불러오지 못했습니다" /></ClassroomWorkspaceContainer>

  const selectedWeek = weeks.find((week) => week.weekNumber === selectedWeekNumber)

  return <ClassroomWorkspaceContainer className="lg:overflow-hidden">
    <ClassroomWorkspaceHeader
      actions={<ClassroomHeaderInfoBar classroom={classroom} inviteCodeDisabled={isReadOnly} onInviteCodeClick={() => void copyInviteCode(classroom, classroomsRepository, setClassroom, showToast)} showInviteCode={isInstructor} />}
      activeTab="course"
      classroom={classroom}
      showClassroomSummary={false}
    />

    {isInstructor && isReadOnly ? <p className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 type-caption text-stone-600"><Archive size={15} />종료된 강의실입니다. 콘텐츠를 확인할 수 있지만 새 항목을 추가하거나 수정할 수 없습니다.</p> : null}

    <section aria-label="강의실 통합 콘텐츠" className="grid min-h-[600px] items-start gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
      <ClassroomContentRail
        endDate={classroom.endDate}
        onSelect={(weekNumber) => {
          setResourcePreview(null)
          updateQuery({ panel: null, week: weekNumber === null ? 'all' : String(weekNumber) })
        }}
        selectedWeekNumber={selectedWeekNumber}
        startDate={classroom.startDate}
        weeks={weeks}
      />
      <div className="min-w-0 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden">
        {viewingNotice && selectedNotice ? <NoticeDetailPanel canEdit={canManage} notice={selectedNotice} onClose={() => updateQuery({ panel: null })} onEdit={() => updateQuery({ panel: `notice-edit-${selectedNotice.id}` })} /> : null}
        {editingNotice ? <NoticeContentPanel disabled={!canManage} key={panel} notice={selectedNotice} onClose={() => updateQuery({ panel: selectedNotice ? `notice-${selectedNotice.id}` : null })} onDelete={canManage && selectedNotice ? deleteNotice : undefined} onSave={saveNotice} weekNumber={selectedWeekNumber} /> : null}
        {editingExam ? <ExamContentPanel classroomId={classroomId} disabled={!canManage} exam={selectedExam} initialWeekNumber={selectedWeekNumber ?? undefined} key={panel} onClose={() => updateQuery({ panel: null })} onDeleted={(examId) => { setExams((items) => items.filter((item) => item.id !== examId)); updateQuery({ panel: null }, true) }} onSaved={(saved) => { setExams((items) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]); updateQuery({ panel: `exam-${saved.id}` }, true) }} repository={examsRepository} /> : null}
        {resourcePreview ? <ClassroomResourcePreviewPanel
          onClose={() => setResourcePreview(null)}
          resource={resourcePreview}
          weekTitle={weeks.find((week) => week.weekNumber === resourcePreview.weekNumber)?.title}
        /> : null}
        {!viewingNotice && !editingNotice && !editingExam && !resourcePreview ? <ClassroomContentPanel
          canManage={canManage}
          errors={resourceErrors}
          filter={filter}
          globalItems={globalItems}
          isUploading={isUploading}
          items={visibleItems}
          onAdd={(kind) => {
            if (kind === 'material') {
              setUploadTargetWeek(selectedWeekNumber ?? weeks[0]?.weekNumber ?? null)
              setUploadInitialFile(null)
              setIsUploadDialogOpen(true)
            } else if (kind === 'resource') {
              setResourceTargetWeek(selectedWeekNumber ?? weeks[0]?.weekNumber ?? null)
              setIsResourceUploadDialogOpen(true)
            } else updateQuery({ panel: `${kind}-new` })
          }}
          onDrop={(file) => {
            if (selectedWeekNumber === null) return
            setUploadTargetWeek(selectedWeekNumber)
            setUploadInitialFile(file)
            setIsUploadDialogOpen(true)
          }}
          onFilter={(nextFilter) => updateQuery({ filter: nextFilter === 'all' ? null : nextFilter })}
          onItem={(item) => {
            if (item.kind === 'material') void openMaterial(item.source.id)
            if (item.kind === 'resource') setResourcePreview(item.source)
            if (item.kind === 'notice') updateQuery({ panel: `notice-${item.source.id}` })
            if (item.kind === 'exam') {
              if (isInstructor) updateQuery({ panel: `exam-${item.source.id}` })
              else navigate(examDetailPath(item.source.id, classroomId))
            }
          }}
          onRemoveMaterial={removeMaterial}
          onRenameMaterial={(material) => setRenamingMaterial(material)}
          onRetry={(key) => void loadResource(key)}
          openingMaterialId={openingMaterialId}
          processingMaterialTitle={pendingMaterial
            && (selectedWeekNumber === null || selectedWeekNumber === pendingMaterial.weekNumber)
            && (filter === 'all' || filter === 'material')
            ? pendingMaterial.title
            : null}
          selectedWeek={selectedWeek}
          selectedWeekNumber={selectedWeekNumber}
          setDragging={setDraggingWeek}
          draggingWeek={draggingWeek}
        /> : null}
      </div>
    </section>

    {isUploadDialogOpen ? <UploadMaterialDialog initialFile={uploadInitialFile ?? undefined} initialWeekNumber={uploadTargetWeek ?? undefined} isUploading={isUploading} onClose={() => { setIsUploadDialogOpen(false); setUploadInitialFile(null) }} onUpload={uploadMaterial} weeks={weeks} /> : null}
    {isResourceUploadDialogOpen ? <ClassroomResourceUploadDialog
      initialWeekNumber={resourceTargetWeek ?? undefined}
      onClose={() => setIsResourceUploadDialogOpen(false)}
      onPreview={(resource) => {
        resourceSequenceRef.current += 1
        const uploadedResource: ClassroomResource = {
          ...resource,
          id: `local-${resourceSequenceRef.current}`,
          uploadedAt: new Date().toISOString(),
        }
        if (uploadedResource.source.kind === 'file' && uploadedResource.source.objectUrl) {
          resourceObjectUrlsRef.current.add(uploadedResource.source.objectUrl)
        }
        setResources((current) => [uploadedResource, ...current])
        setResourcePreview(uploadedResource)
        setIsResourceUploadDialogOpen(false)
      }}
      weeks={weeks}
    /> : null}
    {renamingMaterial ? <RenameMaterialDialog initialTitle={renamingMaterial.title} onClose={() => setRenamingMaterial(null)} onSave={renameMaterial} /> : null}
  </ClassroomWorkspaceContainer>
}

async function copyInviteCode(classroom: Classroom, repository: ReturnType<typeof createClassroomsRepository>, setClassroom: (updater: (current: Classroom | null) => Classroom | null) => void, showToast: (message: string, tone: 'danger' | 'success') => void) {
  try {
    const inviteCode = classroom.inviteCode || await repository.getInviteCode(classroom.id)
    await navigator.clipboard.writeText(inviteCode)
    setClassroom((current) => current ? { ...current, inviteCode } : current)
    showToast('초대 코드를 복사했습니다.', 'success')
  } catch (error) {
    showToast(getRequestErrorMessage(error), 'danger')
  }
}

function resolveSelectedWeek(value: string | null, classroom: Classroom | null, weeks: ClassroomWeek[]): number | null {
  if (value === null) return null
  if (value === 'all') return null
  const requested = Number(value)
  if (Number.isInteger(requested) && weeks.some((week) => week.weekNumber === requested)) return requested
  if (classroom?.currentWeek && weeks.some((week) => week.weekNumber === classroom.currentWeek)) return classroom.currentWeek
  return weeks[0]?.weekNumber ?? null
}

function parseFilter(value: string | null): ClassroomContentFilter {
  return value === 'material' || value === 'resource' || value === 'notice' || value === 'exam' ? value : 'all'
}

function sortWeeks(weeks: ClassroomWeek[]): ClassroomWeek[] {
  return [...weeks].sort((left, right) => left.weekNumber - right.weekNumber)
}

function UploadMaterialDialog({ initialFile, initialWeekNumber, isUploading, onClose, onUpload, weeks }: { initialFile?: File; initialWeekNumber?: number; isUploading: boolean; onClose: () => void; onUpload: (file: File, title: string, weekNumber: number) => Promise<boolean>; weeks: ClassroomWeek[] }) {
  const orderedWeeks = useMemo(() => [...weeks].sort((left, right) => left.weekNumber - right.weekNumber), [weeks])
  const [weekNumber, setWeekNumber] = useState(initialWeekNumber ?? orderedWeeks[0]?.weekNumber ?? 1)
  const [file, setFile] = useState<File | null>(initialFile ?? null)
  const [title, setTitle] = useState(initialFile?.name ?? '')
  const fileError = file ? validateMaterialUpload(file) : null
  const titleError = validateMaterialTitle(title)
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (file && !fileError && !titleError && await onUpload(file, title.trim(), weekNumber)) onClose()
  }
  function selectFile(nextFile: File | null) {
    setFile(nextFile)
    setTitle(nextFile?.name ?? '')
  }
  return <div aria-label="수업 생성" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} role="dialog"><form className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onSubmit={submit}><div className="flex items-center justify-between"><h2 className="type-dialog-title font-bold">수업 생성</h2><button aria-label="수업 생성 닫기" className="flex size-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100" onClick={onClose} type="button"><X size={17} /></button></div><label className="mt-5 block type-control font-semibold">주차 선택<select className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body" onChange={(event) => setWeekNumber(Number(event.target.value))} value={weekNumber}>{orderedWeeks.map((week) => <option key={week.id} value={week.weekNumber}>{week.weekNumber}주차 · {week.title}</option>)}</select></label><label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 text-center"><Upload size={20} /><span className="mt-2 type-body font-semibold">{file?.name ?? 'PDF 파일 선택'}</span><input accept="application/pdf,.pdf" className="sr-only" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} type="file" /></label>{fileError ? <p className="mt-2 type-caption font-medium text-rose-700" role="alert">{fileError}</p> : null}<label className="mt-4 block type-control font-semibold">수업 제목<input aria-invalid={Boolean(titleError)} className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" maxLength={MAX_MATERIAL_TITLE_LENGTH} onChange={(event) => setTitle(event.target.value)} placeholder="수업 제목을 입력하세요." value={title} /></label>{titleError && file ? <p className="mt-2 type-caption font-medium text-rose-700" role="alert">{titleError}</p> : null}<div className="mt-5 flex justify-end gap-2"><Button onClick={onClose} variant="secondary">취소</Button><Button disabled={!file || Boolean(fileError) || Boolean(titleError) || isUploading} type="submit">{isUploading ? '생성 중' : '생성'}</Button></div></form></div>
}
