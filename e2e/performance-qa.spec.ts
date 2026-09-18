import { mkdirSync, writeFileSync } from 'node:fs'

import { expect, test, type Page, type TestInfo } from '@playwright/test'

import { loginAs, qaEnvironment, waitForAppSettled } from './qa-helpers'

interface PerformanceSnapshot {
  cls: number
  domContentLoadedMs: number
  duplicateGets: Array<{ count: number; url: string }>
  fcpMs: number
  initialAssetBytes: number
  interactionMs?: number
  lcpMs: number
  loadMs: number
  longTaskCount: number
  longTaskDurationMs: number
  mode: 'cold' | 'warm'
  project: string
  resourceCount: number
  run: number
  ttfbMs: number
}

const performanceProjects = new Set(['chromium-1440', 'phone-390', 'tablet-820-landscape'])

test.describe('frontend performance', () => {
  test('[FE] login cold and warm loading stay within the frontend budgets', async ({ page }, testInfo) => {
    test.skip(!performanceProjects.has(testInfo.project.name), 'performance runs use representative Chromium viewports')
    test.setTimeout(180_000)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    const isMobile = testInfo.project.name === 'phone-390'
    if (isMobile) {
      await cdp.send('Network.emulateNetworkConditions', {
        connectionType: 'cellular4g',
        downloadThroughput: 1_600_000 / 8,
        latency: 150,
        offline: false,
        uploadThroughput: 750_000 / 8,
      })
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }

    const snapshots: PerformanceSnapshot[] = []
    for (const mode of ['cold', 'warm'] as const) {
      for (let run = 1; run <= 3; run += 1) {
        if (mode === 'cold') await cdp.send('Network.clearBrowserCache')
        snapshots.push(await measureLogin(page, testInfo, mode, run))
      }
    }

    await attachReport(testInfo, 'login-performance.json', snapshots)
    persistReport(testInfo, 'login', snapshots)

    if (qaEnvironment === 'mock') {
      const cold = medianSnapshot(snapshots.filter((snapshot) => snapshot.mode === 'cold'))
      const lcpBudget = isMobile ? 4_000 : 2_500
      if (cold.lcpMs > 0) expect.soft(cold.lcpMs, 'median cold LCP budget').toBeLessThanOrEqual(lcpBudget)
      expect.soft(cold.cls, 'median cold CLS budget').toBeLessThanOrEqual(0.1)
      expect.soft(cold.interactionMs ?? 0, 'forgot-password interaction budget').toBeLessThanOrEqual(200)
      expect.soft(cold.longTaskDurationMs, 'long task total should remain bounded').toBeLessThanOrEqual(1_000)
      expect.soft(cold.duplicateGets, 'login must not issue duplicate GET requests').toEqual([])
    }
  })

  test('[FE] authenticated route transitions avoid duplicate reads and eager heavy chunks', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-1440', 'authenticated performance uses the desktop Chromium baseline')
    test.setTimeout(120_000)
    const loggedIn = await loginAs(page, 'LEARNER')
    test.skip(!loggedIn, `${qaEnvironment} learner QA credentials are not configured`)

    const requests: Array<{ method: string; url: string }> = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) {
        requests.push({ method: request.method(), url: normalizeUrl(request.url()) })
      }
    })
    const routeReports = []
    for (const path of ['/classrooms', '/calendar', '/notes']) {
      requests.length = 0
      const startedAt = performance.now()
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await waitForAppSettled(page)
      const transitionMs = Math.round((performance.now() - startedAt) * 10) / 10
      const duplicateGets = duplicateGetRequests(requests)
      const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name))
      routeReports.push({ duplicateGets, path, resources, transitionMs })
      if (qaEnvironment === 'mock') {
        expect.soft(transitionMs, `${path} transition budget`).toBeLessThanOrEqual(1_500)
        expect.soft(duplicateGets, `${path} must not issue duplicate GET requests`).toEqual([])
      }
    }

    const initialResources = routeReports[0]?.resources ?? []
    const eagerHeavyAssets = initialResources.filter((resource) => /(?:pdf\.worker|NotionBlockEditor)/i.test(resource))
    expect.soft(eagerHeavyAssets, 'heavy workspace assets must remain route-lazy').toEqual([])
    await attachReport(testInfo, 'route-performance.json', routeReports)
    persistReport(testInfo, 'routes', routeReports)
  })
})

