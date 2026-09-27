import { ApiClientError } from './ApiClientError'
import { isApiFailure } from './contracts'

const GENERIC_RATE_LIMIT_MESSAGE =
  '요청이 많아요. 잠시 후 다시 시도해 주세요.'
const AI_QUOTA_MESSAGE =
  '오늘의 AI 사용 한도를 모두 사용했어요. 내일 다시 이용해 주세요.'

export async function mapRateLimitError(
  response: Response,
): Promise<ApiClientError> {
  const payload = await readJson(response)
  const retryAfterSeconds = readRetryAfterSeconds(response)

  if (isApiFailure(payload)) {
    return new ApiClientError({
      code: payload.error.code,
      details: payload.error.details,
      message:
        payload.error.code === 'AI_QUOTA_EXCEEDED'
          ? AI_QUOTA_MESSAGE
          : payload.error.message || GENERIC_RATE_LIMIT_MESSAGE,
      retryAfterSeconds,
      status: response.status,
      timestamp: payload.timestamp,
      traceId: payload.traceId,
    })
  }

  return new ApiClientError({
    code: 'RATE_LIMITED',
    message: GENERIC_RATE_LIMIT_MESSAGE,
    retryAfterSeconds,
    status: response.status,
  })
}

/**
 * Retry-After는 초 단위 숫자 또는 HTTP-date로 올 수 있다(RFC 9110).
 * 둘 다 초로 환산하고, 해석할 수 없으면 null.
 */
function readRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get('Retry-After')?.trim()
  if (!header) return null

  if (/^\d+$/.test(header)) return Number(header)

  const until = Date.parse(header)
  if (Number.isNaN(until)) return null
  return Math.max(0, Math.ceil((until - Date.now()) / 1000))
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}
