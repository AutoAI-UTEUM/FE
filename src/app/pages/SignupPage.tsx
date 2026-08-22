import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  GraduationCap,
  Presentation,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  hasFormErrors,
  mapAuthErrorToFormErrors,
  useAuth,
  validateSignupForm,
  type SignupFormErrors,
  type SignupFormValues,
  type SignupRole,
} from '../../features/auth'
import { ApiClientError } from '../../shared/api'
import { Button } from '../../shared/ui'
import { routes } from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'

const initialValues: SignupFormValues = {
  email: '',
  name: '',
  password: '',
  role: 'LEARNER',
}

const GOOGLE_TERMS_VERSION = '2026-07-01'
const GOOGLE_PRIVACY_VERSION = '2026-07-01'

type SignupStep = 'account' | 'role'
type EmailAvailabilityStatus =
  | 'available'
  | 'checking'
  | 'idle'
  | 'taken'
  | 'unsupported'

const roleOptions: Array<{
  description: string
  icon: LucideIcon
  label: string
  value: SignupRole
}> = [
  {
    description:
      '초대코드로 강의실에 참여하고, 자료를 보며 AI와 학습해요',
    icon: GraduationCap,
    label: '학습자',
    value: 'LEARNER',
  },
  {
    description:
      '강의실을 만들어 자료를 올리고, 초대코드로 학습자를 초대해요',
    icon: Presentation,
    label: '강의자',
    value: 'INSTRUCTOR',
  },
]

