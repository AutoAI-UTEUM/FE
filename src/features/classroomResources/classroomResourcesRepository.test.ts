import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRawRequest, AuthenticatedRequest } from '../auth'
import { createClassroomResourcesRepository } from './classroomResourcesRepository'

describe('classroomResourcesRepository', () => {
  it('connects resource list, link creation, update, delete, and file download', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(success({
        items: [resourceDto],
        page: 0,
        size: 100,
        totalElements: 1,
        totalPages: 1,
      }))
      .mockResolvedValueOnce(success(resourceDto))
      .mockResolvedValueOnce(success({ ...resourceDto, title: '수정 자료' }))
      .mockResolvedValueOnce(success(null))
    const rawRequest = vi.fn().mockResolvedValue(new Response('file'))
    const repository = createClassroomResourcesRepository(
      request as AuthenticatedRequest,
      rawRequest as AuthenticatedRawRequest,
    )

    await expect(repository.list('12')).resolves.toEqual([
      expect.objectContaining({ id: '31', title: '참고 자료', type: 'LINK' }),
    ])
    await repository.create('12', {
      title: '참고 자료',
      type: 'LINK',
      url: 'https://example.com',
      weekNumber: 2,
    })
    await repository.update('31', { title: '수정 자료', weekNumber: null })
    await repository.delete('31')
    await expect(repository.getFile('31')).resolves.toBeInstanceOf(Blob)

    expect(request).toHaveBeenNthCalledWith(1, '/api/classrooms/12/resources?page=0&size=100', { signal: undefined })
    expect(request).toHaveBeenNthCalledWith(2, '/api/classrooms/12/resources', {
      body: { title: '참고 자료', url: 'https://example.com', weekNumber: 2 },
      method: 'POST',
      signal: undefined,
    })
    expect(request).toHaveBeenNthCalledWith(3, '/api/resources/31', {
      body: {
        title: '수정 자료',
        titlePresent: true,
        weekNumber: null,
        weekNumberPresent: true,
      },
      method: 'PATCH',
      signal: undefined,
    })
    expect(request).toHaveBeenNthCalledWith(4, '/api/resources/31', {
      method: 'DELETE',
      signal: undefined,
    })
    expect(rawRequest).toHaveBeenCalledWith('/api/resources/31/file', { signal: undefined })
  })

  it('uploads a file as multipart form data', async () => {
    const request = vi.fn().mockResolvedValue(success({
      ...resourceDto,
      contentType: 'image/png',
      fileName: 'diagram.png',
      type: 'FILE',
      url: null,
    }))
    const repository = createClassroomResourcesRepository(request as AuthenticatedRequest)
    const file = new File(['image'], 'diagram.png', { type: 'image/png' })

    await repository.create('12', {
      file,
      title: '구조도',
      type: 'FILE',
      weekNumber: 3,
    })

    const options = request.mock.calls[0]?.[1] as { body: FormData; method: string }
    expect(request.mock.calls[0]?.[0]).toBe('/api/classrooms/12/resources')
    expect(options.method).toBe('POST')
    expect(options.body.get('file')).toBe(file)
    expect(options.body.get('title')).toBe('구조도')
    expect(options.body.get('weekNumber')).toBe('3')
  })
})

const resourceDto = {
  contentType: null,
  createdAt: '2026-08-25T01:00:00Z',
  fileName: null,
  resourceId: 31,
  sizeBytes: null,
  title: '참고 자료',
  type: 'LINK',
  url: 'https://example.com',
  weekNumber: 2,
}

function success<T>(data: T) {
  return { data, message: '요청 성공', success: true as const }
}
