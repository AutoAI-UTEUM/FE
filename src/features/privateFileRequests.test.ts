import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rawApiRequest } from '../shared/api/rawApiClient'
import type { AuthenticatedRawRequest, AuthenticatedRequest } from './auth'
import { createClassroomResourcesRepository } from './classroomResources/classroomResourcesRepository'
import { createMaterialsRepository } from './materials/materialsRepository'

const fileRequests = [
  {
    accept: 'application/pdf, application/json',
    contentType: 'application/pdf',
    createRepository: createMaterialsRepository,
    name: 'material PDF',
    path: '/api/materials/id%2Fwith%20space/file',
  },
  {
    accept: null,
    contentType: 'application/octet-stream',
    createRepository: createClassroomResourcesRepository,
    name: 'classroom attachment',
    path: '/api/resources/id%2Fwith%20space/file',
  },
]

describe.each(fileRequests)('$name request', ({ accept, contentType, createRepository, path }) => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const createFileRepository = () => {
    const rawRequest: AuthenticatedRawRequest = (requestPath, options) => rawApiRequest(
      requestPath,
      { ...options, accessToken: 'synthetic-current-access-token' },
    )
    return createRepository(vi.fn() as AuthenticatedRequest, rawRequest)
  }

  it('forwards no-store to fetch while preserving the file and request context', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 0, 255])
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(bytes, { headers: { 'Content-Type': contentType } }),
    )
    const signal = new AbortController().signal

    const file = await createFileRepository().getFile('id/with space', signal)

    expect(file.type).toBe(contentType)
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `http://localhost:8080${path}`,
      expect.objectContaining({ cache: 'no-store', credentials: 'include', signal }),
    )
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer synthetic-current-access-token')
    expect(headers.get('Accept')).toBe(accept)
  })

  it.each([401, 403, 404])('preserves a fresh server denial with status %s', async (status) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        error: { code: 'FILE_ACCESS_DENIED', details: [], message: 'File unavailable.' },
        success: false,
      }), { status }),
    )

    await expect(createFileRepository().getFile('id/with space')).rejects.toMatchObject({
      code: 'FILE_ACCESS_DENIED',
      status,
    })
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store')
  })

  it('keeps caller cancellation and the raw-client abort error', async () => {
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, options) => {
      expect(options?.signal).toBe(controller.signal)
      controller.abort()
      throw new DOMException('Cancelled by caller', 'AbortError')
    })

    await expect(createFileRepository().getFile('id/with space', controller.signal)).rejects.toMatchObject({
      code: 'REQUEST_ABORTED',
    })
    expect(controller.signal.aborted).toBe(true)
    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store')
  })
})

it('keeps the PDF response content-type guard', async () => {
  const rawRequest = vi.fn().mockResolvedValue(
    new Response('<html>not a PDF</html>', { headers: { 'Content-Type': 'text/html' } }),
  )
  const repository = createMaterialsRepository(
    vi.fn() as AuthenticatedRequest,
    rawRequest as AuthenticatedRawRequest,
  )

  await expect(repository.getFile('10')).rejects.toMatchObject({
    code: 'INVALID_PDF_RESPONSE',
    status: 200,
  })
})
