import { mkdirSync, writeFileSync } from 'node:fs'

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

import { loginAs, qaEnvironment, waitForAppSettled } from './qa-helpers'

const mixedContent = [
  '## 혼합 콘텐츠 검증',
  '',
  '인라인 수식 $E = mc^2$ 와 블록 수식:',
  '',
  '$$\\int_0^1 x^2 dx = \\frac{1}{3}$$',
  '',
  '| 항목 | 값 |',
  '| --- | --- |',
  '| 표 셀 | 정상 표시 |',
  '',
  '```ts',
  'const verified = true',
  '```',
  '',
  `[긴 URL](https://example.invalid/${'very-long-segment-'.repeat(18)})`,
  '',
  `긴한글문자열${'가나다라마바사아자차카타파하'.repeat(18)}`,
].join('\n')

test.describe('UI-04/05 independent acceptance', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(qaEnvironment !== 'mock', 'synthetic content and failure injection run against mock only')
    test.skip(
      !new Set(['chromium-1440', 'phone-360', 'phone-390', 'tablet-768-portrait', 'tablet-800-landscape', 'tablet-820-landscape', 'webkit-1440']).has(testInfo.project.name),
      'representative desktop, phone, tablet, and alternate-engine projects only',
    )
  })

  test('PDF and mixed learning content remain operable by keyboard without page overflow', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await loginAs(page, 'LEARNER')
    await page.route('**/api/sessions/100/messages**', (route) => route.fulfill({
      body: JSON.stringify({
        data: {
          hasMore: false,
          items: [{
            content: mixedContent,
            createdAt: '2026-10-03T04:00:00Z',
            messageId: 9001,
            messageType: 'EXPLANATION',
            pageNumber: 1,
            senderType: 'AI',
            status: 'COMPLETED',
          }],
          nextCursor: null,
        },
        message: 'ok',
        success: true,
      }),
      contentType: 'application/json',
      status: 200,
    }))

    await page.goto('/sessions/100')
    await waitForAppSettled(page)
    await expect(page.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 30_000 })

    if (testInfo.project.name.startsWith('phone-')) {
      const workspaceTabs = page.getByRole('tablist', { name: '작업 화면' })
      const learningTab = workspaceTabs.getByRole('tab', { name: '학습', exact: true })
      await tabTo(page, learningTab)
      await page.keyboard.press('Enter')
      await expect(learningTab).toHaveAttribute('aria-selected', 'true')
    }

    const learningPanel = page.getByRole('region', { name: 'AI 학습 패널' })
    const chatTab = learningPanel.getByRole('tab', { name: '학습', exact: true })
    await tabTo(page, chatTab)
    await page.keyboard.press('Enter')

    await expect(learningPanel.getByRole('heading', { name: '혼합 콘텐츠 검증' })).toBeVisible()
    await expect(learningPanel.locator('.katex')).toHaveCount(2)
    await expect(learningPanel.locator('table')).toBeVisible()
    await expect(learningPanel.locator('pre')).toContainText('const verified = true')
    await expect(learningPanel.getByRole('link', { name: '긴 URL' })).toBeVisible()
    const scan = await new AxeBuilder({ page })
      .include('[aria-label="AI 학습 패널"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
    const serious = scan.violations.filter((violation) => (
      violation.impact === 'critical' || violation.impact === 'serious'
    ))
    if (serious.length > 0) {
      await testInfo.attach('learning-panel-accessibility-violations.json', {
        body: Buffer.from(JSON.stringify(serious, null, 2)),
        contentType: 'application/json',
      })
    }
    expect.soft(serious, 'learning panel serious or critical axe violations').toEqual([])

    const question = learningPanel.locator('#chat-question')
    await tabTo(page, question)
    const focusStyle = await question.locator('xpath=..').evaluate((element) => {
      const style = window.getComputedStyle(element)
      return { borderColor: style.borderColor, boxShadow: style.boxShadow }
    })
    expect(focusStyle.boxShadow, 'question field needs a visible focus-within ring').not.toBe('none')
    await page.keyboard.insertText('키보드 질문 표본')
    await page.keyboard.press('Enter')
    await expect(question).toHaveValue('')
    await expect(question).toBeFocused()

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }))
    expect(Math.max(layout.bodyWidth, layout.documentWidth) - layout.viewportWidth).toBeLessThanOrEqual(2)
    await testInfo.attach('mixed-content-layout.json', {
      body: Buffer.from(JSON.stringify(layout, null, 2)),
      contentType: 'application/json',
    })
    await testInfo.attach('mixed-content.png', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    })
  })

  test('quiz can be answered and submitted with keyboard controls', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-1440', 'keyboard completion is sampled on desktop Chromium')
    let submitRequests = 0
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/quizzes/50/submit') {
        submitRequests += 1
      }
    })
    await loginAs(page, 'LEARNER')
    await page.goto('/quizzes/50')
    await waitForAppSettled(page)

    const firstChoice = page.locator('input[type="radio"]').first()
    await tabTo(page, firstChoice)
    await page.keyboard.press('Space')
    await expect(firstChoice).toBeChecked()

    const nextQuestion = page.getByRole('button', { name: '다음 문항' })
    await tabTo(page, nextQuestion)
    await page.keyboard.press('Enter')
    const secondChoice = page.locator('input[type="radio"]').first()
    await tabTo(page, secondChoice)
    await page.keyboard.press('Space')
    await expect(secondChoice).toBeChecked()

    const submit = page.locator('button[type="submit"]')
    await tabTo(page, submit)
    await page.keyboard.press('Enter')
    await expect.poll(() => submitRequests).toBe(1)
    await expect(page.getByRole('region', { name: '현재 문항 채점 결과' })).toBeVisible()
  })

  test('report list covers error, keyboard retry, populated, and empty states', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-1440', 'state-transition acceptance is sampled on desktop Chromium')
    await loginAs(page, 'INSTRUCTOR')
    let studentRequests = 0
    let emptyMode = false
    await page.route('**/api/classrooms/12/students**', async (route) => {
      studentRequests += 1
      if (studentRequests === 1) {
        await route.fulfill({
          body: JSON.stringify({ error: { code: 'TEMPORARY_UNAVAILABLE', details: [], message: 'temporary QA failure' }, success: false }),
          contentType: 'application/json',
          status: 503,
        })
        return
      }
      const items = emptyMode ? [] : [{
        affiliation: '컴퓨터공학부',
        email: 'learner@example.com',
        name: '테스트 학습자',
        studentId: 31,
      }]
      await route.fulfill({
        body: JSON.stringify({
          data: { items, page: 0, size: 100, totalElements: items.length, totalPages: items.length ? 1 : 0 },
          message: 'ok',
          success: true,
        }),
        contentType: 'application/json',
        status: 200,
      })
    })

    await page.goto('/classrooms/12/reports')
    const retry = page.getByRole('button', { name: '다시 시도' })
    await expect(retry).toBeVisible()
    await tabTo(page, retry)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: '학습자 리포트 목록' })).toBeVisible()
    await expect(page.getByRole('link', { name: '테스트 학습자 리포트 열기' })).toBeVisible()

    emptyMode = true
    await page.reload()
    await expect(page.getByRole('heading', { name: '리포트를 생성할 학습자가 없습니다' })).toBeVisible()
    expect(studentRequests).toBeGreaterThanOrEqual(3)
  })

  test('failed report keeps history, hides the internal code, and starts one retry job', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-1440', 'report failure recovery is sampled on desktop Chromium')
    await loginAs(page, 'INSTRUCTOR')
    let createRequests = 0
    let createdRequestId = ''

    await page.route('**/api/classrooms/12/students/31/reports', async (route) => {
      if (route.request().method() === 'POST') {
        createRequests += 1
        createdRequestId = (route.request().postDataJSON() as { requestId: string }).requestId
        await route.fulfill({
          body: JSON.stringify({
            data: { pollAfterSeconds: 5, reportId: 'job-retry', status: 'PENDING' },
            message: 'ok',
            success: true,
          }),
          contentType: 'application/json',
          status: 202,
        })
        return
      }
      await route.fulfill({
        body: JSON.stringify({
          data: {
            activeGeneration: { pollAfterSeconds: 1, reportId: 'job-failed', status: 'PROCESSING' },
            items: [{
              createdAt: '2026-10-01T00:00:00Z',
              overallScore: 82,
              overallStage: 'GOOD',
              reportId: 'report-existing',
              version: 3,
            }],
          },
          message: 'ok',
          success: true,
        }),
        contentType: 'application/json',
        status: 200,
      })
    })
    await page.route('**/api/classrooms/12/weeks**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ data: { items: [] }, message: 'ok', success: true }),
        contentType: 'application/json',
        status: 200,
      })
    })
    await page.route('**/api/reports/job-failed', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: {
            failureCode: 'AI_RESPONSE_INVALID',
            fallback: {
              dataQuality: { progressDataAvailable: true },
              metrics: { sessionCount: 2 },
            },
            reportId: 'job-failed',
            status: 'FAILED',
          },
          message: 'ok',
          success: true,
        }),
        contentType: 'application/json',
        status: 200,
      })
    })

    await page.goto('/classrooms/12/students/31/reports')
    await expect(page.getByRole('heading', { name: '리포트를 생성하지 못했습니다' })).toBeVisible()
    await expect(page.getByText('리포트 생성 결과를 처리하지 못했습니다. 다시 생성해 주세요.')).toBeVisible()
    await expect(page.getByText('AI_RESPONSE_INVALID')).toHaveCount(0)
    await expect(page.locator('a[href="/classrooms/12/students/31/reports/report-existing"]')).toBeVisible()

    await page.getByRole('button', { name: '다시 생성' }).click()
    await expect.poll(() => createRequests).toBe(1)
    expect(createdRequestId).not.toBe('')
    await expect(page.getByRole('button', { name: '리포트 생성 중' })).toBeDisabled()
  })

  test('feedback preserves input after an error and supports keyboard resubmission', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-1440', 'feedback state-transition acceptance is sampled on desktop Chromium')
    await loginAs(page, 'LEARNER')
    let submissions = 0
    await page.route('**/api/feedback', async (route) => {
      submissions += 1
      if (submissions === 1) {
        await route.fulfill({
          body: JSON.stringify({ error: { code: 'TEMPORARY_UNAVAILABLE', details: [], message: 'temporary QA failure' }, success: false }),
          contentType: 'application/json',
          status: 503,
        })
        return
      }
      await route.fulfill({
        body: JSON.stringify({ data: { feedbackId: 1 }, message: 'ok', success: true }),
        contentType: 'application/json',
        status: 200,
      })
    })

    await page.goto('/feedback')
    const message = page.getByRole('textbox', { name: '내용' })
    await tabTo(page, message)
    await page.keyboard.insertText('재시도 보존 확인')
    const submit = page.getByRole('button', { name: '보내기' })
    await tabTo(page, submit)
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toContainText('temporary QA failure')
    await expect(message).toHaveValue('재시도 보존 확인')

    await tabTo(page, submit)
    await page.keyboard.press('Enter')
    await expect(message).toHaveValue('')
    expect(submissions).toBe(2)
  })
})

