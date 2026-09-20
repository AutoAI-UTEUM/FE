import { useEffect, useMemo, useState } from 'react'
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
  const { apiRequest } = useAuth()
  const repository = useMemo(
    () => createSessionsRepository(apiRequest),
    [apiRequest],
  )
  const [items, setItems] = useState<ReviewQuizItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  async function load() {
    setIsLoading(true)
    setError(null)
    try {
      const sessions = (await repository.list()).filter(
        (session) => session.status !== 'DELETED',
      )
      const quizzesBySession = await Promise.all(
        sessions.map(async (session) => ({
          quizzes: await repository.listQuizzes(session.id).catch(() => []),
          session,
        })),
      )
      setItems(flattenAndSortQuizzes(quizzesBySession))
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    repository
      .list()
      .then((sessions) =>
        Promise.all(
          sessions
            .filter((session) => session.status !== 'DELETED')
            .map(async (session) => ({
              quizzes: await repository.listQuizzes(session.id).catch(() => []),
              session,
            })),
        ),
      )
      .then((quizzesBySession) => {
        if (!cancelled) setItems(flattenAndSortQuizzes(quizzesBySession))
      })
      .catch((requestError) => {
        if (!cancelled) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repository])

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
          action={<Button onClick={() => void load()}>다시 시도</Button>}
          description={error}
          title="복습 퀴즈를 불러오지 못했습니다"
        />
      ) : null}
      {!isLoading && !error && items.length === 0 ? (
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
              className="flex min-h-32 flex-col rounded-lg border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
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
