import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Send, Sparkles, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { isInstructorRole, useAuth } from '../../features/auth'
import { rememberClassroomId } from '../../features/classrooms'
import { createExamsRepository, type CreateExamInput, type Exam, type ExamQuestion, type ExamQuestionType, type ExamSubmission, type GenerateExamDraftInput, type InstructorSubmissionSummary } from '../../features/exams'
import { ExamEditor } from '../../features/exams/ExamEditor'
import { isExamDraftValid } from '../../features/exams/examEditorModel'
import { getRequestErrorMessage } from '../../shared/api'
import { formatDateTime } from '../../shared/lib/format'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { useAsyncJobPolling } from '../../shared/state'
import { Badge, Button, ButtonLink, EmptyState, ErrorState, LoadingState, PageContainer, PageHeader, useToast } from '../../shared/ui'
import { ExamStatusBadge } from './ExamsPage'
import { classroomExamsPath } from '../routes'

export function ExamDetailPage() {
  usePageTitle('시험')
  const { classroomId = '', examId } = useParams(); const { apiRequest, user } = useAuth(); const navigate = useNavigate(); const { show } = useToast()
  const isInstructor = isInstructorRole(user?.role)
  const repository = useMemo(() => createExamsRepository(apiRequest), [apiRequest])
  const [exam, setExam] = useState<Exam | null>()
  const [error, setError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

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
    <PageHeader title={exam.title} titleAccessory={<ExamStatusBadge status={exam.status} />} actions={<ButtonLink to={classroomExamsPath(exam.classroomId)} variant="secondary">목록</ButtonLink>} />
    {isInstructor ? <InstructorExamView exam={exam} isWorking={isWorking} onAction={(action) => void runAction(action)} onUpdated={setExam} repository={repository} /> : <LearnerExamView exam={exam} repository={repository} />}
  </PageContainer>
}

function InstructorExamView({ exam, isWorking, onAction, onUpdated, repository }: { exam: Exam; isWorking: boolean; onAction: (action: 'publish' | 'close' | 'delete') => void; onUpdated: (exam: Exam) => void; repository: ReturnType<typeof createExamsRepository> }) {
  const { show } = useToast(); const [isEditing, setIsEditing] = useState(false); const [isSaving, setIsSaving] = useState(false)
  const [isAiDraftOpen, setIsAiDraftOpen] = useState(false)
  const [draftWasTruncated, setDraftWasTruncated] = useState(false)
  const [submissions, setSubmissions] = useState<InstructorSubmissionSummary[]>([]); const [submissionsError, setSubmissionsError] = useState<string | null>(null)
  const [regradingSubmissionId, setRegradingSubmissionId] = useState<string | null>(null)
  const [draft, setDraft] = useState<CreateExamInput>(() => toExamInput(exam))
  const fetchSubmissions = useCallback((signal: AbortSignal) => repository.listSubmissions(exam.id, signal), [exam.id, repository])
  const handleSubmissionPollingError = useCallback((error: unknown) => setSubmissionsError(getRequestErrorMessage(error)), [])
  const handleSubmissionPollingDelay = useCallback(() => setSubmissionsError('자동 재채점이 약 90분 이상 지연되고 있습니다. 잠시 후 다시 확인하세요.'), [])
  useEffect(() => { if (exam.status === 'DRAFT') return; const controller = new AbortController(); fetchSubmissions(controller.signal).then((items) => { setSubmissions(items); setSubmissionsError(null) }).catch((error) => { if (!controller.signal.aborted) setSubmissionsError(getRequestErrorMessage(error)) }); return () => controller.abort() }, [exam.status, fetchSubmissions])
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
    {exam.status === 'DRAFT' && isEditing ? <form className="rounded-xl border border-stone-200 bg-white p-5" onSubmit={save}>{draftWasTruncated ? <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 type-control font-semibold text-amber-800" role="status">자료가 많아 앞 30페이지만 사용되었습니다.</p> : null}<ExamEditor onChange={setDraft} value={draft} /><div className="mt-6 flex justify-end gap-2"><Button onClick={() => { setDraft(toExamInput(exam)); setDraftWasTruncated(false); setIsEditing(false) }} variant="ghost">취소</Button><Button disabled={!isExamDraftValid(draft) || isSaving} type="submit">{isSaving ? '저장 중' : '변경 저장'}</Button></div></form> : <section className="rounded-xl border border-stone-200 bg-white"><div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-5 py-4"><div><p className="type-body text-stone-600">{exam.description || '설명 없음'}</p><p className="mt-1 type-caption text-stone-400">{exam.weekNumber ? `${exam.weekNumber}주차 · ` : ''}{exam.questionCount}문항 · 총 {exam.totalScore}점 · 재응시 {exam.allowRetake ? '허용' : '불가'}</p></div><div className="ml-auto flex flex-wrap gap-2">{exam.status === 'DRAFT' ? <><Button onClick={() => setIsAiDraftOpen(true)} variant="secondary"><Sparkles aria-hidden="true" size={14} />AI 초안으로 시작</Button><Button onClick={() => { setDraft(toExamInput(exam)); setDraftWasTruncated(false); setIsEditing(true) }} variant="secondary">직접 수정</Button><Button disabled={isWorking || exam.questionCount === 0} onClick={() => onAction('publish')}>공개</Button><Button disabled={isWorking} onClick={() => onAction('delete')} variant="ghost"><Trash2 size={14} />삭제</Button></> : null}{exam.status === 'PUBLISHED' ? <Button disabled={isWorking} onClick={() => onAction('close')} variant="secondary">시험 종료</Button> : null}</div></div><div className="divide-y divide-stone-100">{exam.questions.map((question, index) => <article className="px-5 py-4" key={question.id}><div className="flex gap-3"><Badge>{index + 1}번</Badge><div className="min-w-0"><h2 className="type-body font-semibold text-stone-900">{question.questionText}</h2><p className="mt-1 type-caption text-stone-500">{question.questionType} · {question.maxScore}점</p><PrivateAnswer question={question} /></div></div></article>)}</div></section>}
    {exam.status !== 'DRAFT' ? <section className="overflow-hidden rounded-xl border border-stone-200 bg-white"><div className="border-b border-stone-200 px-5 py-4"><h2 className="type-section-title font-bold">제출 현황</h2></div>{submissionsError ? <p className="border-b border-stone-100 px-5 py-3 type-control text-rose-700" role="alert">{submissionsError}</p> : null}{submissions.length === 0 ? <EmptyState title="제출 내역이 없습니다" description="학습자가 시험을 제출하면 여기에 표시됩니다." /> : <><div className="overflow-x-auto mobile-web:hidden"><table className="w-full min-w-[780px] text-left type-control"><thead className="bg-stone-50 type-caption text-stone-500"><tr><th className="px-5 py-3">학습자</th><th>상태</th><th>시도</th><th>점수</th><th>제출 시각</th><th className="px-5 text-right">작업</th></tr></thead><tbody>{submissions.map((submission) => <tr className="border-t border-stone-100" key={submission.id}><td className="px-5 py-3 font-semibold">{submission.userName}</td><td>{getSubmissionLabel(submission.status)}</td><td>{submission.attemptNo}/{submission.attemptCount}</td><td>{submission.status === 'GRADED' ? `${submission.score ?? 0}/${submission.maxScore ?? 0}` : '-'}</td><td className="text-stone-500">{formatDateTime(submission.submittedAt)}</td><td className="px-5 text-right">{submission.status === 'GRADING_FAILED' ? <Button disabled={regradingSubmissionId !== null} onClick={() => void regradeSubmission(submission.id)} size="sm" variant="secondary">{regradingSubmissionId === submission.id ? '요청 중' : '재채점'}</Button> : null}</td></tr>)}</tbody></table></div><div className="hidden divide-y divide-stone-100 mobile-web:block">{submissions.map((submission) => <article className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 type-control" key={submission.id}><strong className="truncate">{submission.userName}</strong><span className="font-semibold text-stone-700">{getSubmissionLabel(submission.status)}</span><div className="col-span-2 grid grid-cols-3 gap-2 rounded-lg bg-stone-50 p-3 text-center"><span><small className="block text-stone-400">시도</small>{submission.attemptNo}/{submission.attemptCount}</span><span><small className="block text-stone-400">점수</small>{submission.status === 'GRADED' ? `${submission.score ?? 0}/${submission.maxScore ?? 0}` : '-'}</span><span><small className="block text-stone-400">제출</small>{formatDateTime(submission.submittedAt)}</span></div>{submission.status === 'GRADING_FAILED' ? <Button className="col-span-2 w-full" disabled={regradingSubmissionId !== null} onClick={() => void regradeSubmission(submission.id)} size="sm" variant="secondary">{regradingSubmissionId === submission.id ? '요청 중' : '재채점'}</Button> : null}</article>)}</div></>}</section> : null}
    {isAiDraftOpen ? <AiExamDraftDialog initialWeekNumber={exam.weekNumber} onClose={() => setIsAiDraftOpen(false)} onGenerate={generateAiDraft} /> : null}
  </>
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

  return <div aria-labelledby="ai-exam-draft-title" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4" role="dialog"><form className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-2xl" onSubmit={submit}><div className="flex items-start justify-between gap-4"><div><h2 className="type-dialog-title font-bold text-stone-950" id="ai-exam-draft-title">AI 문항 초안</h2><p className="mt-1 type-caption text-stone-500">생성된 문항은 검토 후 저장해야 반영됩니다.</p></div><button aria-label="AI 문항 초안 닫기" className="flex size-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100" disabled={isGenerating} onClick={onClose} type="button"><X aria-hidden="true" size={16} /></button></div><label className="mt-5 block type-control font-semibold text-stone-700">분석 범위<select className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body" disabled={isGenerating} onChange={(event) => setWeekNumber(event.target.value)} value={weekNumber}><option value="">전체 READY 자료</option>{Array.from({ length: 52 }, (_, index) => index + 1).map((week) => <option key={week} value={week}>{week}주차</option>)}</select></label><fieldset className="mt-5"><legend className="type-control font-semibold text-stone-700">문항 구성</legend><div className="mt-2 grid grid-cols-2 gap-3">{draftQuestionTypes.map((item) => <label className="rounded-lg border border-stone-200 p-3 type-control font-semibold text-stone-700" key={item.type}>{item.label}<input aria-label={`${item.label} 문항 수`} className="mt-2 h-9 w-full rounded-lg border border-stone-300 px-3 type-body" disabled={isGenerating} max={20} min={0} onChange={(event) => setCounts((current) => ({ ...current, [item.type]: Math.max(0, Number(event.target.value)) }))} type="number" value={counts[item.type]} /></label>)}</div></fieldset><p className={`mt-3 type-caption font-semibold ${totalCount > 20 ? 'text-rose-700' : 'text-stone-500'}`}>총 {totalCount}문항 / 최대 20문항</p><div className="mt-6 flex justify-end gap-2"><Button disabled={isGenerating} onClick={onClose} variant="secondary">취소</Button><Button disabled={isGenerating || totalCount < 1 || totalCount > 20} type="submit">{isGenerating ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={14} />AI가 문항을 생성하는 중</> : <><Sparkles aria-hidden="true" size={14} />초안 생성</>}</Button></div></form></div>
}

function LearnerExamView({ exam, repository }: { exam: Exam; repository: ReturnType<typeof createExamsRepository> }) {
  const [answers, setAnswers] = useState<Record<string, string>>({}); const [index, setIndex] = useState(0); const [submission, setSubmission] = useState<ExamSubmission | null>(exam.mySubmission ? { ...exam.mySubmission, id: '', items: [], maxScore: exam.totalScore } as ExamSubmission : null); const [isSubmitting, setIsSubmitting] = useState(false); const [error, setError] = useState<string | null>(null)
  const question = exam.questions[index]
  const fetchSubmission = useCallback((signal: AbortSignal) => repository.getMySubmission(exam.id, undefined, signal), [exam.id, repository])
  const handlePollingError = useCallback((requestError: unknown) => setError(getRequestErrorMessage(requestError)), [])
  const handlePollingDelay = useCallback(() => setError('자동 재시도까지 완료되지 않았습니다. 약 90분 이상 지속되면 강의자에게 문의해 주세요.'), [])
  useAsyncJobPolling({ enabled: submission?.status === 'SUBMITTED', fetchNext: fetchSubmission, getDelayMs: getExamPollingDelay, isPending: isExamSubmissionPending, maxDurationMs: 90 * 60_000, onDelayed: handlePollingDelay, onError: handlePollingError, onResult: setSubmission })
  async function submit(event: FormEvent) { event.preventDefault(); if (isSubmitting || !exam.submittable) return; setIsSubmitting(true); try { setSubmission(await repository.submit(exam.id, answers, createRequestId())); setError(null) } catch (requestError) { setError(getRequestErrorMessage(requestError)) } finally { setIsSubmitting(false) } }
  if (submission && submission.status !== 'SUBMITTED') return <SubmissionResult exam={exam} submission={submission} />
  if (!question) return <EmptyState title="공개된 문항이 없습니다" description="강의자에게 시험 상태를 문의하세요." />
  return <form className="overflow-hidden rounded-xl border border-stone-200 bg-white" onSubmit={submit}><div className="border-b border-stone-200 px-5 py-4"><p className="type-body text-stone-600">{exam.description || '시험 문항에 답한 뒤 제출하세요.'}</p><div className="mt-3 flex items-center justify-between type-caption text-stone-500"><span>{index + 1}/{exam.questions.length} 문항</span><span>{Object.values(answers).filter(Boolean).length}개 답변</span></div></div><div className="p-5 sm:p-7"><QuestionAnswerInput onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))} question={question} value={answers[question.id] ?? ''} />{submission?.status === 'SUBMITTED' ? <p className="mt-5 rounded-lg bg-brand-50 px-4 py-3 type-body font-semibold text-brand-800" role="status">답안을 제출했습니다. 채점이 지연되면 자동으로 재시도 중입니다.</p> : null}{error ? <p className="mt-4 type-body text-rose-700" role="alert">{error}</p> : null}<div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4"><div className="flex gap-2"><Button disabled={index === 0 || Boolean(submission)} onClick={() => setIndex((current) => current - 1)} variant="secondary"><ChevronLeft size={15} />이전</Button><Button disabled={index === exam.questions.length - 1 || Boolean(submission)} onClick={() => setIndex((current) => current + 1)} variant="secondary">다음<ChevronRight size={15} /></Button></div><Button disabled={!exam.submittable || isSubmitting || Boolean(submission)} type="submit"><Send size={15} />{isSubmitting ? '제출 중' : exam.submittable ? '시험 제출' : '제출 불가'}</Button></div></div></form>
}

function QuestionAnswerInput({ onChange, question, value }: { onChange: (value: string) => void; question: ExamQuestion; value: string }) {
  return <fieldset><legend className="type-section-title font-bold text-stone-950"><span className="mr-2 text-brand-700">Q.</span>{question.questionText}</legend><p className="mt-2 type-caption text-stone-500">{question.maxScore}점</p>{question.questionType === 'MCQ' ? <div className="mt-5 grid gap-2">{(question.options ?? []).map((option) => <label className={`flex min-h-11 items-center gap-3 rounded-lg border px-4 type-body ${value === option.id ? 'border-brand-600 bg-brand-50' : 'border-stone-200'}`} key={option.id}><input checked={value === option.id} onChange={() => onChange(option.id)} type="radio" /><strong>{option.id.toUpperCase()}.</strong>{option.text}</label>)}</div> : question.questionType === 'OX' ? <div className="mt-5 flex gap-3">{[['true', 'O'], ['false', 'X']].map(([answer, label]) => <label className={`flex h-16 flex-1 items-center justify-center rounded-lg border type-dialog-title font-bold ${value === answer ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-stone-200'}`} key={answer}><input checked={value === answer} className="sr-only" onChange={() => onChange(answer)} type="radio" />{label}</label>)}</div> : <textarea className="mt-5 min-h-40 w-full resize-none rounded-lg border border-stone-300 px-4 py-3 type-body" onChange={(event) => onChange(event.target.value)} placeholder="답안을 입력하세요" value={value} />}</fieldset>
}

function SubmissionResult({ exam, submission }: { exam: Exam; submission: ExamSubmission }) { return <section className="rounded-xl border border-stone-200 bg-white p-6"><div className="flex items-start gap-4"><span className={`flex size-11 items-center justify-center rounded-full ${submission.status === 'GRADED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}><CheckCircle2 size={22} /></span><div><h2 className="type-dialog-title font-bold">{submission.status === 'GRADED' ? '채점이 완료되었습니다' : '채점을 완료하지 못했습니다'}</h2><p className="mt-1 type-body text-stone-500">{exam.title} · {submission.attemptNo}회차</p>{submission.status === 'GRADED' ? <p className="mt-4 type-page-title font-bold text-brand-700">{submission.score ?? 0}/{submission.maxScore ?? exam.totalScore}점 <span className="type-body text-stone-500">({submission.normalizedScore ?? 0}점)</span></p> : <p className="mt-4 type-body text-rose-700">자동 재시도를 완료했지만 채점하지 못했습니다. 강의자에게 문의하세요.</p>}</div></div>{submission.items.length > 0 ? <div className="mt-6 divide-y divide-stone-100 border-t border-stone-200">{submission.items.map((item, index) => <div className="py-4" key={item.questionId}><div className="flex items-center gap-2"><strong className="type-body">{index + 1}번</strong>{item.verdict ? <Badge tone={item.verdict === 'CORRECT' ? 'success' : item.verdict === 'PARTIAL' ? 'warning' : 'danger'}>{item.verdict === 'CORRECT' ? '정답' : item.verdict === 'PARTIAL' ? '부분 정답' : '오답'}</Badge> : null}<span className="ml-auto type-control font-semibold">{item.score ?? '-'}/{item.maxScore}</span></div>{item.feedback ? <p className="mt-2 type-body text-stone-600">{item.feedback}</p> : null}</div>)}</div> : null}</section> }

function PrivateAnswer({ question }: { question: ExamQuestion }) { const answer = question.questionType === 'MCQ' ? question.answerChoiceId?.toUpperCase() : question.questionType === 'OX' ? (question.answerValue ? 'O' : 'X') : question.questionType === 'SHORT' ? question.referenceAnswer : question.modelAnswer; return answer ? <p className="mt-2 type-caption text-stone-600"><strong>정답:</strong> {answer}</p> : null }
function toExamInput(exam: Exam): CreateExamInput { return { allowRetake: exam.allowRetake, description: exam.description, questions: exam.questions.map((question) => ({ answerChoiceId: question.answerChoiceId, answerValue: question.answerValue, explanation: question.explanation, modelAnswer: question.modelAnswer, options: question.options, points: question.maxScore, questionText: question.questionText, questionType: question.questionType, referenceAnswer: question.referenceAnswer, rubric: question.rubric })), title: exam.title, weekNumber: exam.weekNumber } }
function getSubmissionLabel(status: ExamSubmission['status']) { return status === 'GRADED' ? '채점 완료' : status === 'SUBMITTED' ? '채점 중' : '채점 실패' }
function isExamSubmissionPending(submission: ExamSubmission) { return submission.status === 'SUBMITTED' }
function isInstructorSubmissionPending(submission: InstructorSubmissionSummary) { return submission.status === 'SUBMITTED' }
function hasPendingInstructorSubmission(submissions: InstructorSubmissionSummary[]) { return submissions.some(isInstructorSubmissionPending) }
function getExamPollingDelay(elapsedMs: number) { return elapsedMs < 30_000 ? 2000 : 5000 }
function createRequestId() { return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `exam-${Date.now()}` }
