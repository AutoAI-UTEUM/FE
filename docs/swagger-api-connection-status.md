# Swagger API 연결 상태

## 기준

- 확인일: 2026-08-20
- Swagger UI: <https://edu-pilot.duckdns.org/swagger-ui/index.html>
- OpenAPI JSON: <https://edu-pilot.duckdns.org/v3/api-docs>
- BE 문서: `AutoAI-EduPilot/BE` `develop`의 `docs/api-spec.md`
- Swagger operation: 100개

`화면 연결`은 실제 페이지나 hook에서 사용자가 호출할 수 있는 상태를 뜻한다.
`repository 준비`는 계약과 mapper가 구현됐지만 현재 화면에 직접 조작 UI가 없는
상태를 뜻한다. 테스트 fixture나 주석은 연결로 계산하지 않는다.

## 이번 반영

- 인앱 알림: `GET /api/users/me/notifications`를 사이드바 알림 패널에 연결하고,
  서버 `readAt` 기준 미읽음 배지와 개별·전체 읽음 처리를 제공한다.
  `PATCH /api/users/me/notifications/{notificationId}/read`와
  `DELETE /api/users/me/notifications/{notificationId}`도 연결했으며, 알림 유형별
  `link`를 자료·공지·입장 요청 화면 경로로 변환한다.
- 수강생 목록: `GET /api/classrooms/{id}/students`의 `q`와
  `sort=RECENT_ACTIVITY|NAME|LOW_PROGRESS`를 연결했다. 이름 검색과 정렬은 서버에서
  수행하며 `averageProgressRate`, `aiQuestionCountLast7Days`를 수강생 표와 CSV에
  표시한다.
- 자료 처리 실패: 자료 목록·상세의 `failureReason` enum을 사용자 문구로 변환하고
  `traceId`가 있으면 문의 코드로 표시한다. 구형 실패 자료의 nullable 응답도
  일반 실패 문구로 처리한다.
- 강의실 목록: `ClassroomSummaryResponse.materialCount`를 매핑하고 주차 목록 조회가
  실패해도 서버 집계값을 유지한다.
- 학습 메시지: 조회 응답의 `status=FAILED`와 동일 `requestId` 재시도 흐름,
  `POST /api/sessions/{sessionId}/quiz-decline` 연결을 재검증했다.
- 강의실 영구 삭제: `DELETE /api/classrooms/{id}/permanent`를 강의실 설정의
  재확인 모달에 연결했다. 현재 강의실 이름을 정확히 입력해야 요청할 수 있다.
- 배포 Swagger에 추가된 리포트·학습현황·수강생 관리·개인 일정·주차 상태/순서
  API가 실제 화면과 repository에 연결된 상태임을 재검증했다.
- 별도 시험: 강사 초안 생성·조회·수정·삭제·공개·종료·제출 현황과 학습자
  목록·응시·결과 조회를 역할별 화면에 연결. DRAFT 시험의 `AI 초안으로 시작`은
  생성 범위와 문항 구성을 받아 편집기에 불러오며 검토 후 저장해야 반영된다.
- 통합학습: 페이지 이동 PATCH와 `EXPLAIN_CURRENT_PAGE`를 재검증하고,
  `pageStatus=QUIZ_READY`와 `activeQuizId`가 함께 복원되면 퀴즈를 자동으로 연다.

## 이전 반영 (강의자 시안 5c·8c 조작 UI)

- 공지 관리: 공지별 `수정`·`내리기` (PATCH/DELETE notices)
- 자료 관리: 주차 자료 `삭제`(주차에서 제거, DELETE week-material),
  공개 예정 주차 `지금 공개`(PATCH week releaseAt)

## 이전 반영

- 회원가입 부가정보: 소속, 학습 이메일 수신 동의, 약관·개인정보 버전 전송
- 사용자: 프로필 수정, 아바타 조회·업로드·삭제, 환경설정 조회·저장
- 강의실: 역할별 목록·상세·생성, 참여 요청, 초대 코드, 주차 조회·생성,
  주차별 PDF 업로드
- 운영: 참여 요청 조회·승인·거절, 공지 조회·등록
- 캘린더: 주차 공개·공지 게시 파생 일정 조회
- 학습: 세션 노트 조회·생성·삭제
- 공통: 피드백 접수

## 화면 연결

### 인증·사용자

`POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/refresh`,
`POST /api/auth/logout`, `GET /api/auth/email-availability`,
`GET/PATCH/DELETE /api/users/me`, `GET/POST/DELETE /api/users/me/avatar`,
`GET/PATCH /api/users/me/preferences`,
`GET/PATCH/DELETE /api/users/me/notifications/...`,
`GET/POST/PATCH/DELETE /api/users/me/schedule/...`

### 강의실

