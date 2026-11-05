# Composer prediction FE 준비 및 차단 사항

2026-11-04 개발 채널의 고영빈 3부 인계와 한승준 21:20 인계에 맞춘 준비입니다.
BE #571 (`266c5b8`)의 원격 develop handoff가 추가되었습니다. Spring endpoint는 기본 OFF이며 운영 배포·실환경 연동 인수는 확인되지 않았습니다.
AI 내부 API를 FE에서 직접 호출하지 않습니다.

## 구현한 부분

- 인증된 raw request를 주입하는 별도 POST SSE transport:
  `/api/sessions/{sessionId}/composer-prediction`, 본문 `{sourceMessageId}`,
  `prediction` 이벤트. usage나 대화 본문은 FE 요청에 넣거나 저장하지 않습니다.
- schemaVersion=1.0, persisted sourceMessageId, `message-{id}` sourceTurnId,
  서버 소유 64자리 SHA-256 contextVersion, 객체 warnings, 최대 160자/null suggestion 검증. 사전 차단의 null context는 표시하지 않습니다.
- `ChatPanel`의 선택적 predictionRequest / predictionTarget / predictionBlocked 입력과
  취소·중복 억제 hook. 입력·새 전송·페이지/세션/계정/탭 전환·평가 차단·pagehide 시
  AbortSignal을 사용하며, 응답 시 source/서버 contextVersion/로컬 입력 세대를 다시 대조합니다.
- 빈 입력창에만 표시, Tab 또는 44px 수락 버튼으로 편집 가능한 초안에 반영,
  별도 사용자 전송. 입력 잠금·채팅 오류·자동 재시도·미수락 제안 저장은 없습니다.
- 현재 화면에서 제안을 끌 수 있습니다. 계정별 영속 설정 계약은 아직 협의 대상입니다.
- FE gate `VITE_COMPOSER_PREDICTION_READINESS=spring-composer-prediction-sse-v1`이
  정확히 맞아야 요청합니다. 이 값을 배포 설정에 추가하지 않았습니다.

## 활성화·실제 페이지 연결 대기

`SessionDetailPage`는 prediction prop을 공급하지 않습니다. 추천은 배포 후에도
자동 호출되지 않습니다. 최신 BE handoff는 FE가 contextVersion을 독립적으로
받거나 계산할 것을 요구하지 않습니다. 서버가 생성한 64자리 SHA-256을 응답에서
검증하고, FE는 요청 당시 session/page/source와 client generation을 대조합니다.
이전 독립 contextVersion 선행 조건은 이번 계약 대조로 제거했습니다.

실제 페이지 연결 시 완료·저장된 turn POST 응답을 기다린 뒤 마지막 COMPLETED
EXPLANATION/QA 저장 AI 메시지 ID를 선택해야 합니다. SSE completed만 보고 먼저
호출하면 안 됩니다. IME 시작·새 turn·페이지/세션/대화/source 변경·opt-out·평가·이탈
취소와 늦은 응답 폐기를 함께 검증해야 합니다.

Spring/AI 배포·양쪽 플래그/정책/비용 한도 준비, TEACHBACK 등 평가 단계의 명시적
gate, 프록시 buffering·HTTP 취소·실모델/MySQL E2E와 모바일/스크린리더 인수가
아직 확인되지 않았습니다. 현재 PR은 adapter·초안 UI의 준비 코드이며 실제 추천
서비스 출시 완료가 아닙니다. 플래그와 서버 설정은 변경하지 않습니다.

합성 테스트: 별도 SSE body, OFF/평가 단계 무요청, 취소 무시한 늦은 응답,
페이지/문맥 변경, null/실패 무표시, 중복 이벤트, Tab/클릭→편집→명시 전송.
