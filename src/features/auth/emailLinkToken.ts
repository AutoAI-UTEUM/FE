declare global {
  interface Window {
    __uteumEmailLink?: { read: () => string | null; issue: 'obsolete-query' | 'invalid-fragment' | null; clear: () => void }
  }
}

export function readEmailLinkToken(): string | null {
  // Also cover client-side navigation that did not reload index.html.
  let pathname: string
  try { pathname = decodeURIComponent(window.location.pathname) } catch { return null }
  if (pathname.toLowerCase().replace(/\/+$/, '') === '/verify-email' &&
      (window.location.search || window.location.hash)) {
    window.__uteumEmailLink?.clear()
    const obsoleteQuery = new URLSearchParams(window.location.search).has('token')
    const match = /^#token=([A-Za-z0-9_-]{43})$/.exec(window.location.hash)
    let token = !obsoleteQuery && match ? match[1] : null
    const issue = obsoleteQuery ? 'obsolete-query' : window.location.hash && !match ? 'invalid-fragment' : null
    let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'referrer'; document.head.append(meta) }
    meta.content = 'no-referrer'
    window.history.replaceState(null, '', '/verify-email')
    window.__uteumEmailLink = { read: () => token, issue, clear: () => { token = null } }
    window.addEventListener('pagehide', () => { token = null }, { once: true })
  }
  return window.__uteumEmailLink?.read() ?? null
}

export function readEmailLinkIssue(): 'obsolete-query' | 'invalid-fragment' | null {
  return window.__uteumEmailLink?.issue ?? null
}

export function clearEmailLinkToken(): void {
  window.__uteumEmailLink?.clear()
  delete window.__uteumEmailLink
}
