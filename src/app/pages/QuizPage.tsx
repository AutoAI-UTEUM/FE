import { CircleCheckBig, CircleHelp, CircleX, ChevronLeft, ChevronRight, LoaderCircle, Send, TriangleAlert } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../../features/auth'
import { DocumentChatPanel } from '../../features/documentChat'
import { getRequestErrorMessage } from '../../shared/api'
import {
  createQuizRepository,
  shouldShowDiagnosisEntry,
  validateQuizAnswer,
  type PublicQuiz,
  type PublicQuizQuestion,
  type PublicQuizResult,
  type QuizAnswers,
} from '../../features/quiz'
import {
  Button,
  ButtonLink,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from '../../shared/ui'
import { createSessionsRepository, type SessionQuizSummary } from '../../features/sessions'
import { diagnosisPath, routes } from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { MobileWorkspaceTabs, useResponsiveViewport } from '../../shared/responsive'

const DEFAULT_REVIEW_CHAT_WIDTH = 660
const MIN_REVIEW_CHAT_WIDTH = 360
const MIN_QUIZ_PANEL_WIDTH = 360
const REVIEW_PANEL_RESIZER_WIDTH = 6

export function QuizPage() {
  return <QuizWorkspace />
}

interface QuizWorkspaceProps {
  embedded?: boolean
  onBackToPdf?: () => void
  onSubmitted?: (result: PublicQuizResult) => void
  materialId?: string
  quizId?: string
  reviewSummary?: SessionQuizSummary
  showReviewChat?: boolean
}

export function QuizWorkspace({
  embedded = false,
  materialId: materialIdProp,
  onBackToPdf,
  onSubmitted,
  quizId: quizIdProp,
  reviewSummary,
  showReviewChat = true,
}: QuizWorkspaceProps) {
  usePageTitle(embedded ? '학습 공간' : '퀴즈')
  const { quizId: routeQuizId } = useParams()
  const quizId = quizIdProp ?? routeQuizId
  const navigate = useNavigate()
  const { apiRequest } = useAuth()
  const repository = useMemo(
    () => createQuizRepository(apiRequest),
    [apiRequest],
  )
  const sessionsRepository = useMemo(
    () => createSessionsRepository(apiRequest),
    [apiRequest],
  )
  const [quiz, setQuiz] = useState<PublicQuiz | null | undefined>()
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswers>({})
  const [error, setError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<PublicQuizResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [sessionMaterial, setSessionMaterial] = useState<{
    materialId?: string
    sessionId: string
  }>()
  const [reviewChatWidth, setReviewChatWidth] = useState<number | null>(null)
  const [reviewChatMaxWidth, setReviewChatMaxWidth] = useState(DEFAULT_REVIEW_CHAT_WIDTH)
  const [mobileReviewPane, setMobileReviewPane] = useState<'quiz' | 'review'>('quiz')
  const { isPhone } = useResponsiveViewport()
  const reviewWorkspaceRef = useRef<HTMLDivElement | null>(null)
  const questions = quiz?.questions ?? []
  const question = questions[currentQuestionIndex] ?? questions[0]
  const diagnosisEntry = result?.diagnosisEntry
  const isReviewMode = reviewSummary?.submitted === true || quiz?.submitted === true
  const isReadOnly = isSubmitted || isReviewMode
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const resultSummary = isReviewMode ? reviewSummary : result
  const resolvedMaterialId = materialIdProp ?? (
    sessionMaterial && sessionMaterial.sessionId === quiz?.sessionId
      ? sessionMaterial.materialId
      : undefined
  )
  const shouldShowReviewChat = showReviewChat && isReadOnly && Boolean(resolvedMaterialId)
  const currentFeedback = result?.feedback.find(
    (candidate) => candidate.questionId === question?.id,
  )

  useEffect(() => {
    const workspace = reviewWorkspaceRef.current
    if (!shouldShowReviewChat || !workspace || typeof ResizeObserver === 'undefined') return

    const updatePanelBounds = () => {
      const nextMaximum = Math.max(
        MIN_REVIEW_CHAT_WIDTH,
        workspace.clientWidth - MIN_QUIZ_PANEL_WIDTH - REVIEW_PANEL_RESIZER_WIDTH,
      )
      setReviewChatMaxWidth(nextMaximum)
      setReviewChatWidth((width) => width === null
        ? null
        : Math.min(nextMaximum, Math.max(MIN_REVIEW_CHAT_WIDTH, width)))
    }

    updatePanelBounds()
    const observer = new ResizeObserver(updatePanelBounds)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [shouldShowReviewChat])

  useEffect(() => {
    if (!quizId) return
    const controller = new AbortController()
    Promise.all([
      repository.getById(quizId, controller.signal),
      isReviewMode
        ? repository.getSubmission(quizId, controller.signal)
        : Promise.resolve(null),
    ])
      .then(([nextQuiz, submissionResult]) => {
        setQuiz(nextQuiz)
        if (isReviewMode && submissionResult) {
          setResult(submissionResult)
          setAnswers(Object.fromEntries(
            submissionResult.feedback
              .filter((item) => item.submittedAnswer !== undefined)
              .map((item) => [item.questionId, item.submittedAnswer ?? '']),
          ))
          setIsSubmitted(true)
          setError(null)
        } else if (isReviewMode) {
          setResult(null)
          setError('과거 퀴즈 제출 결과를 찾을 수 없습니다.')
        } else {
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setQuiz(null)
          setError(getRequestErrorMessage(requestError))
        }
      })

    return () => controller.abort()
  }, [isReviewMode, quizId, reloadKey, repository])

  useEffect(() => {
    if (materialIdProp) return
    if (!quiz?.sessionId) return

    const controller = new AbortController()
    sessionsRepository.getById(quiz.sessionId, controller.signal)
      .then((quizSession) => {
        if (!controller.signal.aborted) {
          setSessionMaterial({
            materialId: quizSession?.materialId,
            sessionId: quiz.sessionId,
          })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSessionMaterial({ sessionId: quiz.sessionId })
        }
      })
    return () => controller.abort()
  }, [materialIdProp, quiz?.sessionId, sessionsRepository])

  function updateAnswer(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }))
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quiz || isSubmitting) return
    const firstInvalidQuestion = questions.find(
      (candidate) => validateQuizAnswer(candidate, answers) !== null,
    )
    const validationError = firstInvalidQuestion
      ? validateQuizAnswer(firstInvalidQuestion, answers)
      : null
    setError(validationError)

    if (validationError && firstInvalidQuestion) {
      setCurrentQuestionIndex(questions.indexOf(firstInvalidQuestion))
      return
    }

    setIsSubmitting(true)
    try {
      const nextResult = await repository.submit(quiz, answers)
      setResult(nextResult)
      setIsSubmitted(true)
      setCurrentQuestionIndex(0)
      setError(null)
      onSubmitted?.(nextResult)
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  function resizeReviewChat(clientX: number) {
    const workspace = reviewWorkspaceRef.current
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    const nextMaximum = Math.max(
      MIN_REVIEW_CHAT_WIDTH,
      bounds.width - MIN_QUIZ_PANEL_WIDTH - REVIEW_PANEL_RESIZER_WIDTH,
    )
    const nextWidth = bounds.right - clientX - REVIEW_PANEL_RESIZER_WIDTH / 2
    setReviewChatMaxWidth(nextMaximum)
    setReviewChatWidth(Math.min(nextMaximum, Math.max(MIN_REVIEW_CHAT_WIDTH, nextWidth)))
  }

  function handleReviewResizerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeReviewChat(event.clientX)
  }

  function handleReviewResizerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    resizeReviewChat(event.clientX)
  }

  function handleReviewResizerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? 24 : -24
    setReviewChatWidth((width) => {
      const currentWidth = width ?? Math.max(
        MIN_REVIEW_CHAT_WIDTH,
        ((reviewWorkspaceRef.current?.clientWidth || DEFAULT_REVIEW_CHAT_WIDTH * 2) - REVIEW_PANEL_RESIZER_WIDTH) / 2,
      )
      return Math.min(
        reviewChatMaxWidth,
        Math.max(MIN_REVIEW_CHAT_WIDTH, currentWidth + delta),
      )
    })
  }

  if (!quizId) {
    return (
      <QuizFrame embedded={embedded} onBackToPdf={onBackToPdf}>
        <ErrorState
          title="퀴즈를 찾을 수 없습니다."
          description="퀴즈 식별자가 없습니다."
          action={getBackAction(embedded, onBackToPdf)}
        />
      </QuizFrame>
    )
  }

  if (quiz === undefined) {
    return (
      <QuizFrame embedded={embedded} onBackToPdf={onBackToPdf}>
        <LoadingState message="퀴즈 문항을 불러오는 중입니다." />
      </QuizFrame>
    )
  }

  if (!quiz) {
    return (
      <QuizFrame embedded={embedded} onBackToPdf={onBackToPdf}>
        <ErrorState
          title="퀴즈를 찾을 수 없습니다."
          description={error ?? '세션에서 퀴즈를 다시 선택하세요.'}
          action={
            error ? (
              <Button
                onClick={() => {
                  setError(null)
                  setQuiz(undefined)
                  setReloadKey((key) => key + 1)
                }}
                type="button"
              >
                다시 시도
              </Button>
            ) : getBackAction(embedded, onBackToPdf)
          }
        />
      </QuizFrame>
    )
  }

  if (!question) {
    return (
      <QuizFrame embedded={embedded} onBackToPdf={onBackToPdf}>
        <ErrorState
          title="공개된 퀴즈 문항이 없습니다."
          description="퀴즈 생성 상태를 확인한 뒤 다시 시도하세요."
          action={getBackAction(embedded, onBackToPdf)}
        />
      </QuizFrame>
    )
  }

  return (
    <QuizFrame embedded={embedded} onBackToPdf={onBackToPdf}>
      {shouldShowReviewChat && isPhone ? (
        <MobileWorkspaceTabs
          active={mobileReviewPane}
          items={[{ label: '퀴즈', value: 'quiz' }, { label: '복습', value: 'review' }]}
          onChange={setMobileReviewPane}
        />
      ) : null}
      <div
        aria-label={shouldShowReviewChat ? '퀴즈 복습 작업 영역' : undefined}
        className={shouldShowReviewChat
          ? `study-session-content min-h-[940px] min-w-0 overflow-hidden bg-white mobile-web:min-h-0 mobile-web:h-[calc(100dvh-8rem)] lg:min-h-0 ${embedded ? 'lg:h-full' : 'lg:h-[calc(100dvh-7rem)]'}`
          : 'min-w-0'}
        ref={shouldShowReviewChat ? reviewWorkspaceRef : undefined}
        role={shouldShowReviewChat ? 'region' : undefined}
        style={shouldShowReviewChat && reviewChatWidth !== null
          ? { '--chat-panel-width': `${reviewChatWidth}px` } as CSSProperties
          : undefined}
      >
      <section aria-label="퀴즈 문항" className={`${isPhone && mobileReviewPane !== 'quiz' ? 'hidden' : ''} h-full min-h-0 min-w-0 overflow-y-auto rounded-xl border border-stone-200 bg-white lg:rounded-none lg:border-0`}>
        <form className="p-4 sm:p-6" onSubmit={handleSubmit}>
          <div className="flex justify-end">
            <span className="whitespace-nowrap text-right type-caption font-semibold tabular-nums text-stone-500">
              문항 {currentQuestionIndex + 1} / {questions.length}
            </span>
          </div>
          <h2 className="mt-3 min-w-0 type-dialog-title font-bold text-stone-950" id={`quiz-question-${question.id}`}>
            {question.prompt}
          </h2>
          <QuestionInput
            disabled={isReadOnly}
            labelId={`quiz-question-${question.id}`}
            onChange={(value) => updateAnswer(question.id, value)}
            question={question}
            value={answers[question.id] ?? ''}
          />

          {result ? (
            <QuestionResultDetails
              answer={answers[question.id]}
              feedback={currentFeedback}
              question={question}
            />
          ) : null}

          {error ? (
            <p className="mt-4 type-body font-medium text-rose-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {resultSummary ? (
              <div aria-label="퀴즈 정보" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 type-caption text-stone-600">
                <strong className={resultSummary.passed === false
                  ? 'font-semibold text-amber-700'
                  : resultSummary.passed === true
                    ? 'font-semibold text-emerald-700'
                    : 'font-semibold text-stone-700'}>
                  {resultSummary.score === undefined
                    ? '채점 완료'
                    : `점수 ${resultSummary.score}${resultSummary.maxScore === undefined ? '' : ` / ${resultSummary.maxScore}`}`}
                  {resultSummary.passed === undefined ? '' : resultSummary.passed ? ' · 통과' : ' · 보완 필요'}
                </strong>
              </div>
            ) : <div />}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {result && shouldShowDiagnosisEntry(result) && diagnosisEntry ? (
                embedded ? (
                  <Button
                    onClick={() => navigate(diagnosisPath(
                      diagnosisEntry.sessionId,
                      diagnosisEntry.diagnosisId,
                    ))}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    진단으로 이어가기
                  </Button>
                ) : (
                  <ButtonLink
                    size="sm"
                    to={diagnosisPath(
                      diagnosisEntry.sessionId,
                      diagnosisEntry.diagnosisId,
                    )}
                    variant="secondary"
                  >
                    진단으로 이어가기
                  </ButtonLink>
                )
              ) : null}
              {!isReviewMode && isLastQuestion ? (
                <Button disabled={isSubmitted || isSubmitting} size="sm" type="submit">
                  {isSubmitting
                    ? <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                    : <Send aria-hidden="true" size={14} />}
                  {isSubmitting ? '평가 중' : isSubmitted ? '제출 완료' : '제출'}
                </Button>
              ) : null}
              {resultSummary && !embedded ? (
                <ButtonLink size="sm" to={routes.classrooms} variant="secondary">
                  강의실로 돌아가기
                </ButtonLink>
              ) : null}
              <div className="ml-1 flex gap-1.5">
                <button
                  aria-label="이전 문항"
                  className="flex size-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 mobile-web:size-11"
                  disabled={currentQuestionIndex <= 0}
                  onClick={() => {
                    setCurrentQuestionIndex((index) => Math.max(index - 1, 0))
                    setError(null)
                  }}
                  title="이전 문항"
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" size={15} />
                </button>
                <button
                  aria-label="다음 문항"
                  className="flex size-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 mobile-web:size-11"
                  disabled={currentQuestionIndex >= questions.length - 1}
                  onClick={() => {
                    setCurrentQuestionIndex((index) =>
                      Math.min(index + 1, questions.length - 1),
                    )
                    setError(null)
                  }}
                  title="다음 문항"
                  type="button"
                >
                  <ChevronRight aria-hidden="true" size={15} />
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>
      {shouldShowReviewChat ? (
        <div
          aria-label="퀴즈와 복습 패널 너비 조절"
          aria-orientation="vertical"
          aria-valuemax={Math.round(reviewChatMaxWidth)}
          aria-valuemin={MIN_REVIEW_CHAT_WIDTH}
          aria-valuenow={reviewChatWidth === null ? undefined : Math.round(reviewChatWidth)}
          className="group hidden h-full cursor-col-resize touch-none items-center justify-center bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-brand-600 lg:flex mobile-web:!hidden"
          onDoubleClick={() => setReviewChatWidth(null)}
          onKeyDown={handleReviewResizerKeyDown}
          onPointerDown={handleReviewResizerPointerDown}
          onPointerMove={handleReviewResizerPointerMove}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          role="separator"
          tabIndex={0}
          title="드래그하여 퀴즈와 복습 패널 너비 조절, 두 번 클릭하여 동일 너비로 복원"
        >
          <span className="h-full w-px bg-stone-200 transition-colors group-hover:bg-brand-400" />
        </div>
      ) : null}
      {shouldShowReviewChat && resolvedMaterialId ? (
        <div className={isPhone && mobileReviewPane !== 'review' ? 'hidden' : 'min-h-0 min-w-0 overflow-hidden'}>
        <DocumentChatPanel
          className="!min-h-0 !rounded-none !border-0"
          key={`${resolvedMaterialId}-quiz`}
          materialId={resolvedMaterialId}
          mode="quiz"
          request={apiRequest}
        />
        </div>
      ) : null}
      </div>
    </QuizFrame>
  )
}

