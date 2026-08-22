/**
 * 프레임워크 비의존 API 픽스처.
 *
 * - vitest: apiFixtureServer.ts가 fetch를 스텁하면서 호출한다.
 * - vite dev: dev/mockApiPlugin.ts가 Node 미들웨어에서 호출한다(mode: 'dev').
 *
 * 'test' 모드 동작은 기존 테스트 계약이므로 바꾸지 않는다.
 * 브라우저 워크스루용 확장 라우트는 'dev' 모드에만 추가한다.
 */

export type ApiFixtureMode = 'dev' | 'test'

export interface ApiFixtureOptions {
  mode?: ApiFixtureMode
}

export async function handleApiFixtureRequest(
  request: Request,
  options: ApiFixtureOptions = {},
): Promise<Response> {
  const url = new URL(request.url)
  const path = `${url.pathname}${url.search}`

  if (request.method === 'GET' && path === '/api/health') {
    return apiSuccess({ status: 'UP' })
  }

  if (request.method === 'GET' && path === '/api/health/ready') {
    return jsonResponse(
      {
        checks: { aiService: 'UP', db: 'UP' },
        status: 'UP',
      },
      200,
    )
  }

  if (
    request.method === 'GET' &&
    /^\/api\/materials\/\d+\/file$/.test(path)
  ) {
    return new Response(createFixturePdf(5), {
      headers: {
        'Content-Disposition': 'inline; filename="material.pdf"',
        'Content-Type': 'application/pdf',
      },
    })
  }

  if (
    request.method === 'GET' &&
    /^\/api\/sessions\/\d+\/stream$/.test(path)
  ) {
    return new Response(
      [
        'event: status',
        'data: {"stage":"GENERATING"}',
        '',
        'event: content_delta',
        'data: {"text":"개념 정의와 "}',
        '',
        'event: content_delta',
        'data: {"text":"적용 사례를 설명합니다."}',
        '',
        'event: completed',
        'data: {"result":{}}',
        '',
        '',
      ].join('\n'),
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
  }

  if (options.mode === 'dev') {
    const devResponse = await handleDevRoute(request, url)
    if (devResponse) return devResponse
  }

  if (request.method === 'POST' && path === '/api/auth/login') {
    const body = await readJson<{ email: string }>(request)
    if (body.email === 'locked@example.com') {
      return apiFailure(
        'INVALID_CREDENTIALS',
        '이메일 또는 비밀번호를 확인하세요.',
        401,
      )
    }
    return apiSuccess({
      accessToken: 'access-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      user: {
        email: body.email,
        id: 1,
        name: 'learner',
        role: body.email.startsWith('instructor') ? 'INSTRUCTOR' : 'LEARNER',
      },
    })
  }

  if (request.method === 'POST' && path === '/api/auth/google') {
    const body = await readJson<{ idToken: string; role?: string }>(request)
    if (body.idToken === 'new-google-id-token' && !body.role) {
      return apiFailure(
        'SIGNUP_REQUIRED',
        '신규 회원은 가입 정보가 필요합니다.',
        409,
      )
    }
    return apiSuccess({
      accessToken: 'google-access-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      user: {
        email: 'google@example.com',
        id: 2,
        name: 'Google 사용자',
        role: body.role ?? 'LEARNER',
      },
    })
  }

  if (request.method === 'POST' && path === '/api/auth/refresh') {
    return apiFailure('TOKEN_INVALID', '유효하지 않은 인증 토큰입니다.', 401)
  }

  if (request.method === 'POST' && path === '/api/auth/logout') {
    return apiSuccess(null)
  }

  if (
    request.method === 'GET' &&
    path.startsWith('/api/auth/email-availability?')
  ) {
    return apiSuccess({
      available: url.searchParams.get('email') !== 'existing@example.com',
    })
  }

  if (request.method === 'DELETE' && path === '/api/users/me') {
    const body = await readJson<{ password: string }>(request)
    if (body.password === 'wrong-password-1') {
      return apiFailure('INVALID_CREDENTIALS', '비밀번호가 올바르지 않습니다.', 401)
    }
    return apiSuccess(null)
  }

  if (request.method === 'POST' && path === '/api/auth/signup') {
    const body = await readJson<{ email: string; name: string }>(request)
    return apiSuccess({
      email: body.email,
      name: body.name,
      userId: 1,
    })
  }

  if (request.method === 'GET' && path === '/api/users/me') {
    return apiSuccess({
      email: 'learner@example.com',
      id: 1,
      name: 'learner',
      role: 'LEARNER',
    })
  }

  if (request.method === 'GET' && path === '/api/users/me/preferences') {
    return apiSuccess({
      aiAnswerStyle: 'NORMAL',
      newMaterialNotification: true,
      studyReminder: false,
    })
  }

  if (request.method === 'PATCH' && path === '/api/users/me/preferences') {
    return apiSuccess(await readJson(request))
  }

  if (
    request.method === 'GET' &&
    path === '/api/users/me/notifications?page=0&size=20'
  ) {
    return apiSuccess(paged([]))
  }

  if (
    request.method === 'PATCH' &&
    /^\/api\/users\/me\/notifications\/\d+\/read$/.test(path)
  ) {
    return apiSuccess({
      body: '확인할 알림입니다.',
      createdAt: '2026-08-20T00:00:00Z',
      link: {},
      notificationId: Number(path.split('/')[5]),
      readAt: '2026-08-20T00:01:00Z',
      title: '알림',
      type: 'NOTICE_PUBLISHED',
    })
  }

  if (
    request.method === 'DELETE' &&
    /^\/api\/users\/me\/notifications\/\d+$/.test(path)
  ) {
    return apiSuccess(null)
  }

  if (request.method === 'POST' && path === '/api/feedback') {
    return apiSuccess({ createdAt: '2026-08-15T00:00:00Z', feedbackId: 1 })
  }

  if (
    request.method === 'GET' &&
    path === '/api/classrooms?page=0&size=100&sort=RECENT'
  ) {
    return apiSuccess(paged([]))
  }

  if (request.method === 'GET' && path === '/api/classrooms/12') {
    return apiSuccess({
      classroomId: 12,
      color: 'BLUE',
      endDate: '2026-08-16',
      instructorName: '강의자',
      learnerCount: 1,
      name: '자료구조',
      pendingRequestCount: 0,
      progressRate: 0,
      startDate: '2026-08-03',
      status: 'ACTIVE',
      weekCount: 2,
    })
  }

  if (request.method === 'GET' && path === '/api/classrooms/12/weeks') {
    return apiSuccess({
      items: [
        {
          displayOrder: 1,
          materials: [
            {
              materialId: 10,
              pageCount: 5,
              processingStatus: 'READY',
              title: '시험 대비 요약.pdf',
              uploadedAt: '2026-07-22T00:00:00Z',
            },
          ],
          status: 'PUBLISHED',
          title: '핵심 개념',
          weekId: 91,
          weekNumber: 1,
        },
        {
          displayOrder: 2,
          materials: [
            {
              materialId: 11,
              processingStatus: 'PROCESSING',
              title: '강의 노트 5주차.pdf',
              uploadedAt: '2026-07-23T00:00:00Z',
            },
          ],
          status: 'SCHEDULED',
          title: '심화 학습',
          weekId: 92,
          weekNumber: 2,
        },
      ].reverse(),
    })
  }

  if (
    request.method === 'GET' &&
    path.startsWith('/api/users/me/schedule?')
  ) {
    return apiSuccess({ items: [] })
  }

  if (request.method === 'POST' && path === '/api/users/me/schedule') {
    const body = await readJson<{ endsAt: string; hasTime: boolean; startsAt: string; title: string }>(request)
    return apiSuccess({ ...body, kind: 'PERSONAL', scheduleId: 'personal-1' })
  }

  if (request.method === 'PATCH' && path === '/api/users/me/schedule/personal-1') {
    const body = await readJson<{ endsAt?: string; hasTime?: boolean; startsAt?: string; title?: string }>(request)
    return apiSuccess({
      endsAt: body.endsAt ?? '2099-08-03T10:00:00.000Z',
      hasTime: body.hasTime ?? true,
      kind: 'PERSONAL',
      scheduleId: 'personal-1',
      startsAt: body.startsAt ?? '2099-08-03T09:00:00.000Z',
      title: body.title ?? '개인 일정',
    })
  }

  if (request.method === 'DELETE' && path === '/api/users/me/schedule/personal-1') {
    return apiSuccess(null)
  }

  if (request.method === 'GET' && /^\/api\/classrooms\/\d+\/analytics$/.test(path)) {
    return apiSuccess({
      aiQuestionCountLast7Days: 0,
      averageProgressRate: 0,
      inactiveLearnerCountLast7Days: 0,
      lastUpdatedAt: '2026-08-04T12:00:00Z',
      learnerCount: 0,
      materials: [],
      questionsByPage: [],
    })
  }

  if (request.method === 'GET' && /^\/api\/classrooms\/\d+\/students\?/.test(path)) {
    return apiSuccess(paged([]))
  }

  if (request.method === 'GET' && path === '/api/materials?page=0&size=20') {
    return apiSuccess(paged(materialListFixture))
  }

  if (
    request.method === 'GET' &&
    /^\/api\/materials\/\d+\/overview$/.test(path)
  ) {
    const materialId = Number(path.match(/^\/api\/materials\/(\d+)\/overview$/)?.[1] ?? 0)
    return apiSuccess({
      content: null,
      materialId,
      status: 'PENDING',
      updatedAt: null,
    })
  }

  if (request.method === 'POST' && path === '/api/materials') {
    const form = await request.clone().formData()
    return apiSuccess({
      createdAt: '2026-07-27T00:00:00Z',
      materialId: 13,
      processingStatus: 'PROCESSING',
      title: String(form.get('title')),
    })
  }

  if (request.method === 'DELETE' && path === '/api/materials/10') {
    return apiFailure(
      'MATERIAL_HAS_ACTIVE_SESSION',
      '진행 중인 세션이 있는 자료입니다.',
      409,
    )
  }

  if (request.method === 'DELETE' && path === '/api/materials/11') {
    return apiSuccess(null)
  }

  if (request.method === 'GET' && path === '/api/materials/999') {
    return apiFailure('MATERIAL_NOT_FOUND', '자료를 찾을 수 없습니다.', 404)
  }

  if (request.method === 'GET' && path === '/api/materials/10') {
    return apiSuccess(materialFixtures[10])
  }

  if (request.method === 'GET' && path === '/api/materials/14') {
    return apiSuccess(materialFixtures[14])
  }

  if (request.method === 'GET' && path === '/api/sessions?page=0&size=20') {
    return apiSuccess(
      paged([
        {
          currentPage: 1,
          materialId: 10,
          materialTitle: '시험 대비 요약.pdf',
          sessionId: 100,
          status: 'ACTIVE',
          updatedAt: '2026-07-27T00:00:00Z',
        },
        {
          currentPage: 5,
          materialId: 10,
          materialTitle: '시험 대비 요약.pdf',
          sessionId: 101,
          status: 'COMPLETED',
          updatedAt: '2026-07-26T00:00:00Z',
        },
      ]),
    )
  }

  if (request.method === 'POST' && path === '/api/sessions') {
    return apiSuccess({
      currentPage: 1,
      materialId: 10,
      pageStatus: 'NOT_EXPLAINED',
      sessionId: 102,
      status: 'ACTIVE',
      uiActions: [],
    })
  }

  if (
    request.method === 'GET' &&
    path === '/api/sessions/100/quizzes'
  ) {
    return apiSuccess({ quizzes: quizHistoryFixture })
  }

  if (request.method === 'GET' && path === '/api/sessions/103/quizzes') {
    return apiSuccess({ quizzes: [] })
  }

  if (request.method === 'GET' && path === '/api/users/me/memory?materialId=10') {
    return apiSuccess(memoryFixture(10))
  }

  if (request.method === 'DELETE' && path === '/api/sessions/100') {
    return apiSuccess({ sessionId: 100, status: 'DELETED' })
  }

  if (request.method === 'GET' && path === '/api/sessions/999') {
    return apiFailure('SESSION_NOT_FOUND', '세션을 찾을 수 없습니다.', 404)
  }

  if (request.method === 'GET' && path === '/api/sessions/100') {
    return apiSuccess(sessionFixtures[100])
  }

  if (request.method === 'GET' && path === '/api/sessions/103') {
    return apiSuccess(sessionFixtures[103])
  }

  if (
    request.method === 'GET' &&
    path === '/api/sessions/100/messages?size=50'
  ) {
    return apiSuccess({ hasMore: false, items: [], nextCursor: null })
  }

  if (request.method === 'GET' && path === '/api/sessions/103/messages?size=50') {
    return apiSuccess({ hasMore: false, items: [], nextCursor: null })
  }

  if (request.method === 'PATCH' && path === '/api/sessions/100/page') {
    const body = await readJson<{ pageNumber: number }>(request)
    return apiSuccess({
      currentPage: body.pageNumber,
      uiActions: [
        {
          content: '현재 페이지를 설명할까요?',
          noEvent: 'WAIT',
          type: 'BINARY_DECISION',
          yesEvent: 'EXPLAIN_CURRENT_PAGE',
        },
      ],
    })
  }

  if (request.method === 'POST' && path === '/api/sessions/100/turns') {
    return turnResponse(await readJson<{ eventType?: string }>(request))
  }

  if (request.method === 'POST' && path === '/api/sessions/100/quiz-decline') {
    return apiSuccess({
      uiActions: [
        {
          content: '다음 페이지로 이동할까요?',
          noEvent: 'WAIT',
          type: 'BINARY_DECISION',
          yesEvent: 'MOVE_NEXT_PAGE',
        },
      ],
    })
  }

  if (request.method === 'POST' && path === '/api/sessions/100/complete') {
    return apiSuccess({
      currentPage: 5,
      materialId: 10,
      sessionId: 100,
      status: 'COMPLETED',
      updatedAt: '2026-07-27T00:00:00Z',
    })
  }

  if (request.method === 'GET' && path === '/api/quizzes/50') {
    return apiSuccess(quizFixture)
  }

  if (request.method === 'GET' && path === '/api/quizzes/51') {
    return apiSuccess({
      questions: [
        {
          maxScore: 100,
          questionId: 'ox-1',
          questionText: '현재 설명은 참입니까?',
        },
      ],
      quizId: 51,
      quizType: 'OX',
      sessionId: 100,
      submitted: false,
      title: 'OX 확인 퀴즈',
    })
  }

  if (request.method === 'POST' && path === '/api/quizzes/50/submit') {
    return apiSuccess(quizSubmitFixture)
  }

  if (request.method === 'GET' && path === '/api/quizzes/50/submission') {
    return apiSuccess({
      items: [
        {
          correctAnswer: 'mcq-a',
          explanation: '새 개념은 정의부터 확인해야 합니다.',
          feedback: '개념의 정의를 먼저 확인하는 것이 맞습니다.',
          maxScore: 50,
          questionId: 'question-mcq',
          score: 50,
          submittedAnswer: 'mcq-a',
          verdict: 'CORRECT',
        },
        {
          correctAnswer: 'review-a',
          explanation: '이해가 낮은 페이지를 복습해야 합니다.',
          feedback: '복습 순서를 다시 확인해 보세요.',
          maxScore: 50,
          questionId: 'question-review',
          score: 0,
          submittedAnswer: 'review-b',
          verdict: 'WRONG',
        },
      ],
      maxScore: 100,
      passed: false,
      quizId: 50,
      score: 48,
      submissionId: 200,
      submittedAt: '2026-07-28T00:10:00Z',
    })
  }

  return apiFailure('NOT_FOUND', `${request.method} ${path}`, 404)
}

