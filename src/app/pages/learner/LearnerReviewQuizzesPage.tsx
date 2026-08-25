import { ArrowRight, CheckCircle2, ClipboardCheck, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../../features/auth'
import {
  createSessionsRepository,
  type LearningSession,
  type SessionQuizSummary,
} from '../../../features/sessions'
import { getRequestErrorMessage } from '../../../shared/api'
import { formatDateTime } from '../../../shared/lib/format'
import { usePageTitle } from '../../../shared/lib/usePageTitle'
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  PageContainer,
  PageHeader,
} from '../../../shared/ui'
import { quizDetailPath } from '../../routes'

interface ReviewQuizItem {
  quiz: SessionQuizSummary
  session: LearningSession
}

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

  const reviewTarget = items.find(
    ({ quiz }) => quiz.submitted && quiz.passed === false,
  )

  return (
    <PageContainer>
      <PageHeader
        title="복습 퀴즈"
        titleAccessory={
          <p className="type-caption text-stone-400">AI 채팅에서 만든 퀴즈 {items.length}세트</p>
        }
      />

      {reviewTarget ? (
        <section className="flex flex-col gap-4 rounded-lg border border-rose-100 bg-rose-50/60 px-5 py-4 sm:flex-row sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-rose-600">
            <RotateCcw aria-hidden="true" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="type-body font-bold text-stone-950">오늘 다시 풀어볼 퀴즈</h2>
            <p className="mt-1 truncate type-caption text-stone-500">
              {reviewTarget.session.materialTitle} · {reviewTarget.quiz.title}
            </p>
          </div>
          <ButtonLink to={quizDetailPath(reviewTarget.quiz.quizId)}>
            다시 풀기
            <ArrowRight aria-hidden="true" size={14} />
          </ButtonLink>
        </section>
      ) : null}

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
            <article
              className="flex min-h-48 flex-col rounded-lg border border-stone-200 bg-white p-5"
              key={`${session.id}-${quiz.quizId}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <ClipboardCheck aria-hidden="true" size={16} />
                </span>
                <Badge tone={getQuizTone(quiz)}>{getQuizStatus(quiz)}</Badge>
              </div>
              <h2 className="mt-4 line-clamp-2 type-body font-bold text-stone-950">
                {quiz.title}
              </h2>
              <p className="mt-1 truncate type-caption text-stone-400">
                {session.materialTitle}
                {quiz.createdAt ? ` · ${formatDateTime(quiz.createdAt)}` : ''}
              </p>
              {quiz.submitted && quiz.score !== undefined ? (
                <p className="mt-3 flex items-center gap-1.5 type-caption font-semibold text-stone-600">
                  <CheckCircle2 aria-hidden="true" size={13} />
                  {quiz.score}/{quiz.maxScore ?? quiz.score}점
                </p>
              ) : null}
              <ButtonLink
                className="mt-auto"
                size="sm"
                to={quizDetailPath(quiz.quizId)}
                variant="secondary"
              >
                {quiz.submitted ? '결과 보기' : '풀기'}
                <ArrowRight aria-hidden="true" size={13} />
              </ButtonLink>
            </article>
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

function getQuizTone(
  quiz: SessionQuizSummary,
): 'danger' | 'info' | 'success' {
  if (!quiz.submitted) return 'info'
  return quiz.passed ? 'success' : 'danger'
}
