# 가입 준비 오류·보호자 조회 FE 준비 — 2026-10-08

FE 원격 develop을 다시 확인하고 fetch한 기준은 `f1ad9d924b4768f798dc438066a311a2aac955f0`이다. 기존 OneDrive FE는 `a2e78bd7b15ab73ffd685a8f88bd083219d4284a`이며 untracked 사용자 파일을 수정하지 않았다. 작업은 별도 `task/FE` detached worktree에서 수행한다. 기존 체크아웃·상위 디렉터리 및 최신 tracked 파일에서 적용할 AGENTS.md·.agents/skills는 발견되지 않았다. Codex memory 내용은 사용하지 않았다.

고정 근거는 [BE539 계약](https://github.com/AutoAI-UTEUM/BE/blob/461b853311a692ca1a2a9dad4d12ee92c7b04d92/docs/guardian-team-review-fe-contract.md), 같은 커밋 GuardianTeamDtos.java·GuardianTeamService.java·GuardianTeamRequest.java·EmailVerificationWebConfig.java 및 [BE541](https://github.com/AutoAI-UTEUM/BE/pull/541) head `58df7c95f11fa10c3b70a97e4a6fa9ecd152ed2e`다. BE538/539/541은 읽은 시점에 모두 Draft·미병합이었다. BE539 GET도 서버가 만료 정리를 수행할 수 있으므로 FE 읽기 전용이 서버 DB의 무변경을 보증하지 않는다. 실제 서버는 호출하지 않았다.

## 동작과 OFF 경계

- 기존 `VITE_AUTH_CONTRACT_READINESS`를 유지한다. LOCAL·신규 Google의 정확한 code/status `SIGNUP_POLICY_NOT_READY`/503은 준비 안내와 가입 중단, `POLICY_CONSENT_REQUIRED`/400은 최신 문서 조회·선택 초기화·재동의다. HTTP status가 다른 동명 code는 두 계약으로 처리하지 않는다.
- 503 뒤 자동 GET/POST, 타이머 또는 자동 가입 재전송은 없다. 같은 페이지에서 사용자가 정책 조회를 한 번 명시적으로 실행할 수 있고, 성공하면 직접 가입을 다시 시도한다. 재차503 또는 조회 실패이면 다시 방문하도록 안내한다. 빈 배열은 BE 설정 false에서 유효할 수 있으므로 GET 성공이 가입 준비 완료의 증거가 아니며 최종 POST가 판정한다. 새 필수 문서는 직접 재동의한다. OFF 빌드에서는 신규 정책 GET과 입력을 추가하지 않으며 503 가입은 중단한다.
- 기존 Google 로그인은 token-only이며 DOB·정책 동의를 강요하지 않는다. Google 신규 가입 취소·pagehide·unmount는 signal을 취소하고 늦은 응답을 client session이나 화면에 반영하지 않는다. 기존 LOCAL 뒤로가기에서 이미 생성된 계정 안내와 자동 로그인 중단 보장을 유지한다. 전송 이후 서버에서 이미 처리된 결과를 client abort가 취소했다고 주장하지 않는다.
- 별도 `VITE_GUARDIAN_TEAM_READINESS`의 정확한 합성 값 `be-guardian-461b8533-v1`만 조회 준비를 연다. 누락·오타·다른 값은 OFF다. 운영 env, workflow, 배포, capability 활성화는 변경하지 않았다. 테스트 빌드의 값은 운영 승인이나 배포 신호가 아니다.
- `/guardian-request`는 인증된 본인 조회 전용 페이지다. ON 준비 빌드의 계정 관리·이메일 확인 페이지에서 연결하고, mount/직접 새로 확인 시 GET `/api/users/me/guardian-requests/entry`를 사용한다. 정책 unavailable에서 null request는 과거 부재로 표시하지 않는다. 현재 요청이 포함돼도 POST 신청·링크·철회·동의·담당자 쓰기 함수와 입력을 구현하지 않았다.
- AuthProvider의 JSON/raw 게이트는 ON일 때 정확한 GET entry, GET self collection 및 UUID 한 구간의 POST withdraw만 추가 예외다. RequireAuth는 정확한 `/guardian-request` 한 화면만 이메일 대기 예외다. 익명 로그인, 기존 role/account 게이트, 학습·자료·PDF·SSE·AI 차단은 유지한다. withdraw는 matcher 준비만 검증했으며 합성·실제 철회 요청을 실행하지 않았다. POST intake/link·admin 경로와 suffix·다른 method에는 새 예외가 없다.

## DTO·표시·메모리

Entry requirement `REQUIRED/NOT_REQUIRED/BIRTHDATE_REQUIRED`는 서버만 결정한다. DOB·cohort·브라우저 연도·ageVerificationState 추론은 없다. REQUIRED와 APPROVED는 함께 존재할 수 있다. Status.state 안내, serviceApproved, externalAiApproved를 따로 표시한다. DECLARED나 선언 범위를 승인으로 승격하지 않고 상충하는 승인 flag 응답은 fail-closed다. 이 화면은 업무 접근을 열거나 auth user 승인 값을 변경하지 않는다.

View·Status는 reviewer의 userId·contact·generationStartedAt·declaredScopes를 포함하지 않으며 parser가 불필요한 extra 필드를 제거한다. Detail은 준비된 별도 타입/parser만 있고 API/담당자 화면은 없다. 연락처·시각·관계·확인 수단·증거 참조 null, 빈 declaredScopes/events/forms를 보존한다. optionalAiScope는 BE의 Java String.isBlank 기준 빈 값·공백을 null로 정규화한다. generationStartedAt UTC와 status.webDeclaredAt을 구별하고 배열의 출처나 승인 여부를 추정하지 않는다. EMAIL_REPLY→confirmation EMAIL_REPLY, PHONE_CALLBACK→confirmation PHONE은 명시적 매핑이다.

currentNotice=false이면 이전 forms/채널을 화면에서 표시하지 않는다. Entry의 현재 채널을 오래된 View에 대입하지 않는다. 정책 URL null을 안전하게 보존하고 실제 링크를 발급하거나 열지 않는다. Link replayed=true/url=null parser·안내는 새 링크가 없다고 표시한다. 기존 URL·토큰을 저장하거나 되살리지 않는다. View forms는 React text이며 HTML을 실행하지 않는다. 신청 기한·연락처 정리·웹 선언·명시적 확인·승인 기한을 각각 ISO UTC로 표시한다.

snapshot은 본인 owner와 함께 페이지 메모리에만 있다. 새로운 조회·403/오류에서 먼저 비우고, 계정 전환·pagehide·unmount는 signal을 취소하고 늦은 결과를 무시한다. 중복 GET은 ref로 제한하고 자동 polling/retry를 하지 않는다. 저장소·URL query·analytics·console에 신청/연락처/토큰을 추가하지 않는다.

## 검증

`qa-artifacts/guardian-signup`의 JSON과 합성 browser screenshot은 로컬 증거이며 gitignore 대상이다. 독립 검토 수정 후 관련6개 파일의 집중121개를 다시 실행해 모두 통과했다.

| 검사 | 실제 결과 |
| --- | --- |
| 최종 lint / TypeScript / git diff --check | PASS |
| 전체 Vitest | 독립 검토 수정 후106 files / 1,106 PASS / failure0 / pending0, `full-unit-review.json`(실행 stdout 집계); 수정 전 결과는 `full-unit-final.json` |
| 관련6개 파일 | 121/121 PASS, `targeted-review.json`; 수정 전113개는 `targeted.json` |
| 신규 Chromium 준비 상태, desktop+390px phone | 최종 UI 포함16/16 PASS, `ready/browser.json` |
| 신규 Chromium 기본 OFF | 6 PASS / 10 ready 전용 SKIP / failure0, `off/browser.json` |
| readiness OFF·synthetic-ready production build | 두 browser 실행의 tsc+Vite build PASS; 기존 large-chunk warning 존재 |

초기 단위 검사에서 공통 envelope message 누락, LOCAL 뒤로가기 취소 동작 회귀, 합성 필수 소속 누락과 재클릭 selector 오류를 발견해 수정했다. 첫 브라우저 시도는 Chromium1243 미설치로16개 모두 시작 실패했다(`browser-missing-attempt.json`). 전용 Chromium 설치 후 첫 실제 실행은13 PASS/3 FAIL이었다. 외부 Google 스크립트 요청은 guard가 차단했고, 기존 가입 진입 fixture를 잘못된400/GOOGLE_SIGNUP_REQUIRED에서 기존 계약409/SIGNUP_REQUIRED로 바로잡았다(`browser-harness-attempt.json`). 이후16/16 green 실행은 위 실패들과 합산하지 않는다. 실제 외부 Google 요청·계정·철회·메일·AI는 수행하지 않았다.

재현: Node22.17.0, npm10.9.2, lockfile 기반 `npm ci --ignore-scripts --no-audit --no-fund`. `/api`·기존 `reports,policy-consent`로 lint/typecheck/full Vitest를 실행한다. 신규 browser는 `node node_modules/@playwright/test/cli.js test --config=playwright.guardian-signup.config.ts`이며 `QA_GUARDIAN_SIGNUP_READY=synthetic-ready`와 빈 값 두 번을 순차 실행한다. `PLAYWRIGHT_BROWSERS_PATH`에 전용 Chromium cache를 지정한다. loopback4191·strictPort·reuseExistingServer=false이며 외부 요청 및 guardian mutation을 차단한다. 전용 Google library/credential도 page memory의 합성 stub이다.

## 독립 읽기 전용 최종 검토

별도 검토자가 P2 계약 결함1건을 재현했다. [GuardianTeamProperties.java L79–81](https://github.com/AutoAI-UTEUM/BE/blob/461b853311a692ca1a2a9dad4d12ee92c7b04d92/main-service/src/main/java/io/edupilot/guardian/team/GuardianTeamProperties.java#L79)은 optionalAiScope null/isBlank를 선택 AI 없음으로 허용하고, [GuardianTeamService.java L373–377](https://github.com/AutoAI-UTEUM/BE/blob/461b853311a692ca1a2a9dad4d12ee92c7b04d92/main-service/src/main/java/io/edupilot/guardian/team/GuardianTeamService.java#L373)은 원문을 View로 반환한다. 기존 FE parser는 빈 문자열·공백을 INVALID_RESPONSE로 거절했다. Java blank와 같은 정규화로 수정하고 View/Entry6개·실제 조회 화면2개 회귀 검사와 Chromium blank fixture를 보강했다.

검토자는 수정 후19개 메모리 검사 및 BMP65,536개 문자 판정 비교를 통과시켰고 추가 재현 결함을 발견하지 못했다. 파일 수정·서비스 실행·원격 쓰기는 하지 않았다. 독립 메모리 검사의 첫 시도는 harness 구형 TypeScript target 때문에 실패했으며 ES2022로 보정한 재검사가 통과했다. 구현자의 첫 lint는 no-control-regex 위반으로 실패했고, 문자 코드 범위와 비제어 공백 정규식으로 같은 동작을 구현한 후 최종 lint가 통과했다. 독립 검토는 전체 테스트 재실행이나 실제 BE/OAuth 인수를 대신하지 않으며, 위 검사 결과는 구현자가 실행했다. 수정 전 browser JSON은 `browser-ready-before-review.json`·`browser-off-before-review.json`에 보존한다.

## 남은 범위

변경 파일(26개):

| 역할 | 파일 |
| --- | --- |
| 가입503/400·제한된 재조회 | `src/features/auth/signupPolicyError.ts`, `useSignupContract.ts`, `SignupContractFields.tsx`, `src/app/pages/SignupPage.tsx` |
| 인증 method 예외·Google 취소 | `src/features/auth/AuthProvider.tsx`, `RequireAuth.tsx`, `launchAuthContract.ts`, `authContext.ts`, `authRepository.ts` |
| 보호자 타입·파서·조회 | `src/features/guardian/guardianContract.ts`, `guardianRepository.ts` |
| 라우트·화면 연결 | `src/app/pages/GuardianRequestPage.tsx`, `SettingsPage.tsx`, `VerifyEmailPage.tsx`, `src/app/AppRoutes.tsx`, `routes.ts`, `src/vite-env.d.ts` |
| 합성 단위·통합 | `src/features/guardian/guardianContract.test.tsx`, `src/app/pages/GuardianRequestPage.test.tsx`, `SignupLaunchContract.test.tsx`, `src/test/guardianFixtures.ts` |
| 합성 Chromium | `e2e/guardian-signup-contract.spec.ts`, `playwright.guardian-signup.config.ts` |
| QA·로컬 캐시 | `docs/qa/launch-signup-email-contract.md`, 이 문서, `.gitignore` |

실BE 브라우저·운영 API·실제 Google OAuth·메일·SMS·관계 확인·DB·정책 게시·유료 AI·계정 변경 인수는 실행하지 않는다. 공개 보호자 제출과 담당자 화면, 실제 intake/link/withdraw/confirmation/decision/revoke 및 DOB 정정 쓰기는 남겨 둔다. 실제 브라우저/휴대기기·Safari/Firefox 검증, backend 배포 계약·권한·정책 readiness 확인 및 별도 활성화 승인 후에만 운영 연결을 검토한다. push/PR/merge/deploy는 없다.
