import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorState,
  MarkdownEditor,
  MarkdownContent,
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
      'app-page-frame',
      'space-y-5',
    )
    expect(screen.getByTestId('page-container')).toHaveAttribute(
      'data-page-container',
      'standard',
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

  it('inserts headings from the markdown editor toolbar', () => {
    const onChange = vi.fn()
    const { container } = render(<MarkdownEditor onChange={onChange} value="노트 제목" />)

    fireEvent.click(within(container).getByRole('button', { name: '제목 1' }))

    expect(onChange).toHaveBeenCalledWith('# 노트 제목')
  })

  it('renders note toggle blocks without enabling raw html', () => {
    render(<MarkdownContent content={':::toggle 추가 설명\n**세부 내용**\n:::'} />)

    expect(screen.getByText('추가 설명').closest('summary')).toBeInTheDocument()
    expect(screen.getByText('세부 내용').tagName).toBe('STRONG')
  })

  it('renders strong emphasis when AI wraps Korean text and quotes together', () => {
    render(<MarkdownContent content={'최적화는 **“제약 안에서 목적 함수를 찾는 수학 용어”**입니다.'} />)

    const emphasized = screen.getByText('제약 안에서 목적 함수를 찾는 수학 용어')
    expect(emphasized.tagName).toBe('STRONG')
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
  })

  it('hides an unfinished strong delimiter while an answer is streaming', () => {
    render(<MarkdownContent content="응답을 **작성하는 중" isStreaming />)

    expect(screen.getByText('응답을 작성하는 중')).toBeInTheDocument()
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
  })

  it('turns overview page ranges into page navigation controls', () => {
    const onPageReferenceClick = vi.fn()
    render(
      <MarkdownContent
        content={'- 기초 개념 p.4–11\n- 심화 개념 p.12-15\n- `코드 p.20-21`'}
        onPageReferenceClick={onPageReferenceClick}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'p.4–11' }))
    fireEvent.click(screen.getByRole('button', { name: 'p.12-15' }))

    expect(onPageReferenceClick).toHaveBeenNthCalledWith(1, 4)
    expect(onPageReferenceClick).toHaveBeenNthCalledWith(2, 12)
    expect(screen.queryByRole('button', { name: 'p.20-21' })).not.toBeInTheDocument()
  })
})
