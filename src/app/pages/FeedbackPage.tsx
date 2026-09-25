import { useMemo, useState, type FormEvent } from 'react'

import { useAuth } from '../../features/auth'
import { createFeedbackRepository, type FeedbackCategory } from '../../features/feedback'
import { getRequestErrorMessage } from '../../shared/api'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Button, PageContainer, PageHeader, Select, useToast } from '../../shared/ui'

export function FeedbackPage() {
  usePageTitle('피드백')
  const { apiRequest } = useAuth()
  const { show: showToast } = useToast()
  const repository = useMemo(() => createFeedbackRepository(apiRequest), [apiRequest])
  const [category, setCategory] = useState<FeedbackCategory>('GENERAL')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!message.trim() || isSubmitting) return

    setIsSubmitting(true)
    try {
      await repository.create({
        category,
        message: message.trim(),
        pageUrl: window.location.href,
      })
      setMessage('')
      showToast('피드백을 보냈습니다.', 'success')
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader title="피드백" />
      <form className="max-w-2xl" onSubmit={submitFeedback}>
        <p className="type-body text-stone-500">
          서비스 이용 중 발견한 문제나 의견을 보내주세요.
        </p>
        <label className="mt-5 block type-control font-semibold text-stone-800">
          분류
          <Select
            className="mt-1.5 w-full"
            onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
            value={category}
          >
            <option value="GENERAL">일반 문의</option>
            <option value="BUG">오류 신고</option>
            <option value="FEATURE_REQUEST">기능 제안</option>
          </Select>
        </label>
        <label className="mt-4 block type-control font-semibold text-stone-800">
          내용
          <textarea
            className="mt-1.5 min-h-40 w-full resize-y rounded-lg border border-stone-300 px-3 py-2.5 type-body text-stone-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            maxLength={2000}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="의견이나 문제 상황을 입력해 주세요."
            required
            value={message}
          />
        </label>
        <div className="mt-4 flex justify-end">
          <Button disabled={!message.trim() || isSubmitting} type="submit">
            {isSubmitting ? '전송 중' : '보내기'}
          </Button>
        </div>
      </form>
    </PageContainer>
  )
}