export function SignupPage() {
  usePageTitle('회원가입')
  const {
    checkEmailAvailability,
    clearGoogleSignup,
    loginWithGoogle,
    pendingGoogleIdToken,
    signup,
  } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<SignupStep>('role')
  const [values, setValues] = useState<SignupFormValues>(initialValues)
  const [emailAvailability, setEmailAvailability] =
    useState<EmailAvailabilityStatus>('idle')
  const [errors, setErrors] = useState<SignupFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState<
    string | null
  >(null)
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false)
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false)
  const [termsError, setTermsError] = useState<string | null>(null)
  const [googleRole, setGoogleRole] = useState<SignupRole>('LEARNER')
  const [hasAcceptedGoogleTerms, setHasAcceptedGoogleTerms] = useState(false)
  const [googleTermsError, setGoogleTermsError] = useState<string | null>(null)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)
  const emailAvailabilitySupportedRef = useRef(true)

  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    values.email.trim(),
  )

  useEffect(() => {
    if (
      step !== 'account' ||
      !isEmailFormatValid ||
      !emailAvailabilitySupportedRef.current
    ) {
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      setEmailAvailability('checking')
      void checkEmailAvailability(values.email, controller.signal)
        .then((available) => {
          if (controller.signal.aborted) return
          setEmailAvailability(available ? 'available' : 'taken')
          if (!available) {
            setErrors((current) => ({
              ...current,
              email: '이미 가입된 이메일입니다.',
            }))
          }
        })
        .catch((error: unknown) => {
          if (
            (error instanceof ApiClientError &&
              error.code === 'REQUEST_ABORTED') ||
            controller.signal.aborted
          ) {
            return
          }
          emailAvailabilitySupportedRef.current = false
          setEmailAvailability('unsupported')
        })
    }, 400)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [
    checkEmailAvailability,
    isEmailFormatValid,
    step,
    values.email,
  ])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateSignupForm(values)
    const nextConfirmPasswordError = !confirmPassword
      ? '비밀번호를 한 번 더 입력하세요.'
      : confirmPassword !== values.password
        ? '비밀번호가 일치하지 않습니다.'
        : null
    if (emailAvailability === 'taken') {
      nextErrors.email = '이미 가입된 이메일입니다.'
    }
    setErrors(nextErrors)
    setConfirmPasswordError(nextConfirmPasswordError)
    if (!hasAcceptedTerms) {
      setTermsError('필수 약관에 동의해 주세요.')
    }
    if (
      hasFormErrors(nextErrors) ||
      nextConfirmPasswordError ||
      !hasAcceptedTerms ||
      emailAvailability === 'taken'
    ) {
      return
    }

    setIsSubmitting(true)
    setServerError(null)
    try {
      await signup(values)
      navigate(routes.classrooms, { replace: true })
    } catch (error) {
      const formErrors = mapAuthErrorToFormErrors(error)
      if (formErrors) setErrors(formErrors as SignupFormErrors)
      else setServerError('회원가입 요청을 처리하지 못했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleGoogleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pendingGoogleIdToken) return
    if (!hasAcceptedGoogleTerms) {
      setGoogleTermsError('필수 약관에 동의해 주세요.')
      return
    }

    setIsGoogleSubmitting(true)
    setGoogleError(null)
    try {
      await loginWithGoogle({
        idToken: pendingGoogleIdToken,
        privacyVersion: GOOGLE_PRIVACY_VERSION,
        role: googleRole,
        termsVersion: GOOGLE_TERMS_VERSION,
      })
      navigate(routes.classrooms, { replace: true })
    } catch {
      setGoogleError('Google 회원가입 요청을 처리하지 못했습니다.')
    } finally {
      setIsGoogleSubmitting(false)
    }
  }

  function cancelGoogleSignup() {
    clearGoogleSignup()
    navigate(routes.login, { replace: true })
  }

  function updateValue<Field extends keyof SignupFormValues>(
    field: Field,
    value: SignupFormValues[Field],
  ) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    if (field === 'email') {
      setEmailAvailability(
        emailAvailabilitySupportedRef.current ? 'idle' : 'unsupported',
      )
    }
    setServerError(null)
  }

  function updateConfirmPassword(value: string) {
    setConfirmPassword(value)
    setConfirmPasswordError(null)
    setServerError(null)
  }

  const selectedRoleLabel =
    values.role === 'INSTRUCTOR' ? '강의자' : '학습자'
  const passwordStrength = getPasswordStrength(values.password)

  if (pendingGoogleIdToken) {
    return (
      <div>
        <div className="flex flex-col gap-1.5">
          <p className="type-control text-stone-400">Google 회원가입</p>
          <h1 className="type-page-title font-bold text-stone-900">
            Google 가입을 완료해 주세요
          </h1>
          <p className="type-body text-stone-400">
            으뜸에서 사용할 역할을 선택해 주세요
          </p>
        </div>

        <form className="mt-6" onSubmit={handleGoogleSignup}>
          <div
            aria-label="Google 가입 역할"
            className="grid grid-cols-2 rounded-lg bg-stone-100 p-1"
            role="radiogroup"
          >
            {([
              ['LEARNER', '학습자'],
              ['INSTRUCTOR', '강의자'],
            ] as const).map(([role, label]) => {
              const isSelected = googleRole === role
              return (
                <button
                  aria-checked={isSelected}
                  className={[
                    'h-10 rounded-md type-body font-semibold transition-colors',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600',
                    isSelected
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-stone-500 hover:text-stone-800',
                  ].join(' ')}
                  key={role}
                  onClick={() => setGoogleRole(role)}
                  role="radio"
                  type="button"
                >
                  {label}
                </button>
              )
            })}
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-2.5 type-control leading-5 text-stone-600">
            <input
              checked={hasAcceptedGoogleTerms}
              className="mt-0.5 size-4 shrink-0 rounded border-stone-300 accent-brand-600"
              onChange={(event) => {
                setHasAcceptedGoogleTerms(event.target.checked)
                setGoogleTermsError(null)
              }}
              type="checkbox"
            />
            <span>
              이용약관 및 개인정보 처리방침에 동의합니다{' '}
              <span className="font-semibold text-rose-600">*</span>
            </span>
          </label>
          {googleTermsError ? (
            <p className="mt-1 type-caption font-medium text-rose-700" role="alert">
              {googleTermsError}
            </p>
          ) : null}

          {googleError ? (
            <p className="mt-3 type-body font-medium text-rose-700" role="alert">
              {googleError}
            </p>
          ) : null}

          <div className="mt-5 flex gap-2">
            <Button
              className="h-11 flex-1"
              disabled={isGoogleSubmitting}
              type="submit"
            >
              {isGoogleSubmitting ? '가입 중' : '동의하고 가입하기'}
            </Button>
            <Button
              className="h-11"
              disabled={isGoogleSubmitting}
              onClick={cancelGoogleSignup}
              type="button"
              variant="secondary"
            >
              취소
            </Button>
          </div>
        </form>
      </div>
    )
  }

  if (step === 'role') {
    return (
      <div>
        <div className="flex flex-col gap-1.5">
          <p className="type-control text-stone-400">회원가입 1 / 2</p>
          <h1 className="type-page-title font-bold text-stone-900">
            어떤 역할로 사용하시나요?
          </h1>
          <p className="type-body text-stone-400">
            가입 후에도 설정에서 변경할 수 있어요
          </p>
        </div>

        <div
          aria-label="사용 역할"
          className="mt-6 grid gap-3"
          role="radiogroup"
        >
          {roleOptions.map((option) => {
            const isSelected = values.role === option.value

            return (
              <button
                aria-checked={isSelected}
                className={[
                  'flex min-h-21 w-full items-center gap-4 rounded-xl border p-5 text-left transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  isSelected
                    ? 'border-[1.5px] border-brand-600 bg-brand-50'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50',
                ].join(' ')}
                key={option.value}
                onClick={() => updateValue('role', option.value)}
                role="radio"
                type="button"
              >
                <span
                  className={[
                    'flex size-11 shrink-0 items-center justify-center rounded-[11px]',
                    isSelected
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-stone-100 text-stone-500',
                  ].join(' ')}
                >
                  <option.icon aria-hidden="true" size={21} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block type-section-title font-bold text-stone-900">
                    {option.label}
                  </strong>
                  <span className="mt-0.5 block type-control leading-5 text-stone-600">
                    {option.description}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={[
                    'flex size-5 shrink-0 items-center justify-center rounded-full',
                    isSelected
                      ? 'bg-brand-600 text-white'
                      : 'border-[1.5px] border-stone-200',
                  ].join(' ')}
                >
                  {isSelected ? <Check size={12} strokeWidth={2.5} /> : null}
                </span>
              </button>
            )
          })}
        </div>

        <Button
          className="mt-6 h-11 w-full"
          onClick={() => setStep('account')}
          type="button"
        >
          다음
          <ArrowRight aria-hidden="true" size={15} />
        </Button>

        <p className="mt-6 text-center type-body text-stone-600">
          이미 계정이 있다면{' '}
          <Link
            to={routes.login}
            className="font-semibold text-brand-700 underline-offset-4 hover:underline"
          >
            로그인
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        <p className="type-control text-stone-400">
          회원가입 2 / 2 ·{' '}
          <strong className="font-semibold text-brand-600">
            {selectedRoleLabel}
          </strong>
        </p>
        <h1 className="type-page-title font-bold text-stone-900">
          계정 정보를 입력하세요
        </h1>
      </div>

      <form className="mt-6 space-y-4" noValidate onSubmit={handleSubmit}>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label
              className="type-control font-semibold text-stone-800"
              htmlFor="signup-name"
            >
              이름
            </label>
            {errors.name ? (
              <p
                className="type-caption font-medium text-rose-700"
                id="signup-name-error"
                role="alert"
              >
                {errors.name}
              </p>
            ) : null}
          </div>
          <input
            aria-describedby={errors.name ? 'signup-name-error' : undefined}
            aria-invalid={errors.name ? true : undefined}
            autoComplete="name"
            className={`${fieldClassName(Boolean(errors.name), '')} mt-1`}
            id="signup-name"
            onChange={(event) => updateValue('name', event.target.value)}
            placeholder="홍길동"
            value={values.name}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label
              className="type-control font-semibold text-stone-800"
              htmlFor="signup-email"
            >
              이메일
            </label>
            {errors.email ? (
              <p
                className="type-caption font-medium text-rose-700"
                id="signup-email-error"
                role="alert"
              >
                {errors.email}
              </p>
            ) : null}
          </div>
          <div className="relative mt-1">
            <input
              aria-describedby={errors.email ? 'signup-email-error' : undefined}
              aria-invalid={errors.email ? true : undefined}
              autoComplete="email"
              className={fieldClassName(Boolean(errors.email), 'pr-24')}
              id="signup-email"
              onChange={(event) => updateValue('email', event.target.value)}
              placeholder="user@example.com"
              type="email"
              value={values.email}
            />
            {isEmailFormatValid &&
            !errors.email &&
            emailAvailability !== 'idle' ? (
              <span
                className={[
                  'pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 type-micro font-semibold',
                  emailAvailability === 'available'
                    ? 'text-emerald-700'
                    : 'text-stone-500',
                ].join(' ')}
              >
                {getEmailAvailabilityLabel(emailAvailability)}
              </span>
            ) : null}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label
              className="type-control font-semibold text-stone-800"
              htmlFor="signup-password"
            >
              비밀번호
            </label>
            {errors.password ? (
              <p
                className="type-caption font-medium text-rose-700"
                id="signup-password-error"
                role="alert"
              >
                {errors.password}
              </p>
            ) : null}
          </div>
          <div className="relative mt-1">
            <input
              aria-describedby={
                errors.password ? 'signup-password-error' : 'password-strength'
              }
              aria-invalid={errors.password ? true : undefined}
              autoComplete="new-password"
              className={fieldClassName(Boolean(errors.password), 'pr-11')}
              id="signup-password"
              onChange={(event) => updateValue('password', event.target.value)}
              placeholder="영문·숫자 포함 8~64자"
              type={isPasswordVisible ? 'text' : 'password'}
              value={values.password}
            />
            <button
              aria-label={
                isPasswordVisible ? '비밀번호 숨기기' : '비밀번호 표시'
              }
              className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 items-center justify-center rounded text-stone-400 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              type="button"
            >
              {isPasswordVisible ? (
                <EyeOff aria-hidden="true" size={16} />
              ) : (
                <Eye aria-hidden="true" size={16} />
              )}
            </button>
          </div>
          <div
            aria-live="polite"
            className="mt-2 flex items-center gap-1.5"
            id="password-strength"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <span
                className={[
                  'h-1 flex-1 rounded-full',
                  index < passwordStrength.score
                    ? passwordStrength.barClassName
                    : 'bg-stone-200',
                ].join(' ')}
                key={index}
              />
            ))}
            <span
              className={[
                'ml-1.5 min-w-9 text-right type-micro font-semibold',
                passwordStrength.labelClassName,
              ].join(' ')}
            >
              {passwordStrength.label}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label
              className="type-control font-semibold text-stone-800"
              htmlFor="signup-confirm-password"
            >
              비밀번호 확인
            </label>
            {confirmPasswordError ? (
              <p
                className="type-caption font-medium text-rose-700"
                id="signup-confirm-password-error"
                role="alert"
              >
                {confirmPasswordError}
              </p>
            ) : null}
          </div>
          <div className="relative mt-1">
            <input
              aria-describedby={
                confirmPasswordError
                  ? 'signup-confirm-password-error'
                  : undefined
              }
              aria-invalid={confirmPasswordError ? true : undefined}
              autoComplete="new-password"
              className={fieldClassName(
                Boolean(confirmPasswordError),
                'pr-11',
              )}
              id="signup-confirm-password"
              onChange={(event) => updateConfirmPassword(event.target.value)}
              placeholder="비밀번호를 다시 입력하세요"
              type={isConfirmPasswordVisible ? 'text' : 'password'}
              value={confirmPassword}
            />
            <button
              aria-label={
                isConfirmPasswordVisible
                  ? '비밀번호 확인 숨기기'
                  : '비밀번호 확인 표시'
              }
              className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 items-center justify-center rounded text-stone-400 hover:text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
              onClick={() =>
                setIsConfirmPasswordVisible((visible) => !visible)
              }
              type="button"
            >
              {isConfirmPasswordVisible ? (
                <EyeOff aria-hidden="true" size={16} />
              ) : (
                <Eye aria-hidden="true" size={16} />
              )}
            </button>
          </div>
        </div>

        <div className="grid gap-2 pt-1">
          <label className="flex cursor-pointer items-start gap-2.5 type-control leading-5 text-stone-600">
            <input
              checked={hasAcceptedTerms}
              className="size-4 shrink-0 rounded border-stone-300 accent-brand-600"
              onChange={(event) => {
                setHasAcceptedTerms(event.target.checked)
                setTermsError(null)
              }}
              type="checkbox"
            />
            <span>
              이용약관 및 개인정보 처리방침 동의{' '}
              <span className="font-semibold text-rose-600">*</span>
            </span>
          </label>
          {termsError ? (
            <p className="type-caption font-medium text-rose-700" role="alert">
              {termsError}
            </p>
          ) : null}
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            className="h-11 shrink-0 px-5"
            onClick={() => {
              setEmailAvailability('idle')
              setStep('role')
            }}
            type="button"
            variant="secondary"
          >
            <ArrowLeft aria-hidden="true" size={15} />
            이전
          </Button>
          <Button
            className="h-11 flex-1"
            disabled={
              isSubmitting ||
              emailAvailability === 'checking' ||
              emailAvailability === 'taken'
            }
            type="submit"
          >
            {isSubmitting ? '가입 중' : '가입 완료'}
          </Button>
        </div>
      </form>

      {serverError ? (
        <p className="mt-3 type-body font-medium text-rose-700" role="alert">
          {serverError}
        </p>
      ) : null}

    </div>
  )
}

