# 으뜸 (UTEUM) Frontend

으뜸(UTEUM)의 React 프론트엔드입니다. 브라우저에서 호출하는 서버는 Spring Main Service 하나이며 FastAPI AI Service를 직접 호출하지 않습니다.

## 기술 스택

- React 19.1.1
- TypeScript 5.6
- Vite 7.3.6
- React Router DOM 7.18.1
- Tailwind CSS 4.1.13
- Vitest + React Testing Library
- Node.js 22.12 이상 (CI: Node.js 24)
- npm

## 시작하기

```bash
npm install
copy .env.example .env.local
npm run dev
```

개발 서버는 `http://localhost:5173`에서 실행됩니다.

## 환경 변수

| 이름 | 예시 | 설명 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `/api` | 브라우저가 호출할 Spring Main Service 경로 |
| `VITE_DEV_PROXY_TARGET` | `https://dev.uteum.com` | 로컬 `/api` 요청을 전달할 개발 백엔드 |

기본 로컬 서버는 배포된 dev 백엔드를 프록시하므로 역할, 인증 쿠키,
API 응답이 배포 화면과 같습니다. 로컬 Spring을 사용할 때만
`VITE_DEV_PROXY_TARGET=http://localhost:8080`으로 변경하고, 화면 QA용
mock은 `VITE_DEV_PROXY_TARGET=mock`을 명시한 경우에만 사용합니다.
토큰과 비밀값이 있는 로컬 환경 파일은 커밋하지 않습니다.

## 프로젝트 구조

```text
src/
├─ app/             # 앱 진입, 라우팅, 레이아웃, 페이지
├─ features/        # 기능 모델, API repository, 기능 UI
├─ shared/
│  ├─ api/          # 공통 응답 계약, 오류, Spring API client
│  ├─ config/       # 환경 변수 검증
│  └─ ui/           # 공통 UI 컴포넌트
└─ test/            # 테스트 공통 설정
```

## 앱 셸과 라우팅

| Route | 목적 |
| --- | --- |
| `/` | `/classrooms`로 이동 |
| `/login` | 로그인 및 저장 세션 복원 |
| `/signup` | 회원가입 후 자동 로그인 |
| `/classrooms` | 역할별 내 강의실 |
| `/classrooms/:classroomId` | 역할별 강의실 상세와 주차별 자료 |
| `/classrooms/:classroomId/edit` | 강의자 강의실 정보·학습자 관리 |
| `/calendar` | 역할별 강의 일정. 강의자는 일정 관리 가능 |
| `/notes` | 학습자가 세션에서 저장한 노트 모음 |
| `/review-quizzes` | 학습자가 세션에서 만든 복습 퀴즈 모음 |
| `/learning-status` | 강의자 학습 현황 |
| `/announcements` | 강의자 공지 관리 |
| `/entrance-requests` | 강의자 입장 요청 관리 |
| `/materials` | 자료 목록과 PDF 업로드 |
| `/materials/:materialId` | 자료 상세와 학습 세션 생성 |
| `/sessions` | 세션 목록과 재진입 |
| `/sessions/:sessionId` | 페이지 이동과 학습 채팅 |
| `/quizzes/:quizId` | 퀴즈 풀이와 제출 결과 |
| `/sessions/:sessionId/diagnosis/:diagnosisId` | 진행 중 진단 복원과 교정 답변 |

화면은 기능별 repository를 통해 Spring API를 호출합니다. 네트워크 오류가 발생해도 로컬 데이터로 자동 전환하지 않습니다.

## UI 작업 가이드

으뜸 FE는 운영형 SaaS 학습 도구 방향을 기본으로 합니다. 외부 디자인 skill을 참고할 때는 [MengTo/Skills 적용 가이드](docs/mengto-skills-guide.md)를 따릅니다.

회원가입 소속 자동완성에 사용할 수 있는 공식 데이터와 권장 연동
구조는 [소속 기관 데이터 연동 검토](docs/affiliation-data-sources.md)에
정리합니다.

