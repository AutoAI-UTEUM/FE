import { ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuth } from '../../features/auth'
import { getRequestErrorMessage } from '../../shared/api'
import {
  createDiagnosisRepository,
  validateDiagnosisAnswer,
  type CorrectionMessage,
  type PendingDiagnosis,
} from '../../features/diagnosis'
import { createSessionsRepository } from '../../features/sessions'
import type { QuizKind } from '../../features/quiz'
import {
  Badge,
  Button,
  ButtonLink,
  ErrorState,
  LoadingState,
  MarkdownContent,
  PageContainer,
  PageHeader,
} from '../../shared/ui'
import { sessionDetailPath } from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'

const QUIZ_TYPE_OPTIONS: Array<{ kind: QuizKind; label: string }> = [
  { kind: 'MCQ', label: '객관식' },
  { kind: 'OX', label: 'OX' },
  { kind: 'SHORT', label: '단답형' },
  { kind: 'ESSAY', label: '서술형' },
]

export function DiagnosisPage() {
  usePageTitle('진단·교정')
  const { diagnosisId, sessionId } = useParams()
  const navigate = useNavigate()
  const { apiRequest } = useAuth()
  const sessionsRepository = useMemo(
    () => createSessionsRepository(apiRequest),
    [apiRequest],
  )
  const repository = useMemo(
    () => createDiagnosisRepository(sessionsRepository),
    [sessionsRepository],
  )
  const [pendingDiagnosis, setPendingDiagnosis] = useState<
    PendingDiagnosis | null | undefined
  >()
  const [answer, setAnswer] = useState('')
  const [correction, setCorrection] = useState<CorrectionMessage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isStartingRetest, setIsStartingRetest] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!diagnosisId || !sessionId) return

    const controller = new AbortController()
    repository
      .restore(diagnosisId, sessionId, controller.signal)
      .then((diagnosis) => {
        setPendingDiagnosis(diagnosis)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setPendingDiagnosis(null)
          setError(getRequestErrorMessage(requestError))
        }
      })

    return () => controller.abort()
  }, [diagnosisId, reloadKey, repository, sessionId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validateDiagnosisAnswer(answer)
    setError(validationError)
    if (validationError) return
    if (!pendingDiagnosis || isSubmitting) return

    setIsSubmitting(true)
    try {
      const nextCorrection = await repository.submitAnswer(
        pendingDiagnosis,
        answer,
      )
      setCorrection(nextCorrection)
      setIsSubmitted(true)
      setError(null)
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRetest(kind: QuizKind) {
    if (!sessionId || isStartingRetest) return
    setIsStartingRetest(true)
    setError(null)
    try {
      const result = await sessionsRepository.submitTurn(sessionId, {
        eventType: 'QUIZ_TYPE_SELECTED',
        payload: { quizType: kind },
        requestId: createRequestId(),
      })
      if (!result.activeQuizId) {
        setError('재평가 퀴즈를 생성하지 못했습니다. 다시 시도해 주세요.')
        return
      }
      navigate(sessionDetailPath(sessionId), { replace: true })
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsStartingRetest(false)
    }
  }

  if (!diagnosisId || !sessionId) {
    return (
      <ErrorState
        title="진행 중인 진단을 찾을 수 없습니다."
        description="진단 또는 세션 식별자가 없습니다."
        action={<ButtonLink to="/sessions">세션 목록으로</ButtonLink>}
      />
    )
  }

  if (pendingDiagnosis === undefined) {
    return <LoadingState message="진단 상태를 복원하는 중입니다." />
  }

  if (!pendingDiagnosis) {
    return (
      <ErrorState
        title="진행 중인 진단을 찾을 수 없습니다."
        description={error ?? '학습 세션에서 진단을 다시 시작하세요.'}
        action={
          error ? (
            <Button
              onClick={() => {
                setError(null)
                setPendingDiagnosis(undefined)
                setReloadKey((key) => key + 1)
              }}
              type="button"
            >
              다시 시도
            </Button>
          ) : (
            <ButtonLink to={sessionDetailPath(sessionId ?? '')}>
              학습 세션으로
            </ButtonLink>
          )
        }
      />
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="진단·교정"
      />

      <section className="flex flex-col gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <RotateCcw aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" size={18} />
          <div>
            <h2 className="type-body font-bold text-amber-950">진단 복원</h2>
            <p className="mt-1 type-body leading-6 text-amber-900">
              저득점 결과 {pendingDiagnosis.quizScore}점에서 이어진 진단입니다.
            </p>
            <p className="mt-2 type-body font-semibold text-amber-950">
              {pendingDiagnosis.sourceQuestion}
            </p>
          </div>
        </div>
        <Badge tone="warning">복원됨</Badge>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <form className="p-4 sm:p-6" onSubmit={handleSubmit}>
          <label className="block">
            <span className="type-dialog-title font-bold text-stone-950">
              {pendingDiagnosis.prompt}
            </span>
            <textarea
              className="mt-4 min-h-40 w-full rounded-lg border border-stone-300 px-3 py-2 type-body focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              disabled={isSubmitted}
              onChange={(event) => {
                setAnswer(event.target.value)
                setError(null)
              }}
              value={answer}
            />
          </label>

          {error ? (
            <p className="mt-3 type-body font-medium text-rose-700" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-5 flex justify-end border-t border-stone-200 pt-4">
            <Button disabled={isSubmitted || isSubmitting} type="submit">
              {isSubmitting ? '제출 중' : isSubmitted ? '제출 완료' : '진단 제출'}
            </Button>
          </div>
        </form>
      </section>

      {isSubmitted && correction ? (
        <section className="overflow-hidden rounded-lg border border-emerald-200 bg-white">
          <div className="flex items-start gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-4 sm:px-5">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 text-emerald-700" size={19} />
            <div>
              <h2 className="type-section-title font-bold text-emerald-950">{correction.title}</h2>
              <MarkdownContent className="mt-1 text-emerald-900" content={correction.summary} />
            </div>
          </div>
          {correction.focusAreas.length > 0 ? (
            <ul className="grid divide-y divide-stone-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {correction.focusAreas.map((focusArea) => (
                <li className="px-4 py-3 type-body font-semibold text-stone-700" key={focusArea}>
                  {focusArea}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="border-t border-stone-200 px-4 py-4 sm:px-5">
            <p className="type-body font-semibold text-stone-900">교정 내용을 확인했습니다. 다시 평가할 퀴즈 유형을 선택하세요.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {QUIZ_TYPE_OPTIONS.map((option) => (
                <Button
                  disabled={isStartingRetest}
                  key={option.kind}
                  onClick={() => void handleRetest(option.kind)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {error ? <p className="mt-3 type-body font-medium text-rose-700" role="alert">{error}</p> : null}
            <p className="mt-4 type-body text-stone-600">{correction.nextQuestionPrompt}</p>
            <ButtonLink
              className="mt-3"
              to={sessionDetailPath(pendingDiagnosis.sessionId)}
              variant="secondary"
            >
              일반 질문으로 이어가기
              <ArrowRight aria-hidden="true" size={15} />
            </ButtonLink>
          </div>
        </section>
      ) : null}
    </PageContainer>
  )
}

function createRequestId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `retest-${Date.now()}`
}
