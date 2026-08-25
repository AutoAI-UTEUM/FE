import { ArrowLeft, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { usePageTitle } from '../../shared/lib/usePageTitle'
import { Button } from '../../shared/ui'
import { routes } from '../routes'

export function ForgotPasswordPage() {
  usePageTitle('비밀번호 찾기')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSent, setIsSent] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextError = validateEmail(email)
    setError(nextError)
    if (nextError) return

    // TODO(BE): 재설정 요청 API가 추가되면 이 로컬 완료 상태를 실제 응답으로 교체한다.
    setIsSent(true)
  }

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        <h1 className="type-page-title font-bold text-stone-900">비밀번호 찾기</h1>
        <p className="type-body text-stone-400">
          가입한 이메일로 재설정 링크를 보내드려요
        </p>
      </div>

      <form className="mt-4" noValidate onSubmit={handleSubmit}>
        <div className="flex items-baseline justify-between gap-3">
          <label
            className="type-control font-semibold text-stone-800"
            htmlFor="forgot-password-email"
          >
            이메일
          </label>
          {error ? (
            <p
              className="type-caption font-medium text-rose-700"
              id="forgot-password-email-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
        <input
          aria-describedby={
            error ? 'forgot-password-email-error' : undefined
          }
          aria-invalid={error ? true : undefined}
          autoComplete="email"
          className={[
            'mt-1.5 block h-11 w-full rounded-[10px] border bg-white px-3.5 type-body text-stone-950',
            'placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100',
            error ? 'border-rose-400' : 'border-stone-300',
          ].join(' ')}
          id="forgot-password-email"
          onChange={(event) => {
            setEmail(event.target.value)
            setError(null)
            setIsSent(false)
          }}
          placeholder="user@example.com"
          type="email"
          value={email}
        />

        <Button className="mt-6 h-11 w-full" type="submit">
          재설정 링크 보내기
        </Button>
      </form>

      {isSent ? (
        <p
          className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-brand-100 bg-brand-50 px-4 py-2.5 text-center type-control font-medium text-brand-600"
          role="status"
        >
          <Mail aria-hidden="true" className="shrink-0" size={12} />
          링크를 보냈어요. 메일함을 확인해 주세요 - 10분간 유효합니다.
        </p>
      ) : null}

      <Link
        className="mx-auto mt-6 flex w-fit items-center gap-1.5 type-control text-stone-500 hover:text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        to={routes.login}
      >
        <ArrowLeft aria-hidden="true" size={12} />
        로그인으로 돌아가기
      </Link>
    </div>
  )
}

function validateEmail(email: string): string | null {
  const normalizedEmail = email.trim()
  if (!normalizedEmail) return '이메일을 입력하세요.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return '이메일 형식을 확인하세요.'
  }
  return null
}
