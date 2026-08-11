import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NoticeContentPanel } from './ClassroomContentPanels'

afterEach(cleanup)

describe('NoticeContentPanel', () => {
  it('sends the selected week and immediate publishing fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<NoticeContentPanel disabled={false} notice={null} onClose={vi.fn()} onSave={onSave} weekNumber={3} />)

    fireEvent.change(screen.getByLabelText('공지 제목'), { target: { value: '3주차 안내' } })
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '수업 자료를 확인하세요.' } })
    fireEvent.click(screen.getByRole('button', { name: '공지 게시' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      content: '수업 자료를 확인하세요.',
      publishAt: null,
      title: '3주차 안내',
      weekNumber: 3,
    }, undefined))
  })

  it('converts a future local reservation time to an ISO timestamp', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<NoticeContentPanel disabled={false} notice={null} onClose={vi.fn()} onSave={onSave} weekNumber={null} />)

    fireEvent.change(screen.getByLabelText('공지 제목'), { target: { value: '전체 안내' } })
    fireEvent.change(screen.getByLabelText('본문'), { target: { value: '예약 공지입니다.' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 게시' }))
    fireEvent.change(screen.getByLabelText('예약 공개 시각'), { target: { value: '2099-08-12T09:30' } })
    fireEvent.click(screen.getByRole('button', { name: '예약 등록' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      content: '예약 공지입니다.',
      publishAt: new Date('2099-08-12T09:30').toISOString(),
      title: '전체 안내',
      weekNumber: null,
    }, undefined))
  })
})