test('UI-04 200% reflow surrogate remains operable at half-width CSS viewport', async ({ page }, testInfo) => {
  test.skip(qaEnvironment !== 'mock', 'synthetic viewport inspection runs against mock only')
  test.skip(testInfo.project.name !== 'chromium-1440', 'one deterministic Chromium surrogate is sufficient')
  await page.setViewportSize({ height: 450, width: 720 })
  await loginAs(page, 'LEARNER')
  await page.goto('/sessions/100')
  await waitForAppSettled(page)
  await expect(page.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 30_000 })
  const overflow = await page.evaluate(() => (
    Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)
      - document.documentElement.clientWidth
  ))
  expect(overflow).toBeLessThanOrEqual(2)
  await testInfo.attach('reflow-surrogate-720x450.png', {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  })
})

test('UI-04 phone-landscape synthetic viewport keeps workspace panes keyboard reachable', async ({ page }, testInfo) => {
  test.skip(qaEnvironment !== 'mock', 'synthetic viewport inspection runs against mock only')
  test.skip(testInfo.project.name !== 'chromium-1440', 'one deterministic Chromium landscape sample is sufficient')
  await page.setViewportSize({ height: 360, width: 800 })
  await loginAs(page, 'LEARNER')
  await page.goto('/sessions/100')
  await expect(page.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('region', { name: 'PDF 뷰어' })).toBeVisible()
  const learningPanel = page.getByRole('region', { name: 'AI 학습 패널' })
  if (!await learningPanel.isVisible()) {
    const learningButton = page.getByRole('button', { name: '학습', exact: true }).first()
    await tabTo(page, learningButton)
    await page.keyboard.press('Enter')
  }
  await expect(learningPanel).toBeVisible()
  const overflow = await page.evaluate(() => (
    Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)
      - document.documentElement.clientWidth
  ))
  expect(overflow).toBeLessThanOrEqual(2)
  await testInfo.attach('phone-landscape-800x360.png', {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  })
})

