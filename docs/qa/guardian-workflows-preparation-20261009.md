# 보호자 후속 화면 준비 — 기본 OFF, 2026-10-09

## 기준과 작업 범위

기준 FE는 Draft [PR236](https://github.com/AutoAI-UTEUM/FE/pull/236)의 `074b67d0ce3ea183283915345845ef437625ffa8`이다. 별도 로컬 브랜치 `codex/guardian-workflows-off`, 작업 폴더 `C:/Users/leega/Documents/Codex/2026-10-08/task/FE`에만 구현했다. 원격 develop은 시작·완료 확인에서 `f1ad9d924b4768f798dc438066a311a2aac955f0`, PR236 head는 기준 그대로다. 이번 브랜치를 push하거나 PR236을 갱신하지 않았다. 원래 OneDrive FE의 HEAD `a2e78bd7b15ab73ffd685a8f88bd083219d4284a` 및 tracked/index clean 상태를 보존했다. 사용자 untracked 파일은 수정하지 않았다. 적용할 AGENTS.md/.agents/skills는 발견되지 않았고 memory_summary.md는 사용하지 않았다.

실제 계약 근거는 [BE539 계약](https://github.com/AutoAI-UTEUM/BE/blob/461b853311a692ca1a2a9dad4d12ee92c7b04d92/docs/guardian-team-review-fe-contract.md)과 DTO·Service이며, [BE542 head](https://github.com/AutoAI-UTEUM/BE/tree/292593715055e19aaa65dade34c275b657571118)의 동일 파일을 다시 대조했다. BE542는 runtime 변경 없이 정책·메일·복구 검토 문서만 추가한다. 완료 전 읽기 전용 조회에서도 BE538/539/541/542는 모두 Draft/open/미병합이었다. 각 head는 다음과 같다.

- 538: `cca982c5a1663ee7d474446390618c371b151806`
- 539: `461b853311a692ca1a2a9dad4d12ee92c7b04d92`
- 541: `58df7c95f11fa10c3b70a97e4a6fa9ecd152ed2e`
- 542: `292593715055e19aaa65dade34c275b657571118`

이 문서는 PR236의 과거 읽기 전용 범위를 덮어쓰지 않는 별도 후속 기록이다. 사용자가 이어서 승인한 보호자 접수/링크/철회, 공개 의사 표시, 지정 담당자 확인/결정/철회 UI를 로컬 기본 OFF 상태로 준비했다. 실제 사용자·운영 토큰·BE·메일·계정·정책·DB 변경·유료 AI·활성화·병합·배포는 실행하지 않았다. 조회도 서버 만료 정리를 수행할 수 있어 실제 서버를 호출하지 않았다.

## OFF와 인증 경계

후속 기능은 기존 `VITE_GUARDIAN_TEAM_READINESS`와 새 `VITE_GUARDIAN_WORKFLOW_READINESS`, `VITE_GUARDIAN_POLICY_REVIEW_READINESS`의 정확한 값이 모두 필요하다. 하나라도 누락·오타이면 API 호출 전에 중단한다. 새 플래그는 운영 env/.env.example/workflow/dev 배포 설정에 추가하지 않았다. Playwright의 값은 합성 검사 전용이며 정책 승인 증거가 아니다. 별도 법무/개인정보·운영 검토와 최신 계약 인수 없이 QA 값을 운영에 복사하지 않는다.

이메일 인증 대기 예외는 기존 본인 조회/UUID 철회와 후속 준비 상태의 정확한 POST self collection/UUID link만이다. method·UUID·suffix를 검사하며 admin/public/업무 API를 인증 예외로 열지 않는다. 본인 화면은 기존 `/guardian-request` 예외를 그대로 사용한다. 담당자 `/admin/guardian-requests`는 RequireAuth+RequireAdmin 밖으로 우회하지 않고 AppLayout의 업무 자동 조회와 분리한다. ADMIN 역할만으로 처리 권한을 확정하지 않으며 서버 지정 담당자·활성 계정·자기 신청 금지 검사를 따른다. 공개 `/guardian-consent`는 별도 경로이며 view/consent에 Authorization을 붙이지 않고 credentials omit/no-store/no-referrer를 사용한다.

## UI와 요청 안전 처리

- 본인 접수는 최소 `guardianContactProvidedByChild=false`만 보내며 아동에게 보호자 이름·연락처를 수집하지 않는다. canStartRequest와 requirement는 서버 판정이다. DOB·나이·승인 여부를 추론하지 않는다. 현재 신청 차수의 링크 발급과 철회는 별도 최종 확인 후 요청한다. 오래된 고지에서도 서버가 허용한 본인/담당자 철회는 가능하다. 이전 링크를 발송하거나 열지 않으며 새 응답 url=null/replayed=true이면 이전 URL을 되살리지 않는다.
- 공개 링크는 43자 URL-safe fragment만 메모리로 읽고 모듈/네트워크 진입 전 주소에서 제거한다. query가 있으면 거절한다. mount 자동 POST, 저장소·console·analytics 기록은 없다. 사용자가 안내 확인을 눌러 view POST를 수행한다. 최신 고지/양식/필수 SERVICE/회신 창구가 없거나 TBD 양식이면 제출 입력을 닫는다. 모든 동의·AI·관계·법정대리인 선택은 초기 false/빈 값이다. 고지 재조회와 새 링크에서도 선택을 초기화한다. 선택 AI는 서버 optionalAiScope에서만 제공한다. 거절에는 빈 scopes/null relationship이며 이름·연락처를 붙이지 않는다. DECLARED는 승인과 분리한다. consent 성공 뒤 소비된 토큰으로 view를 다시 호출하지 않는다.
- 지정 담당자 목록·상세는 명시적 조회다. 차수 시작 UTC와 웹 선언 시각을 구별하고 nullable 연락처·시각·빈 선언 범위를 보존한다. EMAIL_REPLY/PHONE_CALLBACK 회신 채널과 EMAIL_REPLY/PHONE 등록 method를 명시적으로 매핑한다. 실제 회신 수신 UTC는 직접 입력하고 차수 시작 이후·입력 시각 이하를 검증한다. 증거 참조는 제한된 문자 100자만 허용하며 원문·주민번호·URL·연락처·토큰을 요청하지 않는다. 회신 체크 5개와 승인 체크 4개는 매 상세에서 수동 false로 시작한다. 웹 선언이 있으면 관계·범위를 일치시킨다. 최종 승인에는 REVIEW_PENDING과 실제 명시 확인·SERVICE가 필요하며 응답 전 승인 표시를 바꾸지 않는다. 반려/보완/철회 사유도 계약의 허용 값으로 나눈다.
- 준비할 때 command/UUID/차수/revision/notice/body/idempotencyKey를 직렬화해 고정한다. 중복 클릭은 동기 ref로 제한한다. 응답 유실·잘못된 성공 응답·알 수 없는 5xx는 불확실 상태로 유지하며 동일 body/key의 명시적 재시도만 제공한다. pending/불확실 상태에서 부모 목록·상세·안내 재조회와 선택 변경을 잠근다. 명시 503 GUARDIAN_TEAM_UNAVAILABLE은 중단, 400/401/403/409/429는 원문 없는 안내와 입력/상세 비우기로 처리한다. 자동 POST/재시도 타이머는 없다. 전송 전 취소만 제공하고 pagehide/unmount/계정 전환은 abort와 늦은 응답 무시로 처리한다. client abort가 서버 작업을 되돌렸다고 주장하지 않는다.
- 서비스/외부 AI 승인 flag를 각각 표시하며 auth user나 업무 접근을 승격하지 않는다. forms는 React text로만 렌더한다. 새 조회·권한 오류·pagehide·계정 전환 시 민감 상세와 발급 URL을 비운다. 링크·신청·회신·operation은 페이지 메모리에만 존재한다.

## 검증과 초기 실패 기록

최종 실제 검사 결과는 root `guardian-workflows-result.json`과 로컬 `qa-artifacts/guardian-workflows`에 기록한다. 준비 ON은 합성 mock 응답만, 실제 서비스 도메인은 브라우저에서 차단했다. OFF 건너뛴 검사는 통과로 합산하지 않는다.

| 검사 | 최종 결과 / 증거 |
| --- | --- |
| ESLint / TypeScript | PASS |
| 전체 Vitest | 107 files / 1,153 PASS / failed 0 / pending 0, `full-unit.json` |
| 관련 7개 파일 | 166/166 PASS, `targeted.json` |
| 신규 Chromium 준비 mock PC+390px phone | 12/12 PASS, `ready/browser.json` |
| 신규 Chromium 기본 OFF PC+phone | 4 PASS / 준비 전용 8 SKIP / 실패 0, `off/browser.json` |
| 기존 가입/조회 Chromium 준비 mock | 16/16 PASS, `qa-artifacts/guardian-signup/ready/browser.json` |
| 기존 가입/조회 Chromium 기본 OFF | 6 PASS / 준비 전용 10 SKIP / 실패 0, `qa-artifacts/guardian-signup/off/browser.json` |
| 최종 모든 readiness OFF production build / 전체 패치 공백 검사 | PASS, 기존 500kB chunk warning 유지 |
| 독립 최종 검토 | 미해결 주요 결함 없음; 별도 메모리 검사 4 PASS. 전체 검사는 root 실행 결과임 |

합성 검사는 default OFF·정확한 인증 예외·기존 Google token-only·LOCAL/Google 400/503·null/stale/replay·DECLARED와 승인 분리·PHONE UTC·권한 부족·수동 체크·중복 클릭·응답 유실·부모 새로고침 잠금·새 고지 선택 초기화·닫기/뒤로가기·계정 전환과 늦은 응답을 포함한다. PC/phone screenshot을 실제 열어 줄바꿈·입력/상태 표시와 HTML 원문 비실행을 확인했다. 실제 휴대기기는 아니다.

초기 검사 실패를 최종 성공으로 바꾸어 서술하지 않는다. 첫 브라우저 4개 관계 selector timeout, 다음 2개 증거 selector 중복은 role+exact selector로 보정했다. `browser-selector-attempt.json`, `browser-evidence-selector-attempt.json`을 보존했다. 첫 fullunit의 기존 이메일 bootstrap 2개 실패는 새 inline script를 기존 이메일 bootstrap 뒤/모듈 앞에 배치해 기존 처리와 검사를 유지하고 수정했다(`full-unit-bootstrap-attempt.json`). 초기 lint/type 오류도 수정 후 재실행했다.

독립 검토자가 부모 새로고침으로 불확실 요청 key를 잃는 결함과 child unmount 시 terminal 안내 소실을 발견했다. 부모 pending lock과 부모 안내 보존으로 수정했다. stale 담당자 철회의 BE 허용 차이를 발견해 확인/결정의 current 조건과 분리했다. 각각 재현 검사와 최종 재검토를 수행했다. 최종 독립 검사자는 파일·실제 API·원격을 변경하지 않았다.

## 미검증·미정 항목과 다음 단계

실제 BE 최신 환경 인수, 실제 OAuth/메일/토큰·실 사용자·실 기기, 배포 CI와 운영 관측은 미실시다. 현 작업의 mock와 정적 검사로 이를 통과했다고 표현하지 않는다. 다른 업무 전체 브라우저 matrix/performance/screenshot matrix는 이번에 재실행하지 않았다.

BE542 P01~P08의 운영자/연락처/시행·게시 metadata, 가입 단계별 처리 근거, 관계 확인 기준, 실제 고지·선택 AI 의미, 증거 보유/파기와 운영자, 탈퇴·강사 강의실 예외, 제공자/국외 이전, 미성년 계약 검토는 여전히 TBD다. 제안 기간을 코드 상수나 승인된 규칙으로 채우지 않았다. 공개 링크 입력 외 보호자 이름/연락처 수집은 구현하지 않았으며 승인 기준·실제 메일 회신 작성/발송은 범위 밖이다.

현재 Detail에는 requiredScopes/optionalAiScope 구조화 필드가 없다. 웹 선언의 typed EXTERNAL_AI가 있으면 같은 범위만 등록할 수 있으며, 선언 없는 수동 회신에 AI 범위를 추가하는 UI는 닫아 두었다. 현재 선택 범위를 보증할 DTO 보완 또는 승인된 명시 계약이 필요하다. forms 문구로 AI 설정이나 승인 여부를 추론하지 않는다.

안전한 다음 단계는 이 로컬 diff 검토와 정책 TBD 해소, 최신 BE 계약/DTO 확정, 별도 승인된 실제 환경 인수다. 이후 원격 게시와 기능 활성화·메일·계정/DB 작업·병합/배포에는 각 별도 승인이 필요하다. 이번 기본 OFF 구현/검사는 그 승인으로 간주하지 않는다.

## 변경 파일

`index.html`, `src/app/AppRoutes.tsx`, `src/app/routes.ts`, `src/app/pages/SettingsPage.tsx`, `GuardianRequestPage.tsx`, 새 `GuardianConsentPage.tsx`/`GuardianReviewPage.tsx`; `src/features/guardian/guardianContract.ts`, 새 `guardianWorkflowRepository.ts`/`useGuardianOperation.ts`/`GuardianOperationPanel.tsx`/`GuardianSelfActions.tsx`/`guardianLinkToken.ts`/`guardianWorkflow.test.tsx`; `src/vite-env.d.ts`, `playwright.guardian-workflows.config.ts`, `e2e/guardian-workflows.spec.ts`, 이 문서. 패치는 위 파일만 포함하며 원래 index는 staging하지 않았다.
