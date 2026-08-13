# BE 필요 API 목록 (FE -> BE)

## 기준

| 항목 | 내용 |
| --- | --- |
| 확인일 | 2026-08-12 |
| FE 기준 | `develop` 현재 로컬 변경사항 |
| BE 기준 | `develop` `docs/api-spec.md` 마지막 갱신 2026-08-02 |
| 실행 계약 | 배포 Swagger `/v3/api-docs` 91개 operation |

현재 Swagger에 추가된 강의실, 프로필, 환경설정, 일정 조회, 노트, 피드백 API는
FE repository에 반영했다. 아래에는 **화면은 존재하지만 여전히 공개 API가 없는
기능**만 남긴다.

## 페이지별 점검 결과

| 화면 | 연결된 기능 | 공개 API가 없거나 응답이 부족한 기능 |
| --- | --- | --- |
| 로그인·회원가입 | 가입, 이메일 중복 확인, 로그인, refresh, 로그아웃 | 비밀번호 재설정, Google OAuth |
| 설정 | 프로필, 아바타, 환경설정, 회원 탈퇴 | `studyReminder`·새 자료 알림의 실제 이메일/인앱 전달과 읽음 상태 |
| 강의실 목록 | 생성, 조회, 수정, 종료, 영구 삭제, 초대 코드 | 종료 강의실 재활성화, 서버 검색·추가 정렬 |
| 강의실 강의 | 주차, PDF 자료, 공지, 시험 CRUD | 주차별 공지, 공지 예약 게시, PPT/PPTX, 처리 실패 상세 |
| 수강생·입장 요청 | 목록, 제외, 개별 승인·거절, 수강생별 진도·최근 7일 AI 질문, 서버 검색·정렬 | 일괄 승인 |
| 학습 현황·리포트 | 자료별 현황, 페이지별 질문 수, 수강생별 지표, 리포트 기준·생성·조회 | 리포트 Q&A는 Phase 3 |
| 캘린더·알림 패널 | 개인 일정 CRUD, 강의실 일정 통합 조회 | 실제 알림 전송, 읽음·삭제·전달 이력 |
| 자료·세션·PDF·채팅 | 업로드, 세션, 페이지 이동, 대화, 노트, 퀴즈 | 자연어 학습 명령 정규화, 교정 후 재평가 퀴즈 |
| 시험 | 시험 CRUD, 제출·결과, AI 문항 초안 | 현재 노출 UI 기준 추가 필수 API 없음 |

테마, 패널 너비, 검색창 입력값, 드롭다운 선택 상태처럼 한 기기에서만 필요한 UI
상태는 서버 API 요청 대상에서 제외한다. 메시지 공유는 Web Share API를 사용하고 지원하지
않는 환경에서는 복사로 대체하므로 BE API가 필요하지 않다.

## 연결 완료: 퀴즈 제안 거절

퀴즈 제안의 서버 상태를 해제하는 다음 계약을 FE repository와 통합학습 화면에
연결했고 2026-08-10 배포 Swagger에서도 계약을 확인했다. 응답의 `uiActions`를
그대로 현재 진행 액션으로 교체한다.

```http
POST /api/sessions/{sessionId}/quiz-decline
```

요청 본문은 없으며 다음 페이지 제안 또는 마지막 페이지의 학습 완료 제안을
응답한다.

## 연결 완료: 강의자 학습 현황·리포트

2026-08-05 배포 Swagger에 아래 endpoint가 공개됐고 FE repository와 강의자 화면에
연결했다. 배포 빌드는 `VITE_API_CAPABILITIES=reports`로 활성화한다.

```http
GET  /api/classrooms/{classroomId}/analytics
GET  /api/classrooms/{classroomId}/students
GET  /api/classrooms/{classroomId}/report-criteria
POST /api/classrooms/{classroomId}/report-criteria
PATCH /api/classrooms/{classroomId}/report-criteria/{criterionId}
POST /api/classrooms/{classroomId}/students/{studentId}/reports
GET  /api/classrooms/{classroomId}/students/{studentId}/reports
GET  /api/reports/{reportId}
```

