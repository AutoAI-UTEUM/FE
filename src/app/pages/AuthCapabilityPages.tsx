import { CheckCircle2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'

import { getAuthRepository, validatePassword } from '../../features/auth'
import { ApiClientError, getRequestErrorMessage } from '../../shared/api'
import { isApiCapabilityEnabled } from '../../shared/config/capabilities'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Button, ButtonLink, ErrorState, TextInput } from '../../shared/ui'
import { routes } from '../routes'

export function ResetPasswordPage() {
  usePageTitle('비밀번호 재설정')
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const lastCleanupKeyRef = useRef<string | null>(null)
  const captureLink = () => {
    const params = new URLSearchParams(location.search)
    const hasToken = params.has('token')
    const token = params.get('token')?.trim() ?? ''
    params.delete('token')
    const cleanSearch = params.toString()
    return {
      key: location.key,
      locationKey: location.key,
      token,
      cleanupTarget: hasToken
        ? `${location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${location.hash}`
        : null,
    }
  }
  const [link, setLink] = useState(captureLink)
  if (link.locationKey !== location.key) {
    const target = `${location.pathname}${location.search}${location.hash}`
    // Only our one expected replacement can keep the captured credential.
    // Back/Forward or any other navigation must never reuse another entry's token.
    setLink(navigationType === 'REPLACE' && link.cleanupTarget === target
      ? { ...link, locationKey: location.key, cleanupTarget: null }
      : captureLink())
  }
  useLayoutEffect(() => {
    const params = new URLSearchParams(location.search)
    if (!params.has('token') || lastCleanupKeyRef.current === location.key) return
    lastCleanupKeyRef.current = location.key
    params.delete('token')
    const search = params.toString()
    void navigate({
      pathname: location.pathname,
      search: search ? `?${search}` : '',
      hash: location.hash,
    }, { replace: true, state: location.state })
  }, [location, navigate])
  const clearToken = useCallback(() => {
    setLink((current) => ({ ...current, token: '' }))
  }, [])

  return <ResetPasswordForm key={link.key} token={link.token} clearToken={clearToken} />
}

function ResetPasswordForm({ token, clearToken }: { token: string; clearToken: () => void }) {
  const enabled = isApiCapabilityEnabled('password-reset')
  const submissionRef = useRef<AbortController | null>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => () => {
    submissionRef.current?.abort()
    submissionRef.current = null
  }, [])

  if (!enabled) {
    return <ErrorState action={<ButtonLink to={routes.login}>로그인으로</ButtonLink>} description="비밀번호 재설정 기능을 준비하고 있습니다." title="현재 이용할 수 없습니다" />
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionRef.current || successMessage || !token) return
    const nextPasswordError = validatePassword(password)
    if (nextPasswordError) {
      setPasswordError(nextPasswordError)
      return
    }
    if (password !== passwordConfirm) {
      setPasswordError('비밀번호가 일치하지 않습니다.')
      return
    }

    const controller = new AbortController()
    submissionRef.current = controller
    setIsSubmitting(true)
    setPasswordError(null)
    setRequestError(null)
    try {
      const message = await getAuthRepository().confirmPasswordReset(token, password, controller.signal)
      if (submissionRef.current !== controller || controller.signal.aborted) return
      setSuccessMessage(message)
      setPassword('')
      setPasswordConfirm('')
      clearToken()
    } catch (error) {
      if (submissionRef.current !== controller || controller.signal.aborted) return
      setRequestError(
        error instanceof ApiClientError && error.code === 'RESET_TOKEN_INVALID'
          ? '재설정 링크가 만료되었거나 유효하지 않습니다. 링크를 다시 요청해 주세요.'
          : getRequestErrorMessage(error),
      )
    } finally {
      if (submissionRef.current === controller) {
        submissionRef.current = null
        setIsSubmitting(false)
      }
    }
  }

  if (successMessage) {
    return (
      <section className="text-center" role="status">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <CheckCircle2 aria-hidden="true" size={24} />
        </span>
        <h1 className="mt-4 type-page-title font-bold text-stone-900">비밀번호 변경 완료</h1>
        <p className="mt-2 type-body text-stone-500">{successMessage}</p>
        <ButtonLink className="mt-6 w-full" to={routes.login}>새 비밀번호로 로그인</ButtonLink>
      </section>
    )
  }

  if (!token) {
    return <ErrorState action={<ButtonLink to={routes.forgotPassword}>재설정 링크 다시 받기</ButtonLink>} description="재설정 이메일의 링크를 다시 열어 주세요. 보안을 위해 새로고침하면 링크를 다시 열어야 합니다." title="비밀번호를 재설정할 수 없습니다" />
  }

  return (
    <div>
      <h1 className="type-page-title font-bold text-stone-900">새 비밀번호 설정</h1>
      <p className="mt-2 type-body text-stone-500">영문과 숫자를 포함해 8~64자로 입력해 주세요.</p>
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <TextInput
          autoComplete="new-password"
          disabled={isSubmitting}
          error={passwordError ?? undefined}
          id="reset-password"
          label="새 비밀번호"
          onChange={(event) => {
            setPassword(event.target.value)
            setPasswordError(null)
            setRequestError(null)
          }}
          type="password"
          value={password}
        />
        <TextInput
          autoComplete="new-password"
          disabled={isSubmitting}
          id="reset-password-confirm"
          label="새 비밀번호 확인"
          onChange={(event) => {
            setPasswordConfirm(event.target.value)
            setPasswordError(null)
            setRequestError(null)
          }}
          type="password"
          value={passwordConfirm}
        />
        {requestError ? <p className="type-control text-rose-700" role="alert">{requestError}</p> : null}
        <Button className="mt-2 h-11 w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? '변경 중' : '비밀번호 변경'}
        </Button>
      </form>
      <ButtonLink className="mt-4 w-full" to={routes.login} variant="ghost">로그인으로 돌아가기</ButtonLink>
    </div>
  )
}

export function AuthCallbackPage() {
  usePageTitle('소셜 로그인')
  const enabled = isApiCapabilityEnabled('oauth')
  return <ErrorState action={<ButtonLink to={routes.login}>로그인으로</ButtonLink>} description={enabled ? 'OAuth callback API 계약이 아직 연결되지 않았습니다.' : '소셜 로그인 callback API가 배포되지 않았습니다.'} title="소셜 로그인을 완료할 수 없습니다" />
}
