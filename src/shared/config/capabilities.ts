export type ApiCapability =
  | 'analytics'
  | 'oauth'
  | 'exam-attempt-drafts'
  | 'password-reset'
  | 'policy-consent'
  | 'reports'
  | 'schedule'
  | 'user-notes'

export function isApiCapabilityEnabled(capability: ApiCapability): boolean {
  return getApiCapabilities().has(capability)
}

function getApiCapabilities(): ReadonlySet<string> {
  return new Set(
    (import.meta.env.VITE_API_CAPABILITIES ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}