리포트 생성은 `scope: FULL | WEEK`와 선택적 `weekNumber`를 전송하고, 응답의
`status=PENDING|PROCESSING|COMPLETED|FAILED`와 `pollAfterSeconds`로 polling한다.
완료 목록의 `activeGeneration`, 상세의 `overallStage`, `criteria`, nullable score와
`publicLabel` 근거도 최신 계약에 맞춰 변환한다.

다음 기능은 현재 P0 범위에서 제외한다.

- `POST /api/reports/{reportId}/questions`: DEC-033과 BE #119·#120에 따라 Phase 3.
  FE 리포트 상세 화면에서도 질문 UI와 repository 메서드를 노출하지 않는다.
- AI 질문의 주제별 분류: 조회 시 LLM을 호출하지 않고 페이지별 질문 수로 대체한다.
  주제 클러스터링은 배치 인프라가 마련된 뒤 P2 backlog에서 검토한다.
- `POST /api/classrooms/{classroomId}/reminders`: 전달 수단과 알림 인프라가 정해질
  때까지 보류한다. 이메일을 채택하면 비밀번호 재설정 이메일과 함께 구축한다.

## P1. 인증 보조 기능

비밀번호 찾기와 Google 로그인 UI는 있지만 실제 요청을 보낼 API가 없다.

```http
POST /api/auth/password-reset/request
POST /api/auth/password-reset/confirm
GET  /api/auth/oauth/google/authorize
GET  /api/auth/oauth/google/callback
```

비밀번호 재설정 요청은 계정 존재 여부를 노출하지 않는 동일 응답을 반환하고,
OAuth 콜백은 현재 refresh HttpOnly cookie 정책을 유지해야 한다.

## 연결 완료. 수강생별 학습 현황

2026-08-11 기준 `GET /api/classrooms/{classroomId}/students`에 다음 지표와
검색·정렬 query가 배포되어 FE에 연결됐다.

```json
{
  "averageProgressRate": 64,
  "aiQuestionCountLast7Days": 12
}
```

목록 query는 `q`, `sort=RECENT_ACTIVITY|NAME|LOW_PROGRESS`를 사용한다.

학습 현황 화면의 세 영역은 모두 현재 배포 API에 연결돼 있다.

- 자료별 학습 현황: `GET /api/classrooms/{classroomId}/analytics`의 `materials`
- 페이지별 질문 수: 같은 응답의 `questionsByPage`
- 수강생별 학습 현황: `GET /api/classrooms/{classroomId}/students`의
  `averageProgressRate`, `aiQuestionCountLast7Days`, `lastActiveAt`

따라서 이 화면을 위해 새로 필요한 API는 없다. 다만 실제 질문이 존재하는 강의실에서
`aiQuestionCountLast7Days`와 `questionsByPage`가 계속 0으로 반환되면 신규 계약이 아니라
BE 집계 로직 점검 대상으로 처리한다. `qa_threads`의 강의실 연결 자료 범위와 USER 메시지
생성 시각이 최근 7일 집계에 포함되는지 확인이 필요하다.

## P1. 알림 전달

환경설정의 `newMaterialNotification`, `studyReminder` 저장 API는 연결돼 있지만,
새 자료 알림과 "3일 이상 미접속 시 이메일"을 실제로 전달하는 공개 계약은 없다.
이메일 또는 인앱 알림 수단을 확정한 뒤 다음 기능이 필요하다.

```http
GET    /api/users/me/notifications
PATCH  /api/users/me/notifications/{notificationId}/read
DELETE /api/users/me/notifications/{notificationId}
```

서버 내부에서는 새 자료 게시와 미접속 조건을 환경설정에 따라 발송하는 작업이
필요하다. 비밀번호 재설정도 이메일을 사용한다면 같은 발송 인프라로 묶는다.

