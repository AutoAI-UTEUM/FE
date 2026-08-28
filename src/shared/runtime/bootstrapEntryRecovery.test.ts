import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('entry bootstrap recovery', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

  it('recovers when the initial application module fails to load', () => {
    expect(html).toContain('window.__uteumEntryLoadFailed = () =>')
    expect(html).toContain("window.addEventListener(\n          'error'")
    expect(html).toContain('event.target instanceof HTMLScriptElement')
    expect(html).toContain("url.searchParams.set(reloadQueryKey, String(Date.now()))")
  })

  it('stops automatic reload loops and exposes a manual retry action', () => {
    expect(html).toContain('const reloadCooldownMs = 60_000')
    expect(html).toContain("retryButton.textContent = '다시 시도'")
    expect(html).toContain(
      'window.setTimeout(window.__uteumEntryLoadFailed, 10_000)',
    )
  })
})
