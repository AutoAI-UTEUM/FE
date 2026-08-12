import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rawApiRequest } from './rawApiClient'

describe('rawApiRequest', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('returns binary responses with bearer authentication', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'application/pdf' },
      }),
    )

    const response = await rawApiRequest('/api/materials/10/file', {
      accessToken: 'access-token',
    })

    expect(await response.blob()).toHaveProperty('size', 3)
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer access-token')
  })

  it('accepts an explicitly allowed readiness status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"status":"DOWN"}', { status: 503 }),
    )

    await expect(
      rawApiRequest('/api/health/ready', { acceptStatuses: [503] }),
    ).resolves.toHaveProperty('status', 503)
  })

  it('maps common backend failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'MATERIAL_NOT_FOUND',
            details: [],
            message: '자료를 찾을 수 없습니다.',
          },
          success: false,
        }),
        { status: 404 },
      ),
    )

    await expect(rawApiRequest('/api/materials/999/file')).rejects.toMatchObject(
      {
        code: 'MATERIAL_NOT_FOUND',
        status: 404,
      },
    )
  })

  it('maps non-JSON rate limit responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>too many requests</html>', { status: 429 }),
    )

    await expect(rawApiRequest('/api/materials')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      message: '요청이 많아요, 잠시 후 다시 시도해 주세요.',
      status: 429,
    })
  })
})
