import { expect, test, type Page } from '@playwright/test'

import { loginAs, qaEnvironment } from './qa-helpers'

test.beforeEach(() => { expect(qaEnvironment, 'synthetic APIs only').toBe('mock') })

test('loads, edits, reloads and clears the instructor reason without mobile overflow', async ({ page }, testInfo) => {
  const api = await setup(page)
  await page.goto('/classrooms/30/exams/10/submissions/300')
  const reason = page.getByLabel('1번 점수 변경 사유 (선택)')
  await expect(reason).toHaveValue('기존 검토 사유')
  await page.getByLabel('1번 점수', { exact: true }).fill('8.25')
  await reason.fill('R'.repeat(500))
  await page.getByRole('button', { name: '점수 저장', exact: true }).click()
  const savedReason = page.locator('article p').filter({ hasText: 'R'.repeat(500) })
  await expect(savedReason).toBeVisible()
  expect(api.patches).toEqual([{ score: 8.25, reason: 'R'.repeat(500) }])
  await expect(reason).toHaveAttribute('maxlength', '500')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(2)
  await page.screenshot({ path: testInfo.outputPath('manual-reason.png'), fullPage: true })

  await page.emulateMedia({ media: 'print' })
  await expect(savedReason).toHaveCount(1)
  await expect(savedReason).toBeHidden()
  await expect(reason).toBeHidden()
  await expect(page.getByLabel('1번 점수', { exact: true })).toBeHidden()
  await expect(page.getByText('합성 답안', { exact: true })).toBeVisible()
  await page.emulateMedia({ media: 'screen' })

  await page.reload()
  await expect(reason).toHaveValue('R'.repeat(500))
  await expect(page.getByLabel('1번 점수', { exact: true })).toHaveValue('8.25')
  await reason.fill('')
  await page.getByRole('button', { name: '점수 저장', exact: true }).click()
  await expect(page.getByText('저장된 점수 변경 사유')).toHaveCount(0)
  expect(api.patches.at(-1)).toEqual({ score: 8.25, reason: '' })
})

test('retains both drafts after a rejected save and submits only on explicit retry', async ({ page }) => {
  const api = await setup(page, { failFirst: true })
  await page.goto('/classrooms/30/exams/10/submissions/300')
  await page.getByLabel('1번 점수', { exact: true }).fill('8')
  await page.getByLabel('1번 점수 변경 사유 (선택)').fill('새로운 합성 검토')
  const save = page.getByRole('button', { name: '점수 저장', exact: true })
  await save.click()
  await expect(page.getByRole('alert')).toContainText('합성 저장 실패')
  await expect(page.getByLabel('1번 점수 변경 사유 (선택)')).toHaveValue('새로운 합성 검토')
  await expect(page.getByText('기존 검토 사유', { exact: true })).toBeVisible()
  expect(api.patches).toHaveLength(1)
  await save.click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('paragraph').filter({ hasText: '새로운 합성 검토' })).toBeVisible()
  expect(api.patches).toEqual([{ score: 8, reason: '새로운 합성 검토' }, { score: 8, reason: '새로운 합성 검토' }])
})

test('keeps an unsaved reason scoped to its learner during next/back navigation', async ({ page }) => {
  const api = await setup(page)
  await page.goto('/classrooms/30/exams/10/submissions/300')
  await page.getByLabel('1번 점수 변경 사유 (선택)').fill('미저장 A 사유')
  await page.locator('a[href$="/submissions/301"]').click()
  await expect(page.getByLabel('1번 점수 변경 사유 (선택)')).toHaveValue('B 검토 사유')
  await expect(page.getByText('기존 검토 사유', { exact: true })).toHaveCount(0)
  await page.goBack()
  await expect(page.getByLabel('1번 점수 변경 사유 (선택)')).toHaveValue('기존 검토 사유')
  expect(api.patches).toEqual([])
})

async function setup(page: Page, { failFirst = false } = {}) {
  // Block external hosts, including optional third-party scripts. Every API
  // request below goes to the local synthetic Vite fixture server.
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') await route.abort()
    else await route.fallback()
  })
  expect(await loginAs(page, 'INSTRUCTOR')).toBe(true)
  const patches: Array<{ score: number; reason: string }> = []
  let score = 9
  let reason: string | null = '기존 검토 사유'
  await page.route('**/api/exams/10', async route => route.fulfill(json({ examId: 10, classroomId: 30, title: '합성 점수 검토', status: 'PUBLISHED', totalScore: 10, questionCount: 1, questions: [{ questionId: 'q1', questionText: '합성 문항', questionType: 'SHORT', maxScore: 10 }] })))
  await page.route('**/api/exams/10/submissions/300', async route => route.fulfill(json(submission(300, score, reason))))
  await page.route('**/api/exams/10/submissions/301', async route => route.fulfill(json(submission(301, 7, 'B 검토 사유'))))
  await page.route('**/api/exams/10/submissions?*', async route => route.fulfill(json({ items: [summary(300, 8, '합성 A'), summary(301, 9, '합성 B')], page: 0, size: 100, totalElements: 2, totalPages: 1 })))
  await page.route('**/api/classrooms/30/students?*', async route => route.fulfill(json({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 })))
  await page.route('**/api/exams/10/submissions/300/answers/q1/score', async route => {
    const body = route.request().postDataJSON() as { score: number; reason: string }
    patches.push(body)
    if (failFirst && patches.length === 1) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'VALIDATION_FAILED', message: '합성 저장 실패', details: [] } }) })
    score = body.score
    reason = body.reason || null
    return route.fulfill(json(submission(300, score, reason)))
  })
  return { patches }
}
function submission(submissionId: number, score: number, manualScoreReason: string | null) { return { submissionId, attemptNo: 1, status: 'GRADED', submittedAt: '2026-10-13T10:00:00Z', score, maxScore: 10, items: [{ questionId: 'q1', answer: '합성 답안', maxScore: 10, score, manualScore: score, manualScoreReason }] } }
function summary(submissionId: number, userId: number, userName: string) { return { submissionId, userId, userName, attemptNo: 1, attemptCount: 1, status: 'GRADED', score: 9, maxScore: 10, submittedAt: '2026-10-13T10:00:00Z' } }
function json(data: unknown) { return { status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data }) } }