/**
 * dev 전용 확장 — 테스트 픽스처가 커버하지 않아 브라우저 워크스루가 끊기는 구간을 메운다.
 * (세션 101·102 상세, 자료 11~13 상세, 비어 있지 않은 채팅 이력, refresh 성공)
 */
async function handleDevRoute(
  request: Request,
  url: URL,
): Promise<Response | undefined> {
  const { method } = request
  const { pathname } = url

  // 새로고침만으로 로그인 상태가 복원되도록 (DEC-004 경로 그대로 검증)
  if (method === 'POST' && pathname === '/api/auth/refresh') {
    return apiSuccess({
      accessToken: 'dev-access-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
    })
  }

  if (method === 'POST' && pathname === '/api/sessions') {
    const body = await readJson<{ materialId: number | string }>(request)
    const materialId = Number(body.materialId) || 14
    return apiSuccess({
      ...sessionFixtures[102],
      materialId,
      materialTitle: materialFixtures[materialId]?.title ?? '새 학습 자료.pdf',
    })
  }

  const materialDetail = /^\/api\/materials\/(\d+)$/.exec(pathname)
  if (method === 'GET' && materialDetail) {
    const material = materialFixtures[Number(materialDetail[1])]
    return material
      ? apiSuccess(material)
      : apiFailure('MATERIAL_NOT_FOUND', '자료를 찾을 수 없습니다.', 404)
  }

  const sessionDetail = /^\/api\/sessions\/(\d+)$/.exec(pathname)
  if (sessionDetail) {
    const sessionId = Number(sessionDetail[1])
    const session = sessionFixtures[sessionId]
    if (!session) {
      return apiFailure('SESSION_NOT_FOUND', '세션을 찾을 수 없습니다.', 404)
    }
    if (method === 'GET') return apiSuccess(session)
    if (method === 'DELETE') return apiSuccess({ sessionId, status: 'DELETED' })
  }

  const sessionScoped = /^\/api\/sessions\/(\d+)\/(messages|quizzes|page|turns|complete)$/.exec(
    pathname,
  )
  if (sessionScoped) {
    const sessionId = Number(sessionScoped[1])
    const segment = sessionScoped[2]
    const session = sessionFixtures[sessionId]
    if (!session) {
      return apiFailure('SESSION_NOT_FOUND', '세션을 찾을 수 없습니다.', 404)
    }

    if (method === 'GET' && segment === 'messages') {
      return apiSuccess(paged(sessionId === 100 ? messageHistoryFixture : []))
    }
    if (method === 'GET' && segment === 'quizzes') {
      return apiSuccess(paged(sessionId === 100 ? quizHistoryFixture : []))
    }
    if (method === 'PATCH' && segment === 'page') {
      const body = await readJson<{ pageNumber: number }>(request)
      return apiSuccess({
        currentPage: body.pageNumber,
        uiActions: [
          {
            content: '현재 페이지를 설명할까요?',
            noEvent: 'WAIT',
            type: 'BINARY_DECISION',
            yesEvent: 'EXPLAIN_CURRENT_PAGE',
          },
        ],
      })
    }
    if (method === 'POST' && segment === 'turns') {
      return turnResponse(await readJson<{ eventType?: string }>(request))
    }
    if (method === 'POST' && segment === 'complete') {
      return apiSuccess({ ...session, status: 'COMPLETED' })
    }
  }

  if (method === 'GET' && pathname === '/api/users/me/memory') {
    const materialId = Number(url.searchParams.get('materialId')) || 10
    return apiSuccess(memoryFixture(materialId))
  }

  return undefined
}

