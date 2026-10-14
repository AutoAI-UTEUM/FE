# 강사 수동 점수 변경 사유 FE 계약 검증 (2026-10-14)

## 선정 근거와 기준

- 부모 환경에서 실제로 읽은 [AutoAI 개발 채널](https://discord.com/channels/1542688939742339153/1555440530643746996)의 10월 13일 BE548 후속 보고를 전달받았다. 이 Windows 환경에서는 Discord 브라우저 연결이 MXC 오류로 실패했으며, 직접 읽었다고 주장하지 않는다.
- GitHub를 직접 대조했을 때 [BE548](https://github.com/AutoAI-UTEUM/BE/pull/548)은 병합됐고 BE develop은 `8163a8269a2a68c4595b0643caea62e91c1f5e1c`였다. FE develop은 `0ae5650e5796ce3b217c389e253b676265b89e48`, 열린 FE PR은 보호자 범위 Draft238뿐이었다.
- 기존 FE는 PATCH에 `{ score }`만 보냈다. BE는 사유 생략도 기존 사유 삭제로 처리하므로 점수만 다시 저장하면 사유가 지워질 수 있었다. 공통 매퍼의 `...item`으로 런타임 응답 필드가 보존될 수 있었지만 타입·입력·표시는 없었다.
- 관련 AGENTS.md와 `.agents/skills`를 확인했으나 해당 체크아웃과 확인한 상위 경로에서 적용 파일을 찾지 못했다. README의 lint·타입·전체 단위·빌드 절차를 따른다.

## 기준 계약과 구현

- [ManualScoreAdjustmentRequest](https://github.com/AutoAI-UTEUM/BE/blob/8163a8269a2a68c4595b0643caea62e91c1f5e1c/main-service/src/main/java/io/edupilot/exam/dto/ManualScoreAdjustmentRequest.java): `score` + 선택 `reason`, 원문 최대 500 UTF-16 code units.
- [InstructorExamService](https://github.com/AutoAI-UTEUM/BE/blob/8163a8269a2a68c4595b0643caea62e91c1f5e1c/main-service/src/main/java/io/edupilot/exam/InstructorExamService.java): 원문 길이 검증 후 Java `isBlank`/`strip`; 생략·null·공백은 null로 기존 사유 삭제. GRADED만 변경 가능하며 점수·길이 오류는 400, 상태 충돌은 409다.
- [InstructorExamAnswerResultResponse](https://github.com/AutoAI-UTEUM/BE/blob/8163a8269a2a68c4595b0643caea62e91c1f5e1c/main-service/src/main/java/io/edupilot/exam/dto/InstructorExamAnswerResultResponse.java): 소유 강사 상세 GET·수정 응답의 `items[].manualScoreReason`. 전체 변경 이력이 아니라 현재 사유이며 학생 응답에는 없다.
- 기존 사유를 문항별 입력란에 채우고 점수와 함께 전송한다. 입력을 비워 저장하면 삭제한다. FE는 원문을 보내고 서버가 반환한 정규화 값을 표시한다.
- 저장 성공 전에는 이전 저장값을 표시하고 실패 시 입력을 유지한다. 다른 문항의 미저장 초안을 보존하며 pending 중에는 중복 저장과 편집을 막는다.
- 기존 request/submission/account 스코프 remount·abort·늦은 응답 차단을 유지한다. repository의 `AbortSignal`은 기존 5번째 인수 위치를 유지하고 4번째 인수만 `{ score, reason? }`로 명시했다. 저장된 사유가 없던 score-only 요청도 지원한다.
- 학습자 제출·조회·재채점 모델에서는 사유를 명시적으로 제외한다. 저장된 사유와 편집란은 인쇄 CSS에서 숨겨 답안 PDF로 우발 출력되지 않게 한다.

## 로컬 검증과 증거

테스트는 목·합성 입력과 로컬 서버만 사용했다. 최종 lint·타입 검사·프로덕션 빌드는 통과했다. 전체 단위·통합 108개 파일에서 1,180개 통과, 실패·제외 0이며 아래 관련 4개 파일의 65개도 포함한다. 빌드에는 기존 500 kB 초과 chunk 경고가 있다.

- 관련 단위 검증: 누락/null/empty/공백, 500/501, 서로게이트 문자, 기존 사유 유지·삭제·교체·재조회, raw 공백 전송, 서버 오류·네트워크 오류 후 수동 재시도, 다른 문항 초안 보존, abort·늦은 응답·중복 저장, 학습자 모델 비노출.
- Chromium 브라우저: PC 1440×900, phone 390×844, tablet 1280×800에서 저장·복원·삭제·실패·뒤로가기·다른 학습자 격리·인쇄 숨김·긴 사유 overflow 검증. 12 통과, 실패·제외·flaky 0.
- 브라우저 사진은 `qa-artifacts/mock/test-results/**/manual-reason.png`, JSON은 `qa-artifacts/mock/results.json`에 있다. 전체 단위 결과는 `qa-artifacts/manual-score-reason/full-unit.json`이다. 산출물은 gitignore 대상으로 커밋하지 않는다.
- 첫 전체 실행은 의존성 junction의 외부 PDF worker 경로가 Vite에서 거부돼 실패했다. 연결만 제거하고 새 작업트리에 의존성을 복사했다. 첫 브라우저 실행은 저장값과 textarea를 함께 찾는 모호한 선택자 6건이 실패했고 실제 저장된 문단을 검증하도록 수정했다. 이 실행들은 성공으로 집계하지 않는다.
- CI의 기존 navigation job에 새 사유와 제출 스코프 회귀를 PC·phone 목 환경으로 추가하고 증거 업로드를 연결했다.

## 보존과 남은 범위

- 별도 `codex/manual-score-reason-20261014` 작업트리에서 구현했다. 원래 FE develop 체크아웃의 HEAD `a2e78bd7b15ab73ffd685a8f88bd083219d4284a`와 사용자 변경 18개 상태 행을 보존한다. 기존 FE238 작업트리도 변경하지 않는다.
- 강제 push, 병합, 배포, 기능 활성화, 실제 계정·메일·개인정보·DB 변경, 권한·서버 설정 변경, 유료 외부 모델 API 호출은 수행하지 않는다.
- 실제 BE 연결 인수, Safari 실기기, 기존 보호자·복원·SSE 운영 인수는 이번 합성 검증의 통과 범위에 포함하지 않는다.
