import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from './ApiClientError'
import { apiRequest } from './apiClient'

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080/')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns a successful common envelope', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        data: { status: 'UP' },
        message: '정상',
      }),
    )

    await expect(apiRequest<{ status: string }>('/api/health')).resolves.toEqual({
      success: true,
      data: { status: 'UP' },
      message: '정상',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/api/health',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('serializes JSON and adds an optional bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, data: {}, message: '정상' }),
    )

    await apiRequest('/api/example', {
      method: 'POST',
      accessToken: 'access-token',
      body: { value: 1 },
    })

    const init = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer access-token')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe('{"value":1}')
  })

  it('lets the browser add the multipart boundary for FormData requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, data: {}, message: '정상' }),
    )
    const body = new FormData()
    body.append('file', new File(['%PDF-test'], 'material.pdf', { type: 'application/pdf' }))
    body.append('title', 'material.pdf')

    await apiRequest('/api/materials', { body, method: 'POST' })

    const init = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.has('Content-Type')).toBe(false)
    expect(init?.body).toBe(body)
  })

  it('preserves backend error details and traceId', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: '입력값을 확인해 주세요.',
            details: [{ field: 'email' }],
          },
          traceId: 'trace-123',
          timestamp: '2026-07-22T00:00:00Z',
        },
        400,
      ),
    )

    const error = await captureError(apiRequest('/api/example'))
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 400,
      traceId: 'trace-123',
      details: [{ field: 'email' }],
    })
  })

  it('normalizes network failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('failed'))

    await expect(apiRequest('/api/example')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: null,
    })
  })

  it('rejects non-JSON responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>error</html>', { status: 502 }),
    )

    await expect(apiRequest('/api/example')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      status: 502,
    })
  })

  it('maps non-JSON rate limit responses before parsing the response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>too many requests</html>', { status: 429 }),
    )

    await expect(apiRequest('/api/example')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: '요청이 많아요, 잠시 후 다시 시도해 주세요.',
      status: 429,
    })
  })

  it.each(['https://ai.example.com/internal/ai/turn', '//localhost:8000/internal/ai/turn']) (
    'rejects absolute or protocol-relative paths: %s',
    async (path) => {
      await expect(apiRequest(path)).rejects.toMatchObject({
        code: 'INVALID_API_PATH',
      })
    },
  )
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function captureError(promise: Promise<unknown>): Promise<ApiClientError> {
  try {
    await promise
    throw new Error('Expected request to reject')
  } catch (error) {
    return error as ApiClientError
  }
}