export function apiSuccess(data: unknown, status = 200): Response {
  return jsonResponse({ data, message: '요청이 성공했습니다.', success: true }, status)
}

export function apiFailure(
  code: string,
  message: string,
  status: number,
): Response {
  return jsonResponse(
    {
      error: { code, details: [], message },
      success: false,
    },
    status,
  )
}

function paged(items: unknown[]) {
  return {
    items,
    page: 0,
    size: 20,
    totalElements: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  }
}

async function readJson<T>(request: Request): Promise<T> {
  return (await request.clone().json()) as T
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

function createFixturePdf(pageCount: number): Uint8Array {
  const fontObjectNumber = 3 + pageCount * 2
  const pageObjectNumbers = Array.from(
    { length: pageCount },
    (_, index) => 3 + index * 2,
  )
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ]

  pageObjectNumbers.forEach((pageObjectNumber, index) => {
    const contentObjectNumber = pageObjectNumber + 1
    const stream = `BT /F1 24 Tf 72 720 Td (EduPilot PDF page ${index + 1}) Tj ET`
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjectNumber} 0 R /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    )
  })
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(new TextEncoder().encode(pdf).length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = new TextEncoder().encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  pdf += `startxref\n${xrefOffset}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

function turnResponse(body: { eventType?: string }): Response {
  if (body.eventType === 'EXPLAIN_CURRENT_PAGE') {
    return apiSuccess({
      messages: [
        {
          content: '이 페이지는 핵심 개념의 정의를 다룹니다.',
          createdAt: '2026-07-27T00:00:00Z',
          messageId: 502,
          messageType: 'EXPLANATION',
          senderType: 'AI',
        },
      ],
      state: {},
      uiActions: [
        {
          content: '퀴즈를 진행할까요?',
          noEvent: 'MOVE_NEXT_PAGE',
          type: 'BINARY_DECISION',
          yesEvent: 'SHOW_QUIZ_TYPE_SELECT',
        },
      ],
    })
  }

  if (body.eventType === 'QUIZ_TYPE_SELECTED') {
    return apiSuccess({
      messages: [],
      state: { activeQuizId: 50 },
      uiActions: [],
    })
  }

  return apiSuccess({
    messages: [
      {
        content: '개념 정의와 적용 사례를 분리해서 정리해 보세요.',
        createdAt: '2026-07-27T00:00:00Z',
        messageId: 501,
        messageType: 'REPAIR',
        senderType: 'AI',
      },
    ],
    state: { currentPage: 2, pageStatus: 'IN_PROGRESS' },
    uiActions: [],
  })
}

const materialFixtures: Record<number, Record<string, unknown> | undefined> = {
  10: {
    activeSessionId: 100,
    createdAt: '2026-07-22T00:00:00Z',
    fileSizeBytes: 12_480_000,
    materialId: 10,
    pageCount: 5,
    processingStatus: 'READY',
    title: '시험 대비 요약.pdf',
  },
  11: {
    createdAt: '2026-07-23T00:00:00Z',
    fileSizeBytes: 4_200_000,
    materialId: 11,
    processingStatus: 'PROCESSING',
    title: '강의 노트 5주차.pdf',
  },
  12: {
    createdAt: '2026-07-21T00:00:00Z',
    failureReason: '텍스트를 추출할 수 없는 스캔 이미지 PDF입니다.',
    fileSizeBytes: 8_100_000,
    materialId: 12,
    processingStatus: 'FAILED',
    title: '스캔본 복습자료.pdf',
  },
  13: {
    createdAt: '2026-07-27T00:00:00Z',
    fileSizeBytes: 1_200_000,
    materialId: 13,
    processingStatus: 'PROCESSING',
    title: '업로드한 자료.pdf',
  },
  14: {
    createdAt: '2026-07-24T00:00:00Z',
    fileSizeBytes: 2_048_000,
    materialId: 14,
    pageCount: 8,
    processingStatus: 'READY',
    title: '새 학습 자료.pdf',
  },
}

const materialListFixture = [
  materialFixtures[10],
  {
    createdAt: '2026-07-23T00:00:00Z',
    materialId: 11,
    processingStatus: 'PROCESSING',
    title: '강의 노트 5주차.pdf',
  },
  {
    createdAt: '2026-07-21T00:00:00Z',
    materialId: 12,
    processingStatus: 'FAILED',
    title: '스캔본 복습자료.pdf',
  },
]

const sessionFixtures: Record<number, Record<string, unknown> | undefined> = {
  100: {
    currentPage: 1,
    materialId: 10,
    pageStatus: 'EXPLAINED',
    pendingDiagnosis: {
      diagnosisId: 42,
      prompt: '오답을 고른 이유와 헷갈린 개념을 적어 보세요.',
      quizScore: 48,
      sourceQuestion: '현재 페이지 핵심 개념',
    },
    sessionId: 100,
    status: 'ACTIVE',
    uiActions: [
      {
        content: '현재 페이지를 설명할까요?',
        noEvent: 'WAIT',
        type: 'BINARY_DECISION',
        yesEvent: 'EXPLAIN_CURRENT_PAGE',
      },
    ],
    updatedAt: '2026-07-27T00:00:00Z',
  },
  101: {
    currentPage: 5,
    materialId: 10,
    materialTitle: '시험 대비 요약.pdf',
    pageStatus: 'EXPLAINED',
    sessionId: 101,
    status: 'COMPLETED',
    uiActions: [],
    updatedAt: '2026-07-26T00:00:00Z',
  },
  102: {
    currentPage: 1,
    materialId: 14,
    materialTitle: '새 학습 자료.pdf',
    pageStatus: 'NOT_EXPLAINED',
    sessionId: 102,
    status: 'ACTIVE',
    uiActions: [
      {
        content: '강의를 시작할까요?',
        noEvent: 'WAIT',
        type: 'BINARY_DECISION',
        yesEvent: 'EXPLAIN_CURRENT_PAGE',
      },
    ],
    updatedAt: '2026-07-28T00:00:00Z',
  },
  103: {
    activeQuizId: 50,
    currentPage: 2,
    materialId: 10,
    materialTitle: '시험 대비 요약.pdf',
    pageStatus: 'QUIZ_READY',
    sessionId: 103,
    status: 'ACTIVE',
    uiActions: [],
    updatedAt: '2026-08-06T00:00:00Z',
  },
}

const messageHistoryFixture = [
  {
    content: '이 자료의 1쪽을 요약해 줘',
    createdAt: '2026-07-28T01:00:00Z',
    messageId: 401,
    messageType: 'QA',
    pageNumber: 1,
    senderType: 'USER',
  },
  {
    content:
      '**핵심 정리**\n\n- 평균은 자료 전체를 대표하는 값입니다.\n- 편차는 각 값이 평균에서 떨어진 정도입니다.\n\n다음 쪽에서는 분산을 다룹니다.',
    createdAt: '2026-07-28T01:00:05Z',
    messageId: 402,
    messageType: 'EXPLANATION',
    pageNumber: 1,
    senderType: 'AI',
  },
]

const quizHistoryFixture = [
  {
    createdAt: '2026-07-28T00:00:00Z',
    maxScore: 100,
    passed: false,
    quizId: 50,
    quizType: 'MCQ',
    score: 48,
    submitted: true,
    title: '학습 확인 퀴즈',
  },
]

function memoryFixture(materialId: number) {
  return {
    explanationPreferences: ['쉬운 예시 중심 설명 선호'],
    materialId,
    memoryDigest: '수식 전개를 어려워하고 쉬운 예시를 선호함',
    preferredQuizTypes: ['MCQ'],
    strengths: ['평균 개념을 정확히 사용함'],
    updatedAt: '2026-07-27T00:00:00Z',
    weaknesses: ['수식 전개 과정 설명'],
  }
}

const quizSubmitFixture = {
  gradingResult: {
    items: [
      {
        feedback: '개념의 정의를 먼저 확인하는 것이 맞습니다.',
        maxScore: 50,
        questionId: 'question-mcq',
        score: 50,
        verdict: 'CORRECT',
      },
      {
        feedback: '복습 순서를 다시 확인해 보세요.',
        maxScore: 50,
        questionId: 'question-review',
        score: 0,
        verdict: 'WRONG',
      },
    ],
  },
  maxScore: 100,
  passed: false,
  quizId: 50,
  score: 48,
  submissionId: 200,
  uiActions: [{ diagnosisId: 42, type: 'DIAGNOSIS_QUESTION' }],
}

const quizFixture = {
  questions: [
    {
      maxScore: 50,
      options: [
        { optionId: 'mcq-a', text: '개념의 정의를 먼저 확인한다.' },
        { optionId: 'mcq-b', text: '본문 전체를 암기한다.' },
      ],
      questionId: 'question-mcq',
      questionText:
        '새 개념을 학습할 때 가장 먼저 확인할 정보는 무엇인가요?',
    },
    {
      maxScore: 50,
      options: [
        { optionId: 'review-a', text: '이해가 낮은 페이지를 다시 읽는다.' },
        { optionId: 'review-b', text: '아무 답이나 선택한다.' },
      ],
      questionId: 'question-review',
      questionText: '학습 중 이해가 낮은 부분이 생기면 어떻게 해야 하나요?',
    },
  ],
  quizId: 50,
  quizType: 'MCQ',
  sessionId: 100,
  submitted: false,
  title: '학습 확인 퀴즈',
}
