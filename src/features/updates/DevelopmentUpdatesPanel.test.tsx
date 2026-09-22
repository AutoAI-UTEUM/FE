import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DevelopmentUpdatesPanel } from './DevelopmentUpdatesPanel'

afterEach(() => {
  cleanup()
})

describe('DevelopmentUpdatesPanel', () => {
  it('shows only the selected date updates in one scrollable list without developer names', async () => {
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
    expect(screen.queryByText('fix: 로그인 화면 정리')).not.toBeInTheDocument()
    const calendar = screen.getByRole('group', { name: '2026년 8월 업데이트 달력' })
    expect(within(calendar).getAllByRole('button', { name: /업데이트/ })[0]).toHaveClass('h-[5.75rem]')
    expect(screen.getByRole('heading', { name: '8월 26일 배포' })).toBeInTheDocument()
    expect(screen.getByLabelText('개발 파트')).toBeInTheDocument()
    expect(screen.queryByText('AI·BE·FE 공개 개발 현황')).not.toBeInTheDocument()
    expect(screen.queryByText('BE 개발자')).not.toBeInTheDocument()
    expect(screen.queryByText('FE 개발자')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '업데이트' })).toHaveClass('xl:overflow-hidden')
    expect(screen.getByRole('complementary', { name: '월별 업데이트 목록' })).toHaveClass('overflow-hidden', 'max-h-[32rem]', 'xl:h-full')
    expect(screen.getByRole('region', { name: '업데이트 기록' })).toHaveClass('overflow-y-auto', 'overscroll-contain')

    fireEvent.click(screen.getByRole('button', { name: '2026년 8월 25일, 업데이트 1건' }))
    expect(screen.getByRole('heading', { name: '8월 25일 배포' })).toBeInTheDocument()
    expect(screen.getByText('fix: 로그인 화면 정리')).toBeInTheDocument()
    expect(screen.queryByText('feat: 리포트 API 추가')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('개발 파트'), { target: { value: 'FE' } })
    expect(screen.queryByText('feat: 리포트 API 추가')).not.toBeInTheDocument()
    expect(screen.getByText('feat: 업데이트 화면 추가')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('개발 파트'), { target: { value: 'AI_BE' } })
    expect(screen.getByText('feat: 리포트 API 추가')).toBeInTheDocument()
    expect(screen.queryByText('feat: 업데이트 화면 추가')).not.toBeInTheDocument()
    await waitFor(() => expect(loadMonth).toHaveBeenCalledWith(2026, 7))
  })
})
