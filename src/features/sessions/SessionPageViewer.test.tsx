import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SessionPageViewer } from './SessionPageViewer'

afterEach(cleanup)

describe('SessionPageViewer', () => {
  it('toggles the outline and exposes bounded page controls', () => {
    const onMovePage = vi.fn()
    render(
      <SessionPageViewer
        currentPage={1}
        file={undefined}
        materialTitle="학습 자료.pdf"
        onMovePage={onMovePage}
        totalPages={3}
      />,
    )

    const outlineButton = screen.getByRole('button', { name: '목차' })
    expect(outlineButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('navigation', { name: '자료 페이지' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /형광펜/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '높이 맞춤' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '너비 맞춤' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '이전 (사용 불가)' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(onMovePage).toHaveBeenCalledWith(2)

    fireEvent.click(outlineButton)

    expect(outlineButton).toHaveAttribute('aria-pressed', 'true')
    const pageOutline = screen.getByRole('navigation', { name: '자료 페이지' })
    expect(pageOutline).toBeInTheDocument()
    expect(pageOutline).toHaveClass('[scrollbar-gutter:stable]')
    expect(pageOutline.parentElement).toHaveClass('grid-cols-[144px_minmax(0,1fr)]')

    fireEvent.click(screen.getByRole('button', { name: '너비 맞춤' }))
    expect(screen.getByRole('button', { name: '너비 맞춤' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reopens the resource list from the viewer toolbar', () => {
    const onOpenResources = vi.fn()
    render(
      <MemoryRouter>
        <SessionPageViewer
          backTo="/classrooms/12"
          currentPage={1}
          file={undefined}
          onMovePage={vi.fn()}
          onOpenResources={onOpenResources}
          totalPages={3}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '주차 페이지로' })).toHaveAttribute('href', '/classrooms/12')
    expect(screen.getByRole('link', { name: '주차 페이지로' })).not.toHaveTextContent('주차 페이지로')
    fireEvent.click(screen.getByRole('button', { name: '자료 목록' }))
    expect(onOpenResources).toHaveBeenCalledOnce()
  })

  it('moves pages with arrow keys and zooms with control-wheel', () => {
    const onMovePage = vi.fn()
    render(
      <SessionPageViewer
        currentPage={2}
        file={undefined}
        materialTitle="학습 자료.pdf"
        onMovePage={onMovePage}
        totalPages={3}
      />,
    )

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    expect(onMovePage).toHaveBeenNthCalledWith(1, 3)
    expect(onMovePage).toHaveBeenNthCalledWith(2, 1)

    fireEvent.wheel(screen.getByRole('region', { name: 'PDF 뷰어' }), {
      ctrlKey: true,
      deltaY: -100,
    })
    expect(screen.getByText('110%')).toBeInTheDocument()
  })

  it('allows an enlarged PDF to be dragged in both directions', async () => {
    render(
      <SessionPageViewer
        currentPage={1}
        file={new Blob(['%PDF-1.4'], { type: 'application/pdf' })}
        materialTitle="학습 자료.pdf"
        onMovePage={vi.fn()}
        totalPages={1}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '확대' }))
    const panArea = await screen.findByLabelText('확대된 PDF 이동 영역')
    expect(panArea).toHaveClass('cursor-grab', 'overflow-auto')

    Object.defineProperty(panArea, 'scrollLeft', { configurable: true, value: 80, writable: true })
    Object.defineProperty(panArea, 'scrollTop', { configurable: true, value: 60, writable: true })
    fireEvent.pointerDown(panArea, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(panArea, { clientX: 70, clientY: 75, pointerId: 1 })
    expect(panArea).toHaveProperty('scrollLeft', 110)
    expect(panArea).toHaveProperty('scrollTop', 85)
    fireEvent.pointerUp(panArea, { pointerId: 1 })
  })

  it('locks page and classroom navigation while an AI answer is pending', () => {
    const onMovePage = vi.fn()
    render(
      <MemoryRouter>
        <SessionPageViewer
          backTo="/classrooms/12"
          currentPage={2}
          file={undefined}
          isPending
          onMovePage={onMovePage}
          totalPages={3}
        />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link', { name: '주차 페이지로' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주차 페이지로 (AI 답변 생성 중 이동 불가)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '이전 (사용 불가)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음 (사용 불가)' })).toBeDisabled()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.click(screen.getByRole('button', { name: '목차' }))
    expect(screen.getByRole('button', { name: '1쪽으로 이동' })).toBeDisabled()
    expect(onMovePage).not.toHaveBeenCalled()
  })
})
