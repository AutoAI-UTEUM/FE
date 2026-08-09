import { CircleCheckBig, CircleHelp, CircleX, ChevronLeft, ChevronRight, Send, TriangleAlert } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../../features/auth'
import { getRequestErrorMessage } from '../../shared/api'
import {
  createQuizRepository,
  shouldShowDiagnosisEntry,
  validateQuizAnswer,
  type PublicQuiz,
  type PublicQuizQuestion,
  type PublicQuizResult,
  type QuizAnswers,
  type QuizKind,
} from '../../features/quiz'
import {
  Button,
  ButtonLink,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from '../../shared/ui'
import { diagnosisPath, routes } from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'

const quizKindLabels: Record<QuizKind, string> = {
  ESSAY: '서술형',
  MCQ: '객관식',
  OX: 'OX',
  SHORT: '단답형',
}

export function QuizPage() {
  return <QuizWorkspace />
}

interface QuizWorkspaceProps {
  embedded?: boolean
  onBackToPdf?: () => void
  onSubmitted?: (result: PublicQuizResult) => void
  quizId?: string
}

export function QuizWorkspace({
  embedded = false,
  onBackToPdf,
  onSubmitted,
  quizId: quizIdProp,
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
  const [quiz, setQuiz] = useState<PublicQuiz | null | undefined>()
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<QuizAnswers>({})
  const [error, setError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<PublicQuizResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const questions = quiz?.questions ?? []
  const question = questions[currentQuestionIndex] ?? questions[0]
  const answeredCount = questions.filter((item) => answers[item.id]?.trim()).length
  const availableKinds = Array.from(
    new Set(questions.map((item) => item.kind)),
  )
  const diagnosisEntry = result?.diagnosisEntry

  useEffect(() => {
    if (!quizId) return
    const controller = new AbortController()
    repository
      .getById(quizId, controller.signal)
      .then((nextQuiz) => {
        setQuiz(nextQuiz)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setQuiz(null)
          setError(getRequestErrorMessage(requestError))
        }
      })

    return () => controller.abort()
  }, [quizId, reloadKey, repository])

  function handleKindChange(kind: QuizKind) {
    if (isSubmitted) return
    setCurrentQuestionIndex(
      questions.findIndex((candidate) => candidate.kind === kind),
    )
    setError(null)
  }

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
      setError(null)
      onSubmitted?.(nextResult)
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
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
      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap gap-1.5" role="tablist">
            {availableKinds.map((kind) => (
              <button
                aria-selected={kind === question.kind}
                className={[
                  'min-h-9 rounded-lg border px-3 py-1.5 type-caption font-bold',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  kind === question.kind
                    ? 'border-brand-700 bg-brand-50 text-brand-800'
                    : 'border-stone-200 text-stone-500 hover:bg-stone-50',
                ].join(' ')}
                disabled={isSubmitted}
                key={kind}
                onClick={() => handleKindChange(kind)}
                role="tab"
                type="button"
              >
                {quizKindLabels[kind]}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="type-caption font-semibold text-stone-600">
              문항 {currentQuestionIndex + 1} / {questions.length} · 답변{' '}
              {answeredCount} / {questions.length}
            </p>
            <div
              aria-label={`퀴즈 답변 진행률 ${answeredCount} / ${questions.length}`}
              className="h-1 w-full overflow-hidden rounded-full bg-stone-200 sm:w-48"
              role="progressbar"
            >
              <div
                className="h-full bg-brand-700"
                style={{
                  width: `${(answeredCount / questions.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        <form className="p-4 sm:p-6" onSubmit={handleSubmit}>
          <QuestionInput
            disabled={isSubmitted}
            onChange={(value) => updateAnswer(question.id, value)}
            question={question}
            value={answers[question.id] ?? ''}
          />

          {error ? (
            <p className="mt-4 type-body font-medium text-rose-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button
                disabled={isSubmitted || currentQuestionIndex <= 0}
                onClick={() => {
                  setCurrentQuestionIndex((index) => Math.max(index - 1, 0))
                  setError(null)
                }}
                type="button"
                variant="secondary"
              >
                <ChevronLeft aria-hidden="true" size={15} />
                이전 문항
              </Button>
              <Button
                disabled={
                  isSubmitted ||
                  currentQuestionIndex >= questions.length - 1
                }
                onClick={() => {
                  setCurrentQuestionIndex((index) =>
                    Math.min(index + 1, questions.length - 1),
                  )
                  setError(null)
                }}
                type="button"
                variant="secondary"
              >
                다음 문항
                <ChevronRight aria-hidden="true" size={15} />
              </Button>
            </div>
            <Button disabled={isSubmitted || isSubmitting} type="submit">
              <Send aria-hidden="true" size={15} />
              {isSubmitting ? '제출 중' : isSubmitted ? '제출 완료' : '제출'}
            </Button>
          </div>
        </form>
      </section>

      {isSubmitted && result ? (
        <section className={`overflow-hidden rounded-lg border bg-white ${getResultTone(result.passed).border}`}>
          <div className={`flex flex-col gap-4 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${getResultTone(result.passed).header}`}>
            <div className="flex items-center gap-3">
              <ResultIcon passed={result.passed} />
              <div>
                <h2 className={`type-section-title font-bold ${getResultTone(result.passed).title}`}>결과</h2>
                <p className={`mt-1 type-body ${getResultTone(result.passed).text}`}>
                  점수 {result.score}{result.maxScore === undefined ? '' : ` / ${result.maxScore}`}
                  {result.passed === undefined ? '' : result.passed ? ' · 통과' : ' · 보완 필요'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {shouldShowDiagnosisEntry(result) && diagnosisEntry ? (
                embedded ? (
                  <Button
                    onClick={() => navigate(diagnosisPath(
                      diagnosisEntry.sessionId,
                      diagnosisEntry.diagnosisId,
                    ))}
                    type="button"
                    variant="secondary"
                  >
                    진단으로 이어가기
                  </Button>
                ) : (
                  <ButtonLink
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
              {embedded && onBackToPdf ? (
                <Button onClick={onBackToPdf} type="button" variant="secondary">
                  PDF로 돌아가기
                </Button>
              ) : (
                <ButtonLink to={routes.sessions} variant="secondary">
                  세션으로 돌아가기
                </ButtonLink>
              )}
            </div>
          </div>

          <ul className="divide-y divide-stone-200" aria-label="문항별 채점 결과">
            {questions.map((item, index) => {
              const feedback = result.feedback.find((candidate) => candidate.questionId === item.id)
              const verdict = feedback?.verdict ?? 'UNKNOWN'
              const tone = getVerdictTone(verdict)
              return (
                <li className="px-4 py-4 sm:px-5" key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="type-caption font-semibold text-stone-500">문항 {index + 1}</p>
                      <h3 className="mt-1 type-body font-bold text-stone-950">{item.prompt}</h3>
                    </div>
                    <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 type-caption font-bold ${tone.badge}`}>
                      <VerdictIcon verdict={verdict} />{tone.label}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-2 rounded-lg bg-stone-50 px-3 py-2.5 type-control sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <dt className="inline font-semibold text-stone-500">내 답안 </dt>
                      <dd className="inline break-words text-stone-900">{formatSubmittedAnswer(item, answers[item.id])}</dd>
                    </div>
                    <div>
                      <dt className="inline font-semibold text-stone-500">점수 </dt>
                      <dd className="inline font-bold text-stone-900">{formatItemScore(feedback?.score, feedback?.maxScore)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 type-body leading-6 text-stone-700">{feedback?.message ?? '문항별 피드백이 제공되지 않았습니다.'}</p>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </QuizFrame>
  )
}

function formatSubmittedAnswer(question: PublicQuizQuestion, answer: string | undefined): string {
  if (!answer) return '제출한 답안 없음'
  return question.choices?.find((choice) => choice.id === answer)?.label ?? answer
}

function formatItemScore(score: number | undefined, maxScore: number | undefined): string {
  if (score === undefined) return '정보 없음'
  return maxScore === undefined ? `${score}점` : `${score} / ${maxScore}`
}

function getVerdictTone(verdict: PublicQuizResult['feedback'][number]['verdict']) {
  if (verdict === 'CORRECT') return { badge: 'bg-emerald-50 text-emerald-800', label: '정답' }
  if (verdict === 'PARTIAL') return { badge: 'bg-amber-50 text-amber-800', label: '부분 정답' }
  if (verdict === 'WRONG') return { badge: 'bg-rose-50 text-rose-800', label: '오답' }
  return { badge: 'bg-stone-100 text-stone-700', label: '채점 완료' }
}

function VerdictIcon({ verdict }: { verdict: PublicQuizResult['feedback'][number]['verdict'] }) {
  if (verdict === 'CORRECT') return <CircleCheckBig aria-hidden="true" size={14} />
  if (verdict === 'PARTIAL') return <TriangleAlert aria-hidden="true" size={14} />
  if (verdict === 'WRONG') return <CircleX aria-hidden="true" size={14} />
  return <CircleHelp aria-hidden="true" size={14} />
}

function getResultTone(passed: boolean | undefined) {
  if (passed === true) return {
    border: 'border-emerald-200',
    header: 'border-emerald-200 bg-emerald-50',
    icon: 'text-emerald-700',
    text: 'text-emerald-900',
    title: 'text-emerald-950',
  }
  if (passed === false) return {
    border: 'border-amber-200',
    header: 'border-amber-200 bg-amber-50',
    icon: 'text-amber-700',
    text: 'text-amber-900',
    title: 'text-amber-950',
  }
  return {
    border: 'border-stone-200',
    header: 'border-stone-200 bg-stone-50',
    icon: 'text-stone-600',
    text: 'text-stone-700',
    title: 'text-stone-950',
  }
}

function ResultIcon({ passed }: { passed: boolean | undefined }) {
  const className = getResultTone(passed).icon
  return passed === false
    ? <TriangleAlert aria-hidden="true" className={className} size={20} />
    : <CircleCheckBig aria-hidden="true" className={className} size={20} />
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
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
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
    <ButtonLink to={routes.sessions}>세션 목록으로</ButtonLink>
  )
}

function QuestionInput({
  disabled,
  onChange,
  question,
  value,
}: {
  disabled: boolean
  onChange: (value: string) => void
  question: PublicQuizQuestion
  value: string
}) {
  if (question.kind === 'MCQ' || question.kind === 'OX') {
    return (
      <fieldset className="space-y-4">
        <legend className="type-dialog-title font-bold text-stone-950">{question.prompt}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
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
      <label className="block">
        <span className="type-dialog-title font-bold text-stone-950">{question.prompt}</span>
        <input
          className="mt-4 min-h-10 w-full rounded-lg border border-stone-300 px-3 py-2 type-body focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          disabled={disabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          value={value}
        />
      </label>
    )
  }

  return (
    <label className="block">
      <span className="type-dialog-title font-bold text-stone-950">{question.prompt}</span>
      <textarea
        className="mt-4 min-h-36 w-full rounded-lg border border-stone-300 px-3 py-2 type-body focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        value={value}
      />
    </label>
  )
}
