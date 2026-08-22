import { ArrowRight, LogIn } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  GoogleSignInButton,
  hasFormErrors,
  mapAuthErrorToFormErrors,
  useAuth,
  validateLoginForm,
  type LoginFormErrors,
  type LoginFormValues,
} from '../../features/auth'
import { ServiceStatusIndicator } from '../../features/health'
import { ApiClientError } from '../../shared/api'
import { Button, TextInput } from '../../shared/ui'
import { routes } from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { SERVICE_NAME } from '../../shared/config/brand'

const initialValues: LoginFormValues = {
  email: '',
  password: '',
}

export function LoginPage() {
  usePageTitle('로그인')
  const {
    clearGoogleSignup,
    login,
    loginWithGoogle,
    prepareGoogleSignup,
  } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [values, setValues] = useState<LoginFormValues>(initialValues)
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)
  const isSessionExpired = searchParams.get('reason') === 'session-expired'
  const isIdleExpired = searchParams.get('reason') === 'idle'

  useEffect(() => {
    clearGoogleSignup()
  }, [clearGoogleSignup])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateLoginForm(values)
    setErrors(nextErrors)
    if (hasFormErrors(nextErrors)) return

    setIsSubmitting(true)
    setServerError(null)
    try {
      await login(values)
      navigate(routes.classrooms, { replace: true })
    } catch (error) {
      const formErrors = mapAuthErrorToFormErrors(error)
      if (formErrors) setErrors(formErrors as LoginFormErrors)
      else setServerError('로그인 요청을 처리하지 못했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateValue(field: keyof LoginFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setServerError(null)
  }

  async function handleGoogleCredential(idToken: string) {
    setIsGoogleSubmitting(true)
    setGoogleError(null)

    try {
      await loginWithGoogle({ idToken })
      navigate(routes.classrooms, { replace: true })
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 409 &&
        error.code === 'SIGNUP_REQUIRED'
      ) {
        prepareGoogleSignup(idToken)
        navigate(routes.signup)
        return
      }
      setGoogleError('Google 로그인 요청을 처리하지 못했습니다.')
    } finally {
      setIsGoogleSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        <h1 className="type-page-title font-bold text-stone-900">로그인</h1>
        <p className="type-body text-stone-400">다시 오신 걸 환영해요</p>
      </div>

      {isSessionExpired || isIdleExpired ? (
        <p
          className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 type-body font-medium text-amber-900"
          role="alert"
        >
          {isIdleExpired
            ? '30분 동안 활동이 없어 로그아웃되었습니다.'
            : '세션이 만료되었습니다. 다시 로그인하세요.'}
        </p>
      ) : null}

      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <TextInput
          autoComplete="email"
          error={errors.email}
          id="login-email"
          label="이메일"
          onChange={(event) => updateValue('email', event.target.value)}
          placeholder="user@example.com"
          type="email"
          value={values.email}
        />
        <TextInput
          autoComplete="current-password"
          error={errors.password}
          id="login-password"
          label="비밀번호"
          onChange={(event) => updateValue('password', event.target.value)}
          placeholder="8자 이상"
          type="password"
          value={values.password}
        />
        <Button className="h-11 w-full" disabled={isSubmitting} type="submit">
          <LogIn aria-hidden="true" size={15} />
          {isSubmitting ? '로그인 중' : '로그인'}
        </Button>
      </form>

      {serverError ? (
        <p className="mt-3 type-body font-medium text-rose-700" role="alert">
          {serverError}
        </p>
      ) : null}
      <div className="mt-5 flex items-center justify-between type-control">
        <Link
          className="text-stone-500 hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          to={routes.forgotPassword}
        >
          비밀번호 찾기
        </Link>
        <Link
          to={routes.signup}
          className="inline-flex items-center gap-1 font-semibold text-brand-600 underline-offset-4 hover:underline"
        >
          회원가입
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-3 type-caption text-stone-400">
        <span className="h-px flex-1 bg-stone-200" />
        또는
        <span className="h-px flex-1 bg-stone-200" />
      </div>

      <div className="mt-5">
        <GoogleSignInButton
          disabled={isGoogleSubmitting}
          onCredential={(idToken) => void handleGoogleCredential(idToken)}
        />
        {isGoogleSubmitting ? (
          <p className="mt-2 text-center type-caption text-stone-500" role="status">
            Google 계정을 확인하고 있습니다.
          </p>
        ) : null}
      </div>

      {googleError ? (
        <p className="mt-3 type-body font-medium text-rose-700" role="alert">
          {googleError}
        </p>
      ) : null}

      <p className="mt-6 text-center type-caption leading-relaxed text-stone-400">
        계속하면 {SERVICE_NAME}의 이용약관과
        <br />
        개인정보 처리방침에 동의하는 것으로 간주합니다
      </p>

      <div className="mt-4 flex justify-center border-t border-stone-100 pt-3">
        <ServiceStatusIndicator />
      </div>
    </div>
  )
}
