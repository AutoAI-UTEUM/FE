import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixtures from '../../test/launchAuthFixtures.json'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import { getAuthRepository } from './authRepository'
import { confirmEmailVerification, getEmailVerificationStatus, requestEmailVerification } from './emailVerificationRepository'
import { hasEmailVerificationSupport, LAUNCH_AUTH_CONTRACT, requiresEmailVerification, validateDateOfBirth } from './launchAuthContract'
import { mapAuthErrorToFormErrors } from './authErrors'
import type { AuthUser } from './authContext'
import type { SignupFormValues, GoogleAuthValues } from './authValidation'

const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data, message: 'synthetic' }), { status })
const fixtureResponse = (fixture: { body: unknown; status: number }) => new Response(JSON.stringify(fixture.body), { status: fixture.status })
beforeEach(() => {
  vi.stubEnv('VITE_API_BASE_URL', '/api')
  vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('pinned launch auth contract with synthetic fixtures', () => {
  it('defaults OFF, strips new signup fields, and refuses every new API without fetching', async () => {
    vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', '')
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fixtureResponse(fixtures.responses.localSignup))
    await getAuthRepository().signup(fixtures.inputs.localSignup as SignupFormValues)
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string)
    expect(body).not.toHaveProperty('dateOfBirth')
    expect(body).not.toHaveProperty('consents')
    const request = vi.fn()
    await expect(getEmailVerificationStatus(request)).rejects.toMatchObject({ code: 'AUTH_CONTRACT_UNAVAILABLE' })
    await expect(requestEmailVerification(request)).rejects.toMatchObject({ code: 'AUTH_CONTRACT_UNAVAILABLE' })
    await expect(confirmEmailVerification(fixtures.inputs.confirm.token)).rejects.toMatchObject({ code: 'AUTH_CONTRACT_UNAVAILABLE' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(request).not.toHaveBeenCalled()
  })

  it('passes DOB/current versions for LOCAL and new Google, keeps existing Google token-only', async () => {
    vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', LAUNCH_AUTH_CONTRACT)
    const fetch = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(fixtureResponse(fixtures.responses.localSignup))
      .mockImplementation(async () => fixtureResponse(fixtures.responses.newGoogleSignup))
    const account = await getAuthRepository().signup(fixtures.inputs.localSignup as SignupFormValues)
    expect(account).toMatchObject({ userId: 900001, emailVerification: 'PENDING', emailVerificationRequired: true })
    expect(account).not.toHaveProperty('emailVerifiedAt')
    expect(account).not.toHaveProperty('id')
    await getAuthRepository().loginWithGoogle(fixtures.inputs.newGoogleSignup as GoogleAuthValues)
    await getAuthRepository().loginWithGoogle(fixtures.inputs.existingGoogleLogin)
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject(fixtures.inputs.localSignup)
    expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toMatchObject(fixtures.inputs.newGoogleSignup)
    expect(JSON.parse(fetch.mock.calls[2][1]!.body as string)).toEqual(fixtures.inputs.existingGoogleLogin)
  })

  it.each(['UNKNOWN', 'PENDING', 'VERIFIED'] as const)('preserves %s and explicit required=false without invented evidence', async (state) => {
    const user = { ...fixtures.responses.meLegacy.body.data, emailVerification: state }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(user))
    const me = await getAuthRepository().getMe('synthetic-access')
    expect(me).toMatchObject({ emailVerification: state, emailVerificationRequired: false, emailVerifiedAt: null })
    expect(requiresEmailVerification(me)).toBe(false)
  })

  it('preserves unsupported absence from old login/me, without UNKNOWN/VERIFIED/legacy substitutions', async () => {
    const user = { id: 9, name: 'synthetic', role: 'LEARNER', email: 'old@example.invalid' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(user))
    const me = await getAuthRepository().getMe('synthetic-access')
    expect(hasEmailVerificationSupport(me)).toBe(false)
    expect(me).not.toHaveProperty('emailVerification')
    expect(me).not.toHaveProperty('emailVerificationRequired')
    expect(me).not.toHaveProperty('emailVerifiedAt')
  })

  it.each(['googleEmailConflict', 'googleSignupRequired', 'malformedDob', 'policyRequired'] as const)('keeps %s distinct without retries', async (name) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fixtureResponse(fixtures.responses[name]))
    const call = name.startsWith('google') ? getAuthRepository().loginWithGoogle(fixtures.inputs.existingGoogleLogin)
      : getAuthRepository().signup(fixtures.inputs.localSignup as SignupFormValues)
    await expect(call).rejects.toMatchObject({ code: fixtures.responses[name].body.error.code })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('maps DOB field errors and validates real calendar dates only', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fixtureResponse(fixtures.responses.localMissingDob))
    const error = await getAuthRepository().signup(fixtures.inputs.localSignup as SignupFormValues).catch((error: unknown) => error)
    expect(mapAuthErrorToFormErrors(error)).toHaveProperty('dateOfBirth')
    for (const date of [undefined, '2000-02-30', '1900-02-29', '0000-01-01', '10000-01-01', '2001-2-3']) expect(validateDateOfBirth(date)).toBeTruthy()
    for (const date of ['2000-02-29', '0001-01-01', '9999-12-31', '2015-01-02', '2099-01-01']) expect(validateDateOfBirth(date)).toBeUndefined()
  })

  it('confirm is public POST with no grant/cookies and yields no session/account result', async () => {
    vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', LAUNCH_AUTH_CONTRACT)
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(fixtureResponse(fixtures.responses.confirmVerified))
    await expect(confirmEmailVerification(fixtures.inputs.confirm.token)).resolves.toBeUndefined()
    const init = fetch.mock.calls[0][1]!
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
    expect(new Headers(init.headers).has('Authorization')).toBe(false)
    expect(JSON.parse(init.body as string)).toEqual(fixtures.inputs.confirm)
  })

  it('202/null is accepted, 429 has no invented countdown', async () => {
    vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', LAUNCH_AUTH_CONTRACT)
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fixtureResponse(fixtures.responses.requestAccepted))
      .mockResolvedValue(fixtureResponse(fixtures.responses.requestRateLimited))
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <AuthProvider initialUser={fixtures.responses.meLegacy.body.data as unknown as AuthUser}>{children}</AuthProvider> })
    await expect(requestEmailVerification(result.current.apiRequest)).resolves.toBeUndefined()
    await expect(requestEmailVerification(result.current.apiRequest)).rejects.toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', retryAfterSeconds: null })
    expect(new Headers(fetch.mock.calls[0][1]!.headers).get('Authorization')).toBe('Bearer test-access-token')
  })

  it.each(['JSON', 'PDF', 'SSE'])('%s HTTP 403 holds business requests, keeps session/me, never refreshes/logs out', async (kind) => {
    const initial = fixtures.responses.meLegacy.body.data as unknown as AuthUser
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fixtureResponse(fixtures.responses.emailGateDenied)).mockResolvedValue(response(initial))
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <AuthProvider initialUser={initial}>{children}</AuthProvider> })
    await act(async () => {
      const call = kind === 'JSON' ? result.current.apiRequest('/api/materials') : result.current.rawApiRequest(kind === 'PDF' ? '/api/materials/9/file' : '/api/sessions/9/stream')
      await expect(call).rejects.toMatchObject({ status: 403, code: 'EMAIL_VERIFICATION_REQUIRED' })
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.emailVerificationRequired).toBe(true)
    await expect(result.current.apiRequest('/api/materials')).rejects.toMatchObject({ code: 'EMAIL_VERIFICATION_REQUIRED' })
    await result.current.apiRequest('/api/users/me')
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([kind === 'JSON' ? '/api/materials' : kind === 'PDF' ? '/api/materials/9/file' : '/api/sessions/9/stream', '/api/users/me'])
  })

  it('ignores late self-status/me results after account switch', async () => {
    vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', LAUNCH_AUTH_CONTRACT)
    const initial = fixtures.responses.meLegacy.body.data as unknown as AuthUser
    let release!: (response: Response) => void
    const late = new Promise<Response>((resolve) => { release = resolve })
    const second = { ...initial, id: 800001, email: 'other@example.invalid', emailVerification: 'PENDING' as const, emailVerificationRequired: true }
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).endsWith('/status')) return Promise.resolve(fixtureResponse(fixtures.responses.statusLegacyUnknown))
      if (String(url).endsWith('/api/users/me')) return late
      return Promise.resolve(response({ ...fixtures.responses.loginPending.body.data, user: second }))
    })
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <AuthProvider initialUser={initial}>{children}</AuthProvider> })
    let reload!: Promise<AuthUser | null>
    await act(async () => { reload = result.current.refreshCurrentUser!(); await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await result.current.login({ email: second.email, password: 'Synthetic123!' }) })
    await act(async () => { release(response({ ...initial, emailVerification: 'VERIFIED', emailVerificationRequired: false })); await reload })
    expect(result.current.user).toMatchObject(second)
  })

  it('keeps the latest same-account self lookup when an old PENDING me arrives after VERIFIED', async () => {
    vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', LAUNCH_AUTH_CONTRACT)
    const initial = fixtures.responses.meLegacy.body.data as unknown as AuthUser
    let release!: (response: Response) => void
    const late = new Promise<Response>((resolve) => { release = resolve })
    let meCalls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).endsWith('/status')) return Promise.resolve(fixtureResponse(fixtures.responses.statusLegacyUnknown))
      meCalls++
      return meCalls === 1 ? late : Promise.resolve(response({ ...initial, ...fixtures.responses.confirmVerified.body.data }))
    })
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <AuthProvider initialUser={initial}>{children}</AuthProvider> })
    let old!: Promise<AuthUser | null>
    await act(async () => { old = result.current.refreshCurrentUser!() })
    await waitFor(() => expect(meCalls).toBe(1))
    await act(async () => { await result.current.refreshCurrentUser!() })
    await act(async () => { release(response({ ...initial, emailVerification: 'PENDING', emailVerificationRequired: true })); await old })
    expect(result.current.user).toMatchObject({ emailVerification: 'VERIFIED', emailVerificationRequired: false })
  })

  it.each(['JSON', 'raw'])('ignores a late %s business 403 after a newer same-account VERIFIED lookup', async (kind) => {
    vi.stubEnv('VITE_AUTH_CONTRACT_READINESS', LAUNCH_AUTH_CONTRACT)
    const initial = fixtures.responses.meLegacy.body.data as unknown as AuthUser
    let release!: (response: Response) => void
    const late = new Promise<Response>((resolve) => { release = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).includes('/api/materials')) return late
      if (String(url).endsWith('/status')) return Promise.resolve(fixtureResponse(fixtures.responses.confirmVerified))
      return Promise.resolve(response({ ...initial, ...fixtures.responses.confirmVerified.body.data }))
    })
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <AuthProvider initialUser={initial}>{children}</AuthProvider> })
    const pending = (kind === 'JSON' ? result.current.apiRequest('/api/materials') : result.current.rawApiRequest('/api/materials/9/file')).catch((error: unknown) => error)
    await act(async () => { await result.current.refreshCurrentUser!() })
    await act(async () => { release(fixtureResponse(fixtures.responses.emailGateDenied)); await pending })
    expect(result.current.user).toMatchObject({ emailVerification: 'VERIFIED', emailVerificationRequired: false })
  })
})

