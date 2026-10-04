# 이메일 확인 fragment 계약 준비

이 문서는 [기존 가입·이메일 계약 준비](launch-signup-email-contract.md)의 토큰 운반 부분을 갱신한다. 가입과 상태 조회 계약은 그대로 유지한다.

## 근거와 상태

FE 기준은 develop `21f4ad2d30f13bafd05bfcc289515c2caac98810`이다. [한승준의 fragment 제안](https://discord.com/channels/1542688939742339153/1555440530643746996/1556281981023682722)을 부모 작업에서 전달받았다. 제안은 `/verify-email#token=...`을 메모리로 옮기고 주소를 정리한 뒤 명시적 버튼으로 기존 confirm API를 호출하며, 구형 query 링크는 소비하지 않고 재발급 안내하는 것이다.

[BE #508](https://github.com/AutoAI-UTEUM/BE/pull/508)의 검토 head는 `42a58449582c3495d22494cf038d5d11c6b9aec0`, base는 `e949fbecbe8f6cd414ee9f18605d1a15dca2fa6e`다. 이 Draft는 SPA 경로·로그 개선이며 fragment runtime 구현이나 배포 증거가 아니다. 해당 head의 `EmailVerificationService.issue`는 아직 `/verify-email?token=`을 생성한다. `EmailOutboxStore.enqueue`는 완성된 message를 암호화해 보관하고 claim 시 복호화한다. 코드 변경만으로 기존 발송 대기 본문이 바뀌지는 않는다. 실제 대기함·계정·메일·credential은 조회하지 않았다.

기존 `VITE_AUTH_CONTRACT_READINESS` 명시 기준과 기본 OFF를 유지한다. 환경변수 값, capability, OAuth, 인증 보안 정책, BE·서버·운영 배포 설정은 변경하지 않는다. synthetic-ready CI는 배포 readiness가 아니다. 기존 가입 DOB·정책·이메일 상태·403 호환 계약도 유지한다. Settings 별도 변경과 PR211은 이 변경의 범위 밖이다.

## 수신·확인 계약

- 입력은 정확히 `#token=` 뒤 43자 base64url이다. 중복 token, 추가 fragment 필드, 잘못된 길이·문자는 거부한다.
- query에 `token` 키가 있으면 값은 읽거나 보관하지 않는다. 정상 fragment가 함께 있어도 재발급 안내한다. encoded query 키도 동일하다.
- 초기 HTML의 동기 스크립트는 static no-referrer meta 직후, link/module/recovery 코드보다 앞에 있다. 일반·대소문자·단일 URL decoding 경로를 정규화하고, fragment를 일시 메모리로 옮긴 뒤 `replaceState(null, '', '/verify-email')`로 query/hash/history state를 제거한다. 버튼 mount·GET·프리패치는 confirm하지 않는다.
- SPA 이동도 같은 검증·정리를 한다. 새 링크가 이전 링크를 덮기 전에 이전 closure를 지운다. 진행 중 요청은 abort하고 그 늦은 결과를 표시하지 않는다. OFF에서는 SPA로 들어온 새 토큰도 즉시 지운다.
- 명시 확인 버튼만 공개 POST body `{token}`을 전달한다. 확인 전에 메모리 토큰을 지워 중복 클릭·실패 재소비를 막는다. Bearer·쿠키·새 로그인 세션을 만들지 않으며 응답은 token 계정의 상태다. 현재 로그인 계정은 기존 Bearer status/me로 따로 재조회한다.
- storage/log/return target에 토큰을 기록하지 않는다. 새로고침, 페이지 이탈·pagehide, 화면 내 다른 경로 이동은 pending 토큰을 폐기한다. BFCache 복귀에서도 토큰을 복구하지 않고, 취소된 요청의 busy/ref를 정리해 계정 관리 버튼을 사용할 수 있다.
- 202는 요청 접수 안내이고 발송·전달 완료 안내가 아니다. 429는 수동 재시도 안내이며 임의 카운트다운은 없다. 구형 optional 필드 누락이나 legacy 상태를 VERIFIED로 추정하지 않는다.

## 제거 시점과 한계

표준 fragment는 HTTP 요청 URI와 Referer에 포함되지 않는다. 초기 HTML이 제공되고 동기 스크립트가 실행되는 시점에 주소를 제거한다. SPA의 경우 해당 공개 화면이 렌더될 때 토큰을 잡고 layout 단계에서 router state도 교체한다. 이 처리 전에 확인 API를 호출하지 않는다. 동일 origin의 다른 코드가 임의 URL 값을 수집하는 기능을 새로 도입하면 이 수신 계약을 함께 재검토해야 한다.

FE가 최초 query 요청의 서버·프록시 access/error 로그를 삭제할 수는 없다. 메일 provider의 링크 재작성·클릭 추적이나 이미 발송된 본문의 토큰까지 지우지도 못한다. 서버가 HTML 대신 404를 반환하거나 스크립트 실행이 차단되면 HTML 단계 정리는 실행되지 않는다. 기존 dev의 `/verify-email` 직접 GET은 404였으며 BE #508의 미배포 경로 수정과 공동 확인이 필요하다. FE의 기본 OFF 배포만으로 이 문제가 해결됐다고 판단하지 않는다.

## 활성화 전 담당자 확인

1. BE: 메일 생성 코드를 fragment 계약으로 바꾸고 테스트를 제공한다. 기존 query 링크가 포함된 발송 대기 건·재시도 건의 만료/폐기/재발급 방침을 결정한다. FE가 대기 본문을 임의 변경하지 않는다.
2. BE/운영: 승인된 FE origin과 메일 base URL이 일치하는지, `/verify-email` 직접 진입과 query 없는 오류 로그 동작을 실제 대상 서버에서 공동 검증한다. FE에는 환경값·비밀값을 보내지 않는다.
3. BE/운영: provider가 fragment를 보존하는지, 클릭 추적이 토큰을 별도 URI로 복사하지 않는지 승인된 시험 메일 절차로 검증한다. 이번 작업에서는 실제 메일을 발송하지 않는다.
4. 부모/정책 담당: 배포 runtime 및 API readiness, DOB 미래일·수정·연령 정책과 필수 문서 0개 경우를 확정한 후 별도 활성화를 승인한다. 이 PR 병합은 그 승인을 대신하지 않는다.

사용자에게 필요한 조치는 위 운영·정책 결정을 확정하는 것이다. 활성화 전까지 사용자가 직접 환경변수·OAuth·로그 정책을 바꾸거나 실제 계정으로 검증할 필요는 없다. 공동 검증 시에는 승인된 테스트 계정과 대상 화면의 확인 버튼·현재 계정 상태·재요청 안내를 확인하고, 개발자 도구 Network에서 최초 문서 URI에 token query가 없는지 확인한다. 토큰 본문이나 실제 메일을 채팅·스크린샷·로그에 공유하지 않는다.

## 검증

`emailLinkToken.test.ts`는 실제 초기 HTML 스크립트와 SPA 코드를 각각 실행해 입력 거부·history 정리·이전 closure 폐기·pagehide를 검증한다. Chromium 합성 E2E는 URL/요청/Referer/storage, 명시 단일 POST, 구형 query/encoded 키/혼합 링크, malformed fragment, SPA 교체와 늦은 응답, OFF SPA, 뒤로가기·pagehide 진행 중 취소, 다른 로그인 계정·탭 상태, 기존 가입·legacy/202/429를 검증한다. trace는 OFF이며 외부 API·실제 계정·메일 발송을 사용하지 않는다.

최종 lint/type/build/전체 Vitest, default-OFF/synthetic-ready E2E, 독립 리뷰 및 exact-head CI 증거는 PR에 기록한다.
