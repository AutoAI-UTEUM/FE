import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import {
  createSessionsRepository,
  type LearningSession,
  type SessionQuizSummary,
} from '../../../features/sessions'
import { getRequestErrorMessage } from '../../../shared/api'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import {
  Button,
  EmptyState,
  PageContainer,
  PageHeader,
} from '../../../shared/ui'
import { quizDetailPath } from '../../routes'

interface ReviewQuizItem {
  quiz: SessionQuizSummary
  session: LearningSession
}

const quizDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  day: 'numeric',
  month: 'numeric',
})

export function LearnerReviewQuizzesPage() {
  usePageTitle('복습 퀴즈')
  const { user } = useAuth()
  return <ReviewQuizCollection key={`${user?.id ?? user?.email ?? 'anonymous'}:${user?.role ?? ''}`} />
}

type QuizBatch = { quizzes: SessionQuizSummary[]; session: LearningSession }
type Repository = ReturnType<typeof createSessionsRepository>
interface CollectionResult {
  repository: Repository
  attempt: number
  batches: QuizBatch[]
  failed: LearningSession[]
  error: string | null
}

function ReviewQuizCollection() {
  const { apiRequest } = useAuth()
  const repository = useMemo(() => createSessionsRepository(apiRequest), [apiRequest])
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<CollectionResult | null>(null)
  const cache = useRef<CollectionResult | null>(null)
  const current = result?.repository === repository ? result : null
  const items = flattenAndSortQuizzes(current?.batches ?? [])
  const failed = current?.failed ?? []
  const error = current?.error ?? null
  const isLoading = current?.attempt !== attempt

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    async function load() {
      const previous = cache.current?.repository === repository ? cache.current : null
      const retryFailed = previous && previous.failed.length > 0
      try {
        const sessions = retryFailed
          ? previous.failed
          : (await repository.list(signal)).filter((session) => session.status !== 'DELETED')
        const batches: QuizBatch[] = retryFailed ? [...previous.batches] : []
        const failed: LearningSession[] = []
        let next = 0
        async function worker() {
          while (!signal.aborted && next < sessions.length) {
            const session = sessions[next++]
            try {
              const quizzes = await repository.listQuizzes(session.id, signal)
              if (!signal.aborted) batches.push({ quizzes, session })
            } catch {
              if (!signal.aborted) failed.push(session)
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(4, sessions.length) }, worker))
        if (signal.aborted) return
        const updated = { repository, attempt, batches, failed, error: null }
        cache.current = updated
        setResult(updated)
      } catch (requestError) {
        if (signal.aborted) return
        const updated = { repository, attempt, batches: [], failed: [], error: getRequestErrorMessage(requestError) }
        cache.current = updated
        setResult(updated)
      }
    }
    void load()
    return () => controller.abort()
  }, [repository, attempt])

  function retry() {
    if (!isLoading) setAttempt((value) => value + 1)
  }

  return (
    <PageContainer>
      <PageHeader title="복습 퀴즈" />

      {isLoading ? (
        <p className="py-16 text-center type-body text-stone-500" role="status">
          복습 퀴즈를 불러오는 중입니다.
        </p>
      ) : null}
      {error ? (
        <EmptyState
          action={<Button disabled={isLoading} onClick={retry}>다시 시도</Button>}
          description={error}
          title="복습 퀴즈를 불러오지 못했습니다"
        />
      ) : null}
      {failed.length > 0 ? (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 type-body text-amber-900">
          <p>{current?.batches.length
            ? `일부 복습 퀴즈를 불러오지 못했습니다. 학습 세션 ${failed.length}개의 퀴즈를 다시 불러와 주세요.`
            : '복습 퀴즈를 불러오지 못했습니다. 다시 시도해 주세요.'}</p>
          <Button disabled={isLoading} onClick={retry} variant="secondary">
            {isLoading ? '다시 불러오는 중' : '다시 시도'}
          </Button>
        </div>
      ) : null}
      {!isLoading && !error && failed.length === 0 && items.length === 0 ? (
        <EmptyState
          description="학습 중 만든 퀴즈가 이곳에 모입니다."
          title="저장된 복습 퀴즈가 없습니다"
        />
      ) : null}

      {!error && items.length > 0 ? (
        <section aria-label="복습 퀴즈 목록" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map(({ quiz, session }) => (
            <Link
              aria-label={`${quiz.title} ${quiz.submitted ? '결과 보기' : '풀기'}`}
              className="flex min-h-32 flex-col rounded-3xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              key={`${session.id}-${quiz.quizId}`}
              to={quizDetailPath(quiz.quizId)}
            >
              <div className="flex items-center justify-between gap-3 type-caption">
                <span className={`flex min-w-0 items-center gap-2 ${getQuizStatusTextClass(quiz)}`}>
                  <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${getQuizStatusDotClass(quiz)}`} />
                  {getQuizStatus(quiz)}
                </span>
                <strong className={`shrink-0 font-medium ${getQuizStatusTextClass(quiz)}`}>
                  {quiz.submitted && quiz.score !== undefined
                    ? `${quiz.score}/${quiz.maxScore ?? quiz.score}`
                    : `-/${quiz.maxScore ?? '-'}`}
                </strong>
              </div>
              <h2 className="mt-3 line-clamp-2 type-body font-bold text-stone-950">
                {quiz.title}
              </h2>
              <p className="mt-auto pt-3 type-caption text-stone-500">
                {quiz.createdAt ? formatQuizDate(quiz.createdAt) : '생성 날짜 없음'}
              </p>
            </Link>
          ))}
        </section>
      ) : null}
    </PageContainer>
  )
}

function flattenAndSortQuizzes(
  values: Array<{ quizzes: SessionQuizSummary[]; session: LearningSession }>,
): ReviewQuizItem[] {
  return values
    .flatMap(({ quizzes, session }) =>
      quizzes.map((quiz) => ({ quiz, session })),
    )
    .sort((left, right) =>
      (right.quiz.createdAt ?? '').localeCompare(left.quiz.createdAt ?? ''),
    )
}

function getQuizStatus(quiz: SessionQuizSummary): string {
  if (!quiz.submitted) return '미완료'
  return quiz.passed ? '완료' : '복습 필요'
}

function getQuizStatusTextClass(quiz: SessionQuizSummary): string {
  if (!quiz.submitted) return 'text-cyan-800'
  return quiz.passed ? 'text-emerald-700' : 'text-rose-600'
}

function getQuizStatusDotClass(quiz: SessionQuizSummary): string {
  if (!quiz.submitted) return 'bg-cyan-600'
  return quiz.passed ? 'bg-emerald-500' : 'bg-rose-500'
}

function formatQuizDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : quizDateFormatter.format(date)
}
