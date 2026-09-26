interface ApiClientErrorOptions {
  code: string
  message: string
  status?: number | null
  details?: unknown[]
  retryAfterSeconds?: number | null
  traceId?: string
  timestamp?: string
  cause?: unknown
}

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number | null
  readonly details: readonly unknown[]
  /** 429 응답의 Retry-After(초). 헤더가 없으면 null. */
  readonly retryAfterSeconds: number | null
  readonly traceId?: string
  readonly timestamp?: string

  constructor({
    code,
    message,
    status = null,
    details = [],
    retryAfterSeconds = null,
    traceId,
    timestamp,
    cause,
  }: ApiClientErrorOptions) {
    super(message, { cause })
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.details = details
    this.retryAfterSeconds = retryAfterSeconds
    this.traceId = traceId
    this.timestamp = timestamp
  }
}
