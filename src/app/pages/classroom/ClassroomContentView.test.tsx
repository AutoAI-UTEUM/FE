import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ClassroomContentPanel, ClassroomContentRail } from './ClassroomContentView'
import type { ClassroomContentItem } from './classroomContentModel'

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
    expect(navigation).toHaveClass('lg:overflow-y-auto', 'min-h-0', 'px-1.5', 'py-3')
    expect(navigation.parentElement).toHaveClass('lg:h-full', 'lg:overflow-hidden')
    expect(within(navigation).getByText('심화').closest('button')).toHaveTextContent('8.10 - 8.16')
    expect(within(navigation).getByText('8.10 - 8.16')).toHaveClass('whitespace-nowrap', 'text-right')
    expect(within(navigation).getByText('기초').closest('button')).toHaveTextContent('8.3 - 8.9')
    expect(within(navigation).getByText('전체 항목').closest('button')).toHaveClass('h-9', 'min-h-9')
    expect(within(navigation).getByText('심화').closest('button')).toHaveClass('h-10')
  })

  it('uses the same menu-first layout for selected weeks', () => {
    render(
      <ClassroomContentPanel
        canManage={false}
        draggingWeek={null}
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
      />,
    )

    expect(screen.queryByRole('heading', { name: '심화' })).not.toBeInTheDocument()
    expect(screen.queryByText('8.10 - 8.16')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전체' })).toHaveClass('h-9', 'min-h-9', 'border-transparent')
    expect(screen.getByRole('button', { name: '전체' })).not.toHaveClass('border-brand-600')
    const resourceList = screen.getByRole('region', { name: '리소스 목록' })
    expect(resourceList).toHaveClass('lg:overflow-y-auto', 'space-y-2')
    expect(resourceList).not.toHaveClass('space-y-4')
    expect(resourceList).not.toHaveClass('lg:[scrollbar-gutter:stable]')
    expect(resourceList.parentElement).toHaveClass('lg:h-full', 'lg:overflow-hidden', 'p-3')
  })

  it('shows an upload processing row in place of the empty state', () => {
    render(
      <ClassroomContentPanel
        canManage
        draggingWeek={null}
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
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('수업을 생성하는 중입니다')
    expect(screen.getByRole('status')).toHaveTextContent('lecture · 완료되면 목록에 표시됩니다.')
    expect(screen.queryByRole('heading', { name: '항목 없음' })).not.toBeInTheDocument()
  })

  it('does not show the empty state when a global notice is visible', () => {
    render(
      <ClassroomContentPanel
        canManage
        draggingWeek={null}
        errors={{}}
        filter="notice"
        globalItems={[globalNotice, scheduledNotice]}
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
      />,
    )

    const resourceList = screen.getByRole('region', { name: '리소스 목록' })
    expect(screen.getByRole('button', { name: '수업 생성' })).toHaveClass('h-9', 'min-h-9')
    expect(screen.getByText('테스트 공지')).toBeInTheDocument()
    expect(screen.getByText('테스트 공지').closest('button')).toHaveClass('overflow-hidden')
    expect(screen.getByText('테스트 공지')).toHaveClass('min-w-0', 'max-w-full', 'truncate')
    const noticeButton = screen.getByText('테스트 공지').closest('button')
    const noticeRow = noticeButton?.parentElement
    expect(noticeRow).toHaveClass('h-11', 'min-h-11')
    expect(noticeRow?.firstElementChild).toHaveTextContent('공지')
    expect(noticeRow?.firstElementChild).toHaveClass('min-h-5', 'rounded-md', 'border', 'px-1.5', 'type-caption', 'font-semibold')
    expect(noticeRow?.firstElementChild?.querySelector('svg')).toBeNull()
    expect(noticeRow?.lastElementChild).toHaveClass('size-8', 'shrink-0', 'items-center', 'justify-center')
    expect(within(noticeButton!).queryByText('공지')).not.toBeInTheDocument()
    expect(within(resourceList).queryByText('게시됨')).not.toBeInTheDocument()
    expect(within(resourceList).getByText('예약')).toBeInTheDocument()
    expect(screen.queryByText('전체 항목')).not.toBeInTheDocument()
    expect(screen.getByText('테스트 공지').closest('details')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '항목 없음' })).not.toBeInTheDocument()
  })

  it('shows global items without a section label in the all filter', () => {
    render(
      <ClassroomContentPanel
        canManage
        draggingWeek={null}
        errors={{}}
        filter="all"
        globalItems={[globalNotice]}
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
        selectedWeekNumber={null}
        setDragging={vi.fn()}
      />,
    )

    expect(screen.queryByText('전체 항목')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '전체 콘텐츠' })).not.toBeInTheDocument()
    expect(screen.getByText('테스트 공지').closest('details')).not.toBeInTheDocument()
  })

  it('keeps only one material action menu open at a time', () => {
    render(
      <ClassroomContentPanel
        canManage
        draggingWeek={null}
        errors={{}}
        filter="material"
        globalItems={[]}
        isUploading={false}
        items={[firstMaterial, secondMaterial]}
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
      />,
    )

    const firstMenuButton = screen.getByRole('button', { name: '첫 번째 수업.pdf 작업 메뉴' })
    const secondMenuButton = screen.getByRole('button', { name: '두 번째 수업.pdf 작업 메뉴' })
    fireEvent.click(firstMenuButton)
    expect(firstMenuButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menu')).toHaveLength(1)

    fireEvent.click(secondMenuButton)
    expect(firstMenuButton).toHaveAttribute('aria-expanded', 'false')
    expect(secondMenuButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })
})

const firstMaterial: ClassroomContentItem = {
  id: 'material-10',
  kind: 'material',
  occurredAt: '2026-08-02T00:00:00Z',
  source: {
    id: '10',
    status: 'READY',
    title: '첫 번째 수업.pdf',
    uploadedAt: '2026-08-02T00:00:00Z',
  },
  title: '첫 번째 수업.pdf',
  weekNumber: 2,
  weekOrder: 2,
}

const secondMaterial: ClassroomContentItem = {
  ...firstMaterial,
  id: 'material-11',
  source: {
    ...firstMaterial.source,
    id: '11',
    title: '두 번째 수업.pdf',
  },
  title: '두 번째 수업.pdf',
}

const globalNotice: ClassroomContentItem = {
  id: 'notice-20',
  kind: 'notice',
  occurredAt: '2026-08-02T00:00:00Z',
  source: {
    classroomId: '1',
    content: '공지 내용',
    createdAt: '2026-08-01T00:00:00Z',
    id: '20',
    publishAt: null,
    published: true,
    publishedAt: '2026-08-02T00:00:00Z',
    title: '테스트 공지',
    updatedAt: '2026-08-02T00:00:00Z',
    weekNumber: null,
  },
  title: '테스트 공지',
  weekNumber: null,
  weekOrder: null,
}

const scheduledNotice: ClassroomContentItem = {
  ...globalNotice,
  id: 'notice-21',
  source: {
    ...globalNotice.source,
    id: '21',
    publishAt: '2026-08-10T00:00:00Z',
    published: false,
    publishedAt: '2026-08-02T00:00:00Z',
    title: '예약 공지',
  },
  title: '예약 공지',
}
