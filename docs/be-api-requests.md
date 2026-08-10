# BE 필요 API 목록 (FE -> BE)

## 기준

| 항목 | 내용 |
| --- | --- |
| 확인일 | 2026-08-10 |
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
| 수강생·입장 요청 | 목록, 제외, 개별 승인·거절 | 수강생별 진도·AI 질문 수, 서버 검색·정렬, 일괄 승인 |
| 학습 현황·리포트 | 강의실 집계, 리포트 기준·생성·조회 | 수강생별 학습 지표. 리포트 Q&A는 Phase 3 |
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

## P1. 수강생별 학습 현황

현재 `GET /api/classrooms/{classroomId}/students`는 이름, 이메일, 소속, 참여일,
최근 활동 시각만 반환한다. `학습 현황·리포트`의 수강생 행에 실제 값을 표시하려면
다음 필드를 응답에 추가하거나 별도 상세 집계 endpoint가 필요하다.

```json
{
  "averageProgressRate": 64,
  "aiQuestionCountLast7Days": 12
}
```

수강생이 많을 때도 검색·정렬·페이지네이션이 정확히 동작하도록 목록 query에
`q`, `sort=RECENT_ACTIVITY|NAME|LOW_PROGRESS`도 요청한다. FE는 계약 전까지 현재
받은 페이지 안에서만 검색·정렬하고, 없는 지표는 `-`로 표시한다.

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

강의실 수정의 `startDate`, `endDate`, `shiftWeekReleaseDates`도 공개 PATCH 계약에
연결했다. 영구 삭제 API도 2026-08-06 배포 Swagger에 추가되어 FE 재확인
다이얼로그와 연결했다.

```http
DELETE /api/classrooms/{classroomId}/permanent
```

영구 삭제는 확인용 강의실명을 body의 `confirmName`으로 전송하며, trim 후 현재
강의실명과 정확히 일치할 때만 요청한다.

## 연결 완료: 주차 순서와 운영 상태

주차 드래그 순서와 `PRIVATE`, `SCHEDULED`, `PUBLISHED`, `BREAK` 상태를 아래 API로
저장한다.

```http
PATCH /api/classrooms/{classroomId}/weeks/reorder
PATCH /api/classrooms/{classroomId}/weeks/{weekNumber}/status
```

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

## 계약 확인 필요

- 강의실 통합 콘텐츠 화면에서 주차별 공지를 저장하려면 공지 생성·수정·목록·상세
  계약에 선택 `weekNumber`가 필요하다.

  ```http
  POST  /api/classrooms/{classroomId}/notices
  PATCH /api/classrooms/{classroomId}/notices/{noticeId}
  GET   /api/classrooms/{classroomId}/notices
  ```

  생성·수정 요청과 응답에 `weekNumber: number | null`을 추가한다. `null`은 전체
  공지, 숫자는 해당 주차 공지다. 기존 응답처럼 필드가 없으면 FE는 전체 공지로
  해석하며 게시일로 주차를 추정하지 않는다. 배포 Swagger에 계약이 확인된 뒤
  `VITE_API_CAPABILITIES=notice-weeks`를 추가하면 주차 공지 저장 UI가 활성화된다.
- 공지 API는 현재 즉시 게시만 가능하다. 예약 게시가 범위라면 `publishAt` 필드 또는
  별도 예약 endpoint가 필요하다.
- 자료 업로드는 Swagger상 PDF 전용이다. PPT/PPTX 지원 계획이 있다면 허용 MIME,
  변환 상태, 변환 실패 사유를 계약에 추가해야 한다.
- 업로드 요청이 `200`이어도 비동기 처리 후 `FAILED`가 될 수 있으므로 목록·상세
  응답에서 `failureReason`을 일관되게 제공하고 운영 로그의 추적 ID를 반환해야 한다.
- 강의실 목록 정렬은 `RECENT`, `NAME`만 지원한다. 학습자 UI의 진도 낮은 순과 새
  자료 우선 정렬을 서버에서 지원하려면 enum 확장이 필요하다.
- 강의자 강의실 카드의 자료 수를 표시하기 위해 현재는 각 강의실의 주차 목록을
  추가 조회한다. `ClassroomSummaryResponse.materialCount`를 제공하면 목록의 N+1
  요청을 제거할 수 있다.
