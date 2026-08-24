import { describe, expect, it, vi } from 'vitest'

import type { AuthenticatedRequest } from '../auth'
import { createDocumentChatRepository } from './documentChatRepository'

describe('documentChatRepository', () => {
  it.each([
    ['document', 'doc-chat'],
    ['quiz', 'quiz-chat'],
  ] as const)('posts %s questions with conversation history', async (mode, endpoint) => {
    const request = vi.fn(async () => ({
      data: {
        answer: 'answer',
        warnings: [{ message: '일부 문맥이 잘렸습니다.', type: 'CONTEXT_TRUNCATED' }],
      },
      timestamp: '',
      traceId: '',
    })) as unknown as AuthenticatedRequest
    const repository = createDocumentChatRepository(request)
    const history = [{ content: 'earlier', role: 'USER' as const }]

    await expect(repository.ask('material 1', mode, 'question', history)).resolves.toEqual({
      answer: 'answer',
      warnings: [{ message: '일부 문맥이 잘렸습니다.', type: 'CONTEXT_TRUNCATED' }],
    })
    expect(request).toHaveBeenCalledWith(
      `/api/materials/material%201/${endpoint}`,
      { body: { history, question: 'question' }, method: 'POST', signal: undefined },
    )
  })

  it('only sends the latest 50 history entries', async () => {
    const request = vi.fn(async () => ({ data: { answer: 'ok' } })) as unknown as AuthenticatedRequest
    const history = Array.from({ length: 55 }, (_, index) => ({ content: String(index), role: 'USER' as const }))
    await createDocumentChatRepository(request).ask('1', 'document', 'question', history)
    const options = (request as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(options.body.history).toHaveLength(50)
    expect(options.body.history[0].content).toBe('5')
  })
})
