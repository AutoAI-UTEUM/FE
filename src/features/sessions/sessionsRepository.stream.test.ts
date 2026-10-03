import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRawRequest, AuthenticatedRequest } from '../auth'
import { createSessionsRepository } from './sessionsRepository'

describe('sessionsRepository stream errors', () => {
  it('preserves the structured terminal error contract', async () => {
    const request = vi.fn() as unknown as AuthenticatedRequest
    const rawRequest = vi.fn().mockResolvedValue(new Response([
      'event: error',
      'data: {"code":"TURN_CANCELLED","category":"INTERNAL","message":"답변 생성이 중단되었습니다.","retryable":false,"traceId":"trace-cancel"}',
      '',
      '',
    ].join('\n'))) as unknown as AuthenticatedRawRequest
    const onError = vi.fn()

    await createSessionsRepository(request, rawRequest).stream('573', { onError })

    expect(onError).toHaveBeenCalledExactlyOnceWith({
      category: 'INTERNAL',
      code: 'TURN_CANCELLED',
      message: '답변 생성이 중단되었습니다.',
      retryable: false,
      traceId: 'trace-cancel',
    })
  })
})
