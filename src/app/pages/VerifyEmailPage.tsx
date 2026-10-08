import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth'
import { clearEmailLinkToken, readEmailLinkIssue, readEmailLinkToken } from '../../features/auth/emailLinkToken'
import { confirmEmailVerification, requestEmailVerification } from '../../features/auth/emailVerificationRepository'
import { hasEmailVerificationSupport, isLaunchAuthReady } from '../../features/auth/launchAuthContract'
import { ApiClientError } from '../../shared/api'
import { Button } from '../../shared/ui'
import { routes } from '../routes'
import { isGuardianTeamReady } from '../../features/guardian/guardianContract'

export function VerifyEmailPage() {
  const auth = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const tokenRef = useRef(readEmailLinkToken())
  const [hasToken, setHasToken] = useState(() => Boolean(readEmailLinkToken()))
  const [linkIssue, setLinkIssue] = useState(readEmailLinkIssue)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const activeRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)
  const ready = isLaunchAuthReady()
  const refresh = auth.refreshCurrentUser
  const discardPending = useCallback(() => {
    tokenRef.current = null
    clearEmailLinkToken()
    activeRef.current?.abort()
    activeRef.current = null
    setBusy(false)
    setHasToken(false)
  }, [])

  useLayoutEffect(() => {
    if (location.search || location.hash) {
      // Replacing an SPA link cancels the old action and rejects its late result.
      activeRef.current?.abort()
      activeRef.current = null
      tokenRef.current = ready ? readEmailLinkToken() : null
      setHasToken(Boolean(tokenRef.current))
      setLinkIssue(readEmailLinkIssue())
      if (!ready) clearEmailLinkToken()
      setBusy(false)
      setMessage('')
      navigate(routes.verifyEmail, { replace: true, state: null })
    }
  }, [location.search, location.hash, navigate, ready])

  useEffect(() => {
    mountedRef.current = true
    if (!ready) {
      tokenRef.current = null
      clearEmailLinkToken()
    }
    window.addEventListener('pagehide', discardPending)
    return () => {
      window.removeEventListener('pagehide', discardPending)
      mountedRef.current = false
      activeRef.current?.abort()
      queueMicrotask(() => {
        if (!mountedRef.current) {
          tokenRef.current = null
          clearEmailLinkToken()
        }
      })
    }
  }, [ready, discardPending])

  useEffect(() => {
    if (!ready || !auth.isAuthenticated || !refresh) return
    const controller = new AbortController()
    const reload = () => {
      if (document.visibilityState === 'visible') {
        void refresh(controller.signal).catch(() => undefined)
      }
    }
    reload()
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', reload)
    return () => {
      controller.abort()
      window.removeEventListener('focus', reload)
      document.removeEventListener('visibilitychange', reload)
    }
  }, [ready, auth.isAuthenticated, auth.user?.id, refresh])

  async function act(kind: 'confirm' | 'resend' | 'reload') {
    if (!ready || activeRef.current) return
    if (kind === 'confirm' && !tokenRef.current) return
    const controller = new AbortController()
    activeRef.current = controller
    setBusy(true)
    setMessage('')
    try {
      if (kind === 'confirm') {
        const token = tokenRef.current!
        tokenRef.current = null
        clearEmailLinkToken()
        setHasToken(false)
        await confirmEmailVerification(token, controller.signal)
        if (controller.signal.aborted) return
        setMessage('링크에 연결된 계정의 이메일을 확인했습니다. 로그인한 계정의 상태는 별도로 확인합니다.')
        await refresh?.(controller.signal)
      } else if (kind === 'resend') {
        await requestEmailVerification(auth.apiRequest, controller.signal)
        if (controller.signal.aborted) return
        setMessage('이메일 확인 요청이 접수되었습니다. 발송·수신 완료를 의미하지 않습니다. 새 링크를 요청하면 이전 링크는 사용할 수 없습니다.')
        await refresh?.(controller.signal)
      } else {
        await refresh?.(controller.signal)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setMessage(error instanceof ApiClientError && error.status === 429
        ? '요청이 많습니다. 잠시 후 직접 다시 시도해 주세요.'
        : error instanceof ApiClientError &&
            ['EMAIL_VERIFICATION_TOKEN_INVALID', 'VALIDATION_FAILED', 'MALFORMED_REQUEST'].includes(error.code)
          ? '유효하지 않거나 만료된 링크입니다. 로그인한 뒤 새 링크를 요청해 주세요.'
          : '요청을 완료하지 못했습니다. 로그인 상태와 이메일을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      if (activeRef.current === controller) {
        activeRef.current = null
        if (!controller.signal.aborted) setBusy(false)
      }
    }
  }

  const supported = auth.user && hasEmailVerificationSupport(auth.user)
  return <div className="space-y-4">
    {ready && !hasToken && !linkIssue && !message ? <p>확인할 링크가 없습니다. 이메일의 최신 링크를 다시 열거나 로그인 후 확인 이메일을 다시 요청해 주세요.</p> : null}
    {linkIssue === 'obsolete-query' ? <p role="status">이전 형식의 이메일 링크는 사용할 수 없습니다. 로그인 후 확인 이메일을 다시 요청해 주세요.</p>
      : linkIssue === 'invalid-fragment' ? <p role="status">이메일 링크 형식이 올바르지 않습니다. 로그인 후 확인 이메일을 다시 요청해 주세요.</p> : null}
    <h1 className="type-page-title font-bold">이메일 확인</h1>
    <p>메일 링크를 여는 것만으로 확인되지 않습니다. 아래 버튼으로 확인해 주세요.</p>
    {!ready ? <p role="status">이메일 확인 기능을 준비 중입니다. 사용 가능 안내 후 새 링크를 열어 주세요.</p> : <>
      {hasToken ? <Button disabled={busy} onClick={() => void act('confirm')}>이메일 확인하기</Button> : null}
      {auth.user ? <>
        <p>현재 로그인 계정: {auth.user.email}</p>
        <p>{!supported ? '서버에서 이메일 확인 상태를 제공하지 않습니다.'
          : auth.user.emailVerification === 'VERIFIED' ? '현재 계정의 이메일 확인이 완료되었습니다.'
          : auth.user.emailVerificationRequired === true ? '현재 계정의 이메일 확인이 필요합니다.'
          : '이메일 확인 완료 기록은 없으며 현재 계정은 이용할 수 있습니다.'}</p>
        <Button disabled={busy} onClick={() => void act('resend')}>확인 이메일 다시 요청</Button>
        <Button disabled={busy} onClick={() => void act('reload')}>현재 계정 상태 다시 확인</Button>
      </> : <p>링크 확인은 로그인을 만들지 않습니다. 재요청하려면 로그인해 주세요.</p>}
    </>}
    {message ? <p role="status">{message}</p> : null}
    <div className="flex flex-wrap gap-4">
      <Link to={routes.login} onClick={discardPending}>로그인</Link>
      {auth.isAuthenticated ? <Link to={routes.settings} onClick={discardPending}>계정 관리</Link> : null}
      {auth.isAuthenticated && isGuardianTeamReady() ? <Link to={routes.guardianRequest} onClick={discardPending}>보호자 신청 상태</Link> : null}
      {auth.user && auth.user.emailVerificationRequired !== true ? <Link to={routes.classrooms} onClick={discardPending}>강의실</Link> : null}
    </div>
  </div>
}
