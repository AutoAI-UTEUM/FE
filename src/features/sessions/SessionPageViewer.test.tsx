import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
      <SessionPageViewer
        currentPage={1}
        file={undefined}
        onMovePage={vi.fn()}
        onOpenResources={onOpenResources}
        totalPages={3}
      />,
    )

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
})
