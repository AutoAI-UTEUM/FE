declare global { interface Window { __uteumGuardianLink?: { read: () => string | null; clear: () => void } } }
export function readGuardianLinkToken(): string | null {
  if (window.location.pathname !== '/guardian-consent') return null
  if (window.location.search || window.location.hash) {
    window.__uteumGuardianLink?.clear()
    const match = /^#token=([A-Za-z0-9_-]{43})$/.exec(window.location.hash)
    let token = !window.location.search && match ? match[1] : null
    window.history.replaceState(null, '', '/guardian-consent')
    window.__uteumGuardianLink = { read: () => token, clear: () => { token = null } }
  }
  return window.__uteumGuardianLink?.read() ?? null
}
export function clearGuardianLinkToken() { window.__uteumGuardianLink?.clear(); delete window.__uteumGuardianLink }
