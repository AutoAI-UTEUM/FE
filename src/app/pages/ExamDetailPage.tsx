import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Send, Sparkles, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { isInstructorRole, useAuth } from '../../features/auth'
import { createClassroomsRepository, rememberClassroomId, type ClassroomStudent } from '../../features/classrooms'
import { createExamsRepository, type CreateExamInput, type Exam, type ExamAttemptDraft, type ExamQuestion, type ExamQuestionType, type ExamSubmission, type GenerateExamDraftInput, type InstructorSubmissionSummary } from '../../features/exams'
import { ExamEditor } from '../../features/exams/ExamEditor'
import { isExamDraftValid } from '../../features/exams/examEditorModel'
import { getRequestErrorMessage } from '../../shared/api'
import { isApiCapabilityEnabled } from '../../shared/config/capabilities'
import { formatDateTime } from '../../shared/lib/format'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { useAsyncJobPolling } from '../../shared/state'
import { Badge, Button, ButtonLink, EmptyState, ErrorState, LoadingState, PageContainer, PageHeader, Select, useToast } from '../../shared/ui'
import { ExamStatusBadge } from './ExamsPage'
import { classroomExamSubmissionPath, classroomExamsPath, routes } from '../routes'

export function ExamDetailPage() {
  usePageTitle('시험')
  const { classroomId = '', examId } = useParams(); const { apiRequest, rawApiRequest, user } = useAuth(); const navigate = useNavigate(); const { show } = useToast()
  const isInstructor = isInstructorRole(user?.role)
  const repository = useMemo(() => createExamsRepository(apiRequest, rawApiRequest), [apiRequest, rawApiRequest])
  const [exam, setExam] = useState<Exam | null>()
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [learnerResultExamId, setLearnerResultExamId] = useState<string | null>(null)
  const handleLearnerResultReady = useCallback(() => {
    if (examId) setLearnerResultExamId(examId)
  }, [examId])

  useEffect(() => { if (!examId) return; const controller = new AbortController(); repository.get(examId, controller.signal).then((value) => { setExam(value); setError(null); rememberClassroomId(value.classroomId) }).catch((requestError) => { if (!controller.signal.aborted) { setExam(null); setError(getRequestErrorMessage(requestError)) } }); return () => controller.abort() }, [examId, repository])
  if (!examId) return <ErrorState title="시험을 찾을 수 없습니다" description="시험 식별자가 없습니다." />
  if (exam === undefined) return <LoadingState message="시험을 불러오는 중입니다." />
  if (!exam) return <ErrorState title="시험을 불러오지 못했습니다" description={error ?? '접근 권한이나 시험 상태를 확인하세요.'} action={<ButtonLink to={classroomId ? classroomExamsPath(classroomId) : '/classrooms'}>시험 목록으로</ButtonLink>} />

  async function runAction(action: 'publish' | 'close' | 'delete') {
    if (!examId || !exam || isWorking) return
    const messages = { publish: '시험을 공개할까요?', close: '시험을 종료할까요?', delete: '시험 초안을 삭제할까요?' }
    if (!window.confirm(messages[action])) return
    setIsWorking(true)
    try {
      if (action === 'delete') { await repository.delete(examId); show('시험을 삭제했습니다.', 'success'); navigate(classroomExamsPath(exam.classroomId)); return }
      const updated = action === 'publish' ? await repository.publish(examId) : await repository.close(examId)
      setExam(updated); show(action === 'publish' ? '시험을 공개했습니다.' : '시험을 종료했습니다.', 'success')
    } catch (requestError) { show(getRequestErrorMessage(requestError), 'danger') } finally { setIsWorking(false) }
  }

  return <PageContainer>
    <PageHeader title={exam.title} titleAccessory={<ExamStatusBadge status={exam.status} />} actions={<>{!isInstructor && (learnerResultExamId === exam.id || exam.mySubmission?.status === 'GRADED') ? <Button onClick={() => window.print()} variant="secondary">결과 저장</Button> : null}<ButtonLink to={classroomExamsPath(exam.classroomId)} variant="secondary">목록</ButtonLink></>} />
    {isInstructor ? <InstructorExamView exam={exam} isWorking={isWorking} onAction={(action) => void runAction(action)} onUpdated={setExam} repository={repository} /> : <LearnerExamView exam={exam} onResultReady={handleLearnerResultReady} repository={repository} />}
  </PageContainer>
}

