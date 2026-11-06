# AutoAI / 개발 채널 게시용 BE 요청

**상태: 미게시.** Discord 연결 도구가 없고, 실행 중인 Discord 앱 창 접근은 승인 시간 초과였다. 대체 인앱 브라우저 `https://discord.com/channels/@me`는 로그인 화면으로 이동했다. 서버/개발 채널·최근 대화를 확인할 수 없어서 중복 검토와 게시를 수행하지 못했다. 전송 요청 자체를 하지 않았으며 게시 링크나 실제 게시 내용은 없다. 로그인/앱 접근이 가능해지면 최근 대화와 중복을 확인한 뒤 아래 내용을 게시한다.

아래 경로·필드는 **계약 협의안**이다. 새로운 BE 기능이 이미 존재하거나 합의되었다는 뜻이 아니다. 실제 학생 정보나 비밀을 포함하지 않는다.

## 메시지 1 · 기존 계약 활용 및 확인 요청

선생님 피드백 반영 중 BE 계약 확인드립니다.
원문: https://app.notion.com/p/4090a17c91ac80a08589fb3f5899f8d5
코드 대조: BE develop abc0137 / FE develop 128d4f2.

진행률·이어하기는 신규 API 요청이 아닙니다. 기존 GET /api/classrooms/{id}의 progressRate 및 lastStudied(sessionId, materialId, materialTitle, pageNumber, updatedAt)를 FE에 연결했습니다. 진행률은 LearningProgressService의 설명 완료 페이지 집계값을 표시하며, 페이지 이동을 학습 완료로 취급하지 않습니다. 최근 자료가 현재 공개 READY 주차 자료에 있을 때만 이어하기를 표시합니다.

기존 DELETE /api/classrooms/{id}(운영 종료), /api/classrooms/{id}/permanent(영구 삭제)도 새로 만들 필요 없습니다. 기존 관리 화면을 유지합니다. 소유 강사·강의실명 확인과 개인 자료/세션/진도 보존을 실제 배포 API에서도 동일하게 확인 부탁드립니다. 공개된 과거 주차는 날짜 경과만으로 막지 않는지, 비공개 전환·탈퇴·완료 강의실에서 학습/읽기 권한이 어떤지 인수 시 함께 확인하고 싶습니다.

완료 기준: 멤버는 공개 과거 주차를 열고 기존 sessionId·쪽으로 복귀, 비멤버·권한 회수·비공개 자료는 기존 권한 오류 및 새로고침 동작 유지. 반환 없는 lastStudied를 가짜 데이터로 채우지 않음.

## 메시지 2 · 퀴즈 초안과 필기 동기화

피드백: 퀴즈 중 이탈 시 답안 유실, 펜·학습 중 메모 부재입니다. FE는 우선 계정/퀴즈/문항 또는 세션/쪽으로 분리한 브라우저 임시저장과 펜/글자 메모를 구현하고 로컬 전용임을 표시했습니다.

기존 /api/quizzes/{id}는 공개 문항·submission·submit만 있고, 시험 응시 draft는 별도 기능이라 퀴즈 초안으로 재사용하지 않았습니다. 퀴즈 draft의 GET/PUT 또는 PATCH/DELETE 계약 협의가 필요합니다(경로 제안: /api/quizzes/{quizId}/draft).
요청 후보: requestId, expectedVersion, questionSnapshotVersion, answers[{questionId, answer}], currentQuestionId. 응답 후보: version, savedAt, expiresAt, answers, currentQuestionId. 서버의 최신 문항·소유권·자료 접근권·제출 여부를 매 요청 검증하고 제출 확정 후 draft 처리 및 보관 기간을 정해주세요. 기기간 갱신 충돌은 409와 서버 버전을 반환하는 방식 등을 합의하고 싶습니다.

기존 /api/user-notes는 content/materialId/pageNumber를 지원하지만 quiz/question 연결과 strokes 계약은 없습니다. 새 저장소를 만들기 전에 기존 노트 확장 가능성을 검토 부탁드립니다. 후보 필드: scope(sessionId/pageNumber 또는 quizId/questionId), text, strokes, coordinateSystem/version, expectedVersion. 필기 크기/획/좌표 한도 및 삭제·만료 정책도 필요합니다.