## 연결 완료: 캘린더 개인 일정

개인 일정은 localStorage를 사용하지 않고 아래 API로 조회·생성·수정·삭제한다.

```http
POST   /api/users/me/schedule
PATCH  /api/users/me/schedule/{scheduleId}
DELETE /api/users/me/schedule/{scheduleId}
```

요청은 `title`, `startsAt`, `endsAt`, `hasTime`을 사용하며 서버 응답의
`kind=PERSONAL`로 수정·삭제 가능 일정을 구분한다.

## 연결 완료: 강의실 수강생 관리

수강생 관리 탭은 승인 이력이 아니라 현재 멤버 목록과 제외 API를 사용한다.

```http
GET    /api/classrooms/{classroomId}/students
DELETE /api/classrooms/{classroomId}/students/{studentId}
```

강의실 수정의 `startDate`, `endDate`는 공개 PATCH 계약에 연결했다. FE에서는 주차
예약 공개 기능을 제거했으므로 `shiftWeekReleaseDates`는 더 이상 전송하지 않는다.
영구 삭제 API도 2026-08-06 배포 Swagger에 추가되어 FE 재확인 다이얼로그와 연결했다.

```http
DELETE /api/classrooms/{classroomId}/permanent
```

영구 삭제는 확인용 강의실명을 body의 `confirmName`으로 전송하며, trim 후 현재
강의실명과 정확히 일치할 때만 요청한다.

## P0. 주차 상시 노출 정책으로 변경

FE에서는 주차의 `PRIVATE`, `SCHEDULED`, `PUBLISHED`, `BREAK` 상태 변경 UI와
예약 공개 시각 입력을 제거했다. 2026-08-13부터 주차 추가·삭제·재정렬 UI를
제거했으며, `displayOrder`를 사용하지 않고 `weekNumber ASC`로 고정 표시한다.
주차 이름만 설정 화면에서 수정할 수 있고 저장 버튼을 눌렀을 때 반영한다.
`PATCH /api/classrooms/{classroomId}/weeks/reorder`는 FE에서 호출하지 않는다.

2026-08-12 BE `develop`은 학습자 `GET /api/classrooms/{classroomId}/weeks`에도 상태와
관계없이 전체 주차와 연결 자료를 반환하도록 변경됐다. FE는 역할과 관계없이 이
응답을 `weekNumber ASC`로 정렬하며 `PRIVATE`, `SCHEDULED` 주차의 자료도 별도
필터 없이 표시한다.

- 자료 상세·파일·세션 생성 권한에서 주차 상태와 `releaseAt` 조건 제거 완료 여부를
  통합 테스트로 지속 확인한다.
- 기존 `classroom_weeks`의 상태를 `PUBLISHED`, `releaseAt`을 `null`로 일괄 정리한다.
- `WEEK_RELEASE` 파생 일정을 통합 일정 응답에서 제거하거나 deprecated 처리한다.
- 공지 예약 게시와 시험 공개·마감 상태는 콘텐츠 단위 기능이므로 그대로 유지한다.

## 연결 완료: 학습 대화 제어

- `USER_QUESTION.payload.includeCurrentPage`: BE PR #152가 `develop`에 병합되어
  현재 페이지 첨부·해제 상태를 FE 요청 payload에 연결했다.
- `대화 새로 시작`: `POST /api/sessions/{sessionId}/conversations`에 연결했다.

## 연결 완료: 통합학습 후속 단계 계약

노션 `통합학습 에이전트 명세서` 4번 시나리오는 페이지 설명 뒤 오케스트레이터가
현재 페이지 중요도를 판단해 퀴즈 여부를 결정하도록 정의한다. 2026-08-06 배포분은
표지·목차성 페이지에 다음 페이지 액션을 반환하며, 중요 페이지의 퀴즈 준비 상태는
기존 turns API 응답과 세션 상세 state로 복원한다.