## API 호출 원칙

- 배포 Swagger와 FE 연결 상태는
  [Swagger API 연결 상태](docs/swagger-api-connection-status.md)에서 관리합니다.
- 화면은 구현되어 있지만 BE 계약이 없는 기능은
  [BE 필요 API 목록](docs/be-api-requests.md)에서 관리합니다.
- 브랜치·PR·이슈 정리 점검 결과는
  [FE GitHub 정리 점검](docs/github-repository-audit-2026-08-02.md)에서 관리합니다.
- 모든 브라우저 요청은 `VITE_API_BASE_URL`에 설정한 Spring Main Service로 보냅니다.
- `apiRequest`는 `/api/...` 형태의 상대 경로만 허용합니다. 절대 URL이나 FastAPI URL을 직접 전달할 수 없습니다.
- 요청에는 기본적으로 `credentials: include`를 적용합니다.
- 인증된 repository 요청에는 메모리에 보관한 access token을 Bearer 헤더로 자동 주입합니다.
- PDF와 SSE처럼 공통 JSON envelope를 사용하지 않는 응답은 `rawApiRequest`가
  같은 인증 갱신·401 만료 정책을 적용합니다.
- refresh token은 BE의 HttpOnly 쿠키로 관리하며, 앱 시작 시 refresh API와 `/api/users/me`로 세션을 복원합니다.
- 인증 요청이 401을 반환하면 access token을 한 번 갱신하고 원요청을 재시도합니다. 갱신 실패 또는 재시도 실패 시 세션을 종료합니다.
- 30분 동안 사용자 활동이 없으면 refresh 쿠키를 폐기하고 `?reason=idle`로 로그인 화면에 이동합니다.
- 성공 응답은 `ApiSuccess<T>`로 반환하고 실패 응답은 `ApiClientError`로 정규화합니다.

## 검증 명령

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

GitHub Actions의 `frontend-ci`가 `main`·`develop` 대상 PR과 `develop` push에서 동일한 검증을 실행합니다.

## 정적 배포 준비

정적 배포 전 점검 절차는 [docs/deploy-prep.md](docs/deploy-prep.md)에 정리합니다. 배포 후 smoke 절차는 [docs/deploy-smoke.md](docs/deploy-smoke.md)를 따릅니다.

- `npm run build`로 `dist/` 산출물을 생성하고 `dist/index.html`, `dist/assets/*`가 있는지 확인합니다.
- `dist/`는 배포 산출물이며 저장소에 커밋하지 않습니다.
- 운영 배포 환경에는 `VITE_API_BASE_URL`을 주입하고 `.env`, 인증키, 로그 파일은 업로드하지 않습니다.
- SPA fallback은 `/materials`, `/sessions/:sessionId`, `/quizzes/:quizId` 같은 client route가 새로고침에서 `/index.html`로 복구되는지 확인합니다.
- 실제 dev 배포는 BE #46과 infra 환경 준비 후 진행합니다.

## Health/CORS 연동 확인

[BE #8](https://github.com/AutoAI-EduPilot/BE/issues/8)에서 health endpoint와 CORS 설정이 구현된 후 다음을 확인합니다.

1. Spring local 프로파일을 `http://localhost:8080`에서 실행합니다.
2. 허용 origin에 `http://localhost:5173`이 포함됐는지 확인합니다.
3. FE 개발 서버에서 확정된 health endpoint를 호출합니다.
4. 성공 envelope와 credential 포함 CORS 요청이 브라우저에서 정상 처리되는지 확인합니다.

BE #8이 완료되기 전에는 실제 health/CORS 연동이 확인됐다고 표시하지 않습니다.

## 현재 범위에서 제외

- refresh token과 HttpOnly cookie 전환
- 자료 삭제·업로드 취소·재처리 remote API
- FastAPI 직접 호출
