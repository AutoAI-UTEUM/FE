import { getApiBaseUrl } from '../config/env'
import { ApiClientError } from './ApiClientError'
import { isApiFailure } from './contracts'
import { mapRateLimitError } from './rateLimitError'

export interface RawApiRequestOptions extends RequestInit {
  acceptStatuses?: number[]
  accessToken?: string
}

export async function rawApiRequest(
  path: string,
  options: RawApiRequestOptions = {},
): Promise<Response> {
  assertSpringRelativePath(path)

  const {
    acceptStatuses = [],
    accessToken,
    headers: headerValues,
    ...requestInit
  } = options
  const headers = new Headers(headerValues)

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  let response: Response
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...requestInit,
      credentials: requestInit.credentials ?? 'include',
      headers,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError({
        cause: error,
        code: 'REQUEST_ABORTED',
        message: '요청이 취소되었습니다.',
      })
    }
    throw new ApiClientError({
      cause: error,
      code: 'NETWORK_ERROR',
      message: '서버에 연결할 수 없습니다.',
    })
  }

  if (!response.ok && !acceptStatuses.includes(response.status)) {
    throw await mapRawResponseError(response)
  }

  return response
}

async function mapRawResponseError(response: Response): Promise<ApiClientError> {
  if (response.status === 429) {
    return mapRateLimitError(response)
  }

  const payload = await readJson(response)
  if (isApiFailure(payload)) {
    return new ApiClientError({
      code: payload.error.code,
      details: payload.error.details,
      message: payload.error.message,
      status: response.status,
      timestamp: payload.timestamp,
      traceId: payload.traceId,
    })
  }

  return new ApiClientError({
    code: `HTTP_${response.status}`,
    message: `서버 요청이 실패했습니다. (${response.status})`,
    status: response.status,
  })
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json()
  } catch {
    return undefined
  }
}

function assertSpringRelativePath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ApiClientError({
      code: 'INVALID_API_PATH',
      message: 'API 경로는 Spring 기준의 /로 시작하는 상대 경로여야 합니다.',
    })
  }
}
