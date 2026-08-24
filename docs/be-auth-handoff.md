# 인증 API 확인 및 BE 요청

기준:

- dev Swagger: `https://dev.uteum.com/v3/api-docs`
- BE `main`: `616bd8a`
- 확인일: 2026-07-30

## 1. 회원 탈퇴 후 재로그인

FE는 회원 탈퇴 시 아래 요청을 보냅니다.

```http
DELETE /api/users/me
Authorization: Bearer {accessToken}
Content-Type: application/json

{ "password": "..." }
```

200 응답 후에는 메모리의 access token과 사용자 상태를 즉시 제거합니다. FE에서
탈퇴 요청을 생략하거나 기존 로그인 상태를 유지하는 흐름은 확인되지 않았습니다.

BE `main`도 `User.withdraw()`에서 이메일·이름·비밀번호를 익명화하고
`status=DELETED`로 바꾸며, `AuthService.login()`은 비활성 사용자를
`USER_INACTIVE`로 거부하도록 구현되어 있습니다. 따라서 탈퇴했던 이메일과
비밀번호로 새로운 `POST /api/auth/login`이 성공한다면 배포 서버 또는 DB 반영
문제로 판단됩니다.

확인 요청:

1. 탈퇴 응답이 실제로 200인지와 해당 요청의 trace/log를 확인해 주세요.
2. DB에서 사용자의 `email`, `password_hash`, `status`가 커밋됐는지 확인해 주세요.
3. 탈퇴 직후 원래 이메일로 보낸 새 `POST /api/auth/login`이 200인지 확인해 주세요.
4. 배포 서버가 `main` 616bd8a 이상의 이미지를 실행 중인지 확인해 주세요.

참고로 기존 access token은 계약상 최대 1시간 동안 암호학적으로는 유효할 수
있습니다. 이번 증상이 기존 화면 유지가 아니라 새 로그인 요청 성공인지 구분이
필요합니다.

## 2. 이메일 입력 중 중복 확인

현재 Swagger에는 가입 요청에서만 `EMAIL_ALREADY_EXISTS`를 반환하며 별도 중복
확인 API가 없습니다. FE는 아래 계약으로 400ms 디바운스 연동을 준비했습니다.
엔드포인트가 없는 현재 환경에서는 가입을 막지 않고 가입 요청 시 최종 확인합니다.

```http
GET /api/auth/email-availability?email=user@example.com
```

```json
{
  "success": true,
  "data": {
    "available": true
  },
  "message": "이메일 중복 확인 완료"
}
```

요청 사항:

- 이메일 trim/lowercase 정규화 후 중복을 확인해 주세요.
- 과도한 조회 방지를 위한 rate limit을 적용해 주세요.
- 가입 시 unique constraint와 `EMAIL_ALREADY_EXISTS` 처리는 최종 방어선으로
  그대로 유지해 주세요.

## 3. 가입 역할

FE는 역할 선택값을 가입 요청의 `role`에 포함합니다.

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "홍길동",
  "role": "LEARNER"
}
```

허용값은 `LEARNER`, `INSTRUCTOR`입니다. 현재 Swagger의 `SignupRequest`에는
`role`이 없고, BE `User.create()`는 역할을 항상 `USER`로 저장하므로 강의자
선택도 학습자로 가입됩니다.

요청 사항:

1. `SignupRequest`에 필수 `role`을 추가해 주세요.
2. 사용자 역할을 `LEARNER`/`INSTRUCTOR`로 정리하거나, 기존 `USER`/`ADMIN`을
   유지한다면 안전한 매핑 계약을 회신해 주세요.
3. 공개 회원가입의 강의자 역할을 관리자 권한과 동일하게 처리하지 마세요.
4. signup 응답과 login/users-me 응답에도 같은 역할 값을 반환해 주세요.
5. 학습 자료·강의실 권한 검사와 기존 사용자 마이그레이션을 함께 반영해 주세요.
