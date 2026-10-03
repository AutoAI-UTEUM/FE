import { mkdirSync, writeFileSync } from 'node:fs'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { loginAs, qaEnvironment } from './qa-helpers'

const SAMPLE_COUNT = 7
const LONG_HISTORY_SAMPLE_COUNT = 5

test('UI-06 records representative synthetic timings without an invented pass budget', async ({ browser, page }, testInfo) => {
  test.skip(qaEnvironment !== 'mock', 'repeatable performance sampling uses local synthetic fixtures')
  test.skip(testInfo.project.name !== 'chromium-1440', 'one stable Chromium baseline is sampled')
  test.skip(
    testInfo.config.workers !== 1,
    'performance evidence requires an isolated worker; run npm run test:performance:ui',
  )
  test.setTimeout(240_000)

  await loginAs(page, 'LEARNER')
  let responseSequence = 0
  await page.route('**/api/sessions/100/turns', async (route) => {
    responseSequence += 1
    await route.fulfill({
      body: JSON.stringify({
        data: {
          messages: [{
            content: `합성 AI 응답 ${responseSequence}`,
            createdAt: '2026-10-03T04:00:00Z',
            messageId: 10_000 + responseSequence,
            messageType: 'ANSWER',
            pageNumber: 1,
            senderType: 'AI',
            status: 'COMPLETED',
          }],
          state: { currentPage: 1, pageStatus: 'EXPLAINED' },
          uiActions: [],
        },
        message: 'ok',
        success: true,
      }),
      contentType: 'application/json',
      status: 200,
    })
  })

  const navigationMs: number[] = []
  const pdfFirstPageAfterDomMs: number[] = []
  const inputToAnimationFrameMs: number[] = []
  const syntheticAiResponseMs: number[] = []

  for (let run = 1; run <= SAMPLE_COUNT; run += 1) {
    let startedAt = performance.now()
    await page.goto('/sessions/100', { waitUntil: 'domcontentloaded' })
    navigationMs.push(round(performance.now() - startedAt))

    startedAt = performance.now()
    await expect(page.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 30_000 })
    pdfFirstPageAfterDomMs.push(round(performance.now() - startedAt))

    const question = page.locator('#chat-question')
    await expect(question).toBeVisible()
    inputToAnimationFrameMs.push(round(await measureInputToAnimationFrame(question, `입력 표본 ${run}`)))

    await question.fill(`응답 시간 표본 ${run}`)
    startedAt = performance.now()
    await question.press('Enter')
    await expect(page.getByText(`합성 AI 응답 ${run}`, { exact: true })).toBeVisible()
    syntheticAiResponseMs.push(round(performance.now() - startedAt))
  }

  const longHistoryRenderMs: number[] = []
  await page.route('**/api/sessions/100/messages**', (route) => route.fulfill({
    body: JSON.stringify({
      data: {
        hasMore: false,
        items: Array.from({ length: 200 }, (_, index) => ({
          content: `긴 대화 합성 메시지 ${index + 1}: ${'학습 내용 '.repeat(8)}`,
          createdAt: '2026-10-03T04:00:00Z',
          messageId: 20_000 + index,
          messageType: 'EXPLANATION',
          pageNumber: (index % 5) + 1,
          senderType: index % 2 === 0 ? 'AI' : 'USER',
          status: 'COMPLETED',
        })),
        nextCursor: null,
      },
      message: 'ok',
      success: true,
    }),
    contentType: 'application/json',
    status: 200,
  }))
  for (let run = 1; run <= LONG_HISTORY_SAMPLE_COUNT; run += 1) {
    const startedAt = performance.now()
    await page.goto('/sessions/100')
    await expect(page.getByText('긴 대화 합성 메시지 200:', { exact: false })).toBeAttached()
    longHistoryRenderMs.push(round(performance.now() - startedAt))
  }

  const raw = {
    inputToAnimationFrameMs,
    longHistoryRenderMs,
    navigationMs,
    pdfFirstPageAfterDomMs,
    syntheticAiResponseMs,
  }
  const report = {
    conditions: {
      browser: `Chromium ${browser.version()}`,
      build: 'Vite production preview',
      data: 'synthetic mock API; 5-page local PDF; long history is 200 synthetic messages in one response',
      network: 'loopback; no throttling',
      project: testInfo.project.name,
      viewport: page.viewportSize(),
    },
    generatedAt: new Date().toISOString(),
    limitations: [
      'These measurements exclude backend, external AI, WAN, and production cache behavior.',
      'p95 with seven samples (five for long history) is the observed maximum and is not a release SLO.',
      'Input timing is input-event to next animation frame, not end-to-end INP.',
    ],
    raw,
    summary: Object.fromEntries(Object.entries(raw).map(([name, values]) => [name, summarize(values)])),
  }
  await testInfo.attach('ui-06-performance-samples.json', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json',
  })
  persistReport(testInfo, report)
})

async function measureInputToAnimationFrame(locator: ReturnType<Page['locator']>, value: string) {
  return locator.evaluate((element, nextValue) => new Promise<number>((resolve) => {
    const input = element as HTMLTextAreaElement
    input.addEventListener('input', () => {
      window.requestAnimationFrame(() => resolve(performance.now() - startedAt))
    }, { once: true })
    const startedAt = performance.now()
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(input, nextValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }), value)
}

function summarize(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    max: sorted.at(-1),
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    samples: sorted.length,
  }
}

function percentile(sorted: number[], percentileValue: number) {
  return sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)]
}

function round(value: number) {
  return Math.round(value * 10) / 10
}

function persistReport(testInfo: TestInfo, report: unknown) {
  const directory = `qa-artifacts/${qaEnvironment}/performance`
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    `${directory}/ui-06-${testInfo.project.name}.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  )
}