```http
POST /api/sessions/{sessionId}/turns
eventType: EXPLAIN_CURRENT_PAGE
```

- 응답은 `state.pageStatus=EXPLAINED`와 정확히 하나의 다음 단계 `uiActions`를
  반환하고 세션 상세에도 같은 액션을 저장한다.
- 중요 페이지면 `BINARY_DECISION("퀴즈를 진행할까요?",
  SHOW_QUIZ_TYPE_SELECT, MOVE_NEXT_PAGE)`를 반환한다.
- 퀴즈가 불필요한 페이지면 `BINARY_DECISION("다음 페이지로 이동할까요?",
  MOVE_NEXT_PAGE, WAIT)`를 반환한다.
- 중요도 점수와 내부 판단 근거는 FE에 노출할 필요가 없으며 서버가 최종 액션만
  확정한다.

저득점의 진단·오개념 교정 이후 재평가 퀴즈를 생성하는 공개 이벤트도 현재 없다.
같은 turns API에 아래 이벤트를 추가하거나, 기존 `QUIZ_TYPE_SELECTED`에
`sourceQuizId`와 재평가 목적을 명시할 수 있어야 한다.

```json
{
  "eventType": "REMEDIATION_QUIZ_REQUESTED",
  "payload": {
    "sourceQuizId": 50
  }
}
```

응답은 기존 퀴즈 생성과 같이 `state.activeQuizId`를 반환하고, 재평가 결과도 기존
제출·진단·교정 파이프라인에 누적해야 한다. 자연어로 "설명해줘", "퀴즈 내줘"를
입력한 경우 현재 `USER_QUESTION` 정책과 도구 선택이 충돌할 수 있으므로 BE의
StateReducer 또는 명령 분류 단계에서 지원 이벤트로 정규화하는 규칙도 필요하다.

## P2. 운영 편의

```http
GET  /api/search?q={query}
POST /api/classrooms/{classroomId}/join-requests/approve-batch
POST /api/classrooms/{classroomId}/reactivate
```

통합 검색은 강의실·자료 결과의 `type`, `id`, `title`, 이동 경로를 반환한다.
일괄 승인은 현재 입장 요청 UI의 전체 선택 기능을 활성화할 때 필요하다. 종료된
강의실을 다시 운영하는 정책을 지원한다면 재활성화 endpoint가 필요하며, 지원하지
않는 정책이면 현재처럼 종료 버튼을 비활성 상태로 유지한다.

## 최근 연결 및 계약 확인

- 공지의 주차 지정·예약 게시 계약은 2026-08-11 dev 배포분부터 연결했다.

  ```http
  POST  /api/classrooms/{classroomId}/notices
  PATCH /api/classrooms/{classroomId}/notices/{noticeId}
  GET   /api/classrooms/{classroomId}/notices
  ```

  생성·수정 요청은 `weekNumber: number | null`과 `publishAt: string | null`을 사용한다.
  응답의 게시 여부는 `published`만 신뢰하며, `publishedAt`은 작성·정렬 시각,
  `publishAt`은 예약 공개 시각으로 구분한다. 구형 응답에 `published`가 없으면 FE는
  게시된 공지로 처리한다.
- 메시지 조회의 `status=FAILED`는 전송 실패로 표시한다. 현재 화면에서 실패한 턴은
  메모리에 보존한 동일 `requestId`로 재전송한다. 메시지 조회 응답은 `requestId`를
  반환하지 않으므로 새로고침 후 실패 메시지는 상태만 표시하고 재시도 버튼은
  제공하지 않는다.
- 자료 업로드는 PDF 전용으로 확정됐다. PPT/PPTX는 선택 단계에서 차단하고 PDF 변환
  후 업로드 안내를 표시한다.
- 업로드 요청이 `200`이어도 비동기 처리 후 `FAILED`가 될 수 있다. 2026-08-11
  배포 계약의 `failureReason=EXTRACTION_FAILED|PAGE_LIMIT_EXCEEDED|SCHEDULING_FAILED`와
  `traceId`를 FE에 연결했다.