test('records whether the headless Chromium zoom shortcut changes browser zoom', async ({ page }, testInfo) => {
  test.skip(qaEnvironment !== 'mock', 'capability probing runs against mock only')
  test.skip(testInfo.project.name !== 'chromium-1440', 'zoom capability probe uses Chromium')
  await page.goto('/login')
  const before = await zoomSnapshot(page)
  await page.keyboard.press('Control++')
  await page.keyboard.press('Control++')
  await page.waitForTimeout(250)
  const after = await zoomSnapshot(page)
  const result = { after, before, effective: JSON.stringify(after) !== JSON.stringify(before) }
  await testInfo.attach('browser-zoom-capability.json', {
    body: Buffer.from(JSON.stringify(result, null, 2)),
    contentType: 'application/json',
  })
  mkdirSync(`qa-artifacts/${qaEnvironment}`, { recursive: true })
  writeFileSync(`qa-artifacts/${qaEnvironment}/browser-zoom-capability.json`, `${JSON.stringify(result, null, 2)}\n`)
})

async function tabTo(page: Page, target: Locator, limit = 120) {
  await expect(target).toBeVisible()
  for (let index = 0; index < limit; index += 1) {
    await page.keyboard.press('Tab')
    if (await target.evaluate((element) => element === document.activeElement)) return
  }
  throw new Error(`Keyboard focus did not reach target within ${limit} Tab presses`)
}

function zoomSnapshot(page: Page) {
  return page.evaluate(() => ({
    devicePixelRatio: window.devicePixelRatio,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    visualViewportScale: window.visualViewport?.scale ?? null,
  }))
}