function getEmailAvailabilityLabel(
  status: EmailAvailabilityStatus,
): string {
  switch (status) {
    case 'available':
      return '✓ 사용 가능'
    case 'checking':
      return '확인 중'
    case 'unsupported':
      return '가입 시 확인'
    default:
      return ''
  }
}

function fieldClassName(hasError: boolean, spacingClassName: string): string {
  return [
    'block h-11 w-full rounded-[10px] border bg-white px-3.5 type-body text-stone-950',
    'placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100',
    hasError ? 'border-rose-400' : 'border-stone-300',
    spacingClassName,
  ].join(' ')
}

function getPasswordStrength(password: string): {
  barClassName: string
  label: string
  labelClassName: string
  score: number
} {
  if (!password) {
    return {
      barClassName: 'bg-stone-300',
      label: '',
      labelClassName: 'text-stone-400',
      score: 0,
    }
  }

  const score = [
    password.length >= 8,
    /[a-z]/i.test(password),
    /\d/.test(password),
    password.length >= 12 || /[^a-z\d]/i.test(password),
  ].filter(Boolean).length

  if (score >= 3) {
    return {
      barClassName: 'bg-emerald-600',
      label: '안전',
      labelClassName: 'text-emerald-700',
      score,
    }
  }

  if (score === 2) {
    return {
      barClassName: 'bg-amber-500',
      label: '보통',
      labelClassName: 'text-amber-700',
      score,
    }
  }

  return {
    barClassName: 'bg-rose-500',
    label: '약함',
    labelClassName: 'text-rose-700',
    score: Math.max(1, score),
  }
}
