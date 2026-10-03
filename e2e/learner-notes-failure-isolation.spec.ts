import { expect, test, type Page } from '@playwright/test'

import { loginAs, qaEnvironment, waitForAppSettled } from './qa-helpers'

test.describe('learner note failure isolation', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(qaEnvironment !== 'mock', 'synthetic note failures run against mock only')
    test.skip(
      !new Set(['chromium-1440', 'phone-390']).has(testInfo.project.name),
      'desktop and phone Chromium are the requested representative viewports',
    )
  })

  test('keeps a successful session visible while retrying only the failed session', async ({ page }) => {
    await loginAs(page, 'LEARNER')
    let failedSessionCalls = 0
    await routeSessions(page)
    await page.route('**/api/sessions/100/notes**', (route) => route.fulfill({
      body: JSON.stringify(noteList(1, '# 보존되는 브라우저 노트')),
      contentType: 'application/json',
      status: 200,
    }))
    await page.route('**/api/sessions/101/notes**', (route) => {
      failedSessionCalls += 1
      if (failedSessionCalls === 1) {
        return route.fulfill({
          body: JSON.stringify(apiFailure(500, '일시적인 세션 오류')),
          contentType: 'application/json',
          status: 500,
        })
      }
      return route.fulfill({
        body: JSON.stringify(noteList(2, '# 재시도로 복구된 브라우저 노트')),
        contentType: 'application/json',
        status: 200,
      })
    })

    await page.goto('/notes')
    await waitForAppSettled(page)

    await expect(page.getByText('보존되는 브라우저 노트')).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(
      '일부 세션의 노트를 불러오지 못했습니다. 실패한 세션: 1개.',
    )
    await page.getByRole('button', { name: '실패한 세션 다시 시도' }).click()

    await expect(page.getByText('재시도로 복구된 브라우저 노트')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(failedSessionCalls).toBe(2)
    await expectNoHorizontalOverflow(page)
  })

  test('clears A and blocks save when an in-place navigation to B fails', async ({ page }) => {
    await loginAs(page, 'LEARNER')
    let bPatchRequests = 0
    await routeSessions(page)
    await page.route('**/api/sessions/100/notes**', (route) => route.fulfill({
      body: JSON.stringify(noteList(1, '# A의 브라우저 전용 내용')),
      contentType: 'application/json',
      status: 200,
    }))
    await page.route('**/api/sessions/101/notes**', (route) => route.fulfill({
      body: JSON.stringify(apiFailure(403, 'B 노트를 볼 수 없습니다')),
      contentType: 'application/json',
      status: 403,
    }))
    await page.route('**/api/notes/2', (route) => {
      bPatchRequests += 1
      return route.fulfill({
        body: JSON.stringify({
          data: { content: '# 잘못 저장됨', noteId: 2, pageNumber: 1 },
          message: 'ok',
          success: true,
        }),
        contentType: 'application/json',
        status: 200,
      })
    })

    await page.goto('/notes/session/1/edit?sessionId=100')
    await waitForAppSettled(page)
    await expect(page.getByText('A 자료.pdf')).toBeVisible()
    await expect(page.getByRole('button', { name: '변경사항 저장' })).toBeEnabled()

    await page.evaluate(() => {
      window.history.pushState({}, '', '/notes/session/2/edit?sessionId=101')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    await expect(page.getByRole('heading', { name: '노트를 불러오지 못했습니다' })).toBeVisible()
    await expect(page.getByText('B 노트를 볼 수 없습니다')).toBeVisible()
    await expect(page.getByText('A 자료.pdf')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '변경사항 저장' })).toBeDisabled()
    expect(bPatchRequests).toBe(0)
    await expectNoHorizontalOverflow(page)
  })
})

async function routeSessions(page: Page) {
  await page.route('**/api/sessions?**', (route) => route.fulfill({
    body: JSON.stringify({
      data: {
        items: [
          session(100, 'A 자료.pdf'),
          session(101, 'B 자료.pdf'),
        ],
        page: 0,
        size: 100,
        totalElements: 2,
        totalPages: 1,
      },
      message: 'ok',
      success: true,
    }),
    contentType: 'application/json',
    status: 200,
  }))
}

function session(sessionId: number, materialTitle: string) {
  return {
    currentPage: 1,
    materialId: sessionId,
    materialTitle,
    sessionId,
    status: 'ACTIVE',
    updatedAt: '2026-10-03T00:00:00Z',
  }
}

function noteList(noteId: number, content: string) {
  return {
    data: {
      items: [{ content, noteId, pageNumber: 1 }],
      page: 0,
      size: 100,
      totalElements: 1,
      totalPages: 1,
    },
    message: 'ok',
    success: true,
  }
}

function apiFailure(status: number, message: string) {
  return {
    error: { code: `SYNTHETIC_${status}`, details: [], message },
    success: false,
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => (
    Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)
      - document.documentElement.clientWidth
  ))
  expect(overflow).toBeLessThanOrEqual(2)
}
