import { CheckCircle2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  createConsentsRepository,
  getAuthRepository,
  getPolicyDocument,
  useAuth,
  validatePassword,
  type PolicyRef,
} from '../../features/auth'
import { ApiClientError, getRequestErrorMessage } from '../../shared/api'
import { isApiCapabilityEnabled } from '../../shared/config/capabilities'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Button, ButtonLink, ErrorState, TextInput } from '../../shared/ui'
import { routes } from '../routes'

export function ResetPasswordPage() {
  usePageTitle('비밀번호 재설정')
  const enabled = isApiCapabilityEnabled('password-reset')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!enabled) {
    return <ErrorState action={<ButtonLink to={routes.login}>로그인으로</ButtonLink>} description="비밀번호 재설정 기능을 준비하고 있습니다." title="현재 이용할 수 없습니다" />
  }

  if (!token) {
    return <ErrorState action={<ButtonLink to={routes.forgotPassword}>재설정 링크 다시 받기</ButtonLink>} description="재설정 이메일의 유효한 링크로 접근해 주세요." title="비밀번호를 재설정할 수 없습니다" />
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextPasswordError = validatePassword(password)
    if (nextPasswordError) {
      setPasswordError(nextPasswordError)
      return
    }
    if (password !== passwordConfirm) {
      setPasswordError('비밀번호가 일치하지 않습니다.')
      return
    }

    setIsSubmitting(true)
    setPasswordError(null)
    setRequestError(null)
    try {
      const message = await getAuthRepository().confirmPasswordReset(token, password)
      setSuccessMessage(message)
    } catch (error) {
      setRequestError(
        error instanceof ApiClientError && error.code === 'RESET_TOKEN_INVALID'
          ? '재설정 링크가 만료되었거나 유효하지 않습니다. 링크를 다시 요청해 주세요.'
          : getRequestErrorMessage(error),
      )
    } finally {
      setIsSubmitting(false)
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

  return (
    <div>
      <h1 className="type-page-title font-bold text-stone-900">새 비밀번호 설정</h1>
      <p className="mt-2 type-body text-stone-500">영문과 숫자를 포함해 8~64자로 입력해 주세요.</p>
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <TextInput
          autoComplete="new-password"
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

export function PolicyConsentPage() {
  usePageTitle('약관 동의')
  const enabled = isApiCapabilityEnabled('policy-consent')
  const { apiRequest, clearPendingConsents } = useAuth()
  const consents = useMemo(() => createConsentsRepository(apiRequest), [apiRequest])
  const navigate = useNavigate()
  const [pending, setPending] = useState<Array<PolicyRef & { title?: string }>>([])
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 로그인 응답의 스냅샷을 믿지 않고 다시 묻는다. 새로고침 뒤에도 같은 화면이 동작해야 한다.
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    consents
      .list()
      .then((state) => {
        if (cancelled) return
        if (state.pending.length === 0) {
          clearPendingConsents()
          navigate(routes.classrooms, { replace: true })
          return
        }
        setPending(state.pending)
      })
      .catch((requestError) => {
        if (!cancelled) setError(getRequestErrorMessage(requestError))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clearPendingConsents, consents, enabled, navigate])

  if (!enabled) {
    return <ErrorState action={<ButtonLink to={routes.login}>로그인으로</ButtonLink>} description="약관 동의 화면을 준비하고 있습니다." title="현재 이용할 수 없습니다" />
  }

  async function submit() {
    setIsSubmitting(true)
    setError(null)
    try {
      await consents.accept(pending)
      clearPendingConsents()
      navigate(routes.classrooms, { replace: true })
    } catch (requestError) {
      setError(getRequestErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasAcceptedAll = pending.length > 0 && pending.every((policy) => accepted.has(policyKey(policy)))

  return (
    <div>
      <h1 className="type-page-title font-bold text-stone-900">약관 동의</h1>
      <p className="mt-3 type-body text-stone-600">계속 이용하려면 아래 약관에 동의해 주세요.</p>

      {isLoading ? <p className="mt-6 type-body text-stone-500" role="status">약관을 불러오는 중입니다.</p> : null}

      <ul className="mt-6 flex flex-col gap-3">
        {pending.map((policy) => (
          <li className="rounded-xl border border-stone-200 p-4" key={policyKey(policy)}>
            <label className="flex items-start gap-3 type-body text-stone-800">
              <input
                checked={accepted.has(policyKey(policy))}
                className="mt-0.5 size-4 shrink-0"
                onChange={(event) => {
                  setAccepted((current) => {
                    const next = new Set(current)
                    if (event.target.checked) next.add(policyKey(policy))
                    else next.delete(policyKey(policy))
                    return next
                  })
                  setError(null)
                }}
                type="checkbox"
              />
              <span>
                {policy.title ?? policyTypeLabel(policy.type)}에 동의합니다
                <span className="ml-1 type-caption text-stone-400">v{policy.version}</span>
              </span>
            </label>
            <PolicyBody policy={policy} />
          </li>
        ))}
      </ul>

      {error ? <p className="mt-4 type-control text-rose-700" role="alert">{error}</p> : null}

      <Button className="mt-6 h-11 w-full" disabled={!hasAcceptedAll || isSubmitting} onClick={() => void submit()} type="button">
        {isSubmitting ? '동의 중' : '동의하고 계속'}
      </Button>
    </div>
  )
}

/** 본문은 목록 응답에 없어서 펼칠 때만 따로 받아온다. */
function PolicyBody({ policy }: { policy: PolicyRef }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <details
      className="mt-3"
      onToggle={(event) => {
        if (!event.currentTarget.open || content !== null || error !== null) return
        getPolicyDocument(policy.type, policy.version)
          .then((document) => setContent(document.content))
          .catch((requestError) => setError(getRequestErrorMessage(requestError)))
      }}
    >
      <summary className="cursor-pointer type-caption text-stone-500">전문 보기</summary>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg bg-stone-50 p-3 type-caption whitespace-pre-wrap text-stone-700">
        {error ?? content ?? '불러오는 중입니다.'}
      </div>
    </details>
  )
}

function policyKey(policy: PolicyRef): string {
  return `${policy.type}:${policy.version}`
}

function policyTypeLabel(type: PolicyRef['type']): string {
  return type === 'TERMS' ? '이용약관' : '개인정보 처리방침'
}

export function AuthCallbackPage() {
  usePageTitle('소셜 로그인')
  const enabled = isApiCapabilityEnabled('oauth')
  return <ErrorState action={<ButtonLink to={routes.login}>로그인으로</ButtonLink>} description={enabled ? 'OAuth callback API 계약이 아직 연결되지 않았습니다.' : '소셜 로그인 callback API가 배포되지 않았습니다.'} title="소셜 로그인을 완료할 수 없습니다" />
}
