import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DevelopmentUpdatesPanel } from './DevelopmentUpdatesPanel'

afterEach(() => {
  cleanup()
})

describe('DevelopmentUpdatesPanel', () => {
  it('shows monthly updates in a calendar and opens the selected date details', async () => {
    const loadMonth = vi.fn().mockResolvedValue({
      availableParts: ['BE', 'FE'],
      repositoryUrls: {},
      updates: [
        {
          author: 'BE 개발자',
          committedAt: '2026-08-26T01:00:00Z',
          date: '2026-08-26',
          message: 'feat: 리포트 API 추가',
          part: 'BE',
          repositoryName: 'BE',
          sha: 'abcdef1',
          url: 'https://github.com/be-commit',
        },
        {
          author: 'FE 개발자',
          committedAt: '2026-08-26T02:00:00Z',
          date: '2026-08-26',
          message: 'feat: 업데이트 화면 추가',
          part: 'FE',
          repositoryName: 'FE',
          sha: '123456a',
          url: 'https://github.com/fe-commit',
        },
        {
          author: 'FE 개발자',
          committedAt: '2026-08-25T02:00:00Z',
          date: '2026-08-25',
          message: 'fix: 로그인 화면 정리',
          part: 'FE',
          repositoryName: 'FE',
          sha: '765432b',
          url: 'https://github.com/fe-login-commit',
        },
      ],
    })

    render(
      <DevelopmentUpdatesPanel
        initialDate={new Date('2026-08-26T09:00:00+09:00')}
        repository={{ loadMonth }}
      />,
    )

    expect(await screen.findByText('feat: 리포트 API 추가')).toBeInTheDocument()
    expect(screen.getByText('feat: 업데이트 화면 추가')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: '2026년 8월 업데이트 달력' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '8월 26일' })).toBeInTheDocument()
    expect(screen.getByText('수요일')).toBeInTheDocument()
    expect(screen.getAllByText('2건')).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('gridcell', { name: '2026년 8월 25일, 업데이트 1건' }))
    expect(screen.getByRole('heading', { name: '8월 25일' })).toBeInTheDocument()
    expect(screen.getByText('fix: 로그인 화면 정리')).toBeInTheDocument()
    expect(screen.queryByText('feat: 리포트 API 추가')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'FE' }))
    expect(screen.queryByText('feat: 리포트 API 추가')).not.toBeInTheDocument()
    expect(screen.getByText('feat: 업데이트 화면 추가')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect(screen.getByText('AI 공개 저장소 활동을 확인할 수 없습니다.')).toBeInTheDocument()
    await waitFor(() => expect(loadMonth).toHaveBeenCalledWith(2026, 7))
  })
})
