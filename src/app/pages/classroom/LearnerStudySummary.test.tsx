import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import type { Classroom, ClassroomWeek } from '../../../features/classrooms'
import { LearnerStudySummary } from './LearnerStudySummary'

const classroom: Classroom = { id: '12', name: '수업', color: 'BLUE', status: 'ACTIVE', startDate: '2026-08-03', endDate: '2026-11-16', weekCount: 15, learnerCount: 2, instructorName: '교사', pendingRequestCount: 0, progressRate: 38, lastStudied: { sessionId: '100', materialId: '10', materialTitle: '기초 수업', pageNumber: 3, updatedAt: '2026-11-01T00:00:00Z' } }
const weeks: ClassroomWeek[] = [{ id: '1', title: '지난 주차', status: 'PUBLISHED', weekNumber: 1, displayOrder: 1, materials: [{ id: '10', title: '기초 수업', status: 'READY', uploadedAt: '2026-08-03T00:00:00Z' }] }]
afterEach(cleanup)

describe('learner study summary', () => {
  it('uses the existing server progress and resumes an accessible past week without creating a session', () => {
    render(<MemoryRouter><LearnerStudySummary classroom={classroom} weeks={weeks} /></MemoryRouter>)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '38')
    expect(screen.getByRole('link', { name: '하던 학습 계속하기' })).toHaveAttribute('href', '/sessions/100')
    expect(screen.getByText(/마지막 위치 3쪽/)).toBeInTheDocument()
  })

  it('hides continuation for unpublished or detached material and clamps invalid percentages', () => {
    const view = render(<MemoryRouter><LearnerStudySummary classroom={{ ...classroom, progressRate: 130 }} weeks={[]} /></MemoryRouter>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    view.rerender(<MemoryRouter><LearnerStudySummary classroom={classroom} weeks={[{ ...weeks[0], status: 'PRIVATE' }]} /></MemoryRouter>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
