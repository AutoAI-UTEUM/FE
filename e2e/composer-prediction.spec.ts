import { expect, test, type Page, type Request } from '@playwright/test'
import { loginAs, qaEnvironment } from './qa-helpers'

const pageErrors = new WeakMap<Page, string[]>()
const ready = process.env.QA_COMPOSER_READINESS === 'spring-composer-prediction-sse-v1'
const suggestion = '다른 예시로도 설명해 줘'
const success = (data: unknown) => ({ success: true, data, message: 'Synthetic local fixture' })
const prediction = (sourceMessageId = 777, text: string | null = suggestion) => ({
  schemaVersion: '1.0', sourceMessageId, sourceTurnId: `message-${sourceMessageId}`,
  contextVersion: 'a'.repeat(64), suggestion: text, warnings: [],
})
const sse = (data: unknown) => `event: prediction\ndata: ${JSON.stringify(data)}\n\n`
function deferred() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

async function fixture(page: Page, options: { waitTurn?: ReturnType<typeof deferred>; waitPrediction?: ReturnType<typeof deferred>; response?: 'null' | 'http-error' | 'wrong-source'; action?: 'quiz' | 'diagnosis' | 'unknown' } = {}) {
  const turns: Request[] = []
  const predictions: Request[] = []
  await page.route('**/api/sessions/100/turns', async (route) => {
    turns.push(route.request())
    await options.waitTurn?.promise
    const id = 776 + turns.length
    await route.fulfill({ json: success({
      messages: [{ messageId: id, senderType: 'AI', status: 'COMPLETED', messageType: 'QA', pageNumber: 1, content: `저장 완료 합성 답변 ${id}`, createdAt: '2026-11-06T00:00:00Z' }],
      state: { currentPage: 1, pageStatus: options.action === 'quiz' ? 'QUIZ_READY' : 'EXPLAINED', activeQuizId: options.action === 'quiz' ? 50 : null,
        pendingDiagnosis: options.action === 'diagnosis' ? { diagnosisId: 70 } : null },
      uiActions: options.action === 'unknown' ? [{ type: 'BINARY_DECISION', yesEvent: 'TEACHBACK', noEvent: 'WAIT', content: '합성 평가 단계' }] : [],
    }) })
  })
  await page.route('**/api/sessions/*/composer-prediction', async (route) => {
    predictions.push(route.request())
    await options.waitPrediction?.promise
    if (options.response === 'http-error') return route.fulfill({ status: 503, json: { success: false } })
    const source = route.request().postDataJSON().sourceMessageId as number
    const data = prediction(options.response === 'wrong-source' ? source + 1 : source, options.response === 'null' || source !== 777 ? null : suggestion)
    // Duplicate SSE events must not create duplicate suggestions or requests.
    await route.fulfill({ contentType: 'text/event-stream', body: sse(data) + sse(data) })
  })
  await loginAs(page, 'LEARNER')
  await page.goto('/sessions/100')
  await workspacePane(page, '학습')
  await expect(page.locator('#chat-question')).toBeVisible()
  return { turns, predictions }
}
async function workspacePane(page: Page, name: '자료' | '학습') {
  await expect(page.getByRole('heading', { name: '학습 공간', exact: true })).toBeAttached()
  const phone = page.getByRole('tablist', { name: '작업 화면', exact: true })
  const tablet = page.getByRole('group', { name: '학습 화면 보기', exact: true })
  if (await phone.isVisible()) await phone.getByRole('tab', { name, exact: true }).click()
  else if (await tablet.isVisible()) await tablet.getByRole('button', { name, exact: true }).click()
}
async function send(page: Page, text = '합성 학습 질문') {
  await page.locator('#chat-question').fill(text)
  await page.getByRole('button', { name: '질문 보내기', exact: true }).click()
}
async function settledWithoutSuggestion(page: Page) {
  await expect(page.locator('#composer-prediction')).toHaveCount(0)
  await expect(page.locator('#chat-question')).toBeEnabled()
  await expect(page.getByRole('log')).toContainText('저장 완료 합성 답변')
  await expect(page.getByRole('alert')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  test.skip(qaEnvironment !== 'mock', 'synthetic local API only')
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/*', async (route) => {
    expect(new URL(route.request().url()).hostname, 'no external service').toBe('127.0.0.1')
    await route.continue()
  })
})

test.afterEach(async ({ page }) => { expect(pageErrors.get(page) ?? []).toEqual([]) })

test('only a persisted turn POST can start a prediction; default OFF sends none', async ({ page }) => {
  const gate = deferred()
  const f = await fixture(page, { waitTurn: gate })
  try {
    expect(f.predictions).toHaveLength(0)
    await send(page)
    await expect.poll(() => f.turns.length).toBe(1)
    // The fixture SSE has completed while the acknowledged POST is still held.
    await expect(page.getByRole('log')).toContainText('개념 정의와 적용 사례를 설명합니다.')
    expect(f.predictions).toHaveLength(0)
    gate.release()
    await expect(page.getByRole('log')).toContainText('저장 완료 합성 답변 777')
    if (ready) {
      await expect(page.locator('#composer-prediction')).toContainText(suggestion)
      expect(f.predictions).toHaveLength(1)
      expect(f.predictions[0].method()).toBe('POST')
      expect(f.predictions[0].postDataJSON()).toEqual({ sourceMessageId: 777 })
      expect(f.predictions[0].headers().authorization).toMatch(/^Bearer /)
    } else {
      await expect(page.getByLabel('다음 질문 제안 표시')).toHaveCount(0)
      await settledWithoutSuggestion(page)
      expect(f.predictions).toHaveLength(0)
    }
    await page.reload()
    expect(f.predictions).toHaveLength(ready ? 1 : 0)
    await expect(page.locator('#composer-prediction')).toHaveCount(0)
  } finally { gate.release() }
})

test.describe('synthetic-ready composer interactions', () => {
  test.beforeEach(() => test.skip(!ready, 'readiness stays OFF in default build'))
  for (const method of ['Tab', 'click'] as const) {
    test(`${method} accepts an editable accessible draft; sending remains explicit`, async ({ page }, testInfo) => {
      const f = await fixture(page)
      await send(page)
      const accept = page.getByRole('button', { name: '제안을 초안에 넣기 (Tab)', exact: true })
      await expect(accept).toBeVisible()
      expect((await accept.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await expect(page.locator('#chat-question')).toHaveAttribute('aria-describedby', 'composer-prediction')
      await expect(page.locator('#composer-prediction')).toHaveAttribute('role', 'status')
      await page.screenshot({ path: testInfo.outputPath('prediction-draft.png') })
      if (method === 'Tab') { await page.locator('#chat-question').focus(); await page.keyboard.press('Tab') }
      else await accept.click()
      await expect(page.locator('#chat-question')).toHaveValue(suggestion)
      await expect(page.locator('#chat-question')).toBeFocused()
      expect(f.turns).toHaveLength(1)
      await expect(page.locator('#composer-prediction')).toHaveCount(0)
      await send(page, `${suggestion} (직접 편집)`)
      await expect.poll(() => f.turns.length).toBe(2)
      expect(f.turns[1].postDataJSON().payload.message).toBe(`${suggestion} (직접 편집)`)
      await settledWithoutSuggestion(page)
    })
  }
  test('typing aborts a pending prediction and late data never overwrites input or retries', async ({ page }) => {
    const gate = deferred()
    const f = await fixture(page, { waitPrediction: gate })
    try {
      await send(page)
      await expect.poll(() => f.predictions.length).toBe(1)
      await page.locator('#chat-question').fill('직접 작성 중')
      await expect.poll(() => Boolean(f.predictions[0].failure()), { message: 'typing aborts the browser request' }).toBe(true)
      gate.release()
      await settledWithoutSuggestion(page)
      await expect(page.locator('#chat-question')).toHaveValue('직접 작성 중')
      await page.locator('#chat-question').fill('')
      await page.waitForTimeout(150)
      expect(f.predictions).toHaveLength(1)
    } finally { gate.release() }
  })
  test('composition clears the suggestion and Tab during composition never accepts it', async ({ page }) => {
    const f = await fixture(page)
    await send(page)
    await expect(page.locator('#composer-prediction')).toBeVisible()
    const input = page.locator('#chat-question')
    await input.dispatchEvent('compositionstart', { data: '' })
    await input.dispatchEvent('keydown', { key: 'Tab', isComposing: true })
    await expect(input).toHaveValue('')
    await expect(page.locator('#composer-prediction')).toHaveCount(0)
    await input.dispatchEvent('compositionend', { data: '' })
    await page.waitForTimeout(150)
    expect(f.predictions).toHaveLength(1)
  })
  for (const boundary of ['page', 'navigation'] as const) {
    test(`late response after ${boundary} change is discarded and never resurrected on return`, async ({ page }) => {
      const gate = deferred()
      const f = await fixture(page, { waitPrediction: gate })
      try {
        await send(page)
        await expect.poll(() => f.predictions.length).toBe(1)
        if (boundary === 'page') {
          await workspacePane(page, '자료')
          await page.getByRole('button', { name: '다음', exact: true }).click()
        }
        else {
          await workspacePane(page, '자료')
          await page.locator('a[href="/classrooms"]:visible').first().click()
          await expect(page).toHaveURL(/\/classrooms$/)
          await expect(page.locator('#chat-question')).toHaveCount(0)
        }
        gate.release()
        await expect(page.locator('#composer-prediction')).toHaveCount(0)
        if (boundary === 'page') await page.getByRole('button', { name: '이전', exact: true }).click()
        else { await page.goBack(); await expect(page).toHaveURL(/\/sessions\/100$/) }
        await workspacePane(page, '학습')
        await expect(page.locator('#chat-question')).toHaveValue('')
        await page.waitForTimeout(150)
        await expect(page.locator('#composer-prediction')).toHaveCount(0)
        expect(f.predictions).toHaveLength(1)
      } finally { gate.release() }
    })
  }
  test('hiding the learning pane clears its suggestion', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'workspace pane switch uses mobile/tablet mode')
    const f = await fixture(page)
    await send(page)
    await expect(page.locator('#composer-prediction')).toBeVisible()
    await workspacePane(page, '자료')
    await workspacePane(page, '학습')
    await expect(page.locator('#composer-prediction')).toHaveCount(0)
    expect(f.predictions).toHaveLength(1)
  })
  for (const action of ['quiz', 'diagnosis', 'unknown'] as const) {
    test(`${action} assessment state never requests a prediction`, async ({ page }) => {
      const f = await fixture(page, { action })
      await send(page)
      await expect.poll(() => f.turns.length).toBe(1)
      if (action === 'quiz') await expect(page.getByRole('region', { name: '퀴즈 응시 중 채팅 잠금', exact: true, includeHidden: true })).toBeAttached()
      else await expect(page.getByRole('log')).toContainText('저장 완료 합성 답변 777')
      await expect(page.locator('#composer-prediction')).toHaveCount(0)
      expect(f.predictions).toHaveLength(0)
    })
  }
  for (const response of ['null', 'http-error', 'wrong-source'] as const) {
    test(`${response} is silent and preserves completed answer and editable input`, async ({ page }) => {
      const f = await fixture(page, { response })
      await send(page)
      await expect.poll(() => f.predictions.length).toBe(1)
      await settledWithoutSuggestion(page)
      await page.locator('#chat-question').fill('실패와 무관하게 계속 작성')
      await page.waitForTimeout(150)
      expect(f.predictions).toHaveLength(1)
      expect(f.turns).toHaveLength(1)
    })
  }
  test('opting out cancels a pending request without altering the learning turn', async ({ page }) => {
    const gate = deferred()
    const f = await fixture(page, { waitPrediction: gate })
    try {
      await send(page)
      await expect.poll(() => f.predictions.length).toBe(1)
      await page.getByLabel('다음 질문 제안 표시').uncheck()
      gate.release()
      await settledWithoutSuggestion(page)
      await expect(page.getByLabel('다음 질문 제안 표시')).not.toBeChecked()
      expect(f.turns).toHaveLength(1)
    } finally { gate.release() }
  })
})
