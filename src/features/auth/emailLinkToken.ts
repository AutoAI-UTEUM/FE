declare global {
  interface Window {
    __uteumEmailLink?: { read: () => string | null; clear: () => void }
  }
}

export function readEmailLinkToken(): string | null {
  // Also cover client-side navigation that did not reload index.html.
  let pathname: string
  try { pathname = decodeURIComponent(window.location.pathname) } catch { return null }
  if (pathname.toLowerCase().replace(/\/+$/, '') === '/verify-email' &&
      (window.location.search || window.location.hash)) {
    const values = new URLSearchParams(window.location.search).getAll('token')
    let token = values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(values[0]) ? values[0] : null
    let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'referrer'; document.head.append(meta) }
    meta.content = 'no-referrer'
    window.history.replaceState(null, '', '/verify-email')
    window.__uteumEmailLink = { read: () => token, clear: () => { token = null } }
    window.addEventListener('pagehide', () => { token = null }, { once: true })
  }
  return window.__uteumEmailLink?.read() ?? null
}

export function clearEmailLinkToken(): void {
  window.__uteumEmailLink?.clear()
  delete window.__uteumEmailLink
}
