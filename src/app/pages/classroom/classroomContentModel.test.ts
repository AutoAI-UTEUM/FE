import { describe, expect, it } from 'vitest'

import type { ClassroomNotice, ClassroomWeek } from '../../../features/classrooms'
import type { Exam } from '../../../features/exams'
import { buildClassroomContent, filterClassroomContent, getGlobalClassroomContent } from './classroomContentModel'

describe('classroomContentModel', () => {
  it('combines content by week and sorts it by the latest timestamp', () => {
    const items = buildClassroomContent([weekFixture], [noticeFixture], [examFixture])

    expect(items.map((item) => item.id)).toEqual(['exam-30', 'notice-20', 'material-10'])
    expect(filterClassroomContent(items, 2, 'all').map((item) => item.kind)).toEqual(['exam', 'notice', 'material'])
  })

  it('keeps notices and exams without a week in the global section', () => {
    const items = buildClassroomContent([], [{ ...noticeFixture, weekNumber: null }], [{ ...examFixture, weekNumber: undefined }])

    expect(getGlobalClassroomContent(items, 'all').map((item) => item.kind)).toEqual(['exam', 'notice'])
    expect(filterClassroomContent(items, null, 'notice').map((item) => item.kind)).toEqual([])
  })

  it('sorts all week content by fixed week number before its timestamp', () => {
    const firstWeek: ClassroomWeek = {
      ...weekFixture,
      displayOrder: 1,
      id: '1',
      materials: [{
        id: '11',
        status: 'READY',
        title: '최근 업로드.pdf',
        uploadedAt: '2026-08-10T00:00:00Z',
      }],
      title: '첫 번째 주차',
      weekNumber: 1,
    }
    const thirdWeek: ClassroomWeek = {
      ...weekFixture,
      displayOrder: 3,
      id: '3',
      materials: [{
        id: '13',
        status: 'READY',
        title: '이전 업로드.pdf',
        uploadedAt: '2026-08-01T00:00:00Z',
      }],
      title: '세 번째 주차',
      weekNumber: 3,
    }

    const items = buildClassroomContent([firstWeek, thirdWeek], [], [])

    expect(filterClassroomContent(items, null, 'all').map((item) => item.id)).toEqual([
      'material-11',
      'material-13',
    ])
  })

  it('separates generated lessons from uploaded resources', () => {
    const items = buildClassroomContent([weekFixture], [], [], [{
      id: 'resource-1',
      source: { kind: 'link', url: 'https://uteum.com' },
      title: '참고 링크',
      uploadedAt: '2026-08-02T00:00:00Z',
      weekNumber: 2,
    }])

    expect(filterClassroomContent(items, 2, 'material').map((item) => item.title)).toEqual(['자료.pdf'])
    expect(filterClassroomContent(items, 2, 'resource').map((item) => item.title)).toEqual(['참고 링크'])
  })
})

const weekFixture: ClassroomWeek = {
  displayOrder: 2,
  id: '2',
  materials: [{ id: '10', status: 'READY', title: '자료.pdf', uploadedAt: '2026-08-01T00:00:00Z' }],
  status: 'PUBLISHED',
  title: '두 번째 주차',
  weekNumber: 2,
}

const noticeFixture: ClassroomNotice = {
  classroomId: '1',
  content: '내용',
  createdAt: '2026-08-01T00:00:00Z',
  id: '20',
  publishAt: null,
  published: true,
  publishedAt: '2026-08-02T00:00:00Z',
  title: '공지',
  updatedAt: '2026-08-02T00:00:00Z',
  weekNumber: 2,
}

const examFixture: Exam = {
  allowRetake: false,
  classroomId: '1',
  createdAt: '2026-08-03T00:00:00Z',
  id: '30',
  questionCount: 0,
  questions: [],
  status: 'DRAFT',
  title: '시험',
  totalScore: 0,
  weekNumber: 2,
}
