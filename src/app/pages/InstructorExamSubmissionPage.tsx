import { ArrowLeft, ChevronLeft, ChevronRight, FileDown, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { useAuth } from '../../features/auth'
import { createClassroomsRepository, type ClassroomStudent } from '../../features/classrooms'
import { createExamsRepository, type Exam, type ExamQuestion, type ExamSubmission, type InstructorSubmissionSummary } from '../../features/exams'
import { getRequestErrorMessage } from '../../shared/api'
import { formatDateTime } from '../../shared/lib/format'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Badge, Button, ButtonLink, ErrorState, LoadingState, PageContainer, useToast } from '../../shared/ui'
import { classroomExamDetailPath, classroomExamSubmissionPath } from '../routes'

interface SubmissionPageData {
  exam: Exam
  student?: ClassroomStudent
  submission: ExamSubmission
  submissions: InstructorSubmissionSummary[]
  summary?: InstructorSubmissionSummary
}

export function InstructorExamSubmissionPage() {
  usePageTitle('시험 답안 상세')
  const { apiRequest } = useAuth()
  const { classroomId = '', examId = '', submissionId = '' } = useParams()
  const examsRepository = useMemo(() => createExamsRepository(apiRequest), [apiRequest])
  const classroomsRepository = useMemo(() => createClassroomsRepository(apiRequest), [apiRequest])
  const { show } = useToast()
  const [data, setData] = useState<SubmissionPageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null)
  const [adjustingQuestionId, setAdjustingQuestionId] = useState<string | null>(null)
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!classroomId || !examId || !submissionId) return
    const controller = new AbortController()
    Promise.all([
      examsRepository.get(examId, controller.signal),
      examsRepository.getSubmission(examId, submissionId, controller.signal),
      examsRepository.listSubmissions(examId, controller.signal),
      classroomsRepository.listStudents(classroomId, {}, controller.signal),
    ]).then(([exam, submission, submissions, students]) => {
      const summary = submissions.find((item) => item.id === submissionId)
      setData({
        exam,
        student: summary ? students.find((item) => item.id === summary.userId) : undefined,
        submission,
        submissions,
        summary,
      })
      setScoreDrafts(Object.fromEntries(submission.items.map((item) => [item.questionId, item.score === undefined ? '' : String(item.score)])))
      setError(null)
    }).catch((requestError) => {
      if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
    })
    return () => controller.abort()
  }, [classroomId, classroomsRepository, examId, examsRepository, submissionId])

  async function adjustScore(questionId: string, maxScore: number) {
    if (!data || adjustingQuestionId) return
    const score = Number(scoreDrafts[questionId])
    if (!Number.isFinite(score) || score < 0 || score > maxScore || !/^\d+(?:\.\d{1,2})?$/.test(scoreDrafts[questionId] ?? '')) {
      setAdjustmentError(`점수는 0점부터 ${formatScore(maxScore)}점까지 소수 둘째 자리 이내로 입력하세요.`)
      return
    }
    setAdjustingQuestionId(questionId)
    setAdjustmentError(null)
    try {
      const submission = await examsRepository.adjustScore(examId, submissionId, questionId, score)
      setData((current) => current ? { ...current, submission } : current)
      setScoreDrafts(Object.fromEntries(submission.items.map((item) => [item.questionId, item.score === undefined ? '' : String(item.score)])))
      show('문항 점수를 저장했습니다.', 'success')
    } catch (requestError) {
      setAdjustmentError(getRequestErrorMessage(requestError))
    } finally {
      setAdjustingQuestionId(null)
    }
  }

  if (!classroomId || !examId || !submissionId) {
    return <ErrorState description="시험 또는 제출 식별자가 없습니다." title="답안을 찾을 수 없습니다" />
  }
  if (error) {
    return <ErrorState action={<ButtonLink to={classroomExamDetailPath(classroomId, examId)}>응시 현황으로</ButtonLink>} description={error} title="답안을 불러오지 못했습니다" />
  }
  if (!data) return <LoadingState message="제출 답안을 불러오는 중입니다." />

  const currentIndex = data.submissions.findIndex((item) => item.id === submissionId)
  const previous = currentIndex > 0 ? data.submissions[currentIndex - 1] : undefined
  const next = currentIndex >= 0 && currentIndex < data.submissions.length - 1
    ? data.submissions[currentIndex + 1]
    : undefined
  const studentName = data.student?.name ?? data.summary?.userName ?? '학습자'
  const score = data.submission.score ?? 0
  const maxScore = data.submission.maxScore ?? data.exam.totalScore
  const scoreRate = maxScore > 0 ? Math.min(100, Math.max(0, score / maxScore * 100)) : 0
  const correctCount = data.submission.items.filter((item) => item.verdict === 'CORRECT').length

  return (
    <PageContainer className="print:gap-3">
      <header className="flex flex-wrap items-center gap-3 print:hidden">
        <ButtonLink to={classroomExamDetailPath(classroomId, examId)} variant="secondary">
          <ArrowLeft aria-hidden="true" size={15} />
          응시 현황
        </ButtonLink>
        <p className="type-caption text-stone-400">{data.exam.title} · {data.submission.attemptNo}회차 · 답안 상세</p>
        <div className="ml-auto flex gap-2">
          {previous ? <ButtonLink aria-label="이전 학습자" to={classroomExamSubmissionPath(classroomId, examId, previous.id)} variant="secondary"><ChevronLeft aria-hidden="true" size={15} />이전 학습자</ButtonLink> : <Button disabled variant="secondary"><ChevronLeft aria-hidden="true" size={15} />이전 학습자</Button>}
          {next ? <ButtonLink aria-label="다음 학습자" to={classroomExamSubmissionPath(classroomId, examId, next.id)} variant="secondary">다음 학습자<ChevronRight aria-hidden="true" size={15} /></ButtonLink> : <Button disabled variant="secondary">다음 학습자<ChevronRight aria-hidden="true" size={15} /></Button>}
        </div>
      </header>

      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-5 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 type-control font-bold text-brand-700">{studentName.slice(0, 1)}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-section-title font-bold text-stone-950">{studentName}</h1>
              <SubmissionStatusBadge status={data.submission.status} />
            </div>
            <p className="mt-0.5 type-caption text-stone-400">
              {data.student?.email ? `${data.student.email} · ` : ''}{formatDateTime(data.submission.submittedAt)} 제출 · 소요 {formatDuration(data.submission.durationSeconds)}
            </p>
          </div>
          <Button className="ml-auto print:hidden" onClick={() => window.print()} variant="secondary">
            <FileDown aria-hidden="true" size={15} />답안 PDF
          </Button>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <strong className="type-page-title text-stone-950">{formatScore(score)}<small className="type-caption font-medium text-stone-400">/{formatScore(maxScore)}점</small></strong>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
            <div className={`h-full rounded-full ${scoreRate >= 60 ? 'bg-emerald-600' : 'bg-rose-500'}`} style={{ width: `${scoreRate}%` }} />
          </div>
          <span className="type-caption text-stone-500">정답률 {formatPercentage(correctCount, data.submission.items.length)} · 문항 평균 {formatAverageScore(score, data.submission.items.length)}</span>
        </div>
      </section>

      <section aria-label="문항별 답안" className="grid gap-3 xl:grid-cols-3">
        {data.submission.items.map((item, index) => {
          const question = data.exam.questions.find((candidate) => candidate.id === item.questionId)
          const correctAnswer = formatCorrectAnswer(question)
          return (
            <article className="rounded-lg border border-stone-200 bg-white p-4" key={item.questionId}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="type-body text-stone-950">{index + 1}번</strong>
                {item.verdict ? <Badge size="compact" tone={verdictTone(item.verdict)}>{verdictLabel(item.verdict)}</Badge> : null}
                {item.manualScore !== undefined ? <Badge size="compact" tone="info">직접 수정됨</Badge> : null}
                {question ? <span className="type-caption text-stone-400">{questionTypeLabel(question.questionType)}</span> : null}
                <strong className="ml-auto type-control text-stone-900">{formatNullableScore(item.score)}/{formatScore(item.maxScore)}</strong>
              </div>
              <h2 className="mt-4 min-h-12 type-control font-semibold leading-6 text-stone-900">{question?.questionText ?? '문항 내용을 불러올 수 없습니다.'}</h2>
              <AnswerBox label="학습자 답안" value={formatSubmittedAnswer(question, item.answer)} />
              {correctAnswer ? <AnswerBox correct label="정답" value={correctAnswer} /> : null}
              {item.feedback ? <div className="mt-3 flex gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2.5 type-caption leading-5 text-stone-700"><Sparkles aria-hidden="true" className="mt-0.5 shrink-0 text-brand-600" size={13} /><p>{item.feedback}</p></div> : null}
              {question?.explanation ? <div className="mt-3 border-t border-stone-100 pt-3"><p className="type-caption font-semibold text-stone-500">해설</p><p className="mt-1 whitespace-pre-wrap type-caption leading-5 text-stone-600">{question.explanation}</p></div> : null}
              {data.submission.status === 'GRADED' ? <div className="mt-4 flex items-end gap-2 border-t border-stone-100 pt-3"><label className="min-w-0 flex-1 type-caption font-semibold text-stone-600">점수<input aria-label={`${index + 1}번 점수`} className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-control text-stone-900 outline-none focus:border-brand-600" max={item.maxScore} min={0} onChange={(event) => { setScoreDrafts((current) => ({ ...current, [item.questionId]: event.target.value })); setAdjustmentError(null) }} step="0.01" type="number" value={scoreDrafts[item.questionId] ?? ''} /></label><Button disabled={adjustingQuestionId !== null} onClick={() => void adjustScore(item.questionId, item.maxScore)} size="sm" variant="secondary">{adjustingQuestionId === item.questionId ? '저장 중' : '점수 저장'}</Button></div> : null}
            </article>
          )
        })}
      </section>
      {adjustmentError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 type-body font-medium text-rose-700" role="alert">{adjustmentError}</p> : null}
    </PageContainer>
  )
}

function SubmissionStatusBadge({ status }: { status: ExamSubmission['status'] }) {
  if (status === 'GRADED') return <Badge tone="success">채점 완료</Badge>
  if (status === 'SUBMITTED') return <Badge tone="warning">채점 중</Badge>
  return <Badge tone="danger">채점 실패</Badge>
}

function AnswerBox({ correct = false, label, value }: { correct?: boolean; label: string; value: string }) {
  return <div className={`mt-3 rounded-lg border px-3 py-2.5 ${correct ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200 bg-stone-50/70'}`}><p className={`type-caption ${correct ? 'text-emerald-700' : 'text-stone-400'}`}>{label}</p><p className={`mt-1 whitespace-pre-wrap type-control font-semibold ${correct ? 'text-emerald-800' : 'text-stone-800'}`}>{value}</p></div>
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

function formatCorrectAnswer(question: ExamQuestion | undefined) {
  if (!question) return null
  if (question.questionType === 'MCQ' && question.answerChoiceId) {
    const option = question.options?.find((item) => item.id === question.answerChoiceId)
    return option ? `${option.id.toUpperCase()}. ${option.text}` : question.answerChoiceId.toUpperCase()
  }
  if (question.questionType === 'OX' && question.answerValue !== undefined) return question.answerValue ? 'O' : 'X'
  if (question.questionType === 'SHORT') return question.referenceAnswer ?? null
  if (question.questionType === 'ESSAY') return question.modelAnswer ?? null
  return null
}

function verdictTone(verdict: NonNullable<ExamSubmission['items'][number]['verdict']>) {
  return verdict === 'CORRECT' ? 'success' : verdict === 'PARTIAL' ? 'warning' : 'danger'
}

function verdictLabel(verdict: NonNullable<ExamSubmission['items'][number]['verdict']>) {
  return verdict === 'CORRECT' ? '정답' : verdict === 'PARTIAL' ? '부분 정답' : '오답'
}

function questionTypeLabel(type: ExamQuestion['questionType']) {
  return ({ ESSAY: '서술형', MCQ: '객관식', OX: 'OX', SHORT: '단답형' } as const)[type]
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

function formatNullableScore(value: number | undefined) {
  return value === undefined ? '-' : formatScore(value)
}

function formatPercentage(count: number, total: number) {
  return total > 0 ? `${Math.round(count / total * 100)}%` : '-'
}

function formatAverageScore(score: number, total: number) {
  return total > 0 ? `${formatScore(score / total)}점` : '-'
}

function formatDuration(value: number | undefined) {
  if (value === undefined) return '기록 없음'
  const seconds = Math.max(0, Math.floor(value))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours > 0 ? `${hours}시간` : null, minutes > 0 ? `${minutes}분` : null, `${remainingSeconds}초`].filter(Boolean).join(' ')
}
