import { getApiBaseUrl } from '../config/env'
import { ApiClientError } from './ApiClientError'
import { isApiFailure, isApiSuccess, type ApiSuccess } from './contracts'
import { mapRateLimitError } from './rateLimitError'

type JsonBody = Record<string, unknown> | unknown[]

export interface ApiRequestOptions
  extends Omit<RequestInit, 'body' | 'headers'> {
  accessToken?: string
  body?: BodyInit | JsonBody | null
  headers?: HeadersInit
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiSuccess<T>> {
  assertSpringRelativePath(path)

  const { accessToken, body, headers: headerValues, ...requestInit } = options
  const headers = new Headers(headerValues)
  headers.set('Accept', 'application/json')

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  let requestBody: BodyInit | null | undefined = body as BodyInit | null | undefined

  if (isJsonBody(body)) {
    headers.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(body)
  }

  let response: Response

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...requestInit,
      body: requestBody,
      credentials: requestInit.credentials ?? 'include',
      headers,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError({
        code: 'REQUEST_ABORTED',
        message: '요청이 취소되었습니다.',
        cause: error,
      })
    }

    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: '서버에 연결할 수 없습니다.',
      cause: error,
    })
  }

  if (response.status === 429) {
    throw await mapRateLimitError(response)
  }

  const payload = await parseEnvelope(response)

  if (isApiFailure(payload)) {
    throw new ApiClientError({
      code: payload.error.code,
      message: payload.error.message,
      status: response.status,
      details: payload.error.details,
      traceId: payload.traceId,
      timestamp: payload.timestamp,
    })
  }

  if (!response.ok || !isApiSuccess<T>(payload)) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: '서버 응답이 공통 API 계약과 일치하지 않습니다.',
      status: response.status,
    })
  }

  return payload
}

function assertSpringRelativePath(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new ApiClientError({
      code: 'INVALID_API_PATH',
      message: 'API 경로는 Spring 기준의 /로 시작하는 상대 경로여야 합니다.',
    })
  }
}

function isJsonBody(body: ApiRequestOptions['body']): body is JsonBody {
  if (Array.isArray(body)) {
    return true
  }

  if (body === null || typeof body !== 'object') {
    return false
  }

  return (
    !(body instanceof Blob) &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams) &&
    !(body instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(body)
  )
}

async function parseEnvelope(response: Response): Promise<unknown> {
  const text = await response.text()

  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new ApiClientError({
      code: 'INVALID_RESPONSE',
      message: '서버가 유효한 JSON 응답을 반환하지 않았습니다.',
      status: response.status,
      cause: error,
    })
  }
}