function InstructorExamView({ exam, isWorking, onAction, onUpdated, repository }: { exam: Exam; isWorking: boolean; onAction: (action: 'publish' | 'close' | 'delete') => void; onUpdated: (exam: Exam) => void; repository: ReturnType<typeof createExamsRepository> }) {
  const { apiRequest } = useAuth()
  const { show } = useToast(); const [isEditing, setIsEditing] = useState(false); const [isSaving, setIsSaving] = useState(false)
  const [isAiDraftOpen, setIsAiDraftOpen] = useState(false)
  const [draftWasTruncated, setDraftWasTruncated] = useState(false)
  const [submissions, setSubmissions] = useState<InstructorSubmissionSummary[]>([]); const [submissionsError, setSubmissionsError] = useState<string | null>(null)
  const [students, setStudents] = useState<ClassroomStudent[] | null>(null)
  const [studentsError, setStudentsError] = useState<string | null>(null)
  const [regradingSubmissionId, setRegradingSubmissionId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CreateExamInput>(() => toExamInput(exam))
  const classroomsRepository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const fetchSubmissions = useCallback((signal: AbortSignal) => repository.listSubmissions(exam.id, signal), [exam.id, repository])
  const handleSubmissionPollingError = useCallback((error: unknown) => setSubmissionsError(getRequestErrorMessage(error)), [])
  const handleSubmissionPollingDelay = useCallback(() => setSubmissionsError('자동 재채점이 약 90분 이상 지연되고 있습니다. 잠시 후 다시 확인하세요.'), [])
  useEffect(() => { if (exam.status === 'DRAFT') return; const controller = new AbortController(); fetchSubmissions(controller.signal).then((items) => { setSubmissions(items); setSubmissionsError(null) }).catch((error) => { if (!controller.signal.aborted) setSubmissionsError(getRequestErrorMessage(error)) }); return () => controller.abort() }, [exam.status, fetchSubmissions])
  useEffect(() => {
    if (exam.status === 'DRAFT') return
    const controller = new AbortController()
    classroomsRepository.listStudents(exam.classroomId, { sort: 'NAME' }, controller.signal)
      .then((items) => { setStudents(items); setStudentsError(null) })
      .catch((error) => { if (!controller.signal.aborted) setStudentsError(getRequestErrorMessage(error)) })
    return () => controller.abort()
  }, [classroomsRepository, exam.classroomId, exam.status])
  useAsyncJobPolling({ enabled: submissions.some(isInstructorSubmissionPending), fetchNext: fetchSubmissions, getDelayMs: getExamPollingDelay, isPending: hasPendingInstructorSubmission, maxDurationMs: 90 * 60_000, onDelayed: handleSubmissionPollingDelay, onError: handleSubmissionPollingError, onResult: setSubmissions })
  async function save(event: FormEvent) { event.preventDefault(); if (!isExamDraftValid(draft) || isSaving) return; setIsSaving(true); try { onUpdated(await repository.update(exam.id, draft)); setIsEditing(false); show('시험 초안을 저장했습니다.', 'success') } catch (error) { show(getRequestErrorMessage(error), 'danger') } finally { setIsSaving(false) } }
  async function regradeSubmission(submissionId: string) {
    if (regradingSubmissionId) return
    setRegradingSubmissionId(submissionId)
    setSubmissionsError(null)
    try {
      const updated = await repository.regrade(exam.id, submissionId)
      setSubmissions((current) => current.map((submission) => submission.id === submissionId ? { ...submission, gradedAt: updated.gradedAt, normalizedScore: updated.normalizedScore, score: updated.score, status: updated.status } : submission))
      show('재채점을 요청했습니다. 결과를 자동으로 확인합니다.', 'success')
    } catch (error) {
      setSubmissionsError(getRequestErrorMessage(error))
    } finally {
      setRegradingSubmissionId(null)
    }
  }
  async function generateAiDraft(input: GenerateExamDraftInput) {
    try {
      const generated = await repository.generateDraftQuestions(exam.classroomId, exam.id, input)
      setDraft({
        ...toExamInput(exam),
        questions: generated.questions,
        weekNumber: input.weekNumber ?? exam.weekNumber,
      })
      setDraftWasTruncated(generated.truncated)
      setIsAiDraftOpen(false)
      setIsEditing(true)
      show(`${generated.questions.length}개 문항 초안을 생성했습니다.`, 'success')
    } catch (error) {
      show(getRequestErrorMessage(error), 'danger')
      throw error
    }
  }
  return <>
    {exam.status === 'DRAFT' && isEditing ? <form className="rounded-xl border border-stone-200 bg-white p-5" onSubmit={save}>{draftWasTruncated ? <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 type-control font-semibold text-amber-800" role="status">자료가 많아 앞 30페이지만 사용되었습니다.</p> : null}<ExamEditor onChange={setDraft} value={draft} /><div className="mt-6 flex justify-end gap-2"><Button onClick={() => { setDraft(toExamInput(exam)); setDraftWasTruncated(false); setIsEditing(false) }} variant="ghost">취소</Button><Button disabled={!isExamDraftValid(draft) || isSaving} type="submit">{isSaving ? '저장 중' : '변경 저장'}</Button></div></form> : <section className="rounded-xl border border-stone-200 bg-white"><div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-5 py-4"><div><p className="type-body text-stone-600">{exam.description || '설명 없음'}</p><p className="mt-1 type-caption text-stone-400">{exam.weekNumber ? `${exam.weekNumber}주차 · ` : ''}{exam.questionCount}문항 · 총 {exam.totalScore}점 · 재응시 {exam.allowRetake ? '허용' : '불가'}{exam.dueAt ? ` · 마감 ${formatDateTime(exam.dueAt)}` : ''}</p></div><div className="ml-auto flex flex-wrap gap-2">{exam.status === 'DRAFT' ? <><Button onClick={() => setIsAiDraftOpen(true)} variant="secondary"><Sparkles aria-hidden="true" size={14} />AI 초안으로 시작</Button><Button onClick={() => { setDraft(toExamInput(exam)); setDraftWasTruncated(false); setIsEditing(true) }} variant="secondary">직접 수정</Button><Button disabled={isWorking || exam.questionCount === 0} onClick={() => onAction('publish')}>공개</Button><Button disabled={isWorking} onClick={() => onAction('delete')} variant="ghost"><Trash2 size={14} />삭제</Button></> : null}{exam.status === 'PUBLISHED' ? <Button disabled={isWorking} onClick={() => onAction('close')} variant="secondary">시험 종료</Button> : null}</div></div><div className="divide-y divide-stone-100">{exam.questions.map((question, index) => <article className="px-5 py-4" key={question.id}><div className="flex gap-3"><Badge>{index + 1}번</Badge><div className="min-w-0"><h2 className="type-body font-semibold text-stone-900">{question.questionText}</h2><p className="mt-1 type-caption text-stone-500">{question.questionType} · {question.maxScore}점</p><PrivateAnswer question={question} /></div></div></article>)}</div></section>}
    {exam.status !== 'DRAFT' ? <InstructorSubmissionRoster classroomId={exam.classroomId} examId={exam.id} isRegrading={regradingSubmissionId !== null} onRegrade={(submissionId) => void regradeSubmission(submissionId)} students={students} submissions={submissions} error={submissionsError ?? studentsError} /> : null}
    {isAiDraftOpen ? <AiExamDraftDialog initialWeekNumber={exam.weekNumber} onClose={() => setIsAiDraftOpen(false)} onGenerate={generateAiDraft} /> : null}
  </>
}

interface InstructorRosterRow {
  email?: string
  key: string
  name: string
  submission?: InstructorSubmissionSummary
}

function InstructorSubmissionRoster({ classroomId, error, examId, isRegrading, onRegrade, students, submissions }: { classroomId: string; error: string | null; examId: string; isRegrading: boolean; onRegrade: (submissionId: string) => void; students: ClassroomStudent[] | null; submissions: InstructorSubmissionSummary[] }) {
  const rows = useMemo<InstructorRosterRow[]>(() => {
    if (!students) return submissions.map((submission) => ({ key: submission.userId, name: submission.userName, submission }))
    const submissionsByUser = new Map(submissions.map((submission) => [submission.userId, submission]))
    const studentRows = students.map((student) => ({ email: student.email, key: student.id, name: student.name, submission: submissionsByUser.get(student.id) }))
    const knownStudentIds = new Set(students.map((student) => student.id))
    return [...studentRows, ...submissions.filter((submission) => !knownStudentIds.has(submission.userId)).map((submission) => ({ key: submission.userId, name: submission.userName, submission }))]
  }, [students, submissions])
  const graded = submissions.filter((submission) => submission.status === 'GRADED')
  const average = graded.length > 0 ? graded.reduce((sum, submission) => sum + (submission.normalizedScore ?? 0), 0) / graded.length : null

  return <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
    <div className="border-b border-stone-200 px-5 py-4">
      <h2 className="type-section-title font-bold">시험 관리</h2>
      <p className="mt-1 type-caption text-stone-400">전체 학습자의 제출 및 채점 상태를 확인합니다.</p>
    </div>
    <div className="grid grid-cols-2 border-b border-stone-200 md:grid-cols-4">
      <ExamMetric label="제출" value={`${submissions.length}/${rows.length}명`} />
      <ExamMetric label="채점 완료" value={`${graded.length}/${submissions.length}명`} />
      <ExamMetric label="평균 점수" value={average === null ? '-' : `${Math.round(average)}%`} />
      <ExamMetric label="미제출" value={`${Math.max(0, rows.length - submissions.length)}명`} />
    </div>
    {error ? <p className="border-b border-stone-100 px-5 py-3 type-control text-rose-700" role="alert">{error}</p> : null}
    {rows.length === 0 ? <EmptyState title="학습자가 없습니다" description="강의실에 학습자가 등록되면 여기에 표시됩니다." /> : <>
      <div className="overflow-x-auto mobile-web:hidden">
        <table className="w-full min-w-[820px] text-left type-control">
          <thead className="bg-stone-50 type-caption text-stone-500"><tr><th className="px-5 py-3">학습자</th><th>상태</th><th>시도</th><th>점수</th><th>제출 시각</th><th className="px-5 text-right">작업</th></tr></thead>
          <tbody>{rows.map((row) => <tr className="border-t border-stone-100" key={row.key}><td className="px-5 py-3"><strong className="block">{row.name}</strong>{row.email ? <span className="type-caption text-stone-400">{row.email}</span> : null}</td><td>{row.submission ? getSubmissionLabel(row.submission.status) : '미제출'}</td><td>{row.submission ? `${row.submission.attemptNo}/${row.submission.attemptCount}` : '-'}</td><td>{formatInstructorSubmissionScore(row.submission)}</td><td className="text-stone-500">{row.submission ? formatDateTime(row.submission.submittedAt) : '-'}</td><td className="px-5"><div className="flex justify-end gap-2">{row.submission ? <ButtonLink size="sm" to={classroomExamSubmissionPath(classroomId, examId, row.submission.id)} variant="secondary">답안 보기</ButtonLink> : <span className="type-caption text-stone-400">답안 없음</span>}{row.submission?.status === 'GRADING_FAILED' ? <Button disabled={isRegrading} onClick={() => onRegrade(row.submission!.id)} size="sm" variant="secondary">재채점</Button> : null}</div></td></tr>)}</tbody>
        </table>
      </div>
      <div className="hidden divide-y divide-stone-100 mobile-web:block">{rows.map((row) => <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 type-control" key={row.key}><div className="min-w-0"><strong className="block truncate">{row.name}</strong>{row.email ? <span className="block truncate type-caption text-stone-400">{row.email}</span> : null}</div><span className="font-semibold text-stone-700">{row.submission ? getSubmissionLabel(row.submission.status) : '미제출'}</span><div className="col-span-2 grid grid-cols-3 gap-2 rounded-lg bg-stone-50 p-3 text-center"><span><small className="block text-stone-400">시도</small>{row.submission ? `${row.submission.attemptNo}/${row.submission.attemptCount}` : '-'}</span><span><small className="block text-stone-400">점수</small>{formatInstructorSubmissionScore(row.submission)}</span><span><small className="block text-stone-400">제출</small>{row.submission ? formatDateTime(row.submission.submittedAt) : '-'}</span></div>{row.submission ? <div className="col-span-2 flex gap-2"><ButtonLink className="flex-1" size="sm" to={classroomExamSubmissionPath(classroomId, examId, row.submission.id)} variant="secondary">답안 보기</ButtonLink>{row.submission.status === 'GRADING_FAILED' ? <Button className="flex-1" disabled={isRegrading} onClick={() => onRegrade(row.submission!.id)} size="sm" variant="secondary">재채점</Button> : null}</div> : null}</article>)}</div>
    </>}
  </section>
}

function ExamMetric({ label, value }: { label: string; value: string }) {
  return <div className="border-r border-t border-stone-100 px-5 py-4 first:border-t-0 md:border-t-0"><span className="type-caption text-stone-400">{label}</span><strong className="mt-1 block type-section-title text-stone-950">{value}</strong></div>
}

function formatInstructorSubmissionScore(submission: InstructorSubmissionSummary | undefined) {
  return submission?.status === 'GRADED' ? `${submission.score ?? 0}/${submission.maxScore ?? 0}` : '-'
}

const draftQuestionTypes: Array<{ label: string; type: ExamQuestionType }> = [
  { label: '객관식', type: 'MCQ' },
  { label: 'OX', type: 'OX' },
  { label: '단답형', type: 'SHORT' },
  { label: '서술형', type: 'ESSAY' },
]

function AiExamDraftDialog({ initialWeekNumber, onClose, onGenerate }: { initialWeekNumber?: number; onClose: () => void; onGenerate: (input: GenerateExamDraftInput) => Promise<void> }) {
  const [weekNumber, setWeekNumber] = useState(initialWeekNumber ? String(initialWeekNumber) : '')
  const [counts, setCounts] = useState<Record<ExamQuestionType, number>>({ ESSAY: 0, MCQ: 3, OX: 0, SHORT: 2 })
  const [isGenerating, setIsGenerating] = useState(false)
  const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isGenerating || totalCount < 1 || totalCount > 20) return
    setIsGenerating(true)
    try {
      await onGenerate({
        questionPlan: draftQuestionTypes.flatMap(({ type }) => counts[type] > 0 ? [{ count: counts[type], questionType: type }] : []),
        weekNumber: weekNumber ? Number(weekNumber) : undefined,
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return <div aria-labelledby="ai-exam-draft-title" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !isGenerating) onClose() }} role="dialog"><form className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 " onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><h2 className="type-dialog-title font-bold text-stone-950" id="ai-exam-draft-title">AI 문항 초안</h2><p className="mt-1 type-caption text-stone-500">생성된 문항은 검토 후 저장해야 반영됩니다.</p></div><button aria-label="AI 문항 초안 닫기" className="flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100" disabled={isGenerating} onClick={onClose} type="button"><X aria-hidden="true" size={16} /></button></div><label className="mt-5 block type-control font-semibold text-stone-700">분석 범위<Select className="mt-1 w-full" disabled={isGenerating} onChange={(event) => setWeekNumber(event.target.value)} value={weekNumber}><option value="">전체 READY 자료</option>{Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <option key={week} value={week}>{week}주차</option>)}</Select></label><fieldset className="mt-5"><legend className="type-control font-semibold text-stone-700">문항 구성</legend><div className="mt-2 grid grid-cols-2 gap-3">{draftQuestionTypes.map((item) => <label className="rounded-lg border border-stone-200 p-3 type-control font-semibold text-stone-700" key={item.type}>{item.label}<input aria-label={`${item.label} 문항 수`} className="mt-2 h-9 w-full rounded-lg border border-stone-300 px-3 type-body" disabled={isGenerating} max={20} min={0} onChange={(event) => setCounts((current) => ({ ...current, [item.type]: Math.max(0, Number(event.target.value)) }))} type="number" value={counts[item.type]} /></label>)}</div></fieldset><p className={`mt-3 type-caption font-semibold ${totalCount > 20 ? 'text-rose-700' : 'text-stone-500'}`}>총 {totalCount}문항 / 최대 20문항</p><div className="mt-6 flex justify-end gap-2"><Button disabled={isGenerating} onClick={onClose} variant="secondary">취소</Button><Button disabled={isGenerating || totalCount < 1 || totalCount > 20} type="submit">{isGenerating ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={14} />AI가 문항을 생성하는 중</> : <><Sparkles aria-hidden="true" size={14} />초안 생성</>}</Button></div></form></div>
}

function LearnerExamView({ exam, onResultReady, repository }: { exam: Exam; onResultReady: () => void; repository: ReturnType<typeof createExamsRepository> }) {
  const { setExamInProgress, user } = useAuth()
  const isServerDraftEnabled = isApiCapabilityEnabled('exam-attempt-drafts')
  const draftStorageKey = createExamDraftStorageKey(exam.id, user?.id)
  const shouldStartAttempt = Boolean(!exam.mySubmission && exam.submittable)
  const [answers, setAnswers] = useState<Record<string, string>>(() => readExamDraft(draftStorageKey, exam.questions)); const [index, setIndex] = useState(0); const [submission, setSubmission] = useState<ExamSubmission | null>(null); const [isSubmitting, setIsSubmitting] = useState(false); const [isRestoringSubmission, setIsRestoringSubmission] = useState(Boolean(exam.mySubmission)); const [error, setError] = useState<string | null>(null)
  const [attemptStartStatus, setAttemptStartStatus] = useState<'starting' | 'ready' | 'error'>(shouldStartAttempt ? 'starting' : 'ready')
  const [attemptStartError, setAttemptStartError] = useState<string | null>(null)
  const [attemptStartRetryKey, setAttemptStartRetryKey] = useState(0)
  const [draftInitialized, setDraftInitialized] = useState(!shouldStartAttempt || !isServerDraftEnabled)
  const [draftSyncStatus, setDraftSyncStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'conflict'>(shouldStartAttempt && isServerDraftEnabled ? 'loading' : 'idle')
  const [draftConflict, setDraftConflict] = useState<{ server: ExamAttemptDraft | null } | null>(null)
  const answersRef = useRef(answers)
  const draftVersionRef = useRef<number | null>(null)
  const lastSavedDraftRef = useRef<string | null>(null)
  const draftSavePromiseRef = useRef<Promise<void> | null>(null)
  const question = exam.questions[index]
  const answeredCount = Object.values(answers).filter((answer) => answer.trim().length > 0).length
  const isLastQuestion = index === exam.questions.length - 1
  const fetchSubmission = useCallback((signal: AbortSignal) => repository.getMySubmission(exam.id, undefined, signal), [exam.id, repository])
  const handlePollingError = useCallback((requestError: unknown) => setError(getRequestErrorMessage(requestError)), [])
  const handlePollingDelay = useCallback(() => setError('자동 재시도까지 완료되지 않았습니다. 약 90분 이상 지속되면 강의자에게 문의해 주세요.'), [])
  useEffect(() => {
    if (!exam.mySubmission) return
    const controller = new AbortController()
    fetchSubmission(controller.signal)
      .then((value) => { setSubmission(value); setError(null) })
      .catch((requestError) => { if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError)) })
      .finally(() => { if (!controller.signal.aborted) setIsRestoringSubmission(false) })
    return () => controller.abort()
  }, [exam.mySubmission, fetchSubmission])
  useEffect(() => {
    if (!shouldStartAttempt) return
    const controller = new AbortController()
    repository.startAttempt(exam.id, controller.signal)
      .then(() => setAttemptStartStatus('ready'))
      .catch((requestError) => {
        if (controller.signal.aborted) return
        setAttemptStartStatus('error')
        setAttemptStartError(getRequestErrorMessage(requestError))
      })
    return () => controller.abort()
  }, [attemptStartRetryKey, exam.id, repository, shouldStartAttempt])
  useEffect(() => {
    answersRef.current = answers
  }, [answers])
  useEffect(() => {
    if (!shouldStartAttempt || !isServerDraftEnabled) return
    const controller = new AbortController()
    const localAnswers = readExamDraft(draftStorageKey, exam.questions)
    repository.getAttemptDraft(exam.id, controller.signal)
      .then((serverDraft) => {
        if (controller.signal.aborted) return
        if (!serverDraft) {
          setDraftSyncStatus('idle')
          return
        }
        draftVersionRef.current = serverDraft.version
        const localSerialized = serializeExamAnswers(localAnswers)
        const serverSerialized = serializeExamAnswers(serverDraft.answers)
        if (hasExamAnswers(localAnswers) && localSerialized !== serverSerialized) {
          setDraftConflict({ server: serverDraft })
          setDraftSyncStatus('conflict')
          return
        }
        setAnswers(serverDraft.answers)
        lastSavedDraftRef.current = serverSerialized
        setDraftSyncStatus('saved')
      })
      .catch(() => {
        if (!controller.signal.aborted) setDraftSyncStatus('error')
      })
      .finally(() => {
        if (!controller.signal.aborted) setDraftInitialized(true)
      })
    return () => controller.abort()
  }, [draftStorageKey, exam.id, exam.questions, isServerDraftEnabled, repository, shouldStartAttempt])
  useEffect(() => {
    const isInProgress = Boolean(!exam.mySubmission && !submission && exam.submittable)
    setExamInProgress(isInProgress)
    return () => setExamInProgress(false)
  }, [exam.mySubmission, exam.submittable, setExamInProgress, submission])
  useEffect(() => {
    if (!draftStorageKey) return
    if (exam.mySubmission || submission) {
      removeExamDraft(draftStorageKey)
      return
    }
    writeExamDraft(draftStorageKey, answers)
  }, [answers, draftStorageKey, exam.mySubmission, submission])
  const saveDraftToServer = useCallback(async () => {
    if (
      !shouldStartAttempt ||
      !isServerDraftEnabled ||
      !draftInitialized ||
      attemptStartStatus !== 'ready' ||
      draftConflict ||
      submission ||
      draftSavePromiseRef.current
    ) return

    const snapshot = { ...answersRef.current }
    const serialized = serializeExamAnswers(snapshot)
    if (serialized === lastSavedDraftRef.current) return

    setDraftSyncStatus('saving')
    const task = repository.saveAttemptDraft(
      exam.id,
      snapshot,
      draftVersionRef.current,
    ).then((result) => {
      if (result.kind === 'conflict') {
        if (result.latestDraft) draftVersionRef.current = result.latestDraft.version
        setDraftConflict({ server: result.latestDraft })
        setDraftSyncStatus('conflict')
        return
      }
      draftVersionRef.current = result.version
      lastSavedDraftRef.current = serialized
      setDraftSyncStatus('saved')
    }).catch(() => {
      setDraftSyncStatus('error')
    }).finally(() => {
      draftSavePromiseRef.current = null
    })
    draftSavePromiseRef.current = task
    await task
  }, [attemptStartStatus, draftConflict, draftInitialized, exam.id, isServerDraftEnabled, repository, shouldStartAttempt, submission])
  useEffect(() => {
    if (
      !draftInitialized ||
      attemptStartStatus !== 'ready' ||
      draftConflict ||
      submission
    ) return
    if (serializeExamAnswers(answers) === lastSavedDraftRef.current) return
    const timeoutId = window.setTimeout(() => void saveDraftToServer(), 2_000)
    return () => window.clearTimeout(timeoutId)
  }, [answers, attemptStartStatus, draftConflict, draftInitialized, saveDraftToServer, submission])
  useEffect(() => {
    if (!shouldStartAttempt || !draftInitialized || draftConflict || submission) return
    const intervalId = window.setInterval(() => void saveDraftToServer(), 30_000)
    return () => window.clearInterval(intervalId)
  }, [draftConflict, draftInitialized, saveDraftToServer, shouldStartAttempt, submission])
  useAsyncJobPolling({ enabled: submission?.status === 'SUBMITTED', fetchNext: fetchSubmission, getDelayMs: getExamPollingDelay, isPending: isExamSubmissionPending, maxDurationMs: 90 * 60_000, onDelayed: handlePollingDelay, onError: handlePollingError, onResult: setSubmission })
  useEffect(() => {
    if (submission?.status === 'GRADED') onResultReady()
  }, [onResultReady, submission?.status])
  function retryAttemptStart() {
    setAttemptStartStatus('starting')
    setAttemptStartError(null)
    setAttemptStartRetryKey((current) => current + 1)
  }
  function useServerDraft() {
    const serverDraft = draftConflict?.server
    if (serverDraft) {
      setAnswers(serverDraft.answers)
      draftVersionRef.current = serverDraft.version
      lastSavedDraftRef.current = serializeExamAnswers(serverDraft.answers)
      setDraftSyncStatus('saved')
    } else {
      draftVersionRef.current = null
      lastSavedDraftRef.current = null
      setDraftSyncStatus('idle')
    }
    setDraftConflict(null)
  }
  function keepCurrentDraft() {
    draftVersionRef.current = draftConflict?.server?.version ?? null
    lastSavedDraftRef.current = null
    setDraftConflict(null)
    setDraftSyncStatus('idle')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!isLastQuestion || isSubmitting || !exam.submittable || attemptStartStatus !== 'ready') return
    const confirmed = window.confirm(`전체 ${exam.questions.length}문항 중 ${answeredCount}문항에 답변했습니다. 제출하시겠습니까?`)
    if (!confirmed) return
    setIsSubmitting(true)
    try {
      const nextSubmission = await repository.submit(exam.id, answers, createRequestId())
      if (draftStorageKey) removeExamDraft(draftStorageKey)
      setSubmission(nextSubmission)
      setError(null)
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }
  if (isRestoringSubmission) return <LoadingState message="제출 결과를 불러오는 중입니다." />
  if (exam.mySubmission && !submission) return <ErrorState title="제출 결과를 불러오지 못했습니다" description={error ?? '잠시 후 다시 시도해 주세요.'} />
  if (submission?.status === 'SUBMITTED') return <SubmissionPending error={error} exam={exam} submission={submission} />
  if (submission) return <SubmissionResult exam={exam} submission={submission} />
  if (!question) return <EmptyState title="공개된 문항이 없습니다" description="강의자에게 시험 상태를 문의하세요." />
  return (
    <form className="overflow-hidden rounded-xl border border-stone-200 bg-white" onSubmit={submit}>
      <div className="border-b border-stone-200 px-5 py-4">
        <p className="type-body text-stone-600">{exam.description || '시험 문항에 답한 뒤 제출하세요.'}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 type-caption text-stone-500">
          <span>{index + 1}/{exam.questions.length} 문항</span>
          <span className="flex items-center gap-3">
            <span>{answeredCount}개 답변</span>
            {shouldStartAttempt && isServerDraftEnabled ? (
              <span aria-live="polite" className={draftSyncStatus === 'error' ? 'text-rose-600' : 'text-stone-400'}>
                {getDraftSyncLabel(draftSyncStatus)}
              </span>
            ) : null}
          </span>
        </div>
      </div>
      <div className="p-5 sm:p-7">
        {attemptStartStatus === 'starting' ? <p className="mb-4 type-control font-medium text-stone-500" role="status">응시 시작 시간을 기록하는 중입니다.</p> : null}
        {attemptStartStatus === 'error' ? <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3"><p className="min-w-0 flex-1 type-control text-rose-700" role="alert">응시 시작을 기록하지 못했습니다. {attemptStartError}</p><Button onClick={retryAttemptStart} size="sm" variant="secondary">다시 시도</Button></div> : null}
        {draftConflict ? (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
            <p className="type-control font-semibold text-amber-900">다른 기기에 저장된 답안과 현재 답안이 다릅니다.</p>
            <p className="mt-1 type-caption text-amber-800">사용할 답안을 선택하면 이후 변경사항을 서버에 자동 저장합니다.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={useServerDraft} size="sm" variant="secondary">서버 답안 사용</Button>
              <Button onClick={keepCurrentDraft} size="sm">현재 답안 유지</Button>
            </div>
          </div>
        ) : null}
        <QuestionAnswerInput disabled={isSubmitting || Boolean(draftConflict)} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} question={question} value={answers[question.id] ?? ''} />
        {error ? <p className="mt-4 type-body text-rose-700" role="alert">{error}</p> : null}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
          <div className="flex gap-2">
            <Button disabled={index === 0 || isSubmitting || Boolean(draftConflict)} onClick={() => setIndex((current) => current - 1)} variant="secondary"><ChevronLeft size={15} />이전</Button>
            <Button disabled={isLastQuestion || isSubmitting || Boolean(draftConflict)} onClick={() => setIndex((current) => current + 1)} variant="secondary">다음<ChevronRight size={15} /></Button>
          </div>
          {isLastQuestion ? <Button disabled={!exam.submittable || isSubmitting || attemptStartStatus !== 'ready' || Boolean(draftConflict)} type="submit"><Send size={15} />{isSubmitting ? '제출 중' : attemptStartStatus === 'starting' ? '응시 준비 중' : exam.submittable ? '시험 제출' : '제출 불가'}</Button> : null}
        </div>
      </div>
    </form>
  )
}

function QuestionAnswerInput({ disabled = false, onChange, question, value }: { disabled?: boolean; onChange: (value: string) => void; question: ExamQuestion; value: string }) {
  return <fieldset disabled={disabled}><legend className="type-section-title font-bold text-stone-950"><span className="mr-2 text-brand-700">Q.</span>{question.questionText}</legend><p className="mt-2 type-caption text-stone-500">{question.maxScore}점</p>{question.questionType === 'MCQ' ? <div className="mt-5 grid gap-2">{(question.options ?? []).map((option) => <label className={`flex min-h-11 items-center gap-3 rounded-lg border px-4 type-body ${value === option.id ? 'border-brand-600 bg-brand-50' : 'border-stone-200'}`} key={option.id}><input checked={value === option.id} onChange={() => onChange(option.id)} type="radio" /><strong>{option.id.toUpperCase()}.</strong>{option.text}</label>)}</div> : question.questionType === 'OX' ? <div className="mt-5 flex gap-3">{[['true', 'O'], ['false', 'X']].map(([answer, label]) => <label className={`flex h-16 flex-1 items-center justify-center rounded-lg border type-dialog-title font-bold ${value === answer ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-200'}`} key={answer}><input checked={value === answer} className="sr-only" onChange={() => onChange(answer)} type="radio" />{label}</label>)}</div> : <textarea className="mt-5 min-h-40 w-full resize-none rounded-lg border border-stone-300 px-4 py-3 type-body" onChange={(event) => onChange(event.target.value)} placeholder="답안을 입력하세요" value={value} />}</fieldset>
}

function SubmissionPending({ error, exam, submission }: { error: string | null; exam: Exam; submission: ExamSubmission }) {
  return <section className="rounded-xl border border-stone-200 bg-white p-6" role="status"><div className="flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 aria-hidden="true" size={22} /></span><div><h2 className="type-dialog-title font-bold">시험 제출이 완료되었습니다</h2><p className="mt-1 type-body text-stone-500">{exam.title} · {submission.attemptNo}회차 · {formatDateTime(submission.submittedAt)} 제출</p><p className="mt-3 type-body font-semibold text-stone-700">제출한 답안은 수정할 수 없습니다.</p></div></div><div className="mt-6 flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 type-body font-semibold text-brand-800"><LoaderCircle aria-hidden="true" className="animate-spin" size={16} />채점이 진행 중입니다. 완료되면 결과가 자동으로 표시됩니다.</div>{submission.items.length > 0 ? <div className="mt-5 space-y-3" aria-label="제출한 답안">{submission.items.map((item, index) => { const question = exam.questions.find((candidate) => candidate.id === item.questionId); return <article className="rounded-lg border border-stone-200 bg-stone-50/70 px-4 py-3" key={item.questionId}><div className="flex items-center gap-2"><strong className="type-control text-stone-900">{index + 1}번</strong><span className="type-caption text-stone-400">제출한 답안</span></div><p className="mt-2 whitespace-pre-wrap type-body font-semibold text-stone-800">{formatSubmittedAnswer(question, item.answer)}</p></article> })}</div> : null}{error ? <p className="mt-4 type-body text-rose-700" role="alert">{error}</p> : null}</section>
}

function SubmissionResult({ exam, submission }: { exam: Exam; submission: ExamSubmission }) {
  const [filter, setFilter] = useState<'all' | 'wrong'>('all')

  if (submission.status !== 'GRADED') {
    return (
      <section className="rounded-lg border border-stone-200 bg-white p-6">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700">
            <CheckCircle2 aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="type-dialog-title font-bold">시험 제출은 완료되었지만 채점하지 못했습니다</h2>
            <p className="mt-1 type-body text-stone-500">{exam.title} · {submission.attemptNo}회차</p>
            <p className="mt-4 type-body text-rose-700">자동 재시도를 완료했지만 채점하지 못했습니다. 강의자에게 문의하세요.</p>
          </div>
        </div>
      </section>
    )
  }

  const results = submission.items.map((item, index) => ({
    index,
    item,
    question: exam.questions.find((question) => question.id === item.questionId),
  }))
  const correctCount = results.filter(({ item }) => item.verdict === 'CORRECT').length
  const unansweredCount = results.filter(({ item }) => !item.answer?.trim()).length
  const wrongCount = Math.max(0, results.length - correctCount - unansweredCount)
  const visibleResults = filter === 'wrong'
    ? results.filter(({ item }) => item.verdict !== 'CORRECT')
    : results
  const score = submission.score ?? 0
  const maxScore = submission.maxScore ?? exam.totalScore
  const percentage = maxScore > 0 ? Math.min(100, Math.max(0, (score / maxScore) * 100)) : 0
  const reviewNote = buildExamReviewNote(exam, submission, results)

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_240px]" data-exam-result>
      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <div className="flex items-start gap-4 px-5 py-5 sm:px-6">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <CheckCircle2 aria-hidden="true" size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="type-section-title font-bold text-stone-950">시험 제출 및 채점이 완료되었습니다</h2>
              <p className="mt-1 type-caption text-stone-500">
                {exam.title} · {submission.attemptNo}회차 · {formatDateTime(submission.submittedAt)} 제출
              </p>
            </div>
          </div>
          <dl className="grid border-t border-stone-200 sm:grid-cols-3">
            <ResultMetric label="획득 점수" value={<>{formatScore(score)}<small>/{formatScore(maxScore)}점</small></>} />
            <ResultMetric label="정답 문항" value={<>{correctCount}<small>/{results.length}문항</small></>} />
            <ResultMetric label="소요 시간" value={<span className="type-body">{formatDuration(submission.durationSeconds)}</span>} />
          </dl>
        </section>

        <section aria-labelledby="question-results-title">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="type-section-title font-bold text-stone-950" id="question-results-title">문항별 채점 결과</h2>
            <span className="type-caption text-stone-400">{results.length}문항</span>
            <div className="ml-auto flex rounded-lg border border-stone-200 bg-white p-1" role="group" aria-label="채점 결과 필터">
              <ResultFilterButton active={filter === 'all'} onClick={() => setFilter('all')}>전체</ResultFilterButton>
              <ResultFilterButton active={filter === 'wrong'} onClick={() => setFilter('wrong')}>오답만</ResultFilterButton>
            </div>
          </div>

          {visibleResults.length > 0 ? (
            <div className="space-y-3">
              {visibleResults.map(({ index, item, question }) => {
                const correctAnswer = submission.reviewAvailable
                  ? formatCorrectAnswer(question, item.correctAnswer)
                  : null
                return (
                  <article className="rounded-lg border border-stone-200 bg-white p-5" key={item.questionId}>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="type-body text-stone-950">{index + 1}번</strong>
                      {item.verdict ? <Badge size="compact" tone={getVerdictTone(item.verdict)}>{getVerdictLabel(item.verdict)}</Badge> : null}
                      {question ? <span className="type-caption text-stone-400">{getQuestionTypeLabel(question.questionType)}</span> : null}
                      <span className="ml-auto type-control font-semibold text-stone-800">{formatNullableScore(item.score)}/{formatScore(item.maxScore)}</span>
                    </div>
                    <h3 className="mt-4 type-body font-semibold leading-6 text-stone-900">
                      {question?.questionText ?? '문항 내용을 불러올 수 없습니다.'}
                    </h3>
                    <div className={`mt-4 grid gap-3 ${correctAnswer ? 'md:grid-cols-2' : ''}`}>
                      <AnswerPanel label="내 답안" value={formatSubmittedAnswer(question, item.answer)} />
                      {correctAnswer ? <AnswerPanel correct label="정답" value={correctAnswer} /> : null}
                    </div>
                    {submission.reviewAvailable && item.explanation ? (
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                        <p className="type-caption font-semibold text-emerald-700">해설</p>
                        <p className="mt-1 whitespace-pre-wrap type-control leading-6 text-stone-700">{item.explanation}</p>
                      </div>
                    ) : null}
                    {item.feedback ? (
                      <div className="mt-3 flex gap-2 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 type-control leading-6 text-stone-700">
                        <Sparkles aria-hidden="true" className="mt-1 shrink-0 text-brand-600" size={14} />
                        <p>{item.feedback}</p>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          ) : (
            <EmptyState title="오답이 없습니다" description="모든 문항을 정답으로 처리했습니다." />
          )}
        </section>
      </div>

      <aside className="space-y-3 xl:sticky xl:top-5">
        <section className="rounded-lg border border-stone-200 bg-white p-5" aria-label="시험 점수 요약">
          <div
            aria-label={`${formatScore(score)}점, 총 ${formatScore(maxScore)}점 중 ${formatPercentage(percentage)}퍼센트`}
            className="relative mx-auto flex size-36 items-center justify-center rounded-full"
            role="img"
            style={{ background: `conic-gradient(#4F46E5 ${percentage}%, #EEF0F4 0)` }}
          >
            <div className="flex size-28 flex-col items-center justify-center rounded-full bg-white">
              <strong className="type-page-title text-stone-950">{formatPercentage(percentage)}<small className="type-control text-stone-400">%</small></strong>
              <span className="mt-1 type-caption text-stone-500">{formatScore(score)} / {formatScore(maxScore)}점</span>
            </div>
          </div>
          <dl className="mt-5 space-y-2 type-control">
            <ScoreLegend color="bg-emerald-500" count={correctCount} label="정답" />
            <ScoreLegend color="bg-rose-500" count={wrongCount} label="오답" />
            <ScoreLegend color="bg-stone-300" count={unansweredCount} label="미응답" />
          </dl>
        </section>
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="type-control font-bold text-stone-950">다음 단계</h2>
          <ButtonLink className="mt-3 w-full" state={{ initialContent: reviewNote }} to={routes.newNote}>
            오답 노트 만들기
          </ButtonLink>
          <p className="mt-3 type-caption leading-5 text-stone-400">오답과 채점 피드백을 노트 초안으로 정리합니다.</p>
        </section>
      </aside>
    </div>
  )
}

function ResultMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-stone-200 px-5 py-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <dt className="type-caption text-stone-400">{label}</dt>
      <dd className="mt-1 type-dialog-title font-bold text-stone-950 [&_small]:ml-0.5 [&_small]:type-caption [&_small]:font-medium [&_small]:text-stone-400">{value}</dd>
    </div>
  )
}

function ResultFilterButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button aria-pressed={active} className={`min-h-8 rounded-md px-3 type-caption font-semibold ${active ? 'bg-brand-50 text-brand-700' : 'text-stone-500 hover:bg-stone-50'}`} onClick={onClick} type="button">{children}</button>
}

function AnswerPanel({ correct = false, label, value }: { correct?: boolean; label: string; value: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${correct ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200 bg-stone-50/70'}`}>
      <p className={`type-caption ${correct ? 'text-emerald-700' : 'text-stone-400'}`}>{label}</p>
      <p className={`mt-1 whitespace-pre-wrap type-control font-semibold ${correct ? 'text-emerald-800' : 'text-stone-800'}`}>{value}</p>
    </div>
  )
}

function ScoreLegend({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className={`size-2 rounded-full ${color}`} />
      <dt className="text-stone-600">{label}</dt>
      <dd className="ml-auto font-semibold text-stone-950">{count}문항</dd>
    </div>
  )
}

function getVerdictTone(verdict: NonNullable<ExamSubmission['items'][number]['verdict']>) {
  return verdict === 'CORRECT' ? 'success' : verdict === 'PARTIAL' ? 'warning' : 'danger'
}

function getVerdictLabel(verdict: NonNullable<ExamSubmission['items'][number]['verdict']>) {
  return verdict === 'CORRECT' ? '정답' : verdict === 'PARTIAL' ? '부분 정답' : '오답'
}

function getQuestionTypeLabel(questionType: ExamQuestionType) {
  return ({ ESSAY: '서술형', MCQ: '객관식', OX: 'OX', SHORT: '단답형' } as const)[questionType]
}

function formatSubmittedAnswer(question: ExamQuestion | undefined, answer: string | undefined) {
  if (!answer?.trim()) return '무응답'
  if (question?.questionType === 'OX') return answer === 'true' ? 'O' : answer === 'false' ? 'X' : answer
  if (question?.questionType === 'MCQ') {
    const option = question.options?.find((item) => item.id === answer)
    return option ? `${option.id.toUpperCase()}. ${option.text}` : answer
  }
  return answer
}

function formatCorrectAnswer(question: ExamQuestion | undefined, answer: ExamSubmission['items'][number]['correctAnswer']): string | null {
  if (typeof answer === 'object' && answer) return answer.text ? `${answer.choiceId.toUpperCase()}. ${answer.text}` : answer.choiceId.toUpperCase()
  if (typeof answer === 'boolean') return answer ? 'O' : 'X'
  if (!answer?.trim()) return null
  if (question?.questionType === 'MCQ') {
    const option = question.options?.find((item) => item.id === answer)
    return option ? `${option.id.toUpperCase()}. ${option.text}` : answer.toUpperCase()
  }
  if (question?.questionType === 'OX') return answer === 'true' ? 'O' : answer === 'false' ? 'X' : answer
  return answer
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

function formatNullableScore(value: number | undefined) {
  return value === undefined ? '-' : formatScore(value)
}

function formatPercentage(value: number) {
  return value.toFixed(1).replace(/\.0$/, '')
}

function formatDuration(value: number | undefined) {
  if (value === undefined) return '기록 없음'
  const seconds = Math.max(0, Math.floor(value))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [
    hours > 0 ? `${hours}시간` : null,
    minutes > 0 ? `${minutes}분` : null,
    `${remainingSeconds}초`,
  ].filter(Boolean).join(' ')
}

function buildExamReviewNote(
  exam: Exam,
  submission: ExamSubmission,
  results: Array<{
    index: number
    item: ExamSubmission['items'][number]
    question?: ExamQuestion
  }>,
) {
  const wrongResults = results.filter(({ item }) => item.verdict !== 'CORRECT')
  const sections = wrongResults.map(({ index, item, question }) => [
    `## ${index + 1}번 ${getVerdictLabel(item.verdict ?? 'WRONG')}`,
    '',
    question?.questionText ?? '문항 내용을 불러올 수 없습니다.',
    '',
    `- 내 답안: ${formatSubmittedAnswer(question, item.answer)}`,
    ...(submission.reviewAvailable && item.correctAnswer ? [`- 정답: ${formatCorrectAnswer(question, item.correctAnswer)}`] : []),
    `- 점수: ${formatNullableScore(item.score)}/${formatScore(item.maxScore)}`,
    ...(submission.reviewAvailable && item.explanation ? [`- 해설: ${item.explanation}`] : []),
    ...(item.feedback ? [`- 피드백: ${item.feedback}`] : []),
  ].join('\n'))

  return [
    `# ${exam.title} 오답 노트`,
    '',
    `${submission.attemptNo}회차 · ${formatDateTime(submission.submittedAt)} 제출`,
    '',
    ...(sections.length > 0 ? sections : ['오답이 없습니다.']),
  ].join('\n\n')
}

function PrivateAnswer({ question }: { question: ExamQuestion }) { const answer = question.questionType === 'MCQ' ? question.answerChoiceId?.toUpperCase() : question.questionType === 'OX' ? (question.answerValue ? 'O' : 'X') : question.questionType === 'SHORT' ? question.referenceAnswer : question.modelAnswer; return answer ? <p className="mt-2 type-caption text-stone-600"><strong>정답:</strong> {answer}</p> : null }
function toExamInput(exam: Exam): CreateExamInput { return { allowRetake: exam.allowRetake, description: exam.description, dueAt: exam.dueAt, questions: exam.questions.map((question) => ({ answerChoiceId: question.answerChoiceId, answerValue: question.answerValue, explanation: question.explanation, modelAnswer: question.modelAnswer, options: question.options, points: question.maxScore, questionText: question.questionText, questionType: question.questionType, referenceAnswer: question.referenceAnswer, rubric: question.rubric })), title: exam.title, weekNumber: exam.weekNumber } }
function getSubmissionLabel(status: ExamSubmission['status']) { return status === 'GRADED' ? '채점 완료' : status === 'SUBMITTED' ? '채점 중' : '채점 실패' }
function isExamSubmissionPending(submission: ExamSubmission) { return submission.status === 'SUBMITTED' }
function isInstructorSubmissionPending(submission: InstructorSubmissionSummary) { return submission.status === 'SUBMITTED' }
function hasPendingInstructorSubmission(submissions: InstructorSubmissionSummary[]) { return submissions.some(isInstructorSubmissionPending) }
function getExamPollingDelay(elapsedMs: number) { return elapsedMs < 30_000 ? 2000 : 5000 }
function createRequestId() { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `exam-${Date.now()}` }

function serializeExamAnswers(answers: Record<string, string>) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(answers)
        .filter(([, answer]) => answer.trim().length > 0)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  )
}

function hasExamAnswers(answers: Record<string, string>) {
  return Object.values(answers).some((answer) => answer.trim().length > 0)
}

function getDraftSyncLabel(status: 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'conflict') {
  if (status === 'loading') return '저장 답안 확인 중'
  if (status === 'saving') return '자동 저장 중'
  if (status === 'saved') return '서버에 저장됨'
  if (status === 'error') return '서버 저장 재시도 예정'
  if (status === 'conflict') return '답안 선택 필요'
  return '자동 저장 대기'
}

function createExamDraftStorageKey(examId: number | string, userId?: number) {
  return userId === undefined ? null : `exam-draft:${examId}:${userId}`
}

function readExamDraft(storageKey: string | null, questions: ExamQuestion[]) {
  if (!storageKey) return {}
  try {
    const stored = window.sessionStorage.getItem(storageKey)
    if (!stored) return {}
    const parsed = JSON.parse(stored) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const questionIds = new Set(questions.map((question) => String(question.id)))
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([questionId, answer]) => questionIds.has(questionId) && typeof answer === 'string',
      ),
    )
  } catch {
    return {}
  }
}

function writeExamDraft(storageKey: string, answers: Record<string, string>) {
  try {
    if (Object.values(answers).some((answer) => answer.length > 0)) {
      window.sessionStorage.setItem(storageKey, JSON.stringify(answers))
    } else {
      window.sessionStorage.removeItem(storageKey)
    }
  } catch {
    // 저장 공간이 차단된 환경에서도 시험 응시는 계속할 수 있어야 한다.
  }
}

function removeExamDraft(storageKey: string) {
  try {
    window.sessionStorage.removeItem(storageKey)
  } catch {
    // 저장 공간 접근 실패는 제출 완료 처리를 막지 않는다.
  }
}
