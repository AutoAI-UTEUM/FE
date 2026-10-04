# 가입·이메일 확인 FE 계약 준비 및 합성 인수

기준 FE는 `1b6987d8472a064a080a00bd43232993e9bd41eb`이다. [BE502 계약 문서](https://github.com/AutoAI-UTEUM/BE/blob/d0047567c2864e999e1c5bac781a39ac43de8a3e/docs/qa/fe-auth-contract/README.md)와 실제 BE 후보 `ee69e4259b1b80871fdc1805a7b42d8628ac57e9`의 Signup/Google DTO, AuthService/GoogleAccountService, 정책 summary/detail, 이메일 controller/service/gate/webconfig, user/signup response를 읽어 대조했다. BE502는 docs/fixtures PR이며 runtime 배포 증거가 아니다. 저장소에는 AGENTS.md, .agents, .codex 또는 로컬 skill 지침이 없었다.

## 기본 OFF와 활성화 기준

`VITE_AUTH_CONTRACT_READINESS`가 정확히 `be-auth-ee69e425-v1`인 빌드에만 신규 DOB 필수 입력, 가입 정책 조회·전달, 이메일 status/request/confirm 호출을 준비했다. 누락·오타·다른 값은 OFF다. HTTP 200/404나 optional 응답 필드를 deployment 신호로 사용하지 않는다. 기존 dev/prod 배포 workflow, capability 목록, OAuth 설정, 인증 보안정책과 BE 설정은 변경하지 않았다. CI/Playwright의 synthetic-ready 값은 로컬 합성 인수용이며 운영 활성화가 아니다.

활성화는 별도 부모 확인이 필요하다. BE 담당자가 실제 배포된 runtime의 계약과 migration 상태·가입 전환 시점·rollback을 확정하고, 대상 환경의 status/request/confirm 및 현재 정책 API readiness를 확인해야 한다. 실제 메일 base URL·최종 FE 경로, 발송/provider 상태 및 수신 증거도 담당자가 확정해야 한다. BE502 merge 여부만으로 이 값을 설정하지 않는다. 이 작업은 실제 계정 로그인·학생 데이터·메일/SMS 발송·유료 AI 호출·credential 읽기/출력을 실행하지 않았다.

## 구현과 호환성

- LOCAL과 신규 Google 연속 가입에 달력 날짜 DOB, 현재 requiresConsent 대상의 `{type, version}`만 전달한다. 정책 갱신 오류는 선택을 비우고 재조회·재동의를 요구한다. 기존 Google token-only 로그인에는 신규 입력을 강제하지 않는다. 이메일 충돌과 만료된 Google 인증은 가입 계속 상태와 구별한다.
- DOB는 저장 입력일 뿐이다. 만14세/성인, 보호자 관계·승인, AI 동의 완료를 만들지 않는다. 형식/존재하는 날짜/연도 1–9999만 검사한다. 미래일 제한 및 수정 API·연령정책은 미확정이다.
- login/me optional 이메일 3필드를 그대로 보존한다. 구형 서버의 필드 부재는 부재로 남고 지원 여부를 명시한다. signup의 userId와 확인시각 부재를 구별한다. UNKNOWN/PENDING + required=false는 업무 이용을 유지하지만 확인 완료 UI는 표시하지 않는다.
- `/verify-email`은 공개 경로다. 링크 열기·mount로 confirm하지 않고 명시적 버튼으로 공개 POST를 실행한다. confirm에 현재 Bearer·쿠키를 보내거나 세션을 만들지 않는다. 토큰 계정 결과는 현재 로그인 사용자에게 적용하지 않는다. 본인의 Bearer status와 me를 다시 읽는다.
- HTML 최상단에서 일반·인코딩·대소문자 경로의 token query/hash/history state를 제거한다. 정적 no-referrer 메타는 브라우저의 JS/CSS 선행 요청에도 토큰이 Referer로 실리지 않도록 한다. 토큰은 임시 메모리에만 유지하고 제출·실패·페이지 이탈·기본 OFF에서 지운다. return target에서 verify 경로를 제외한다. 새로고침 뒤에는 메일의 링크를 다시 열어야 한다.
- `EMAIL_VERIFICATION_REQUIRED` JSON/PDF/SSE HTTP 403은 세션을 유지하고 업무 화면을 확인 안내로 전환한다. 후속 업무 호출은 서버 요청 전에 중단한다. 본인 조회/비밀번호/preferences/avatar/consents와 계정 관리 화면을 유지한다. refresh/logout/자동 업무 재시도를 일으키지 않는다. 같은 계정 및 계정 전환의 늦은 상태 조회·403은 요청 순서와 이메일 상태 revision으로 무시한다.
- 202는 요청 접수이며 실제 발송·수신 성공이 아니다. 중복 제출은 동기 ref로 차단한다. 429에는 임의 남은 초·자동 재시도를 만들지 않는다. 링크 만료/재발급/사용/유효하지 않음은 같은 안내다.

## 검증 증거

BE 고정 합성 fixture를 `src/test/launchAuthFixtures.json`에 보존했다. 실제 API·DB·메일/provider를 검증했다고 주장하지 않는다.

| 검증 | 결과 |
| --- | --- |
| lint / typecheck / 기본 OFF build | 통과 |
| 전체 Vitest (기존 CI env: `/api`, `reports,policy-consent`) | 103 files / 1003 tests 통과 |
| 독립 리뷰 재실행: 계약·Google/정책 UI 테스트 | 22/22 통과 |
| synthetic-ready Chromium 계약 E2E | 11 통과, OFF 전용 1 skip |
| 기본 OFF Chromium 계약 E2E | 3 통과, ON 전용 9 skip |
| 기존 인증 다중탭 Chromium E2E | 3/3 통과 |

주요 인수는 기존/신규 LOCAL·Google, 이메일 충돌, DOB 오류, 정책 갱신·전문 열람·0개 필수 문서, 구형 필드 미지원, legacy UNKNOWN/PENDING, 중복 클릭, 만료/재발급/사용 링크, 익명·타계정 링크, 실제 두 탭 focus 재조회, 계정 전환·동일계정 늦은 응답, JSON/PDF/SSE 403이다. 독립 리뷰가 발견한 늦은 self lookup, 늦은 업무 403, encoded verify 경로 누락을 수정했고 잔여 코드 blocker가 없다는 결과를 받았다.

재현은 `VITE_API_BASE_URL=/api`와 기존 CI capability를 사용해 lint/typecheck/test:run/build를 실행한다. 신규 browser는 `QA_ENV=mock`에서 `npx playwright test --config playwright.launch-auth.config.ts`로 실행한다. 기본 OFF는 `QA_AUTH_CONTRACT_READINESS`를 비우고 ON 합성 인수는 `be-auth-ee69e425-v1`로 지정한다. 전용 port 4189와 strictPort로 서버 재사용/충돌을 막는다. 기존 인증 다중탭 E2E는 기존 port 4173에서 순차 실행한다. Vitest/esbuild의 Windows 상위 경로 읽기 제한 때문에 합성 test/build는 승인된 sandbox 밖에서 실행했다.

Frontend CI에 exact PR head checkout의 default-off/synthetic-ready browser matrix를 추가했다. 기존 frontend-ci와 auth-browser-regressions도 통과해야 한다. 최종 SHA 및 Actions 결과는 PR에 연결한다. repository protection/capability 설정은 변경하지 않는다.

## 부모에게 남기는 미확정 계약

1. DOB 미래일·정정 절차·나이 계산 기준일/시간대·윤년 정책. 전역 guardian/agegate는 미완성이며 이 변경이 완성시키지 않는다.
2. requiresConsent 문서가 0개인 경우: 후보 runtime은 빈 배열을 허용하지만 옛 문서와 차이가 있다. 합성 인수는 관찰된 후보 동작을 따른다. 정책 운영 조건은 BE/정책 담당자 확인이 필요하다.
3. 명시적 runtime 배포 신호/FE 활성화 시점 및 메일 base URL·실제 발송/수신 조건. readiness 환경값의 실제 설정은 부모 확인 전 수행하지 않는다.
4. 초기 메일 링크의 HTTP navigation query는 FE 실행 전에 서버에 도착한다. 브라우저 history/Referer/FE storage/log 정리는 검증했지만, 웹서버 접근 로그·메일 provider의 로그 정책은 이 FE 작업으로 변경하거나 검증하지 않았다. 토큰 redaction 정책은 실제 활성화 사전 점검에서 확인해야 한다.

Settings 별도 수정 및 PR211 승인 차단은 건드리지 않았다.
