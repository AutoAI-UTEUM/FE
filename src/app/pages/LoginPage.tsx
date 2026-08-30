import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import {
  GoogleSignInButton,
  hasFormErrors,
  mapAuthErrorToFormErrors,
  useAuth,
  validateLoginForm,
  isAdminRole,
  type LoginFormErrors,
  type LoginFormValues,
} from '../../features/auth'
import { ApiClientError } from '../../shared/api'
import { Button, TextInput } from '../../shared/ui'
import { routes } from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'

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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
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
      const user = await login(values)
      navigate(isAdminRole(user.role) ? routes.admin : routes.classrooms, { replace: true })
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
      const user = await loginWithGoogle({ idToken })
      navigate(isAdminRole(user.role) ? routes.admin : routes.classrooms, { replace: true })
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
      <div>
        <h1 className="type-page-title font-bold text-stone-900">로그인</h1>
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

      <form className="mt-8" noValidate onSubmit={handleSubmit}>
        <div className="[&_input]:mt-0 [&_input]:border-[#D7DEEB] [&_input]:bg-[#EEF2FB] [&_label]:sr-only">
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
        </div>
        <div className="mt-3 [&_input]:mt-0 [&_input]:border-[#D7DEEB] [&_input]:bg-[#EEF2FB] [&_label]:sr-only">
          <div className="relative">
            <TextInput
              autoComplete="current-password"
              className="pr-11"
              error={errors.password}
              id="login-password"
              label="비밀번호"
              onChange={(event) => updateValue('password', event.target.value)}
              placeholder="8자 이상"
              type={isPasswordVisible ? 'text' : 'password'}
              value={values.password}
            />
            <button
              aria-label={isPasswordVisible ? '비밀번호 숨기기' : '비밀번호 표시'}
              aria-pressed={isPasswordVisible}
              className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              title={isPasswordVisible ? '비밀번호 숨기기' : '비밀번호 표시'}
              type="button"
            >
              {isPasswordVisible ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
            </button>
          </div>
        </div>
        <Button
          className="mt-6 h-11 w-full"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? '로그인 중' : '로그인'}
        </Button>
      </form>

      {serverError ? (
        <p className="mt-3 type-body font-medium text-rose-700" role="alert">
          {serverError}
        </p>
      ) : null}
      <div className="mt-3">
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

      <div className="mt-7 flex items-center justify-center gap-4 type-control text-stone-500">
        <Link
          className="hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          to={routes.forgotPassword}
        >
          비밀번호 찾기
        </Link>
        <span aria-hidden="true" className="h-3 w-px bg-stone-200" />
        <Link
          to={routes.signup}
          className="font-semibold text-stone-900 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          회원가입
        </Link>
      </div>
    </div>
  )
}
