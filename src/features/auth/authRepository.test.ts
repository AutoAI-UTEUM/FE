import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mapAuthErrorToFormErrors } from './authErrors'
import { getAuthRepository } from './authRepository'

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('remote auth repository', () => {
  it('signs up and logs in with the documented request bodies', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            email: 'learner@example.com',
            name: '학습자',
            userId: 1,
          },
          message: '회원가입 완료',
          success: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            accessToken: 'access-token',
            expiresIn: 3600,
            tokenType: 'Bearer',
            user: {
              email: 'learner@example.com',
              id: 1,
              name: '학습자',
              role: 'LEARNER',
            },
          },
          message: '로그인 완료',
          success: true,
        }),
      )
    const repository = getAuthRepository()
    const values = {
      email: ' Learner@example.com ',
      name: ' 학습자 ',
      password: 'password123',
      role: 'INSTRUCTOR' as const,
    }

    await repository.signup(values)
    await expect(repository.login(values)).resolves.toEqual({
      accessToken: 'access-token',
      user: {
        email: 'learner@example.com',
        id: 1,
        name: '학습자',
        role: 'LEARNER',
      },
    })

    expectJsonRequest(fetchMock, 0, '/api/auth/signup', {
      email: 'learner@example.com',
      learningEmailOptIn: false,
      name: '학습자',
      password: 'password123',
      privacyVersion: '2026-07-01',
      role: 'INSTRUCTOR',
      termsVersion: '2026-07-01',
    })
    expectJsonRequest(fetchMock, 1, '/api/auth/login', {
      email: 'learner@example.com',
      password: 'password123',
    })
  })

  it('maps VALIDATION_FAILED details onto the matching form fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_FAILED',
            details: [
              {
                field: 'password',
                reason:
                  '비밀번호는 8~64자이며 영문과 숫자를 각각 하나 이상 포함해야 합니다.',
              },
              { field: 'unknownField', reason: '무시되어야 함' },
            ],
            message: '요청 값을 확인해 주세요.',
          },
          success: false,
        },
        400,
      ),
    )

    const failure = await getAuthRepository()
      .signup({
        email: 'learner@example.com',
        name: '학습자',
        password: 'password',
        role: 'LEARNER',
      })
      .catch((error: unknown) => error)

    expect(mapAuthErrorToFormErrors(failure)).toEqual({
      password:
        '비밀번호는 8~64자이며 영문과 숫자를 각각 하나 이상 포함해야 합니다.',
    })
  })

  it('logs in an existing Google user with only the id token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          accessToken: 'google-access-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
          user: {
            email: 'google@example.com',
            id: 2,
            name: 'Google 사용자',
            role: 'LEARNER',
          },
        },
        message: 'Google 로그인 완료',
        success: true,
      }),
    )

    await expect(
      getAuthRepository().loginWithGoogle({ idToken: 'google-id-token' }),
    ).resolves.toMatchObject({
      accessToken: 'google-access-token',
      user: { email: 'google@example.com', role: 'LEARNER' },
    })

    expectJsonRequest(fetchMock, 0, '/api/auth/google', {
      idToken: 'google-id-token',
    })
  })

  it('sends the signup contract for a new Google user', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          accessToken: 'google-access-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
          user: {
            email: 'google@example.com',
            id: 2,
            name: 'Google 사용자',
            role: 'INSTRUCTOR',
          },
        },
        message: 'Google 회원가입 완료',
        success: true,
      }),
    )

    await getAuthRepository().loginWithGoogle({
      idToken: 'google-id-token',
      privacyVersion: '2026-07-01',
      role: 'INSTRUCTOR',
      termsVersion: '2026-07-01',
    })

    expectJsonRequest(fetchMock, 0, '/api/auth/google', {
      idToken: 'google-id-token',
      privacyVersion: '2026-07-01',
      role: 'INSTRUCTOR',
      termsVersion: '2026-07-01',
    })
  })

  it('validates a restored token using the bearer header', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: {
          email: 'learner@example.com',
          name: '학습자',
          userId: 1,
        },
        message: '내 정보',
        success: true,
      }),
    )

    await expect(getAuthRepository().getMe('access-token')).resolves.toEqual({
      email: 'learner@example.com',
      id: 1,
      name: '학습자',
      role: undefined,
    })

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('http://localhost:8080/api/users/me')
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer access-token',
    )
  })

  it('checks normalized email availability while typing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: { available: false },
        message: '이메일 중복 확인 완료',
        success: true,
      }),
    )

    await expect(
      getAuthRepository().checkEmailAvailability(' Existing@Example.com '),
    ).resolves.toBe(false)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe(
      'http://localhost:8080/api/auth/email-availability?email=existing%40example.com',
    )
    expect(init?.method).toBeUndefined()
  })
})

function expectJsonRequest(
  fetchMock: ReturnType<typeof vi.spyOn>,
  index: number,
  path: string,
  body: Record<string, unknown>,
) {
  const [url, init] = fetchMock.mock.calls[index] ?? []
  expect(url).toBe(`http://localhost:8080${path}`)
  expect(init?.method).toBe('POST')
  expect(init?.body).toBe(JSON.stringify(body))
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}
