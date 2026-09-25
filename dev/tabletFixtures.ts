// Browser-only demo data. Never registered in production or the unit-test API.
const now = '2026-09-19T01:00:00Z'
const classroom = { classroomId: 12, name: '자료구조', color: 'BLUE', description: '태블릿 검수용 강의실', instructorName: '테스트 강의자', startDate: '2026-09-01', endDate: '2026-12-31', weekCount: 16, learnerCount: 24, pendingRequestCount: 2, status: 'ACTIVE', progressRate: 45, inviteCode: 'TABLET-QA' }
const students = Array.from({ length: 24 }, (_, index) => ({ studentId: index + 1, name: `테스트 학습자 ${index + 1}`, email: `learner${index + 1}@example.com`, affiliation: '테스트 대학교', status: 'ACTIVE', joinedAt: now, lastActiveAt: now, averageProgressRate: 45 + index, aiQuestionCountLast7Days: index + 2, quizSubmissionCount: 2 }))
const questions = [
  { questionId: 'q1', questionType: 'SHORT', questionText: '자료를 순서대로 보관하는 구조를 설명하세요.', maxScore: 10, modelAnswer: '순차 자료구조', explanation: '순서와 접근 방법을 함께 확인합니다.' },
  { questionId: 'q2', questionType: 'MCQ', questionText: '먼저 들어온 항목이 먼저 나오는 구조는?', maxScore: 10, options: [{ optionId: 'a', text: '스택' }, { optionId: 'b', text: '큐' }], answerChoiceId: 'b', explanation: '큐는 FIFO입니다.' },
  { questionId: 'q3', questionType: 'ESSAY', questionText: '스택과 큐의 차이를 예시와 함께 설명하세요.', maxScore: 10, modelAnswer: '스택은 LIFO, 큐는 FIFO입니다.' },
]
const exam = { examId: 30, classroomId: 12, title: '자료구조 개념 확인', description: '테스트용 시험입니다.', status: 'PUBLISHED', allowRetake: false, submittable: true, questionCount: 3, questions, totalScore: 30, weekNumber: 2, createdAt: now, dueAt: '2026-12-31T14:59:00Z' }
const graded = { submissionId: 1, attemptNo: 1, status: 'GRADED', score: 20, maxScore: 30, normalizedScore: 66.7, submittedAt: now, startedAt: '2026-09-19T00:50:00Z', durationSeconds: 600, reviewAvailable: true, items: questions.map((q, index) => ({ questionId: q.questionId, answer: index === 1 ? 'a' : q.modelAnswer, correctAnswer: index === 1 ? { choiceId: 'b', text: '큐' } : q.modelAnswer, explanation: q.explanation, maxScore: 10, score: index === 1 ? 0 : 10, verdict: index === 1 ? 'WRONG' : 'CORRECT', feedback: '핵심 개념과 적용 상황을 함께 복습하세요.' })) }
const report = { reportId: '1', classroomId: 12, studentId: 1, studentName: '테스트 학습자 1', status: 'COMPLETED', version: 1, createdAt: now, overallScore: 75, summary: { overview: '질문과 퀴즈를 바탕으로 개념 이해 과정을 정리했습니다.', strengths: [{ content: '자료구조의 정의를 이해합니다.', evidenceIds: ['e1'] }], improvements: [{ content: '스택과 큐의 순서를 비교해 보세요.', evidenceIds: ['e1'] }], recommendedActions: [{ content: 'FIFO를 실제 사례와 연결해 복습하세요.', evidenceIds: ['e1'] }] }, criterionResults: [{ criterionKey: 'understanding', criterionName: '개념 이해', status: 'ASSESSED', score: 75, narrative: '핵심 정의를 알고 있으나 응용에 추가 연습이 필요합니다.', evidenceIds: ['e1'] }], evidence: [{ evidenceId: 'e1', publicLabel: '개념 확인 퀴즈', sourceType: 'QUIZ', occurredAt: now, fact: '3문항 중 2문항 정답', metrics: [{ label: '정답', value: '2 / 3' }] }] }
const notes = [{ noteId: 1, content: '# 자료구조 복습\n\n스택과 큐의 차이를 정리합니다.', pageNumber: 1 }]
const submissions = new Map<string, typeof graded>()
const notices = [{ noticeId: 1, classroomId: 12, title: '학습 안내', content: '2주차 개념을 학습하고 시험에 응시하세요.', createdAt: now, updatedAt: now, publishedAt: now, published: true, weekNumber: 2 }]
const success = (data: unknown) => Response.json({ success: true, data, message: 'Mock data' })
const page = (items: unknown[]) => success({ items, page: 0, size: 100, totalElements: items.length, totalPages: 1 })

