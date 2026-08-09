import { ClipboardList, Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { isInstructorRole, useAuth } from '../../features/auth'
import { createClassroomsRepository, rememberClassroomId, type Classroom } from '../../features/classrooms'
import { createExamsRepository, type CreateExamInput, type Exam, type ExamStatus } from '../../features/exams'
import { ExamEditor } from '../../features/exams/ExamEditor'
import { createQuestion, isExamDraftValid } from '../../features/exams/examEditorModel'
import { getRequestErrorMessage } from '../../shared/api'
import { formatDateTime } from '../../shared/lib/format'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Badge, Button, EmptyState, useToast } from '../../shared/ui'
import { classroomExamsPath, examDetailPath } from '../routes'
import { ClassroomWorkspaceContainer } from './classroom/ClassroomWorkspaceContainer'
import { ClassroomWorkspaceHeader } from './classroom/ClassroomWorkspaceHeader'

const initialDraft: CreateExamInput = { allowRetake: false, description: '', questions: [createQuestion('SHORT')], title: '' }

export function ExamsPage() {
  usePageTitle('시험')
  const { apiRequest, user } = useAuth()
  const navigate = useNavigate()
  const { classroomId: routeClassroomId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const isInstructor = isInstructorRole(user?.role)
  const classroomsRepository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const examsRepository = useMemo(() => createExamsRepository(apiRequest), [apiRequest])
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classroomId, setClassroomId] = useState(routeClassroomId)
  const [exams, setExams] = useState<Exam[]>([])
  const [status, setStatus] = useState<ExamStatus | ''>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestedWeek = Number(searchParams.get('weekNumber'))
  const initialWeekNumber = Number.isInteger(requestedWeek) && requestedWeek > 0 ? requestedWeek : undefined
  const [isComposerOpen, setIsComposerOpen] = useState(isInstructor && searchParams.get('create') === '1')
  const [composerWeekNumber, setComposerWeekNumber] = useState<number | undefined>(initialWeekNumber)
  const selectedClassroom = classrooms.find((classroom) => classroom.id === classroomId)

  useEffect(() => {
    const controller = new AbortController()
    classroomsRepository.list('', controller.signal).then((items) => { setClassrooms(items); setClassroomId(items.some((item) => item.id === routeClassroomId) ? routeClassroomId : items[0]?.id || ''); if (items.length === 0) setIsLoading(false) }).catch((requestError) => { if (!controller.signal.aborted) { setError(getRequestErrorMessage(requestError)); setIsLoading(false) } })
    return () => controller.abort()
  }, [classroomsRepository, routeClassroomId])

  useEffect(() => { if (classroomId) rememberClassroomId(classroomId) }, [classroomId])

  useEffect(() => {
    if (!classroomId) return
    const controller = new AbortController()
    examsRepository.list(classroomId, status || undefined, controller.signal).then((items) => { setExams(items); setError(null) }).catch((requestError) => { if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError)) }).finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [classroomId, examsRepository, status])

  return <ClassroomWorkspaceContainer>
    {selectedClassroom ? <ClassroomWorkspaceHeader actions={isInstructor ? <Button disabled={!classroomId} onClick={() => { setComposerWeekNumber(undefined); setIsComposerOpen(true) }}><Plus size={15} />시험 만들기</Button> : undefined} activeTab="exams" classroom={selectedClassroom} titleAccessory={<ClassroomSelect classrooms={classrooms} onChange={(nextClassroomId) => navigate(classroomExamsPath(nextClassroomId), { replace: true })} value={classroomId} />} /> : <h1 className="type-page-title font-bold text-stone-950">시험</h1>}
    <div className="flex gap-2" role="group" aria-label="시험 상태 필터">{([['', '전체'], ['DRAFT', '초안'], ['PUBLISHED', '공개'], ['CLOSED', '종료']] as const).filter(([value]) => isInstructor || value !== 'DRAFT').map(([value, label]) => <button aria-pressed={status === value} className={`h-9 rounded-lg border px-3 type-control font-semibold ${status === value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-200 bg-white text-stone-600'}`} key={value} onClick={() => { setIsLoading(true); setStatus(value) }} type="button">{label}</button>)}</div>
    {isLoading ? <p className="py-16 text-center type-body text-stone-500" role="status">시험을 불러오는 중입니다.</p> : null}
    {error ? <EmptyState description={error} title="시험을 불러오지 못했습니다" /> : null}
    {!isLoading && !error && exams.length === 0 ? <EmptyState description={isInstructor ? '시험 초안을 만들고 문항을 구성해 보세요.' : '강의자가 시험을 공개하면 여기에 표시됩니다.'} title="등록된 시험이 없습니다" /> : null}
    {exams.length > 0 ? <section className="overflow-hidden rounded-lg border border-stone-200 bg-white" aria-label="시험 목록">{exams.map((exam) => <Link className="flex min-h-20 items-center gap-4 border-b border-stone-100 px-5 py-4 last:border-0 hover:bg-stone-50" key={exam.id} to={examDetailPath(exam.id, exam.classroomId)}><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><ClipboardList size={17} /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate type-body text-stone-950">{exam.title}</strong><ExamStatusBadge status={exam.status} /></span><span className="mt-1 block type-caption text-stone-500">{exam.weekNumber ? `${exam.weekNumber}주차 · ` : ''}{exam.questionCount}문항 · {exam.totalScore}점{exam.updatedAt ? ` · ${formatDateTime(exam.updatedAt)}` : ''}</span></span>{!isInstructor && exam.mySubmission ? <span className="type-control font-semibold text-stone-700">{exam.mySubmission.status === 'GRADED' ? `${exam.mySubmission.normalizedScore ?? 0}점` : '채점 중'}</span> : null}</Link>)}</section> : null}
    {isComposerOpen ? <ExamComposer classroomId={classroomId} initialWeekNumber={composerWeekNumber} onClose={() => setIsComposerOpen(false)} onCreated={(exam) => { setExams((items) => [exam, ...items]); setIsComposerOpen(false) }} repository={examsRepository} /> : null}
  </ClassroomWorkspaceContainer>
}

function ClassroomSelect({ classrooms, onChange, value }: { classrooms: Classroom[]; onChange: (classroomId: string) => void; value: string }) {
  return <label><span className="sr-only">강의실 선택</span><select className="h-9 min-w-40 rounded-lg border border-stone-200 bg-white px-3 type-caption font-semibold text-stone-600" onChange={(event) => onChange(event.target.value)} value={value}>{classrooms.length === 0 ? <option value="">강의실 없음</option> : classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select></label>
}

function ExamComposer({ classroomId, initialWeekNumber, onClose, onCreated, repository }: { classroomId: string; initialWeekNumber?: number; onClose: () => void; onCreated: (exam: Exam) => void; repository: ReturnType<typeof createExamsRepository> }) {
  const { show } = useToast(); const [draft, setDraft] = useState<CreateExamInput>({ ...initialDraft, weekNumber: initialWeekNumber }); const [isSubmitting, setIsSubmitting] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); if (!isExamDraftValid(draft) || isSubmitting) return; setIsSubmitting(true); try { onCreated(await repository.create(classroomId, { ...draft, title: draft.title.trim() })); show('시험 초안을 만들었습니다.', 'success') } catch (error) { show(getRequestErrorMessage(error), 'danger') } finally { setIsSubmitting(false) } }
  return <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 px-4 py-6" role="dialog"><form className="max-h-full w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl" onSubmit={submit}><div className="mb-5 flex items-center justify-between"><h2 className="type-dialog-title font-bold">시험 만들기</h2><button aria-label="닫기" className="p-2 text-stone-400" onClick={onClose} type="button"><X size={17} /></button></div><ExamEditor onChange={setDraft} value={draft} /><div className="mt-6 flex justify-end gap-2"><Button onClick={onClose} variant="ghost">취소</Button><Button disabled={!isExamDraftValid(draft) || isSubmitting} type="submit">{isSubmitting ? '저장 중' : '초안 저장'}</Button></div></form></div>
}

export function ExamStatusBadge({ status }: { status: ExamStatus }) { const values = { DRAFT: ['초안', 'neutral'], PUBLISHED: ['공개', 'success'], CLOSED: ['종료', 'warning'] } as const; return <Badge tone={values[status][1]}>{values[status][0]}</Badge> }
