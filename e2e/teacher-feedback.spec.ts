import { expect, test } from '@playwright/test'

import { loginAs } from './qa-helpers'

test('restores a quiz answer and pen strokes after reload without submitting', async ({ page }, testInfo) => {
  let submissions = 0
  page.on('request', (request) => { if (request.url().endsWith('/quizzes/50/submit')) submissions += 1 })
  await loginAs(page, 'LEARNER')
  await page.goto('/quizzes/50')
  await page.locator('label').filter({ hasText: '개념의 정의를 먼저 확인한다.' }).click()
  await expect(page.getByText('이 브라우저에 임시저장했습니다. 아직 제출되지 않았습니다.')).toBeVisible()
  await page.getByText('펜 · 메모', { exact: true }).click()
  await page.getByLabel('글자 메모').fill('문제를 나누어 생각하기')
  const pen = page.getByLabel('펜으로 쓰는 풀이 노트')
  const bounds = await pen.boundingBox()
  if (!bounds) throw new Error('Pen note not visible')
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.3)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.6, { steps: 6 })
  await page.mouse.up()
  await expect(pen.locator('polyline')).toHaveCount(1)
  await page.reload()
  await page.getByRole('button', { name: '저장한 답안 불러오기' }).click()
  await expect(page.getByLabel('개념의 정의를 먼저 확인한다.', { exact: true })).toBeChecked()
  await page.getByText('펜 · 메모', { exact: true }).click()
  await expect(page.getByLabel('글자 메모')).toHaveValue('문제를 나누어 생각하기')
  await expect(page.getByLabel('펜으로 쓰는 풀이 노트').locator('polyline')).toHaveCount(1)
  await page.getByRole('button', { name: '한 획 되돌리기' }).click()
  await expect(page.getByLabel('펜으로 쓰는 풀이 노트').locator('polyline')).toHaveCount(0)
  expect(submissions).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('quiz-draft-and-notes.png'), fullPage: true })
  await page.getByRole('link', { name: '강의실 메인으로' }).click()
  await expect(page).toHaveURL(/\/classrooms$/)
})

test('shows server progress and resumes a published past week with session notes', async ({ page }, testInfo) => {
  await loginAs(page, 'LEARNER')
  await page.route('**/api/classrooms/12', async (route) => {
    const response = await route.fetch()
    const envelope = await response.json()
    envelope.data.progressRate = 38
    envelope.data.lastStudied = { sessionId: 100, materialId: 10, materialTitle: '시험 대비 요약', pageNumber: 1, updatedAt: '2026-11-01T00:00:00Z' }
    await route.fulfill({ json: envelope })
  })
  await page.route('**/api/classrooms/12/weeks', (route) => route.fulfill({ json: {
    success: true, message: 'Synthetic published past week', data: { items: [{ weekId: 91, weekNumber: 1, title: '지난 주차', status: 'PUBLISHED', displayOrder: 1, materials: [{ materialId: 10, pageCount: 5, processingStatus: 'READY', title: '시험 대비 요약', uploadedAt: '2026-07-22T00:00:00Z' }] }] },
  } }))
  await page.goto('/classrooms/12?week=1')
  await expect(page.getByRole('progressbar', { name: '강의실 학습률' })).toHaveAttribute('aria-valuenow', '38')
  await expect(page.getByRole('link', { name: '하던 학습 계속하기' })).toHaveAttribute('href', '/sessions/100')
  await page.screenshot({ path: testInfo.outputPath('classroom-progress.png'), fullPage: true })
  await page.getByRole('link', { name: '하던 학습 계속하기' }).click()
  await expect(page).toHaveURL(/\/sessions\/100$/)
  await page.getByText('펜 · 메모', { exact: true }).click()
  await page.getByLabel('글자 메모').fill('수업을 들으며 적은 메모')
  await page.reload()
  await page.getByText('펜 · 메모', { exact: true }).click()
  await expect(page.getByLabel('글자 메모')).toHaveValue('수업을 들으며 적은 메모')
  await page.screenshot({ path: testInfo.outputPath('session-notes.png'), fullPage: true })
  await page.getByRole('link', { name: '강의실 메인으로' }).click()
  await expect(page).toHaveURL(/\/classrooms/)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(2)
})

test('a PDF dropped on all content opens a reviewable upload dialog', async ({ page }) => {
  await loginAs(page, 'INSTRUCTOR')
  await page.goto('/classrooms/12')
  const hint = page.getByText('PDF 파일을 이 영역으로 끌어 놓거나 수업 생성을 선택하세요. 업로드 전에 주차와 제목을 확인할 수 있습니다.')
  await expect(hint).toBeVisible()
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer()
    data.items.add(new File(['%PDF-1.4 synthetic'], 'teacher-lesson.pdf', { type: 'application/pdf' }))
    return data
  })
  await hint.dispatchEvent('drop', { dataTransfer: transfer })
  const dialog = page.getByRole('dialog', { name: '수업 생성' })
  await expect(dialog.getByText('teacher-lesson.pdf')).toBeVisible()
  await expect(dialog.getByLabel('수업 제목')).toHaveValue('teacher-lesson.pdf')
  await dialog.getByRole('button', { name: '취소', exact: true }).click()
  await expect(dialog).toBeHidden()
})
