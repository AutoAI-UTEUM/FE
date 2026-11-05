# FE 남은 작업 우선순위 — 2026-11-05

기준: 최신 원격 FE develop `fc039a17f4881b2091a12c36ef832537482bf568`,
main `5d801d5af3810e0af5600da40d5492d0f9e32204`, BE #571 merged
`b6ea8b20db410ee457e3d68d59963b8830a7d01b`의 FE handoff.
GitHub 열린 PR 목록과 로컬 코드를 대조했다. 11/4 21:20 이후 Discord의 추가 계약은
이 후속 작업에서 확인하지 않았으며 최신 근거는 원격 PR/코드다.

## 완료에서 제외한 항목

- FE #247: 보호자 사전 동의 관리자 준비, composer transport·취소 hook·초안 UI 및 #571 공통 필드 보완이 develop에 병합됨.
- FE #248: 같은 범위의 선택적 main 반영 완료. 현재 후속은 별도 develop 대상이며 main 동기화·배포를 하지 않음.
- Google 회원가입 장애: 사용자 요청으로 보류. 기존 Discord BE 로그 확인 요청 이후 재시도·수정하지 않음.

## 우선순위와 처리

1. **새 구현: composer 학습 화면 연결.** #247 adapter는 존재하지만 SessionDetailPage가 호출 source를 주지 않음. #571의 구체적인 저장 메시지 계약이 있어 FE 단독 합성 검증 가능. 이번 브랜치에서 기본 OFF 연결, POST 완료 시점, source 선택, IME/페이지/계정/초기화/평가 취소를 구현함.
2. **기존 후보 검토: #241 보호 파일 캐시.** FE·BE550 동시 반영 및 배포된 헤더·기존 탭 검증이 필요. 준비된 PR을 중복 구현하지 않음. 병합·배포는 이번 범위 밖.
3. **기존 후보 검토: #239 강사 점수 변경 사유.** BE548 계약의 저장·조회 UI와 합성 회귀가 별도 PR에 있음. 최신 develop 통합 검토·실제 BE 인수는 남음. 기존 PR 보존.
4. **기존 후보 검토: #244 교사 피드백 및 #240 모바일 알림.** 구현·합성 증거는 별도 PR에 있음. #244 수업페이지 직접 입력의 의미와 난이도 선택 주체는 미정. 기기간 답안/필기 동기화, TTS/OCR, 보호자 보조 권한은 서버·제품 계약 선행.
5. **조건 충족 후 인수: #238 보호자 정책 범위 및 #247 사전 동의.** 기능 OFF. 최종 정책·권한·증빙·메일 인수·서버 준비가 선행해야 하므로 실제 계정 승인/메일 시험은 수행하지 않음.

## 이번 변경 검증

- CI와 같은 `VITE_API_BASE_URL=/api VITE_API_CAPABILITIES=reports,policy-consent` 및 Mac Node26의 `NODE_OPTIONS=--no-experimental-webstorage`로 전체 Vitest: **110파일, 1,195개 통과**, 실패/skip 0 (`--maxWorkers=2`).
- 실제 SessionDetailPage→useSessionChat→저장 응답 mapping→POST SSE→수락 초안을 합성 fetch로 검증. ready/OFF/미지원 TEACHBACK action, POST 전 무요청과 정확한 `{sourceMessageId}` body, 별도 사용자 전송·중복 억제를 확인.
- 정상 POST source만 등록, 초기 이력·SSE 완료는 무후보. reset 및 진행 중 페이지 변경 후 복귀는 무후보. 잘못된 ID/상태/페이지/평가 메시지·미지원 액션/비정상 HTTP 차단. IME 조합 전체 기간의 무요청·표시 제거 포함.
- 전체 lint·typecheck·production build 확인. 기존 500kB chunk 경고는 유지.
- 최초 전체 실행은 CI 환경 변수 없이 실행해 관련 없는 API 화면들이 실패했으므로 통과 증거에서 제외. 별도 집중 실행 중 기존 page baseline unmount 검사도 1회 실패했으며, 최종 집중/전체 실행에서 통과. 제품 코드의 해당 page baseline 경로는 변경하지 않음.
- 실제 브라우저/실기기·FastAPI/provider·MySQL·프록시 SSE E2E는 이번에 실행하지 않음. 합성 React/fetch 검증을 실제 인수로 표시하지 않음.

## 남은 의존성

Composer Spring/AI 배포, 정책 승인·양의 한도/비용 예약값, 명시적인 TEACHBACK 판별,
프록시 buffering·disconnect 전파·실기기 접근성/IME 인수 및 영속 opt-out API.
기존 FE readiness 값은 운영/개발 환경에 추가하지 않았다. 서버·보안·권한 설정,
실계정·메일·개인정보·DB, 병합·배포·기능 활성화는 변경하지 않았다.