function QuestionResultDetails({
  answer,
  feedback,
  question,
}: {
  answer?: string
  feedback?: PublicQuizResult['feedback'][number]
  question: PublicQuizQuestion
}) {
  const verdict = feedback?.verdict ?? 'UNKNOWN'
  const tone = getVerdictTone(verdict)
  const correctAnswer = feedback?.correctAnswer
    ? formatCorrectAnswer(question, feedback.correctAnswer)
    : undefined
  const explanation = feedback?.explanation?.trim()
    && normalizeResultText(feedback.explanation) !== normalizeResultText(correctAnswer)
    ? feedback.explanation.trim()
    : undefined
  const feedbackMessage = feedback?.message?.trim()
    && normalizeResultText(feedback.message) !== normalizeResultText(correctAnswer)
    && normalizeResultText(feedback.message) !== normalizeResultText(explanation)
    ? feedback.message.trim()
    : undefined

  return (
    <section className={`mt-5 rounded-lg border px-4 py-4 ${tone.panel}`} aria-label="현재 문항 채점 결과">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 type-caption font-bold ${tone.badge}`}>
            <VerdictIcon verdict={verdict} />{tone.label}
          </span>
          <span className="min-w-0 type-control text-stone-900">
            <strong className="font-semibold text-stone-500">내 답안 </strong>
            <span className="break-words">{formatSubmittedAnswer(question, answer)}</span>
          </span>
        </div>
        <strong className="type-control text-stone-900">{formatItemScore(feedback?.score, feedback?.maxScore)}</strong>
      </div>
      <dl className="mt-3 grid gap-2 type-control">
        {correctAnswer ? (
          <div className="min-w-0">
            <dt className="inline font-semibold text-stone-500">정답·기준 답안 </dt>
            <dd className="inline break-words text-stone-900">{correctAnswer}</dd>
          </div>
        ) : null}
        {explanation ? (
          <div className="min-w-0">
            <dt className="inline font-semibold text-stone-500">해설 </dt>
            <dd className="inline break-words leading-5 text-stone-700">{explanation}</dd>
          </div>
        ) : null}
        {feedbackMessage ? (
          <div className="min-w-0">
            <dt className="inline font-semibold text-stone-500">피드백 </dt>
            <dd className="inline break-words leading-5 text-stone-700">{feedbackMessage}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  )
}

function normalizeResultText(value?: string): string {
  return (value ?? '').replace(/^(정답|기준 답안|해설|피드백)\s*[:：]?\s*/i, '').replace(/\s+/g, '').toLowerCase()
}

function formatSubmittedAnswer(question: PublicQuizQuestion, answer: string | undefined): string {
  if (!answer) return '제출한 답안 없음'
  return question.choices?.find((choice) => choice.id === answer)?.label ?? answer
}

function formatCorrectAnswer(question: PublicQuizQuestion, answer: string): string {
  return question.choices?.find((choice) => choice.id === answer)?.label ?? answer
}

function formatItemScore(score: number | undefined, maxScore: number | undefined): string {
  if (score === undefined) return '정보 없음'
  return maxScore === undefined ? `${score}점` : `${score} / ${maxScore}`
}

function getVerdictTone(verdict: PublicQuizResult['feedback'][number]['verdict']) {
  if (verdict === 'CORRECT') return {
    badge: 'bg-emerald-100 text-emerald-800',
    label: '정답',
    panel: 'border-emerald-200 bg-emerald-50/50',
  }
  if (verdict === 'PARTIAL') return {
    badge: 'bg-amber-100 text-amber-800',
    label: '부분 정답',
    panel: 'border-amber-200 bg-amber-50/50',
  }
  if (verdict === 'WRONG') return {
    badge: 'bg-rose-100 text-rose-800',
    label: '오답',
    panel: 'border-rose-200 bg-rose-50/50',
  }
  return {
    badge: 'bg-stone-100 text-stone-700',
    label: '채점 완료',
    panel: 'border-stone-200 bg-stone-50/60',
  }
}

function VerdictIcon({ verdict }: { verdict: PublicQuizResult['feedback'][number]['verdict'] }) {
  if (verdict === 'CORRECT') return <CircleCheckBig aria-hidden="true" size={14} />
  if (verdict === 'PARTIAL') return <TriangleAlert aria-hidden="true" size={14} />
  if (verdict === 'WRONG') return <CircleX aria-hidden="true" size={14} />
  return <CircleHelp aria-hidden="true" size={14} />
}

function QuizFrame({
  children,
  embedded,
  onBackToPdf,
}: {
  children: ReactNode
  embedded: boolean
  onBackToPdf?: () => void
}) {
  if (!embedded) {
    return (
      <PageContainer>
        <PageHeader title="퀴즈" />
        {children}
      </PageContainer>
    )
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
      <div className="flex h-13 shrink-0 items-center gap-3 border-b border-stone-200 px-4">
        <Button
          onClick={onBackToPdf}
          size="sm"
          type="button"
          variant="secondary"
        >
          <ChevronLeft aria-hidden="true" size={15} />
          PDF로 돌아가기
        </Button>
        <h2 className="type-body font-semibold text-stone-950">퀴즈</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 mobile-phone:p-0">
        {children}
      </div>
    </section>
  )
}

function getBackAction(embedded: boolean, onBackToPdf?: () => void) {
  return embedded && onBackToPdf ? (
    <Button onClick={onBackToPdf} type="button" variant="secondary">
      PDF로 돌아가기
    </Button>
  ) : (
    <ButtonLink to={routes.classrooms}>강의실로</ButtonLink>
  )
}

function QuestionInput({
  disabled,
  labelId,
  onChange,
  question,
  value,
}: {
  disabled: boolean
  labelId: string
  onChange: (value: string) => void
  question: PublicQuizQuestion
  value: string
}) {
  if (question.kind === 'MCQ' || question.kind === 'OX') {
    return (
      <fieldset aria-labelledby={labelId} className="mt-4">
        <div className="grid gap-2">
          {question.choices?.map((choice) => (
            <label
              className={[
                'flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 type-body font-medium',
                value === choice.id
                  ? 'border-brand-600 bg-brand-50 text-brand-900'
                  : 'border-stone-200 text-stone-700 hover:bg-stone-50',
              ].join(' ')}
              key={choice.id}
            >
              <input
                aria-label={choice.label}
                checked={value === choice.id}
                disabled={disabled}
                name={question.id}
                onChange={() => onChange(choice.id)}
                type="radio"
                value={choice.id}
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>
    )
  }

  if (question.kind === 'SHORT') {
    return (
      <label aria-labelledby={labelId} className="mt-4 block">
        <input
          className="min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 type-body focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          value={value}
        />
      </label>
    )
  }

  return (
    <label aria-labelledby={labelId} className="mt-4 block">
      <textarea
        className="min-h-36 w-full rounded-lg border border-stone-300 px-3 py-2 type-body focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}
