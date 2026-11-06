# FE 잔여 작업과 #141 전환 지연 — 2026-11-06

## 착수 시점 대조 기준

원격 develop `9e5c332a50ff769e5aad138ba0cf44fed8e22088`,
main `dd218f703a48de70d80beec012aa6c168568e97b`와 열린 PR 6개를 대조했다.
FE 체크아웃·상위 작업 경로에 관련 AGENTS.md/.agents/skills는 없었고, 기존
`docs/overnight-qa.md`, Playwright 설정과 성능 예산을 읽었다. 과거 일회성 overnight
실행 일정·실계정 변이 절차를 이번 작업의 승인으로 사용하지 않는다.

이미 완료: #250/#251 프로필 여백·인증 OFF 안내, #252/#253 main/dev 인증 readiness 배포와
합성 링크의 확인 버튼·정적 자산·토큰 보호 smoke. 실제 메일→유효 POST→VERIFIED 인수는
사용자가 나중으로 미뤘으므로 완료에 포함하지 않는다.

## 우선순위

1. **#141 모바일 비밀번호 찾기 전환**: 최신 코드로 재현하고 이 PR에서 최소 수정·합성 검증.
2. **#249/#244/#241 충돌**: 기존 작업 보존, 최신 develop을 각 작업 브랜치에 통합하고 합성
   검증. 조회 시 충돌은 세 PR 모두 frontend-ci.yml의 작업 추가 부분이었다. main/develop 대상
   PR 병합·배포와 작업 브랜치의 통합 커밋을 구분하며 강제 push하지 않는다.
3. **#238/#239/#240 뒤처진 후보**: 기존 구현·검증을 재사용하고 최신 기준 통합 가능성과 남은
   인수 조건 확인. 동일 기능을 중복 구현하지 않는다.
4. **기존 초기 번들 예산 초과**: 아래 200KiB 기준 초과는 이전부터 존재하며 별도 축소 작업.
5. **타 파트/실환경 의존**: #238 보호자 정책·권한·증빙, #249 BE/AI 비용·평가 단계 계약·실환경
   취소/과금 인수, #241 배포 헤더·기존 탭, #239 BE 인수, #244 실제 Safari·펜·IME/스크린리더·
   기기간 저장 계약, 수업 직접 입력/난이도 주체의 제품 결정. 실메일·실계정 인수와 보류된
   Google 가입 장애 후속 검증은 이번 범위에서 제외한다.

## #141 재현과 최소 수정

Node 22.23.3, 기존 lockfile, localhost mock, auth readiness는 현재 배포와 같은 ON,
Chromium 390×844, 4배 CPU·1.6Mbps down/750kbps up·150ms latency, workers=1,
retries=0, 기존 `performance-qa.spec.ts`와 **200ms 기준 그대로** 비교했다.

수정 전 동일 mobile test 두 실행 모두 실패: cold LCP 기준으로 선택된 전환 값
**307.1ms / 308.3ms**. 작은 ForgotPasswordPage도 클릭 시 별도 lazy import/Suspense
경계에 진입했다. 이 페이지를 기존 인증 진입 코드와 함께 준비해 클릭 후 route chunk
다운로드/해석·Suspense 대기를 제거한다. 요청 API·폼·capability와 URL은 바꾸지 않는다.

수정 후 production capability(재설정 OFF 안내) 두 실행 **2 PASS**, cold/warm 12회
**45.7–76.1ms**. dev capability(재설정 폼 ON)도 두 실행 **2 PASS**, 12회
**42.6–77.9ms**. 모든 전환이 기존 200ms 이하이며 LCP/CLS/long task/중복 GET 검사도 통과했다.
실제 재설정 요청이나 메일은 보내지 않았다. 두 capability 조건을 PR CI에 추가했다.

비용: 같은 production-capability ON 빌드의 초기 JS/CSS gzip은 약
**295.9→296.7KiB(약 +0.8KiB)**. 기존 200KiB bundle checker는 수정 전후 모두 실패하며
기준을 올리거나 통과로 표시하지 않는다. 무거운 PDF/editor를 eager 처리하지 않는다.
최종 단위·브라우저·CI 결과는 PR 검증란과 로컬 qa-artifacts/password-route-review에 기록한다.

이번 범위는 코드·합성/로컬 검증·작업 브랜치 push와 Draft PR 갱신이다. 새 main/develop
병합·배포·기능 활성화·서버/보안/권한·실계정/메일/개인정보/DB 변경은 하지 않는다.
