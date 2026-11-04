# Composer prediction FE 준비 및 차단 사항

2026-11-04 개발 채널의 고영빈 3부 인계와 한승준 21:20 인계에 맞춘 준비입니다.
현재 원격 BE develop에는 Spring composer-prediction endpoint가 없습니다.
AI 내부 API를 FE에서 직접 호출하지 않습니다.

## 구현한 부분

- 인증된 raw request를 주입하는 별도 POST SSE transport:
  `/api/sessions/{sessionId}/composer-prediction`, 본문 `{sourceMessageId}`,
  `prediction` 이벤트. usage나 대화 본문은 FE 요청에 넣거나 저장하지 않습니다.
- schemaVersion=1.0, persisted sourceMessageId, `message-{id}` sourceTurnId,
  current contextVersion, 최대 160자/null suggestion 검증. 사전 차단의 null context는 표시하지 않습니다.
- `ChatPanel`의 선택적 predictionRequest / predictionTarget / predictionBlocked 입력과
  취소·중복 억제 hook. 입력·새 전송·페이지/세션/계정/탭 전환·평가 차단·pagehide 시
  AbortSignal을 사용하며, 응답 시 source/서버 contextVersion/로컬 입력 세대를 다시 대조합니다.
- 빈 입력창에만 표시, Tab 또는 44px 수락 버튼으로 편집 가능한 초안에 반영,
  별도 사용자 전송. 입력 잠금·채팅 오류·자동 재시도·미수락 제안 저장은 없습니다.
- 현재 화면에서 제안을 끌 수 있습니다. 계정별 영속 설정 계약은 아직 협의 대상입니다.
- FE gate `VITE_COMPOSER_PREDICTION_READINESS=spring-composer-prediction-sse-v1`이
  정확히 맞아야 요청합니다. 이 값을 배포 설정에 추가하지 않았습니다.

## 선행 계약 미충족 — 운영 페이지에서는 아직 호출하지 않음

`SessionDetailPage`는 prediction prop을 공급하지 않습니다. 기존 호출 흐름에
임의 필드를 추가하거나 현재 contextVersion을 `Date.now`, 로컬 페이지 번호,
학습 실행 UUID 또는 예측 응답 자체에서 추론하지 않았습니다.

Spring 담당자와 다음을 확인해야 합니다.

1. 완료·저장된 공개 설명/QA 메시지 ID와 함께 **현재 서버 생성 contextVersion을
   예측 응답과 독립적으로 FE가 받는 경로/필드**. 현재 SessionTurnResult와 session
   detail DTO에는 그 값이 없습니다. 요청 본문에는 sourceMessageId만 있다는 인계입니다.
2. 새 대화/리셋/평가 진입 시 현재 문맥 버전·activity 변경의 전달 계약.
3. 실제 Spring SSE DTO/종료/오류와 sourceTurnId 매핑, 중복 비용 억제·호출 한도,
   취소 전파의 원격 커밋 및 DEV 합성 연동 증거.

계약 확정 후 SessionDetailPage가 완료·저장 성공을 근거로 target을 공급하고
EXPLAIN/QA 외 단계에서는 blocked=true로 설정해야 합니다. 지금 PR은 adapter,
초안 UI와 합성 경쟁 상태 검증이며 실환경 연동 완료가 아닙니다.

합성 테스트: 별도 SSE body, OFF/평가 단계 무요청, 취소 무시한 늦은 응답,
페이지/문맥 변경, null/실패 무표시, 중복 이벤트, Tab/클릭→편집→명시 전송.
