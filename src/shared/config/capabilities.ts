export type ApiCapability =
  | 'analytics'
  | 'oauth'
  | 'password-reset'
  | 'reports'
  | 'schedule'

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
