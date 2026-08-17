import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ClassroomContentPanel, ClassroomContentRail } from './ClassroomContentView'

const reorderedWeeks = [
  {
    displayOrder: 1,
    id: 'week-2',
    materials: [],
    status: 'PUBLISHED' as const,
    title: '심화',
    weekNumber: 2,
  },
  {
    displayOrder: 2,
    id: 'week-1',
    materials: [],
    status: 'PUBLISHED' as const,
    title: '기초',
    weekNumber: 1,
  },
]

afterEach(cleanup)

describe('ClassroomContentView week periods', () => {
  it('keeps periods aligned with the fixed week number', () => {
    render(
      <ClassroomContentRail
        endDate="2026-08-16"
        onSelect={vi.fn()}
        selectedWeekNumber={2}
        startDate="2026-08-03"
        weeks={reorderedWeeks}
      />,
    )

    const navigation = screen.getByRole('navigation', { name: '강의실 주차' })
    expect(within(navigation).getByText('심화').closest('button')).toHaveTextContent('8.10 - 8.16')
    expect(within(navigation).getByText('기초').closest('button')).toHaveTextContent('8.3 - 8.9')
  })

  it('uses the fixed week number for the selected content period', () => {
    render(
      <ClassroomContentPanel
        canManage={false}
        draggingWeek={null}
        endDate="2026-08-16"
        errors={{}}
        filter="all"
        globalItems={[]}
        isUploading={false}
        items={[]}
        onAdd={vi.fn()}
        onDrop={vi.fn()}
        onFilter={vi.fn()}
        onItem={vi.fn()}
        onRemoveMaterial={vi.fn()}
        onRenameMaterial={vi.fn()}
        onRetry={vi.fn()}
        openingMaterialId={null}
        processingMaterialTitle={null}
        selectedWeek={reorderedWeeks[0]}
        selectedWeekNumber={2}
        setDragging={vi.fn()}
        startDate="2026-08-03"
      />,
    )

    expect(screen.getByRole('heading', { name: '심화' }).parentElement).toHaveTextContent('8.10 - 8.16')
  })

  it('shows an upload processing row in place of the empty state', () => {
    render(
      <ClassroomContentPanel
        canManage
        draggingWeek={null}
        endDate="2026-08-16"
        errors={{}}
        filter="material"
        globalItems={[]}
        isUploading={false}
        items={[]}
        onAdd={vi.fn()}
        onDrop={vi.fn()}
        onFilter={vi.fn()}
        onItem={vi.fn()}
        onRemoveMaterial={vi.fn()}
        onRenameMaterial={vi.fn()}
        onRetry={vi.fn()}
        openingMaterialId={null}
        processingMaterialTitle="lecture.pdf"
        selectedWeek={reorderedWeeks[0]}
        selectedWeekNumber={2}
        setDragging={vi.fn()}
        startDate="2026-08-03"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('강의자료를 처리하는 중입니다')
    expect(screen.getByRole('status')).toHaveTextContent('lecture · 완료되면 목록에 표시됩니다.')
    expect(screen.queryByRole('heading', { name: '항목 없음' })).not.toBeInTheDocument()
  })
})
