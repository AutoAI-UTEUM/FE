import type { AuthenticatedRequest } from '../auth'

export type FeedbackCategory = 'BUG' | 'FEATURE_REQUEST' | 'GENERAL'

export function createFeedbackRepository(request: AuthenticatedRequest) {
  return {
    async create(input: { category: FeedbackCategory; message: string; pageUrl?: string }) {
      const { data } = await request<{ createdAt: string; feedbackId: number }>('/api/feedback', {
        body: { ...input, clientVersion: '0.1.0' },
        method: 'POST',
      })
      return data
    },
  }
}
