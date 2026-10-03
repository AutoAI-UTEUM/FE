import { expect, test } from '@playwright/test'

import { loginAs } from './qa-helpers'

test.describe('release learning acceptance with synthetic APIs', () => {
  test('rapid page moves, one SSE turn, and browser back preserve the completed response without reposting', async ({ page }) => {
    const externalRequests: string[] = []
    const pageMoves: number[] = []
    let streamGets = 0
    let turnPosts = 0

    await page.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.hostname !== '127.0.0.1') {
        externalRequests.push(url.origin)
        await route.abort('blockedbyclient')
        return
      }
      await route.continue()
    })
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.method() === 'PATCH' && url.pathname === '/api/sessions/100/page') {
        const body = request.postDataJSON() as { pageNumber: number }
        pageMoves.push(body.pageNumber)
      }
      if (request.method() === 'GET' && url.pathname === '/api/sessions/100/stream') streamGets += 1
      if (request.method() === 'POST' && url.pathname === '/api/sessions/100/turns') turnPosts += 1
    })

    await loginAs(page, 'LEARNER')
    await page.goto('/sessions/100')
    await expect(page.getByRole('progressbar', { name: '학습 진행률 1 / 5쪽' })).toBeVisible()

    await page.getByRole('button', { name: '다음', exact: true }).click()
    await expect(page.getByRole('progressbar', { name: '학습 진행률 2 / 5쪽' })).toBeVisible()
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await expect(page.getByRole('progressbar', { name: '학습 진행률 3 / 5쪽' })).toBeVisible()
    await expect.poll(() => pageMoves).toEqual([3])

    const conversationItems = page.getByRole('log').locator('article')
    const priorCompletedResponse = conversationItems.filter({ hasText: '핵심 정리' })
    const submittedQuestion = conversationItems.filter({ hasText: '현재 페이지의 핵심을 설명해 주세요.' })
    const finalAssistantResponse = conversationItems.filter({
      hasText: '개념 정의와 적용 사례를 분리해서 정리해 보세요.',
    })
    await expect(priorCompletedResponse).toHaveCount(1)
    await expect(submittedQuestion).toHaveCount(0)
    await expect(finalAssistantResponse).toHaveCount(0)
    await page.locator('#chat-question').fill('현재 페이지의 핵심을 설명해 주세요.')
    await page.getByRole('button', { name: '질문 보내기' }).click()
    await expect(submittedQuestion).toHaveCount(1)
    await expect(finalAssistantResponse).toHaveCount(1)
    await expect(finalAssistantResponse).toContainText('AI 답변')
    await expect(page.locator('#chat-question')).toBeEnabled()

    expect(streamGets).toBe(1)
    expect(turnPosts).toBe(1)
    expect(pageMoves).toEqual([3])

    await page.locator('a[href="/classrooms"]').first().click()
    await expect(page).toHaveURL(/\/classrooms$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/sessions\/100$/)
    await expect(priorCompletedResponse).toHaveCount(1)
    await expect(submittedQuestion).toHaveCount(1)
    await expect(finalAssistantResponse).toHaveCount(1)
    expect(turnPosts).toBe(1)
    expect(externalRequests).toEqual([])
  })
})