export async function handleTabletFixture(request: Request, userKey: string): Promise<Response | undefined> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method
  if (path === '/api/classrooms' && method === 'GET') return page([classroom])
  if (path === '/api/classrooms/12' && method === 'GET') return success(classroom)
  if (path === '/api/classrooms/12/resources' && method === 'GET') return page([])
  if (path === '/api/classrooms/12/invite-code') return success({ inviteCode: classroom.inviteCode })
  if (path === '/api/classrooms/12' && method === 'PATCH') { Object.assign(classroom, await request.json()); return success(classroom) }
  if (/^\/api\/classrooms\/\d+\/students$/.test(path)) return page(students)
  if (path.endsWith('/learning-analytics')) return success({ lastUpdatedAt: now, materials: [{ materialId: 10, title: '자료구조', progressRate: 60, viewed: true, lastViewedAt: now, lastViewedPage: 3, weekNumber: 2 }], questionsByPage: [{ materialId: 10, materialTitle: '자료구조', pageNumber: 2, questionCount: 3, weekNumber: 2 }], quizzes: [{ quizId: 50, materialId: 10, materialTitle: '자료구조', title: '개념 확인', quizType: 'MCQ', score: 80, maxScore: 100, submitted: true, passed: true, submittedAt: now }] })
  if (path.endsWith('/join-requests') && method === 'GET') return page(url.searchParams.get('status') === 'PENDING' ? [{ requestId: 1, classroomId: 12, requestedAt: now, status: 'PENDING', learner: { userId: 25, name: '신규 학습자', email: 'new@example.com', affiliation: '테스트 대학교' } }] : [])
  if (path === '/api/classrooms/12/notices') {
    if (method === 'POST') { const value = { ...notices[0], ...await request.json() as Partial<typeof notices[number]>, noticeId: Date.now() }; notices.push(value); return success(value) }
    return page(notices)
  }
  if (path === '/api/classrooms/12/exams') {
    if (method === 'POST') return success({ ...exam, ...await request.json() as Partial<typeof exam>, status: 'DRAFT' })
    return page([exam])
  }
  if (path === '/api/exams/30') return success({ ...exam, ...(submissions.has(userKey) ? { submittable: false, mySubmission: submissions.get(userKey) } : {}) })
  if (path === '/api/exams/30/attempts/start') return success({ startedAt: now })
  if (path === '/api/exams/30/submissions') {
    if (method === 'POST') {
      const body = await request.json() as { answers: Array<{ questionId: string; answer: string }> }
      const value = { ...graded, items: graded.items.map(item => ({ ...item, answer: body.answers.find(a => a.questionId === item.questionId)?.answer ?? '' })) }
      submissions.set(userKey, value)
      return success(value)
    }
    return page(students.slice(0, 5).map(s => ({ ...graded, submissionId: s.studentId, userId: s.studentId, userName: s.name, attemptCount: 1 })))
  }
  if (path === '/api/exams/30/submissions/me') return submissions.has(userKey) ? success(submissions.get(userKey)) : Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'No submission yet', details: [] } }, { status: 404 })
  if (/^\/api\/exams\/30\/submissions\/\d+$/.test(path)) return success(graded)
  if (/^\/api\/exams\/30\/submissions\/\d+\/answers\/[^/]+\/score$/.test(path)) {
    const body = await request.json() as { score: number }
    const questionId = path.split('/').at(-2)
    const item = graded.items.find(item => item.questionId === questionId)
    if (item) item.score = body.score
    graded.score = graded.items.reduce((sum, item) => sum + item.score, 0)
    return success(graded)
  }
  if (/^\/api\/(sessions|materials)\/\d+\/notes$/.test(path)) {
    if (method === 'POST') { const value = { ...await request.json() as typeof notes[number], noteId: Date.now() }; notes.push(value); return success(value) }
    return page(notes)
  }
  if (/^\/api\/notes\/\d+$/.test(path)) {
    const index = notes.findIndex(note => note.noteId === Number(path.split('/').at(-1)))
    if (method === 'DELETE') { if (index >= 0) notes.splice(index, 1); return success(null) }
    if (method === 'PATCH' && index >= 0) Object.assign(notes[index], await request.json())
    return success(notes[index] ?? notes[0])
  }
  if (/^\/api\/classrooms\/\d+\/students\/\d+\/reports$/.test(path)) return success(method === 'POST' ? report : { items: [report] })
  if (path === '/api/reports/1') return success(report)
  if (path.endsWith('/report-criteria/generation')) return success({ status: 'IDLE', registeredCount: 1, message: '' })
  if (path.endsWith('/report-criteria')) return success({ items: [{ criterionId: 1, criterionKey: 'understanding', name: '개념 이해', active: true, builtin: true, description: '핵심 개념을 이해하고 적용하는 능력', minEvidence: 1, weight: 1, allowedSources: ['QUIZ'], rubric: {} }] })
  return undefined
}
