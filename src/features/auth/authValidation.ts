export interface LoginFormValues {
  email: string
  password: string
}

export type SignupRole = 'INSTRUCTOR' | 'LEARNER'

export interface GoogleAuthValues {
  affiliation?: string
  idToken: string
  learningEmailOptIn?: boolean
  privacyVersion?: string
  role?: SignupRole
  termsVersion?: string
}

export interface SignupFormValues extends LoginFormValues {
  affiliation?: string
  learningEmailOptIn?: boolean
  name: string
  role: SignupRole
}

export type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>>
export type SignupFormErrors = Partial<Record<keyof SignupFormValues, string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 64

export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {}

  if (!values.email.trim()) {
    errors.email = '이메일을 입력하세요.'
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = '올바른 이메일 형식이 아닙니다.'
  }

  if (!values.password) {
    errors.password = '비밀번호를 입력하세요.'
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = '비밀번호는 8자 이상이어야 합니다.'
  }

  return errors
}

export function validateSignupForm(values: SignupFormValues): SignupFormErrors {
  const errors: SignupFormErrors = { ...validateLoginForm(values) }

  // 서버 규칙(8~64자, 영문·숫자 각 1자 이상)과 동일하게 가입 시점에 먼저 거른다.
  if (
    values.password &&
    !errors.password &&
    (values.password.length > MAX_PASSWORD_LENGTH ||
      !/[a-z]/i.test(values.password) ||
      !/\d/.test(values.password))
  ) {
    errors.password = '8~64자, 영문·숫자를 포함해야 합니다.'
  }

  if (!values.name.trim()) {
    errors.name = '이름을 입력하세요.'
  } else if (values.name.trim().length < 2) {
    errors.name = '이름은 2자 이상이어야 합니다.'
  }

  if ((values.affiliation?.trim().length ?? 0) > 100) {
    errors.affiliation = '소속은 100자 이하로 입력하세요.'
  }

  return errors
}

export function hasFormErrors(errors: LoginFormErrors | SignupFormErrors): boolean {
  return Object.keys(errors).length > 0
}
