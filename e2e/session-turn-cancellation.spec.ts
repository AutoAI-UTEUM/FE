import { expect, test } from '@playwright/test'

import { loginAs, qaEnvironment } from './qa-helpers'

test.describe('session turn cancellation contracts', () => {
  test.beforeEach(() => {
    test.skip(qaEnvironment !== 'mock', 'synthetic browser regression only')
  })

  test('keeps one delayed canonical partial answer after a posted turn is cancelled', async ({ page }) => {
    let releaseTurn: (() => void) | undefined
    const turnCanFinish = new Promise<void>((resolve) => { releaseTurn = resolve })
    const requestIds: string[] = []
    let cancelPosts = 0

    await page.route('**/api/sessions/100/stream', (route) => route.fulfill({
      body: sse([
        ['ready', { connectedAt: '2026-10-03T00:00:00Z', sessionId: 100 }],
        ['content_delta', { text: '취소 직전의 임시 답변' }],
        ['completed', { result: { messages: [], uiActions: [] } }],
      ]),
      contentType: 'text/event-stream',
    }))
    await page.route('**/api/sessions/100/turns', async (route) => {
      const body = route.request().postDataJSON() as { requestId: string }
      requestIds.push(body.requestId)
      await turnCanFinish
      await route.fulfill({
        json: success({
          messages: [{
            content: '취소 시점까지 저장된 정본 부분 답변',
            createdAt: '2026-10-03T00:00:01Z',
            messageId: 910,
            senderType: 'AI',
            status: 'COMPLETED',
          }],
          state: {},
          uiActions: [],
        }),
      })
    })
    await page.route('**/api/sessions/100/turns/cancel', async (route) => {
      cancelPosts += 1
      await route.fulfill({ json: success({ cancelled: true }) })
      setTimeout(() => releaseTurn?.(), 100)
    })

    await loginAs(page, 'LEARNER')
    await page.goto('/sessions/100')
    await page.locator('#chat-question').fill('부분 답변을 남겨 주세요.')
    await page.getByRole('button', { name: '질문 보내기' }).click()
    await expect.poll(() => requestIds.length).toBe(1)
    await expect(page.getByRole('log').locator('article').filter({
      hasText: '취소 직전의 임시 답변',
    })).toHaveCount(1)

    await page.getByRole('button', { name: '답변 중단' }).click()
    await expect(page.getByText('답변 생성을 중단했습니다.', { exact: true })).toBeVisible()
    const canonicalPartial = page.getByRole('log').locator('article').filter({
      hasText: '취소 시점까지 저장된 정본 부분 답변',
    })
    await expect(canonicalPartial).toHaveCount(1)
    await expect(page.getByRole('log').locator('article').filter({
      hasText: '취소 직전의 임시 답변',
    })).toHaveCount(0)
    await expect(page.locator('#chat-question')).toBeEnabled()
    await page.waitForTimeout(250)

    expect(cancelPosts).toBe(1)
    expect(requestIds).toHaveLength(1)
  })

  test('ends existing-turn recovery on a structured terminal SSE error without posting a turn', async ({ page }) => {
    let pageMoves = 0
    let turnPosts = 0
    let historyReads = 0

    await page.route('**/api/sessions/100/messages**', async (route) => {
      historyReads += 1
      await route.fulfill({
        json: success({ hasMore: false, items: [], nextCursor: null }),
      })
    })
    await page.route('**/api/sessions/100/page', async (route) => {
      pageMoves += 1
      await route.fulfill({
        json: failure('TURN_IN_PROGRESS', '이미 답변 생성 중입니다.'),
        status: 409,
      })
    })
    await page.route('**/api/sessions/100/stream', (route) => route.fulfill({
      body: sse([
        ['ready', { connectedAt: '2026-10-03T00:00:00Z', sessionId: 100 }],
        ['error', {
          category: 'TIMEOUT',
          code: 'AI_SERVICE_TIMEOUT',
          message: 'AI 응답 시간이 초과되었습니다.',
          retryable: true,
          traceId: 'trace-browser-terminal',
        }],
      ]),
      contentType: 'text/event-stream',
    }))
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.method() === 'POST' && url.pathname === '/api/sessions/100/turns') {
        turnPosts += 1
      }
    })

    await loginAs(page, 'LEARNER')
    await page.goto('/sessions/100')
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await expect(page.getByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })).toBeVisible()
    await page.getByRole('button', { name: '다음', exact: true }).click()

    await expect(page.getByRole('alert')).toContainText('AI 응답 시간이 초과되었습니다.')
    await expect(page.locator('#chat-question')).toBeEnabled()
    await page.waitForTimeout(250)

    expect(pageMoves).toBe(1)
    expect(turnPosts).toBe(0)
    expect(historyReads).toBeLessThanOrEqual(2)
  })
})

function success(data: unknown) {
  return { data, message: 'Synthetic fixture', success: true }
}

function failure(code: string, message: string) {
  return { error: { code, details: [], message }, success: false }
}

function sse(events: Array<[string, Record<string, unknown>]>) {
  return `${events.map(([event, data]) => (
    `event: ${event}\ndata: ${JSON.stringify(data)}\n`
  )).join('\n')}\n`
}
