# 보호자 담당자 현재 정책 범위 보완 — 기본 OFF

## 고정 기준과 범위

FE base는 `develop`의 `0ae5650e5796ce3b217c389e253b676265b89e48`이다. BE [PR546](https://github.com/AutoAI-UTEUM/BE/pull/546) head `2d323bdb2332dd6f794a2ba5cbaa20f1c9d2d9ee`의 [전달 계약](https://github.com/AutoAI-UTEUM/BE/blob/2d323bdb2332dd6f794a2ba5cbaa20f1c9d2d9ee/docs/guardian-team-review-fe-contract.md#L173-L181)과 [GuardianTeamScopeOptionsTest](https://github.com/AutoAI-UTEUM/BE/blob/2d323bdb2332dd6f794a2ba5cbaa20f1c9d2d9ee/main-service/src/test/java/io/edupilot/guardian/team/GuardianTeamScopeOptionsTest.java)를 대조했다. 읽기 확인 당시 BE PR은 Draft이며 Main/AI CI가 성공했다. 해당 CI를 FE의 실제 환경 인수 결과로 계산하지 않는다.

현재 FE worktree는 clean 상태에서 새 개발 브랜치를 만들었다. FE root/조회한 상위·원본 checkout에 적용할 AGENTS.md 또는 .agents/skills가 없음을 확인했고 기존 README와 QA 관례를 따랐다. 원본 사용자 checkout은 수정하지 않았다. 이 작업의 승인 범위는 FE 코드·합성 검증·개발 브랜치 일반 push·Draft PR이며 병합·배포·서버 설정·정책 확정·기능 활성화·실제 계정/메일/동의/개인정보/DB 작업은 포함하지 않는다.

## 결과 동작

- `GuardianDetail`에 `requiredScopes`, `optionalAiScope`를 추가한다. current이면 필수는 정확한 `["SERVICE"]`이고 선택은 `EXTERNAL_AI` 또는 null이다. Java `String.isBlank()`에 대응하는 빈 값은 null로 정규화한다. 누락/undefined/unknown/중복 필수/optional SERVICE와 중복 선언은 거절한다. NBSP·figure space·narrow NBSP·zero-width space를 Java blank로 오인하지 않는다.
- 정상 stale 상세의 `currentNotice=false`, `[]`/null, `replyChannel=null`, `forms={}`를 읽는다. 확인·승인·반려·보완은 닫고, 유효한 진행 중/승인 차수의 철회는 별도 확인을 유지한다. 종료·기한 만료·기한 미확인에는 철회까지 닫고 가능하다는 안내를 하지 않는다.
- 현재 정책 선택지와 `declaredScopes`를 별도로 표시한다. 웹 선언이 없을 때만 현재 정책에 있는 AI를 실제 명시적 회신 근거로 직접 선택한다. 초기값은 false/빈 입력이며 선언 배열이나 양식 문구에서 선택지를 만들지 않는다. 웹 선언이 있으면 관계와 범위를 정확히 일치시켜야 하므로 미선택 AI 추가와 이미 선언한 AI 축소는 제출할 수 없다.
- 모든 명시적 상세 재조회는 새 read 번호로 입력 컴포넌트를 다시 만든다. 동일 request/generation/revision/noticeVersion/digest에서도 정책 변경·stale을 반영하고 관계·증거·수신 시각·범위·체크를 전부 폐기한다. 목록/상세 재조회는 준비·전송·불확실 작업 중 잠긴다.
- 현 기한을 표시 중에도 감지하고, 준비했지만 보내지 않은 작업이 기한을 넘으면 전송 전에 폐기한다. 이미 전송해 응답이 불확실한 작업은 같은 body/key만 직접 재확인하며, 기한이 지나도 새 키를 만들지 않는다. 재전송 성공은 서버 응답으로만 판단한다.
- 최종 승인은 `REVIEW_PENDING`, 실제 확인·증거, 현재 회신 method와 현재 정책에 들어가는 기록 범위 및 수동 체크가 필요하다. service/external-AI 승인 flag는 각각 서버값을 표시한다. 권한 오류/409/정확한 503은 기존 처리에 따라 상세·입력·정책 선택지를 비우고, 알 수 없는 5xx는 불확실 동일 요청 재시도를 유지한다. 닫기/뒤로가기/계정 전환에서 abort하고 늦은 조회·승인 응답을 무시한다.

세 readiness 상수·환경 설정·인증 allowlist·RequireAuth는 변경하지 않았다. OFF build에서 담당자 chunk는 준비 안내만 반환한다. 구 BE가 새 상세 필드를 제공하지 않으면 parser가 닫히며 과거 Detail/Entry/View를 혼합하지 않는다. BE546 실제 반영·운영 정책 검토와 인수 없이 QA readiness를 운영으로 복사하지 않는다.

## 합성 시계와 검사

`GUARDIAN_TEST_NOW=2026-10-08T02:00:00Z`를 공유한다. Vitest는 `Date.now`, Playwright는 `page.clock.setFixedTime`을 고정하여 기존 10월9일 만료 fixture가 실행 날짜에 따라 실패하지 않도록 했다. 만료·타이머·불확실 재시도는 각 시나리오에 별도 기한/시각을 준다. 테스트에 실제 개인·토큰·메일·운영 API를 사용하지 않는다. 브라우저는 localhost 외 origin을 abort하고 모든 API를 fulfill/abort하는 합성 응답으로 대체한다.

| 검사 | 결과 |
| --- | --- |
| ESLint / TypeScript | PASS |
| 전체 Vitest, CI와 동일 `/api`, `reports,policy-consent` 환경 | 107 files / 1,201 PASS / 0 failed |
| 보호자·가입 400/503·Google·인증 집중 | 5 files / 180 PASS / 0 failed |
| Chromium synthetic-ready, PC + 390×844 phone | 28 PASS / 0 failed |
| Chromium default OFF, PC + phone | 4 PASS / ready 전용 24 SKIP / 0 failed |
| production build, 인증/보호자 readiness 모두 빈 값 | PASS; 기존 500kB chunk warning |
| PC·390px 수기 AI 승인 / stale 철회 화면 시각 확인 | 텍스트 줄바꿈·상태·입력 표시 확인, 수기 AI 화면 수평 overflow 없음 |

초기 전체 검사는 CI API/capability 환경을 빠뜨려 93개 기존 화면 테스트가 실패했고 올바른 환경으로 재실행했다. 초기 테스트 helper 구문 오류도 수정했다. 로컬 npx가 system32의 다른 실행 파일을 먼저 선택해 검사하지 않은 호출은 통과로 계산하지 않았다. 설치된 `node node_modules/@playwright/test/cli.js`와 `node node_modules/vitest/vitest.mjs`로 실제 실행/JSON 증거를 확인했다. Vitest 전달 인자 중 일부가 npm.ps1에서 빠져 생성되지 않은 보고서 경로는 증거로 주장하지 않는다.

최종 로컬 증거는 `qa-artifacts/guardian-scope-options`와 `qa-artifacts/guardian-workflows/{ready,off}/browser.json`, 작업 root의 `guardian-scope-options/result.json`에 기록한다. Draft PR의 exact head CI는 별도로 확인해 결과 보고에 URL/head를 붙인다. 실제 BE 인수·OAuth/메일·실제 개인정보·기기/Safari/전체 업무 브라우저 matrix·성능 검사는 미실행이며 이 합성 결과로 통과를 주장하지 않는다.