async function measureLogin(
  page: Page,
  testInfo: TestInfo,
  mode: 'cold' | 'warm',
  run: number,
): Promise<PerformanceSnapshot> {
  const requests: Array<{ method: string; url: string }> = []
  const listener = (request: { method(): string; url(): string }) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      requests.push({ method: request.method(), url: normalizeUrl(request.url()) })
    }
  }
  page.on('request', listener)
  await page.addInitScript(() => {
    const state = { cls: 0, lcp: 0, longTaskCount: 0, longTaskDuration: 0 }
    ;(window as typeof window & { __uteumQaPerformance?: typeof state }).__uteumQaPerformance = state
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries.at(-1)
        if (last) state.lcp = last.startTime
      }).observe({ buffered: true, type: 'largest-contentful-paint' })
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (!entry.hadRecentInput) state.cls += entry.value ?? 0
        }
      }).observe({ buffered: true, type: 'layout-shift' })
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTaskCount += 1
          state.longTaskDuration += entry.duration
        }
      }).observe({ buffered: true, type: 'longtask' })
    } catch {
      // Older browser engines may not expose every performance observer type.
    }
  })

  await page.goto('/login', { waitUntil: 'load' })
  await waitForAppSettled(page)
  await page.waitForTimeout(500)
  const interactionStartedAt = performance.now()
  await page.getByRole('link', { name: '비밀번호 찾기' }).click()
  await page.getByRole('heading', { name: '비밀번호 찾기' }).waitFor({ state: 'visible' })
  const interactionMs = Math.round((performance.now() - interactionStartedAt) * 10) / 10

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const paints = performance.getEntriesByType('paint')
    const state = (window as typeof window & {
      __uteumQaPerformance?: { cls: number; lcp: number; longTaskCount: number; longTaskDuration: number }
    }).__uteumQaPerformance
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    return {
      cls: state?.cls ?? 0,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      fcpMs: paints.find((entry) => entry.name === 'first-contentful-paint')?.startTime ?? 0,
      initialAssetBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0),
      lcpMs: state?.lcp ?? 0,
      loadMs: navigation?.loadEventEnd ?? 0,
      longTaskCount: state?.longTaskCount ?? 0,
      longTaskDurationMs: state?.longTaskDuration ?? 0,
      resourceCount: resources.length,
      ttfbMs: navigation ? navigation.responseStart - navigation.startTime : 0,
    }
  })
  page.removeListener('request', listener)

  return {
    ...metrics,
    duplicateGets: duplicateGetRequests(requests),
    interactionMs,
    mode,
    project: testInfo.project.name,
    run,
  }
}

function medianSnapshot(snapshots: PerformanceSnapshot[]): PerformanceSnapshot {
  return [...snapshots].sort((left, right) => (left.lcpMs || left.loadMs) - (right.lcpMs || right.loadMs))[Math.floor(snapshots.length / 2)]
}

function duplicateGetRequests(requests: Array<{ method: string; url: string }>) {
  const counts = new Map<string, number>()
  for (const request of requests) {
    if (request.method !== 'GET' || /\/api\/(?:auth\/refresh|users\/me)(?:\?|$)/.test(request.url)) continue
    counts.set(request.url, (counts.get(request.url) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ count, url }))
}

function normalizeUrl(value: string) {
  const url = new URL(value)
  return `${url.pathname}${url.search}`
}

async function attachReport(testInfo: TestInfo, name: string, report: unknown) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json',
  })
}

function persistReport(testInfo: TestInfo, name: string, report: unknown) {
  const directory = `qa-artifacts/${qaEnvironment}/performance`
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    `${directory}/${name}-${testInfo.project.name}.json`,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2)}\n`,
  )
}
