import { useSearchParams } from 'react-router-dom'

import { isApiCapabilityEnabled } from '../../shared/config/capabilities'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { ButtonLink, ErrorState } from '../../shared/ui'
import { routes } from '../routes'

export function ResetPasswordPage() {
  usePageTitle('비밀번호 재설정')
  const [searchParams] = useSearchParams()
  const hasToken = Boolean(searchParams.get('token'))
  const enabled = isApiCapabilityEnabled('password-reset')
  return <ErrorState action={<ButtonLink to={routes.login}>로그인으로</ButtonLink>} description={enabled && hasToken ? '비밀번호 재설정 API 계약이 아직 연결되지 않았습니다.' : hasToken ? '비밀번호 재설정 API가 배포되지 않았습니다.' : '재설정 이메일의 유효한 링크로 접근해 주세요.'} title="비밀번호를 재설정할 수 없습니다" />
}

export function AuthCallbackPage() {
  usePageTitle('소셜 로그인')
  const enabled = isApiCapabilityEnabled('oauth')
  return <ErrorState action={<ButtonLink to={routes.login}>로그인으로</ButtonLink>} description={enabled ? 'OAuth callback API 계약이 아직 연결되지 않았습니다.' : '소셜 로그인 callback API가 배포되지 않았습니다.'} title="소셜 로그인을 완료할 수 없습니다" />
}