- 수강생 목록의 `q`와 `sort=RECENT_ACTIVITY|NAME|LOW_PROGRESS`,
  `averageProgressRate`, `aiQuestionCountLast7Days`를 FE 검색·정렬·현황 표에 연결했다.
- 강의실 목록 정렬은 `RECENT`, `NAME`만 지원한다. 학습자 UI의 진도 낮은 순과 새
  자료 우선 정렬을 서버에서 지원하려면 enum 확장이 필요하다.
- `ClassroomSummaryResponse.materialCount`는 강의실 카드에 연결했다. 현재 주차
  목록 추가 조회는 통합 검색의 자료 인덱스를 만들기 위해 유지하며, 조회 실패
  시에도 서버의 자료 수 집계값을 보존한다.

## P1. 공지 첨부파일·AI 초안

Notion `8/6 기준 사이트 피드백`의 공지 작성 개선 중 마크다운 편집·미리보기는
기존 `content` 문자열 계약으로 FE에 반영했다. 첨부파일과 공지 작성 AI는 공개
API가 없어 다음 계약이 필요하다.

```http
POST   /api/classrooms/{classroomId}/notice-attachments
DELETE /api/classrooms/{classroomId}/notice-attachments/{attachmentId}
POST   /api/classrooms/{classroomId}/notices/ai-draft
```

- 첨부 업로드는 `multipart/form-data`의 `file`을 받고 `attachmentId`, `fileName`,
  `contentType`, `size`, `downloadUrl`을 반환한다.
- 공지 생성·수정 요청에 `attachmentIds: string[]`를 추가하고, 목록·상세 응답에는
  동일 첨부 메타데이터 배열을 반환한다. 미게시 공지에 연결되지 않은 임시 첨부의
  만료 정책도 함께 정의해야 한다.
- AI 초안 요청은 `title?`, `prompt`, `weekNumber?`를 받고 Markdown 본문 `content`를
  반환한다. 생성 결과는 자동 게시하지 않고 강의자가 편집·확인한 뒤 기존 공지
  생성 API로 저장한다.

## P1. 내 퀴즈 문항별 제출 결과 조회

현재 `GET /api/sessions/{sessionId}/quizzes`는 퀴즈별 점수·통과 여부만 반환하고,
`GET /api/quizzes/{quizId}`는 공개 문항과 `submitted` 상태만 반환한다. 제출 당시
`POST /api/quizzes/{quizId}/submit` 응답에 포함된 문항별 정답·오답·피드백은
새로고침 후 다시 조회할 수 없다. 제출 완료 퀴즈를 초기 문제로 다시 보여주지 않고
기존 응시 결과를 복원하려면 다음 조회 계약이 필요하다.

```http
GET /api/quizzes/{quizId}/submission
```

```json
{
  "success": true,
  "data": {
    "quizId": 50,
    "submittedAt": "2026-08-12T10:30:00Z",
    "score": 80,
    "maxScore": 100,
    "passed": true,
    "gradingResult": {
      "items": [
        {
          "questionId": 501,
          "submittedAnswer": "B",
          "correct": true,
          "earnedScore": 20,
          "feedback": "핵심 개념을 정확히 구분했습니다."
        }
      ]
    }
  }
}
```

- 학습자 본인의 제출 결과만 조회할 수 있어야 한다.
- 문항 순서와 공개 문항 정보는 `GET /api/quizzes/{quizId}`와 안정적으로 결합할 수
  있도록 같은 `questionId`를 사용한다.
- 미제출 퀴즈는 404 또는 명시적인 `submitted=false` 응답 중 하나로 계약을
  확정한다.
- FE는 이 API가 배포되기 전까지 `내 퀴즈`에서 점수·통과 여부만 표시하고 제출
  완료 퀴즈를 다시 응시 화면으로 열지 않는다.
