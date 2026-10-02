// List contracts intentionally omit classroomId, questions, and questionCount.
// BE f319394: StudentExamListItemResponse and InstructorExamListItemResponse.
export const learnerExamListItem = {
  allowRetake: true,
  closedAt: null,
  description: '개념 이해를 확인합니다.',
  dueAt: null,
  examId: 30,
  latestSubmission: {
    attemptNo: 2,
    maxScore: 200,
    normalizedScore: 5,
    score: 10,
    status: 'GRADED' as const,
    submissionId: 301,
  },
  publishedAt: '2026-08-02T00:00:00Z',
  status: 'PUBLISHED' as const,
  submittable: true,
  title: '자료구조 확인 시험',
  totalScore: 200,
  weekNumber: 2,
}

export const instructorExamListItem = {
  allowRetake: false,
  closedAt: null,
  createdAt: '2026-08-01T00:00:00Z',
  description: null,
  dueAt: null,
  examId: 31,
  publishedAt: null,
  status: 'DRAFT' as const,
  submissionCount: 0,
  title: '알고리즘 중간 시험',
  totalScore: 20,
  updatedAt: '2026-08-03T00:00:00Z',
  weekNumber: 2,
}
