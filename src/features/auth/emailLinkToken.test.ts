import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearEmailLinkToken, readEmailLinkIssue, readEmailLinkToken } from './emailLinkToken'

const token = 'A'.repeat(43)
const html = readFileSync('index.html', 'utf8')
const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)![1]
const capture = {
  HTML: () => new Function('window', 'document', bootstrap)(window, document),
  SPA: () => readEmailLinkToken(),
}

beforeEach(() => {
  clearEmailLinkToken()
  window.history.replaceState(null, '', '/')
})
afterEach(() => { clearEmailLinkToken(); vi.restoreAllMocks() })

describe.each(['HTML', 'SPA'] as const)('%s fragment contract', (mode) => {
  it('captures only a canonical fragment in memory, removes URL/state before any request', () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    window.history.replaceState({ unsafe: token }, '', `/verify-email?returnTo=unsafe#token=${token}`)
    capture[mode]()
    expect(readEmailLinkToken()).toBe(token)
    expect(readEmailLinkIssue()).toBeNull()
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/verify-email')
    expect(window.history.state).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(document.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe('no-referrer')
    clearEmailLinkToken()
    expect(readEmailLinkToken()).toBeNull()
  })

  it.each([
    `?token=${token}`, `?token=${token}#token=${token}`, '?token=',
    `?%74oken=${token}#token=${token}`, `?token=${token}&token=${token}`,
  ])('rejects old query links without keeping their value: %s', (suffix) => {
    window.history.replaceState(null, '', '/verify-email' + suffix)
    capture[mode]()
    expect(readEmailLinkToken()).toBeNull()
    expect(readEmailLinkIssue()).toBe('obsolete-query')
    expect(window.location.search + window.location.hash).toBe('')
    expect(JSON.stringify(window.__uteumEmailLink)).not.toContain(token)
  })

  it.each([
    '#token=short', `#token=${token}&token=${token}`, `#token=${token}&returnTo=unsafe`,
    `#token=${'A'.repeat(44)}`, '#other=value', '#token=%41' + 'A'.repeat(42),
  ])('rejects malformed or ambiguous fragments: %s', (suffix) => {
    window.history.replaceState(null, '', '/verify-email' + suffix)
    capture[mode]()
    expect(readEmailLinkToken()).toBeNull()
    expect(readEmailLinkIssue()).toBe('invalid-fragment')
    expect(window.location.hash).toBe('')
  })

  it('discards the pending token on pagehide and captures a replacement only from a new URL', () => {
    window.history.replaceState(null, '', `/verify-email#token=${token}`)
    capture[mode]()
    window.dispatchEvent(new Event('pagehide'))
    expect(readEmailLinkToken()).toBeNull()
    const replacement = 'B'.repeat(43)
    window.history.replaceState(null, '', `/VERIFY-EMAIL/#token=${replacement}`)
    capture[mode]()
    expect(readEmailLinkToken()).toBe(replacement)
  })

  it('clears the previous closure when a new link replaces a still-unused token', () => {
    window.history.replaceState(null, '', `/verify-email#token=${token}`)
    capture[mode]()
    const previous = window.__uteumEmailLink!
    window.history.replaceState(null, '', `/verify-email#token=${'B'.repeat(43)}`)
    capture[mode]()
    expect(previous.read()).toBeNull()
    expect(readEmailLinkToken()).toBe('B'.repeat(43))
  })
})

it('the synchronous scrub script precedes external resources, module code and entry recovery', () => {
  expect(html.indexOf('name="referrer"')).toBeLessThan(html.indexOf('<script>'))
  expect(html.indexOf('window.__uteumEmailLink')).toBeLessThan(html.indexOf('<link'))
  expect(html.indexOf('window.__uteumEmailLink')).toBeLessThan(html.indexOf('reloadStorageKey'))
  expect(html.indexOf('window.__uteumEmailLink')).toBeLessThan(html.indexOf('type="module"'))
})
