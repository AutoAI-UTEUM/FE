const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_VALUE_LENGTH = 1_000_000

export function workspaceKey(owner: string, scope: string): string {
  return `uteum:workspace:v1:${encodeURIComponent(owner)}:${encodeURIComponent(scope)}`
}

/** Personal browser drafts, never an API response or a source of authorization. */
export function readWorkspaceValue(key: string): unknown {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  if (raw.length > MAX_VALUE_LENGTH) return null
  try {
    const value = JSON.parse(raw)
    if (!value || !Number.isFinite(value.savedAt) || value.savedAt > Date.now() || Date.now() - value.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key)
      return null
    }
    return value.data
  } catch {
    return null
  }
}

export function writeWorkspaceValue(key: string, data: unknown): void {
  const raw = JSON.stringify({ data, savedAt: Date.now() })
  if (raw.length > MAX_VALUE_LENGTH) throw new Error('Draft too large')
  localStorage.setItem(key, raw)
}
