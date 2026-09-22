import { expect, test } from '@playwright/test'

import { loginAs, qaEnvironment, waitForAppSettled, type QaRole } from './qa-helpers'

test.describe('shared authenticated palette', () => {
  test.beforeEach(() => test.skip(qaEnvironment !== 'mock', 'visual contract uses mock accounts'))

  for (const role of ['LEARNER', 'INSTRUCTOR', 'ADMIN'] as const satisfies readonly QaRole[]) {
    test(`${role} uses the common app surfaces and text palette`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(role === 'ADMIN' ? '/admin' : '/classrooms')
      await waitForAppSettled(page)

      const palette = await page.locator('[data-app-shell="true"]').evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          background: style.backgroundColor,
          body: style.getPropertyValue('--color-stone-900').trim(),
          card: getComputedStyle(element.querySelector('aside')!).backgroundColor,
          muted: style.getPropertyValue('--color-stone-500').trim(),
        }
      })
      expect(palette).toEqual({
        background: 'rgb(232, 235, 240)',
        body: '#111827',
        card: 'rgb(255, 255, 255)',
        muted: '#6b7280',
      })
      if (test.info().project.name.startsWith('chromium-')) {
        const shell = await page.locator('[data-app-shell="true"]').evaluate((element) => {
          const sidebar = element.querySelector(':scope > aside')!
          const main = element.querySelector(':scope > main')!
          return {
            sidebarWidth: sidebar.getBoundingClientRect().width,
            contentInset: getComputedStyle(main).paddingLeft,
            contentWidth: main.firstElementChild?.getBoundingClientRect().width,
          }
        })
        const viewportWidth = page.viewportSize()!.width
        const inset = Math.min(40, Math.max(16, viewportWidth * 0.03))
        expect(shell.sidebarWidth).toBe(232)
        expect(parseFloat(shell.contentInset)).toBeCloseTo(inset, 1)
        expect(shell.contentWidth).toBeCloseTo(viewportWidth - 232 - inset * 2, 1)
      }
      await expect(page.locator('[data-app-shell="true"] > aside a[aria-label$="홈"] > span').first()).toContainText('으')
      if (role !== 'ADMIN') {
        const titleSize = await page.getByRole('heading', { name: '내 강의실' }).evaluate((element) => getComputedStyle(element).fontSize)
        expect(titleSize).toBe('26px')
      }
    })
  }
})

test.describe('administrator visual details', () => {
  test.beforeEach(() => test.skip(qaEnvironment !== 'mock', 'visual contract uses mock data'))

  test('shows member and infrastructure monitoring graphs', async ({ page }) => {
    await loginAs(page, 'ADMIN')
    await page.goto('/admin')
    await expect(page.getByRole('img', { name: '최근 7일 누적 전체 회원 수' })).toBeVisible()
    await expect(page.getByRole('img', { name: '최근 7일 마지막 활동일별 회원 수' })).toBeVisible()

    await page.goto('/admin?tab=infra')
    for (const label of ['CPU 추이', '메모리 추이', '디스크 추이', 'AWS 비용 추이']) {
      await expect(page.getByRole('img', { name: label })).toBeVisible()
    }
    await expect(page.getByRole('img', { name: /AI 비용 현재 값|AI 호출 수 추이/ })).toBeVisible()
  })

  test('keeps every calendar date cell the same size', async ({ page }) => {
    await page.route('https://api.github.com/**', (route) => route.fulfill({
      body: '[]',
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      status: 200,
    }))
    await loginAs(page, 'ADMIN')
    await page.goto('/admin?tab=updates')
    const cells = page.getByRole('group', { name: /업데이트 달력/ }).locator('button')
    await expect(cells.first()).toBeVisible()
    const sizes = await cells.evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    }))
    expect(sizes.length).toBeGreaterThan(27)
    const widths = sizes.map(({ width }) => width)
    const heights = sizes.map(({ height }) => height)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
  })
})