`GET/POST /api/classrooms`, `GET /api/classrooms/{id}`,
`PATCH/DELETE /api/classrooms/{id}`, `DELETE /api/classrooms/{id}/permanent`,
`GET /api/classrooms/{id}/invite-code`, `POST /api/classroom-join-requests`,
`GET /api/classrooms/{id}/join-requests`, 개별 `approve`·`reject`,
`GET/POST /api/classrooms/{id}/weeks`,
`PATCH /api/classrooms/{id}/weeks/{weekId}/status`,
`GET /api/classrooms/{id}/students`의 검색·정렬·학습 지표,
`DELETE /api/classrooms/{id}/students/{studentId}`,
`GET /api/classrooms/{id}/analytics`,
`GET/POST/PATCH/DELETE /api/classrooms/{id}/notices/...`,
`DELETE /api/classrooms/{id}/weeks/{weekNumber}/materials/{materialId}`

### 자료·학습

기존 자료, 세션, 턴/SSE, 퀴즈 API와 함께
`GET/POST /api/sessions/{sessionId}/notes`, `DELETE /api/notes/{noteId}`를
화면에서 사용한다. 강의실 자료 업로드는 `POST /api/materials`의
`classroomId`, `weekNumber` multipart 필드를 전송한다.

### 별도 시험

`GET/POST /api/classrooms/{classroomId}/exams`,
`POST /api/classrooms/{classroomId}/exams/{examId}/draft-questions`,
`GET/PATCH/DELETE /api/exams/{examId}`,
`POST /api/exams/{examId}/publish`, `POST /api/exams/{examId}/close`,
`GET/POST /api/exams/{examId}/submissions`,
`GET /api/exams/{examId}/submissions/me`

### 운영

`GET /api/health`, `GET /api/health/ready`, `POST /api/feedback`

### 리포트

`GET/POST /api/classrooms/{classroomId}/report-criteria`,
`PATCH /api/classrooms/{classroomId}/report-criteria/{criterionId}`,
`GET/POST /api/classrooms/{classroomId}/students/{studentId}/reports`,
`GET /api/reports/{reportId}`. 생성은 응답 본문의 `status`와
`pollAfterSeconds`로 폴링하며 `score=null`은 데이터 부족으로 표시한다.

## Repository 준비

아래 API는 typed repository까지 구현했으며 해당 편집 UI가 추가될 때 바로 사용할
수 있다.

- `GET /api/classroom-join-requests/me`: 학습자 본인의 요청 상태·이력 UI 없음
- `POST /api/classrooms/{id}/weeks/{weekNumber}/materials/{materialId}`: 기존 자료
  재연결 UI 없음 — 새 PDF 업로드 경로만 사용
- `GET /api/materials/{materialId}/notes`: 자료 단위 노트 목록 UI 없음
- `GET /api/users/me/memory?materialId={materialId}`: 자료별 학습 메모리 UI 없음
- `GET /api/exams/{examId}/submissions/{submissionId}`: 강의자 제출 상세 UI 없음
- `POST /api/sessions/{sessionId}/conversations`: 새 대화 시작 UI 없음

아래 API는 화면에서 일부만 사용한다.

- `PATCH /api/classrooms/{id}/weeks/{weekNumber}`: 주차 이름 수정은 제공하지만
  개별 `releaseAt` 편집 UI는 없음
- `PATCH /api/classrooms/{classroomId}/report-criteria/{criterionId}`: 활성 상태
  전환은 제공하지만 이름·설명·rubric·가중치 편집 UI는 없음

## 계약 메모

- 배포 Swagger와 BE `develop` 명세는 사용자·알림·강의실·노트·피드백·별도 시험
  범위에서 일치한다. 시험 목록과 역할별 상세 응답은 Swagger가 generic object로
  표시하므로 구체 필드는 `api-spec.md` 계약을 기준으로 매핑한다.
- AI 문항 초안의 `sourcePageNumber`는 실제 PDF 페이지가 아니라 사용된 컨텍스트
  순번이므로 화면에는 `참고 자료 N번`으로 표시한다. 초안은 자동 저장하지 않는다.
- 배포 자료 업로드 summary는 PDF 전용이다. FE 강의실 업로드도 PDF만 허용한다.
- `GET /api/users/me/schedule`은 주차 공개·공지 게시·개인 일정을 통합 조회한다.
  개인 일정 생성·수정·삭제는 동일 schedule API의 POST/PATCH/DELETE에 연결했다.
- 리포트 질문 `POST /api/reports/{reportId}/questions`는 배포 Swagger에 없고
  Phase 3 범위이므로 UI에서 제공하지 않는다.
- BE 문서의 내부 AI endpoint와 페이지 텍스트 endpoint는 브라우저 공개 계약이
  아니므로 FE에서 직접 호출하지 않는다.
