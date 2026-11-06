# 운영 이메일 확인 활성화 준비 — 2026-11-06

## 상태: 활성화 전 중단, Draft 검토만 가능

사용자는 운영 FE readiness 활성화·검증·main PR 병합과 배포를 요청했지만, 동일 준비값이
일반·Google 신규 가입의 정책 조회·동의 UI/payload도 켠다. 기존 DOB 필드·전송은 OFF에서도 유지된다. 준비 근거가 부족하면
활성화 전에 중단하라는 범위에 따라 아래 확인 전에는 Draft·미병합을 유지하고 배포하지 않는다.

- 공개 운영 `GET /api/policies/current`: TERMS/PRIVACY 모두 version `0.9`,
  `requiresConsent=false`, 제목은 법무 검토 전 초안. 현재 초안 사용과 신규 가입 흐름의
  승인 근거 및 BE `EDUPILOT_POLICY_SIGNUP_CONSENT_REQUIRED` 유효값은 미확인이다.
  `requiresConsent=false` 자체는 계약 오류가 아니다. BE 설정이 true인데 동의 대상이 없으면
  `SIGNUP_POLICY_NOT_READY`/503으로 신규 가입을 중단한다.
- 사용자는 가입·메일 수신이 정상이라고 보고했다. BE #572의 운영 배포
  `f2ed85a1830778821c30a038487958bb6ab30ee8`, Deploy prod `42028504065`는 성공이다.
  이는 유효 provider/발송 모드/대상 범위나 서비스 확인 메일 인수 완료를 대신하지 않는다.
  과거 SDK TEST 메일과 합성 검사를 현재 서비스 실메일 인수로 계산하지 않는다.
- 승인 운영 테스트 계정·수신함은 요청 이력에 특정되지 않았고 로컬 `PROD_QA_*` 계정 변수도 없다.
  개인 수신함·임의 새 계정은 사용하지 않았다. 새 계정 생성·실메일·개인정보·DB 변경은
  구체적 대상과 범위의 별도 승인 전 실행하지 않는다.

## 수정안

prod deploy.env에 정확한 계약값을 전달하고 build 전에 검증한다. unit baseline은 OFF,
별도 ready suite는 ON 계약을 검사하며 배포 Build는 ON이다. guardian/composer readiness,
capability 목록과 BE/메일/정책/서버 설정은 변경하지 않는다.

배포 후 정적 smoke 외에 `scripts/smoke-email-verification.mjs`가 실제 served UI에 합성
fragment를 열어 확인 버튼·토큰 보호·자동 POST 금지·reload 토큰 폐기를 검사하고 예상 entry를
대조한다. 버튼은 누르지 않는다. 계정 없는 새 브라우저의 refresh만 합성 401로 고정하고 다른
API 쓰기는 차단한다. 실제 메일·확정 성공을 주장하지 않는다. PR CI는 ON 통과/OFF의 활성 버튼
단계 거부를 대조한다. 토큰 추출·명시적 확인 POST·익명 비로그인·상태 재조회 제품 소스는 보존한다.

## 검증

Node **22.23.3**, 기존 lockfile과 `npm ci --offline` 사용. 전체 baseline Vitest
**82파일·626개 통과**, lint/typecheck 통과. ready 이메일 합성 브라우저
**18 PASS / OFF 전용 2 SKIP**. ON production build와 실제 로컬 served smoke 통과.
OFF 빌드는 활성 버튼 단계에서 smoke가 거부하는 음성 대조를 확인했다.
초기 sandbox의 preview bind EPERM·서버 미실행 실패는 통과 수에 포함하지 않았다.
현재 운영 entry `/assets/index-XsbS3lun.js`는 기존 배포이며 이번 후보 배포가 아니다.

| 항목 | 로컬 합성 | 실제 운영/실메일 |
| --- | --- | --- |
| 새 링크의 명시적 확인 버튼 | 통과 | 현재 OFF, 새 메일 검증 미실행 |
| mount/reload 자동 POST 없음·토큰 보호 | 통과 | 실제 토큰 미사용 |
| 단일 확인 POST 200·VERIFIED/required=false/시각 | 통과 | 승인 계정·새 메일 필요, 미실행 |
| 본인 계정 상태 재조회·다른 탭 반영 | 통과 | 미실행 |
| 익명 확인 성공 후 비로그인 | 통과 | 미실행 |
| 만료·재사용·재발급 이전 링크 거부 | 통과 | 미실행 |
| 재요청 접수와 최신 링크 | 통과 | 실메일 미실행 |
| 일반·Google 신규 가입/기존 로그인 | unit/mock 계약 회귀 통과 | 정책/설정·테스트 범위 미확인, 미실행 |

토큰 없는 운영 probe: confirm GET **405 METHOD_NOT_ALLOWED**,
trace `ae98d40b-73b7-484c-b15e-56dacd1a3a32`; 익명 status GET
**401 AUTHENTICATION_REQUIRED**, trace `6969099a-b302-40c3-884c-08a94144fe82`.
예상된 보호 경계이며 유효 확인 POST 200·발송 준비의 증거가 아니다.
실제 토큰·쿠키·전체 메일/요청 본문은 기록하지 않았다. 최신 CI·PR 상태는 PR 검증란에 기록한다.
