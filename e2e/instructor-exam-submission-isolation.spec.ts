import { expect, test } from '@playwright/test'

import { loginAs } from './qa-helpers'

test('isolates the previous learner while the next submission is loading', async ({ page }) => {
  expect(await loginAs(page, 'INSTRUCTOR')).toBe(true)

  const nextSubmissionGate = deferred<void>()
  const scorePatches: string[] = []

  await page.route('**/api/exams/10', async (route) => {
    await route.fulfill(json(exam()))
  })
  await page.route('**/api/exams/10/submissions/300', async (route) => {
    await route.fulfill(json(submission(300, 'answer-a', 9)))
  })
  await page.route('**/api/exams/10/submissions/301', async (route) => {
    await nextSubmissionGate.promise
    await route.fulfill(json(submission(301, 'answer-b', 8)))
  })
  await page.route('**/api/exams/10/submissions?*', async (route) => {
    await route.fulfill(json({
      items: [submissionSummary(300, 8, 'Learner A'), submissionSummary(301, 9, 'Learner B')],
      page: 0,
      size: 100,
      totalElements: 2,
      totalPages: 1,
    }))
  })
  await page.route('**/api/classrooms/30/students?*', async (route) => {
    await route.fulfill(json({
      items: [
        { aiQuestionCountLast7Days: 0, email: 'a@example.com', joinedAt: '2026-08-01T00:00:00Z', name: 'Learner A', status: 'ACTIVE', studentId: 8 },
        { aiQuestionCountLast7Days: 0, email: 'b@example.com', joinedAt: '2026-08-01T00:00:00Z', name: 'Learner B', status: 'ACTIVE', studentId: 9 },
      ],
      page: 0,
      size: 100,
      totalElements: 2,
      totalPages: 1,
    }))
  })
  await page.route('**/api/exams/10/submissions/*/answers/*/score', async (route) => {
    scorePatches.push(new URL(route.request().url()).pathname)
    await route.fulfill(json(submission(301, 'answer-b', 8)))
  })

  await page.goto('/classrooms/30/exams/10/submissions/300')
  await expect(page.getByText('answer-a', { exact: true })).toBeVisible()
  await page.getByRole('spinbutton').fill('7')

  await page.locator('a[href$="/submissions/301"]').click()

  await expect(page).toHaveURL(/\/submissions\/301$/)
  await expect(page.getByText('answer-a', { exact: true })).toBeHidden()
  await expect(page.getByRole('spinbutton')).toHaveCount(0)
  expect(scorePatches).toEqual([])

  nextSubmissionGate.resolve()
  await expect(page.getByText('answer-b', { exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton')).toHaveValue('8')
  expect(scorePatches).toEqual([])
})

function exam() {
  return {
    allowRetake: false,
    classroomId: 30,
    examId: 10,
    questionCount: 1,
    questions: [{ maxScore: 10, questionId: 'q1', questionText: 'Question 1', questionType: 'SHORT' }],
    status: 'PUBLISHED',
    title: 'State isolation exam',
    totalScore: 10,
  }
}

function submission(submissionId: number, answer: string, score: number) {
  return {
    attemptNo: 1,
    gradedAt: '2026-09-09T01:02:00Z',
    items: [{ answer, maxScore: 10, questionId: 'q1', score, verdict: 'CORRECT' }],
    maxScore: 10,
    normalizedScore: score * 10,
    score,
    status: 'GRADED',
    submissionId,
    submittedAt: '2026-09-09T01:01:12Z',
  }
}

function submissionSummary(submissionId: number, userId: number, userName: string) {
  return {
    attemptCount: 1,
    attemptNo: 1,
    gradedAt: '2026-09-09T01:02:00Z',
    maxScore: 10,
    normalizedScore: 90,
    score: 9,
    status: 'GRADED',
    submissionId,
    submittedAt: '2026-09-09T01:01:12Z',
    userId,
    userName,
  }
}

function json(data: unknown) {
  return {
    body: JSON.stringify({ data, message: 'ok', success: true }),
    contentType: 'application/json',
    status: 200,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}
