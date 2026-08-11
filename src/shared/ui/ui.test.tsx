import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  MarkdownEditor,
  PageContainer,
  PageHeader,
  TextInput,
} from './index'

describe('shared ui', () => {
  it('renders button variants and disabled state', () => {
    render(
      <Button type="button" disabled variant="secondary">
        저장 준비 중
      </Button>,
    )

    expect(screen.getByRole('button', { name: '저장 준비 중' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '저장 준비 중' })).toHaveClass('type-body')
  })

  it('renders button links with router navigation', () => {
    render(
      <MemoryRouter>
        <ButtonLink to="/materials">자료 화면으로</ButtonLink>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '자료 화면으로' })).toHaveAttribute(
      'href',
      '/materials',
    )
  })

  it('renders empty state action content', () => {
    render(
      <EmptyState
        title="등록된 자료가 없습니다."
        description="자료 API 연결 전까지 빈 상태를 표시합니다."
        action={<Button>업로드 준비 중</Button>}
      />,
    )

    expect(screen.getByRole('heading', { name: '등록된 자료가 없습니다.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '업로드 준비 중' })).toBeInTheDocument()
  })

  it('applies the shared page layout spacing', () => {
    render(
      <PageContainer data-testid="page-container">
        <h1>페이지 제목</h1>
      </PageContainer>,
    )

    expect(screen.getByTestId('page-container')).toHaveClass(
      'w-full',
      'space-y-5',
    )
  })

  it('renders error state as an alert', () => {
    render(
      <ErrorState
        title="요청을 처리할 수 없습니다."
        description="잠시 후 다시 시도하세요."
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('요청을 처리할 수 없습니다.')
  })

  it('connects text input labels and descriptions', () => {
    render(
      <TextInput
        id="email"
        label="이메일"
        description="로그인에 사용할 이메일입니다."
        placeholder="user@example.com"
      />,
    )

    expect(screen.getByLabelText('이메일')).toHaveAttribute('aria-describedby', 'email-description')
    expect(screen.getByLabelText('이메일')).toHaveClass('type-body')
    expect(screen.getByText('로그인에 사용할 이메일입니다.')).toHaveClass('type-caption')
  })

  it('uses the page title typography for shared page headers', () => {
    render(<PageHeader title="내 강의실" />)

    expect(screen.getByRole('heading', { name: '내 강의실' })).toHaveClass('type-page-title')
    expect(screen.getByRole('heading', { name: '내 강의실' }).closest('header')).toHaveClass('sm:items-start')
  })

  it('previews markdown while preserving the editable source', () => {
    const onChange = vi.fn()
    const { container } = render(<MarkdownEditor onChange={onChange} value="# 공지 안내" />)

    expect(container.querySelector('textarea')).toHaveValue('# 공지 안내')
    fireEvent.click(container.querySelector('button[aria-pressed="false"]') as HTMLButtonElement)

    expect(container.querySelector('h1')).toHaveTextContent('공지 안내')
    expect(container.querySelector('textarea')).not.toBeInTheDocument()
  })
})
