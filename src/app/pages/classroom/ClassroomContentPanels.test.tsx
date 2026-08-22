import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NoticeContentPanel, NoticeDetailPanel } from './ClassroomContentPanels'

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

describe('NoticeDetailPanel', () => {
  it('renders markdown and enters edit mode only from the edit button', () => {
    const onEdit = vi.fn()
    render(
      <NoticeDetailPanel
        canEdit
        notice={noticeFixture}
        onClose={vi.fn()}
        onEdit={onEdit}
      />,
    )

    expect(screen.getByRole('heading', { name: '수업 준비 안내' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '준비물' })).toBeInTheDocument()
    expect(screen.getByText('노트북')).toBeInTheDocument()
    expect(screen.queryByLabelText('공지 제목')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '편집하기' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('hides the edit action when the notice is read-only', () => {
    render(
      <NoticeDetailPanel
        canEdit={false}
        notice={noticeFixture}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '편집하기' })).not.toBeInTheDocument()
  })
})

const noticeFixture = {
  classroomId: '12',
  content: '## 준비물\n\n- 노트북\n- 필기구',
  createdAt: '2026-08-01T00:00:00Z',
  id: '20',
  publishAt: null,
  published: true,
  publishedAt: '2026-08-02T00:00:00Z',
  title: '수업 준비 안내',
  updatedAt: '2026-08-02T00:00:00Z',
  weekNumber: null,
}
