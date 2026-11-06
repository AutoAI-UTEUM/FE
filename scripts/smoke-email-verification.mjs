import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { chromium } from '@playwright/test'

// Read-only served-build check. A fresh, synthetic fragment exercises the real
// token bootstrap/UI; it is never submitted to the backend or printed.
const base = new URL(process.env.EMAIL_SMOKE_BASE_URL ?? 'https://www.uteum.com')
assert(['https://www.uteum.com', 'http://127.0.0.1:4190'].includes(base.origin), 'Unsupported smoke origin')
const expectedEntry = process.env.EXPECTED_ENTRY
assert(expectedEntry?.startsWith('/assets/index-') && expectedEntry.endsWith('.js'), 'Expected built entry is required')
let stage = 'launch'
let browser
try {
  browser = await chromium.launch()
  const page = await browser.newPage()
  const token = randomBytes(32).toString('base64url')
  let leakedToken = false
  let forbiddenWrites = 0
  page.on('request', (request) => { if (request.url().includes(token)) leakedToken = true })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/auth/refresh') {
      // Anonymous context; no production credentials, cookies or refresh write.
      return route.fulfill({ status: 401, json: { success: false, error: { code: 'TOKEN_INVALID', message: 'Anonymous smoke' } } })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      forbiddenWrites++
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  stage = 'served document'
  const response = await page.goto(`${base.origin}/verify-email#token=${token}`)
  assert.equal(response?.status(), 200)
  stage = 'active confirmation button'
  const confirm = page.getByRole('button', { name: '이메일 확인하기', exact: true })
  await confirm.waitFor({ state: 'visible', timeout: 15_000 })
  assert(await confirm.isEnabled(), 'Confirmation button must be enabled')
  assert.equal(await page.getByText('이메일 확인 기능을 준비 중입니다.', { exact: false }).count(), 0)
  stage = 'token protection and entry'
  assert.equal(new URL(page.url()).pathname, '/verify-email')
  assert.equal(new URL(page.url()).hash, '')
  assert.equal(new URL(page.url()).search, '')
  const entries = await page.locator('script[src]').evaluateAll((scripts) => scripts.map((script) => new URL(script.src).pathname))
  assert(entries.includes(expectedEntry), 'Served entry differs from the approved build')
  const stored = await page.evaluate(() => JSON.stringify({ state: history.state, local: { ...localStorage }, session: { ...sessionStorage } }))
  assert(!stored.includes(token), 'Fragment must not persist in browser storage/history')
  assert(!leakedToken, 'Fragment must not appear in HTTP URLs')
  assert.equal(forbiddenWrites, 0, 'Opening the page must not confirm or mutate')
  stage = 'reload does not confirm'
  await page.reload()
  await page.getByRole('heading', { name: '이메일 확인', exact: true }).waitFor({ state: 'visible' })
  assert.equal(await confirm.count(), 0, 'Reload must discard the in-memory token')
  assert.equal(forbiddenWrites, 0, 'Reload must not confirm or mutate')
  console.log(JSON.stringify({ status: 'passed', origin: base.origin, entry: expectedEntry, activeButton: true, automaticallySubmitted: false, tokenProtected: true, realEmailAcceptance: 'not performed' }))
} catch (error) {
  // No URL, request body, token, cookie, screenshot or trace is written.
  console.error(JSON.stringify({ status: 'failed', stage, errorType: error.name }))
  process.exitCode = 1
} finally {
  await browser?.close()
}