오류/완료 기준: 401·검증 오류·권한 없음·제출 후 수정·버전 충돌·용량 제한을 구분. 타 계정 초안 접근 불가, 실패를 저장 성공으로 표시하지 않음, 기기간 복원·재시도 멱등성·제출 전 정답 비노출 검증.

## 메시지 3 · 난이도와 수업페이지 입력 의미 확인

원문 ‘문제풀이시 작성자에 따라 난이도 선택’은 교사 생성 시 지정인지, 학습자가 응시 전 선택하는지 미확정입니다. FE는 사용자에게 확인 중이며 임의 difficulty payload나 실제 동작하지 않는 선택기를 추가하지 않았습니다. 기존 QUIZ_TYPE_SELECTED turn의 유형(kind)과 난이도는 구별합니다.

범위가 확정되면 기존 POST /api/sessions/{sessionId}/turns 확장 여부와 서버/AI 프롬프트 반영 계약을 논의하고 싶습니다. 후보: difficulty 허용 enum, 설정 주체/권한, quiz kind·coverage와 함께 전달되는 값, 반환 퀴즈/이력에 실제 적용 난이도 표기. 미지원 값은 검증 오류, 진행 중 생성/제출한 퀴즈의 난이도 변경은 명시적인 충돌로 처리하는 방향입니다.
완료 기준: 선택이 실제 문항 생성에 반영됨을 합성 계약 테스트로 확인하고, 범용 기본값과 선택값이 이력에서 구별되며 기존 유형 선택을 보존합니다.

‘수업페이지 직접 입력’도 PDF 쪽수 점프인지 교사가 수업 본문을 텍스트로 작성하는지 확인 중입니다. 전자라면 기존 PATCH /api/sessions/{id}/page의 pageNumber를 활용할 수 있어 새 API 요청이 아닙니다. 후자라면 텍스트 수업 작성·검증·변환 상태 계약이 별도 필요합니다. 의미 확정 전 새 기능 범위를 약속하지 않습니다.

## 메시지 4 · 받아쓰기 TTS/OCR 및 보호자 지원

초1 받아쓰기 요청의 원하는 흐름: 교사가 문장을 입력 → 학생은 음성을 듣고 손글씨 작성 → 이미지/필기 제출 → OCR 결과 확인/필요한 교정 → 평가 결과입니다. 현재 공개 컨트롤러에서 해당 평가 계약을 확인하지 못했습니다.

신규 작업 생성/상태/재시도 API 협의가 필요합니다. 후보 요청: classroomId, 문장 목록, 재생 locale/속도(허용값), assignmentId, requestId, 답안 이미지 업로드 참조. 응답: jobId/status(PENDING/PROCESSING/COMPLETED/FAILED), 접근 통제된 audio 참조, 문항/제출 ID, OCR 인식문/불확실 구간, 교정 이력, score/maxScore, 항목 피드백, 재시도 가능 오류/traceId. FE는 Spring만 호출하고 AI 제공자에 직접 접근하지 않습니다.
권한: 소유 강사만 정답 문장 관리, 배정된 학생만 음성·본인 제출 접근. 제출 전 학생 응답에 교사용 원문 정답을 노출하지 않음. OCR 교정 주체, 띄어쓰기/맞춤법/부분점수, 원본 보관·삭제와 비용 한도는 정책 결정이 필요합니다. 완료 기준: 비동기/실패 복구, 중복 제출 멱등성, 교사 검토·수정 추적, 권한 격리 및 실제 음성/OCR 인수.

보호자 지원은 제안 단계입니다. 기존 guardian 연령 확인/동의 기능과 학습 참여 권한은 다릅니다. 먼저 보호자-학생 관계 확인·조회/보조 입력 범위·철회/만료·기록 주체를 정해야 합니다. 확정 후 관계 상태/allowedActions·범위 밖 거절 계약을 협의하며 기존 기능을 활성화하거나 새 보호자 역할을 임의 신설하지 않았습니다.
