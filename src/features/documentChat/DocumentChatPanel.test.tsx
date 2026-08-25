import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError, type ApiSuccess } from '../../shared/api'
import type { AuthenticatedRequest } from '../auth'
import { DocumentChatPanel } from './DocumentChatPanel'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DocumentChatPanel', () => {
  it('keeps FE history and sends the shared document chat contract', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(success({ answer: '**핵심 답변**입니다.', warnings: [] }))
      .mockResolvedValueOnce(success({
        answer: '앞선 대화를 이어서 설명합니다.',
        warnings: [{ message: '최근 문맥을 사용했습니다.', type: 'CONTEXT_TRUNCATED' }],
      }))
    render(
      <DocumentChatPanel
        materialId="10"
        mode="material"
        request={request as AuthenticatedRequest}
      />,
    )

    const input = screen.getByLabelText('자료 질문')
    fireEvent.change(input, { target: { value: '이 자료의 핵심은?' } })
    fireEvent.click(screen.getByRole('button', { name: '자료 질문 보내기' }))

    expect(await screen.findByText('핵심 답변')).toBeInTheDocument()
    expect(request).toHaveBeenNthCalledWith(1, '/api/materials/10/doc-chat', {
      body: { history: [], question: '이 자료의 핵심은?' },
      method: 'POST',
      signal: expect.any(AbortSignal),
    })

    fireEvent.change(input, { target: { value: '예시도 알려줘' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText('앞선 대화를 이어서 설명합니다.')).toBeInTheDocument()
    expect(screen.getByText('최근 문맥을 사용했습니다.')).toBeInTheDocument()
    expect(request).toHaveBeenNthCalledWith(2, '/api/materials/10/doc-chat', {
      body: {
        history: [
          { content: '이 자료의 핵심은?', role: 'USER' },
          { content: '**핵심 답변**입니다.', role: 'ASSISTANT' },
        ],
        question: '예시도 알려줘',
      },
      method: 'POST',
      signal: expect.any(AbortSignal),
    })
  })

  it('announces that quiz review is coming later and keeps its input disabled', () => {
    const request = vi.fn()
    render(
      <DocumentChatPanel
        materialId="10"
        mode="quiz"
        request={request as AuthenticatedRequest}
      />,
    )

    const input = screen.getByLabelText('퀴즈 복습 질문')
    expect(screen.getAllByText('추후 업데이트 예정')).toHaveLength(2)
    expect(screen.getByText('퀴즈 복습 기능을 준비 중입니다')).toBeInTheDocument()
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: '퀴즈 복습 기능 준비 중' })).toBeDisabled()
    expect(request).not.toHaveBeenCalled()
  })

  it('shows a specific processing error and allows the failed question to retry', async () => {
    const request = vi.fn().mockRejectedValue(new ApiClientError({
      code: 'MATERIAL_PROCESSING',
      message: '자료 처리 중',
      status: 409,
    }))
    render(
      <DocumentChatPanel
        materialId="10"
        mode="material"
        request={request as AuthenticatedRequest}
      />,
    )

    fireEvent.change(screen.getByLabelText('자료 질문'), { target: { value: '질문' } })
    fireEvent.click(screen.getByRole('button', { name: '자료 질문 보내기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('자료 처리가 끝난 뒤 질문할 수 있어요.')
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})

function success<T>(data: T): ApiSuccess<T> {
  return { data, message: '요청이 성공했습니다.', success: true }
}
