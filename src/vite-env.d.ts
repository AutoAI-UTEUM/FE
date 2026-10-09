/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GUARDIAN_WORKFLOW_READINESS?: string
  readonly VITE_GUARDIAN_POLICY_REVIEW_READINESS?: string
  readonly VITE_GUARDIAN_TEAM_READINESS?: string
  readonly VITE_AUTH_CONTRACT_READINESS?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_CAPABILITIES?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
