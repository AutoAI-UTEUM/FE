# Discord 개발 채널 후속 (2026-11-16)

## 확인한 범위
- 로컬 Discord AutoAI `개발` 채널의 11/15 FE 목록 및 11/16 AI 답변을 읽음.
- 기존 Draft PR #244에 강의실 복귀, 최근 학습 이어하기, 서버 진행률, 로컬 답안 초안/필기 기능이 이미 있음. 아직 develop/main에 병합되지 않았으므로 배포 완료로 표시하지 않음.
- 11/15 사용자 작성 목록의 “수업 페이지 번호를 직접 입력해서 이동”을 PDF 쪽수 입력으로 구현. 기존 페이지 이동 handler 및 PATCH 계약을 그대로 사용.

## 이번 수정
- PDF 하단 이전/다음 사이에 숫자 입력과 이동 버튼. Enter 또는 버튼 제출 때만 이동.
- 1부터 전체 쪽수 사이 정수만 허용. 빈 값, 음수, 소수, 지수 표기, 범위 밖 값 거부.
- 현재 페이지 재전송 및 처리 중 이동 차단. 입력 중 전역 방향키 페이지 이동 방지.
- 외부에서 페이지/총 쪽수가 바뀌면 입력 동기화. Escape로 입력 취소.
- PC/phone/tablet 합성 브라우저 회귀 추가. 실계정/개인정보/API 변경 없음.

## 협의 대기 (구현 완료 아님)
- 퀴즈 difficulty EASY/NORMAL/HARD, 기본 NORMAL은 AI 측 제안 단계. BE 값 검증·AI 전달 계약 및 사용자 선택 주체 합의 전 요청 필드나 활성 UI를 넣지 않음.
- 받아쓰기 OCR은 문헌 조사 결과이며 실측 완료가 아님. 학년/문장 길이, 촬영/직접 필기, 띄어쓰기·문장부호 채점, 교사 검토·확정 흐름을 먼저 결정해야 함. 미성년자 실필기 데이터는 수집/전송하지 않음.
- 강의실·자료별 진행률의 기존 API와 실제 BE 반환/지난 주차 접근 계약은 별도 인수 대상.

병합, 배포, 기능 플래그 활성화는 수행하지 않음. 체크 반응을 배포/완료 증거로 사용하지 않음.

## 검증 기록
- 로컬 Node 24.16.0 (설치된 런타임), 기존 lockfile 동일성 확인. CI Node 22는 원격 실행에서 별도 확인.
- `VITE_API_BASE_URL=/api VITE_API_CAPABILITIES=reports,policy-consent npm run test:run`: 111파일 / 1,208 테스트 통과.
- `npm run lint`, `npm run typecheck`, 합성 브라우저의 production build 통과. 기존 500kB chunk 경고 있음.
- 신규 SessionPageViewer 단위: 21 통과. PC 1440×900 / phone 390×844 / tablet 1280×800 Chromium: 3 통과, 재시도 0. 폰 화면 직접 확인.
- 초기 Node 26에서는 localStorage 환경 오류가 있었고 별도 새 worktree의 필수 API env 누락으로 기존 테스트가 실패했음. Node 24 및 명시적 env로 전체 재실행 통과. 최초 Chromium 실행 제한은 승인된 로컬 합성 실행으로 해결.
- 최초 브라우저 fixture에서 page PATCH만 가로채 원본 mock GET 상태와 불일치했던 테스트를 실제 mock PATCH 경유로 수정. 제품 navigation/검증을 우회하지 않음.
