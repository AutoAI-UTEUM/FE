import { ChevronLeft, Monitor, Moon, Sun, UserX, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { createUserSettingsRepository, getRoleLabel, useAuth, type AiAnswerStyle, type UserPreferences } from '../../features/auth'
import { createFeedbackRepository, type FeedbackCategory } from '../../features/feedback'
import { ApiClientError, getRequestErrorMessage } from '../../shared/api'
import { cx } from '../../shared/lib/cx'
import {
  Button,
  Card,
  PageContainer,
  PageHeader,
  TextInput,
  useToast,
} from '../../shared/ui'
import { routes } from '../routes'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { useTheme, type ThemeMode } from '../../shared/theme'
import { useResponsiveViewport } from '../../shared/responsive'

type SettingsSection = 'account' | 'appearance' | 'assistant' | 'feedback' | 'notification' | 'password' | 'profile'

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'profile', label: '프로필' },
  { id: 'appearance', label: '화면 모드' },
  { id: 'notification', label: '알림' },
  { id: 'assistant', label: 'AI 학습 도우미' },
  { id: 'feedback', label: '피드백' },
  { id: 'password', label: '비밀번호 변경' },
  { id: 'account', label: '회원 탈퇴' },
]

const ANSWER_STYLES = [
  { label: '간결하게', value: 'CONCISE' },
  { label: '보통', value: 'NORMAL' },
  { label: '자세하게', value: 'DETAILED' },
]

const THEME_OPTIONS: Array<{
  icon: LucideIcon
  label: string
  value: ThemeMode
}> = [
  { icon: Sun, label: '라이트 모드', value: 'light' },
  { icon: Moon, label: '다크 모드', value: 'dark' },
  { icon: Monitor, label: '시스템 설정', value: 'system' },
]

export function SettingsPage() {
  usePageTitle('설정')
  const navigate = useNavigate()
  const { isMobileWeb } = useResponsiveViewport()

  return (
    <PageContainer>
      {/* 모바일은 뒤로·제목·저장이 한 행이라 SettingsContent가 헤더까지 그린다. */}
      {isMobileWeb ? null : <PageHeader title="설정" />}
      <SettingsContent onBack={() => navigate(-1)} variant="page" />
    </PageContainer>
  )
}

export function SettingsContent({ className, onBack, variant = 'dialog' }: {
  className?: string
  onBack?: () => void
  variant?: 'dialog' | 'page'
} = {}) {
  const { apiRequest, logout, rawApiRequest, updateUser, user, withdraw } = useAuth()
  const { mode, setMode } = useTheme()
  const { isMobileWeb } = useResponsiveViewport()
  const { show: showToast } = useToast()
  const navigate = useNavigate()
  const [section, setSection] = useState<SettingsSection>('profile')
  const [name, setName] = useState(user?.name ?? '')
  const [affiliation, setAffiliation] = useState(user?.affiliation ?? '')
  const [newMaterialNotification, setNewMaterialNotification] = useState(true)
  const [studyReminder, setStudyReminder] = useState(false)
  const [answerStyle, setAnswerStyle] = useState<AiAnswerStyle>('NORMAL')
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>('GENERAL')
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | undefined>()
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  const repository = useMemo(() => createUserSettingsRepository(apiRequest, rawApiRequest), [apiRequest, rawApiRequest])
  const feedbackRepository = useMemo(() => createFeedbackRepository(apiRequest), [apiRequest])

  useEffect(() => {
    repository.getPreferences().then((preferences) => {
      applyPreferences(preferences)
    }).catch(() => undefined).finally(() => setIsLoadingPreferences(false))
    if (!user?.avatarUrl) return
    let objectUrl: string | null = null
    repository.getAvatar().then((blob) => { objectUrl = URL.createObjectURL(blob); setAvatarUrl(objectUrl) }).catch(() => undefined)
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [repository, user?.avatarUrl])

  async function handleLogout() {
    await logout()
    navigate(routes.login, { replace: true })
  }

  function applyPreferences(preferences: UserPreferences) {
    setNewMaterialNotification(preferences.newMaterialNotification)
    setStudyReminder(preferences.studyReminder)
    setAnswerStyle(preferences.aiAnswerStyle)
  }

  async function saveProfile() {
    if (!user || isSavingProfile) return
    setIsSavingProfile(true)
    try {
      const updatedUser = await repository.updateProfile({ affiliation: affiliation.trim(), name: name.trim() })
      updateUser(updatedUser)
      showToast('설정을 저장했습니다.', 'success')
    } catch (error) { showToast(getRequestErrorMessage(error), 'danger') } finally { setIsSavingProfile(false) }
  }

  async function savePreferences(patch: Partial<UserPreferences>) {
    if (isLoadingPreferences || isSavingPreferences) return
    const previous: UserPreferences = { aiAnswerStyle: answerStyle, newMaterialNotification, studyReminder }
    const next = { ...previous, ...patch }
    applyPreferences(next)
    setIsSavingPreferences(true)
    try {
      applyPreferences(await repository.updatePreferences(next))
    } catch (error) {
      applyPreferences(previous)
      showToast(getRequestErrorMessage(error), 'danger')
    } finally {
      setIsSavingPreferences(false)
    }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!feedbackMessage.trim() || isSubmittingFeedback) return
    setIsSubmittingFeedback(true)
    try {
      await feedbackRepository.create({ category: feedbackCategory, message: feedbackMessage.trim(), pageUrl: window.location.href })
      setFeedbackMessage('')
      showToast('피드백을 보냈습니다.', 'success')
    } catch (error) {
      showToast(getRequestErrorMessage(error), 'danger')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  async function uploadAvatar(file: File) {
    try { await repository.uploadAvatar(file); const blob = await repository.getAvatar(); if (avatarUrl) URL.revokeObjectURL(avatarUrl); const next = URL.createObjectURL(blob); setAvatarUrl(next); if (user) updateUser({ ...user, avatarUrl: next }); showToast('프로필 사진을 변경했습니다.', 'success') }
    catch (error) { showToast(getRequestErrorMessage(error), 'danger') }
  }

  async function deleteAvatar() {
    try { await repository.deleteAvatar(); if (avatarUrl) URL.revokeObjectURL(avatarUrl); setAvatarUrl(null); if (user) updateUser({ ...user, avatarUrl: undefined }); showToast('프로필 사진을 삭제했습니다.', 'success') }
    catch (error) { showToast(getRequestErrorMessage(error), 'danger') }
  }

  async function handleWithdraw(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isWithdrawing) return
    if (!password) {
      setPasswordError('비밀번호를 입력하세요.')
      return
    }
    if (
      !window.confirm(
        '정말 탈퇴할까요? 자료와 학습 세션이 삭제되며 복구할 수 없습니다.',
      )
    ) {
      return
    }

    setIsWithdrawing(true)
    setPasswordError(undefined)
    try {
      await withdraw(password)
      navigate(routes.login, { replace: true })
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.code === 'INVALID_CREDENTIALS'
      ) {
        setPasswordError('비밀번호가 올바르지 않습니다.')
      } else {
        setPasswordError(getRequestErrorMessage(error))
      }
    } finally {
      setIsWithdrawing(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isChangingPassword) return
    if (!currentPassword) { setPasswordChangeError('현재 비밀번호를 입력하세요.'); return }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,64}$/.test(newPassword)) { setPasswordChangeError('새 비밀번호는 영문과 숫자를 포함해 8~64자로 입력하세요.'); return }
    if (currentPassword === newPassword) { setPasswordChangeError('현재 비밀번호와 다른 비밀번호를 입력하세요.'); return }
    if (newPassword !== newPasswordConfirm) { setPasswordChangeError('새 비밀번호 확인이 일치하지 않습니다.'); return }
    setIsChangingPassword(true)
    setPasswordChangeError(null)
    try {
      const result = await repository.changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
      showToast('비밀번호를 변경했습니다. 다시 로그인하세요.', 'success')
      if (result.reauthenticationRequired) {
        await logout()
        navigate(routes.login, { replace: true })
      }
    } catch (error) {
      setPasswordChangeError(getRequestErrorMessage(error))
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <>
      {/* 태블릿 가로는 데스크톱과 같은 좌측 카테고리 + 본문 2열, 세로는 스택. */}
      {isMobileWeb && variant === 'page' ? (
        <div className="mb-4 flex items-center gap-3">
          {onBack ? (
            <button
              aria-label="뒤로"
              className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              onClick={onBack}
              type="button"
            >
              <ChevronLeft aria-hidden="true" size={18} />
            </button>
          ) : null}
          <h1 className="min-w-0 flex-1 truncate type-page-title font-bold text-stone-950">설정</h1>
          {section === 'profile' ? (
            <>
              <Button
                onClick={() => {
                  setName(user?.name ?? '')
                  setAffiliation(user?.affiliation ?? '')
                }}
                type="button"
                variant="secondary"
              >
                취소
              </Button>
              <Button
                disabled={isSavingProfile || !name.trim()}
                onClick={() => void saveProfile()}
                type="button"
              >
                {isSavingProfile ? '저장 중' : '저장'}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className={cx('flex flex-col gap-5 lg:flex-row lg:gap-0 tablet-landscape:flex-row tablet-landscape:gap-0', className)}>
        <nav aria-label="설정 메뉴" className="mobile-horizontal-scroll flex min-w-0 max-w-full gap-1 overflow-x-auto pb-1 lg:w-36 lg:shrink-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0 lg:pr-4 tablet-landscape:w-40 tablet-landscape:shrink-0 tablet-landscape:flex-col tablet-landscape:gap-0.5 tablet-landscape:overflow-visible tablet-landscape:pb-0 tablet-landscape:pr-4">
          {SECTIONS.map((item) => (
            <button
              aria-current={section === item.id ? 'page' : undefined}
              className={cx(
                'flex h-9 shrink-0 items-center rounded-lg px-3 type-control',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                item.id === 'account' && 'text-rose-700 lg:mt-4 tablet-landscape:mt-4',
                section === item.id
                  ? item.id === 'account'
                    ? 'bg-rose-50 font-semibold text-rose-700'
                    : 'bg-stone-100 font-semibold text-stone-900'
                  : item.id === 'account'
                    ? 'font-medium hover:bg-rose-50'
                    : 'font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-800',
              )}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          {/*
            태블릿·폰은 프로필이 설정 진입점으로 바뀌어 드롭다운이 없다. 로그아웃을 여기 둔다.
            데스크톱은 사이드바 드롭다운에 그대로 있으므로 DOM에 넣지 않는다.
          */}
          {isMobileWeb ? (
            <button
              className="inline-flex h-9 shrink-0 items-center rounded-lg px-3 type-control font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 tablet-landscape:mt-1"
              onClick={() => void handleLogout()}
              type="button"
            >
              로그아웃
            </button>
          ) : null}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 lg:overflow-y-auto lg:pl-5 lg:pr-1 tablet-landscape:grid tablet-landscape:grid-cols-2 tablet-landscape:content-start tablet-landscape:gap-4 tablet-landscape:space-y-0 tablet-landscape:pl-5 tablet-landscape:pr-1">
          {section === 'profile' ? (
            <ProfileSection
              asRows={isMobileWeb}
              affiliation={affiliation}
              avatarUrl={avatarUrl}
              email={user?.email ?? ''}
              name={name}
              onAffiliationChange={setAffiliation}
              onNameChange={setName}
              onDeleteAvatar={() => void deleteAvatar()}
              onSelectAvatar={() => avatarInputRef.current?.click()}
              role={getRoleLabel(user?.role)}
            />
          ) : null}

          {section === 'account' ? (
            <section className="bg-white">
              <h2 className="type-section-title font-bold text-rose-900">회원 탈퇴</h2>
              <p className="mt-1 type-body text-stone-500">
                탈퇴하면 자료와 학습 세션이 삭제되고 복구할 수 없습니다. 계속하려면
                비밀번호를 입력하세요.
              </p>
              <form className="mt-4 space-y-4" noValidate onSubmit={handleWithdraw}>
                <TextInput
                  autoComplete="current-password"
                  error={passwordError}
                  id="withdraw-password"
                  label="비밀번호 확인"
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setPasswordError(undefined)
                  }}
                  type="password"
                  value={password}
                />
                <div className="flex justify-end">
                  <Button
                    aria-label="회원 탈퇴 실행"
                    className="border-rose-700 bg-rose-700 hover:bg-rose-800"
                    disabled={isWithdrawing}
                    type="submit"
                  >
                    <UserX aria-hidden="true" size={15} />
                    {isWithdrawing ? '탈퇴 처리 중' : '회원 탈퇴'}
                  </Button>
                </div>
              </form>
            </section>
          ) : null}

          {section === 'password' ? (
            <PasswordSection
              currentPassword={currentPassword}
              error={passwordChangeError}
              isSubmitting={isChangingPassword}
              newPassword={newPassword}
              newPasswordConfirm={newPasswordConfirm}
              onCurrentPasswordChange={(value) => { setCurrentPassword(value); setPasswordChangeError(null) }}
              onNewPasswordChange={(value) => { setNewPassword(value); setPasswordChangeError(null) }}
              onNewPasswordConfirmChange={(value) => { setNewPasswordConfirm(value); setPasswordChangeError(null) }}
              onSubmit={changePassword}
            />
          ) : null}

          {section === 'appearance' ? (
            <AppearanceSection mode={mode} onChange={setMode} />
          ) : null}

          {section === 'feedback' ? (
            <FeedbackSection
              category={feedbackCategory}
              isSubmitting={isSubmittingFeedback}
              message={feedbackMessage}
              onCategoryChange={setFeedbackCategory}
              onMessageChange={setFeedbackMessage}
              onSubmit={submitFeedback}
            />
          ) : null}

          {section === 'notification' || section === 'assistant' ? (
            <Card as="section" className="border-0 px-0">
              {section !== 'assistant' ? (
                <>
                  <ToggleRow
                    checked={newMaterialNotification}
                    description="강의자가 자료를 올리면 알려드려요"
                    disabled={isLoadingPreferences || isSavingPreferences}
                    label="새 자료 알림"
                    onChange={(checked) => void savePreferences({ newMaterialNotification: checked })}
                  />
                  <ToggleRow
                    checked={studyReminder}
                    description="3일 이상 접속하지 않으면 이메일 발송"
                    disabled={isLoadingPreferences || isSavingPreferences}
                    isLast={section === 'notification'}
                    label="학습 리마인더"
                    onChange={(checked) => void savePreferences({ studyReminder: checked })}
                  />
                </>
              ) : null}
              {section !== 'notification' ? (
                <div className="flex items-center gap-4 py-4">
                  <div className="min-w-0">
                    <p className="type-body font-semibold text-stone-900">
                      AI 답변 스타일
                    </p>
                    <p className="mt-0.5 type-caption text-stone-400">
                      채팅 답변의 길이와 난이도를 조절해요
                    </p>
                  </div>
                  <label className="ml-auto shrink-0">
                    <span className="sr-only">AI 답변 스타일</span>
                    <select
                      className="h-9 rounded-lg border border-stone-200 bg-white px-3 type-caption font-medium text-stone-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      disabled={isLoadingPreferences || isSavingPreferences}
                      onChange={(event) => void savePreferences({ aiAnswerStyle: event.target.value as AiAnswerStyle })}
                      value={answerStyle}
                    >
                      {ANSWER_STYLES.map((style) => (
                        <option key={style.value} value={style.value}>
                          {style.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </Card>
          ) : null}

          {section === 'profile' && !(isMobileWeb && variant === 'page') ? (
            <div className="flex items-center justify-end gap-3">
              <Button
                onClick={() => {
                  setName(user?.name ?? '')
                  setAffiliation(user?.affiliation ?? '')
                }}
                type="button"
                variant="ghost"
              >
                취소
              </Button>
              <Button
                disabled={isSavingProfile || !name.trim()}
                onClick={() => void saveProfile()}
                type="button"
              >
                {isSavingProfile ? '저장 중' : '저장'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <input aria-label="프로필 이미지 선택" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = '' }} ref={avatarInputRef} type="file" />
    </>
  )
}

function PasswordSection({ currentPassword, error, isSubmitting, newPassword, newPasswordConfirm, onCurrentPasswordChange, onNewPasswordChange, onNewPasswordConfirmChange, onSubmit }: {
  currentPassword: string
  error: string | null
  isSubmitting: boolean
  newPassword: string
  newPasswordConfirm: string
  onCurrentPasswordChange: (value: string) => void
  onNewPasswordChange: (value: string) => void
  onNewPasswordConfirmChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return <form onSubmit={onSubmit}><h2 className="type-section-title font-bold text-stone-950">비밀번호 변경</h2><p className="mt-1 type-body text-stone-500">변경 후에는 모든 기기에서 다시 로그인해야 합니다.</p><div className="mt-5 grid gap-3"><TextInput autoComplete="current-password" id="current-password" label="현재 비밀번호" onChange={(event) => onCurrentPasswordChange(event.target.value)} type="password" value={currentPassword} /><TextInput autoComplete="new-password" id="new-password" label="새 비밀번호" onChange={(event) => onNewPasswordChange(event.target.value)} type="password" value={newPassword} /><TextInput autoComplete="new-password" id="new-password-confirm" label="새 비밀번호 확인" onChange={(event) => onNewPasswordConfirmChange(event.target.value)} type="password" value={newPasswordConfirm} /></div>{error ? <p className="mt-3 type-body font-medium text-rose-700" role="alert">{error}</p> : null}<div className="mt-5 flex justify-end"><Button aria-label="비밀번호 변경 실행" disabled={isSubmitting || !currentPassword || !newPassword || !newPasswordConfirm} type="submit">{isSubmitting ? '변경 중' : '비밀번호 변경'}</Button></div></form>
}

function AppearanceSection({
  mode,
  onChange,
}: {
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
}) {
  return (
    <Card as="section" className="border-0 p-0">
      <h2 className="type-section-title font-bold text-stone-950">화면 모드</h2>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {THEME_OPTIONS.map((option) => (
          <button
            aria-pressed={mode === option.value}
            className={cx(
              'flex h-12 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2 type-control font-semibold transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              mode === option.value
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900',
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            <option.icon aria-hidden="true" size={16} />
            {option.label}
          </button>
        ))}
      </div>
    </Card>
  )
}

function FeedbackSection({
  category,
  isSubmitting,
  message,
  onCategoryChange,
  onMessageChange,
  onSubmit,
}: {
  category: FeedbackCategory
  isSubmitting: boolean
  message: string
  onCategoryChange: (category: FeedbackCategory) => void
  onMessageChange: (message: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form onSubmit={onSubmit}>
      <h2 className="type-section-title font-bold text-stone-950">피드백</h2>
      <p className="mt-1 type-body text-stone-500">서비스 이용 중 발견한 문제나 의견을 보내주세요.</p>
      <label className="mt-4 block type-control font-semibold text-stone-800">
        분류
        <select
          className="mt-1.5 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 type-body text-stone-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          onChange={(event) => onCategoryChange(event.target.value as FeedbackCategory)}
          value={category}
        >
          <option value="GENERAL">일반 문의</option>
          <option value="BUG">오류 신고</option>
          <option value="FEATURE_REQUEST">기능 제안</option>
        </select>
      </label>
      <label className="mt-4 block type-control font-semibold text-stone-800">
        내용
        <textarea
          className="mt-1.5 min-h-24 w-full resize-none rounded-lg border border-stone-300 px-3 py-2.5 type-body text-stone-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          maxLength={2000}
          onChange={(event) => onMessageChange(event.target.value)}
          value={message}
        />
      </label>
      <div className="mt-4 flex justify-end">
        <Button disabled={!message.trim() || isSubmitting} type="submit">
          {isSubmitting ? '전송 중' : '보내기'}
        </Button>
      </div>
    </form>
  )
}

/* 시안의 계정 카드: 라벨 왼쪽 · 값 오른쪽 · 행 사이 헤어라인. 값 자체가 입력란이라 행을 눌러 바로 고친다. */
function ProfileRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex min-h-14 items-center gap-4 border-b border-stone-100 px-4 last:border-b-0">
      <span className="w-20 shrink-0 type-control text-stone-500">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function ProfileSection({
  affiliation,
  asRows = false,
  avatarUrl,
  email,
  name,
  onAffiliationChange,
  onNameChange,
  onDeleteAvatar,
  onSelectAvatar,
  role,
}: {
  affiliation: string
  asRows?: boolean
  avatarUrl: string | null
  email: string
  name: string
  onAffiliationChange: (value: string) => void
  onNameChange: (value: string) => void
  onDeleteAvatar: () => void
  onSelectAvatar: () => void
  role: string
}) {
  if (asRows) {
    return (
      <>
        <section className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white p-4">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 type-card-title font-bold text-stone-500">{avatarUrl ? <img alt="프로필" className="h-full w-full object-cover" src={avatarUrl} /> : name.slice(0, 1) || '?'}</span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate type-section-title font-bold text-stone-950">{name || '이름 없음'}</strong>
            <span className="block truncate type-caption text-stone-500">{email} · {role}</span>
          </div>
          <Button onClick={onSelectAvatar} size="sm" type="button" variant="secondary">
            사진 변경
          </Button>
          <Button className="hidden sm:inline-flex" disabled={!avatarUrl} onClick={onDeleteAvatar} size="sm" type="button" variant="ghost">
            삭제
          </Button>
        </section>

        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <h2 className="border-b border-stone-100 px-4 py-3 type-caption font-semibold text-stone-500">계정</h2>
          <ProfileRow label="이름">
            <input
              aria-label="이름"
              className="w-full rounded-md bg-transparent py-1 type-body text-stone-900 outline-none focus:bg-stone-50 focus:px-2"
              onChange={(event) => onNameChange(event.target.value)}
              value={name}
            />
          </ProfileRow>
          <ProfileRow label="이메일">
            <span className="block truncate type-body text-stone-500">{email}</span>
          </ProfileRow>
          <ProfileRow label="소속">
            <input
              aria-label="소속"
              className="w-full rounded-md bg-transparent py-1 type-body text-stone-900 outline-none placeholder:text-stone-400 focus:bg-stone-50 focus:px-2"
              onChange={(event) => onAffiliationChange(event.target.value)}
              placeholder="학교 · 기관 (선택)"
              value={affiliation}
            />
          </ProfileRow>
          <ProfileRow label="역할">
            <span className="block truncate type-body text-stone-500">{role}</span>
          </ProfileRow>
        </section>
      </>
    )
  }

  return (
    <Card as="section" className="border-0 p-0">
      <h2 className="type-section-title font-bold text-stone-950">프로필</h2>

      <div className="mt-5 flex items-center gap-4.5">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 type-page-title font-bold text-stone-500">{avatarUrl ? <img alt="프로필" className="h-full w-full object-cover" src={avatarUrl} /> : name.slice(0, 1) || '?'}</span>
        <div className="flex gap-2">
          <Button onClick={onSelectAvatar} size="sm" type="button" variant="secondary">
            사진 변경
          </Button>
          <Button disabled={!avatarUrl} onClick={onDeleteAvatar} size="sm" type="button" variant="ghost">
            삭제
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        <TextInput
          id="settings-name"
          label="이름"
          onChange={(event) => onNameChange(event.target.value)}
          value={name}
        />
        <TextInput
          disabled
          id="settings-email"
          label="이메일"
          readOnly
          value={email}
        />
        <TextInput
          id="settings-affiliation"
          label="소속"
          onChange={(event) => onAffiliationChange(event.target.value)}
          placeholder="학교 · 기관 (선택)"
          value={affiliation}
        />
        <TextInput disabled id="settings-role" label="역할" readOnly value={role} />
      </div>
    </Card>
  )
}

function ToggleRow({
  checked,
  description,
  disabled = false,
  isLast = false,
  label,
  onChange,
}: {
  checked: boolean
  description: string
  disabled?: boolean
  isLast?: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <div
      className={cx(
        'flex items-center gap-4 py-4',
        isLast ? undefined : 'border-b border-stone-100',
      )}
    >
      <div className="min-w-0">
        <p className="type-body font-semibold text-stone-900">{label}</p>
        <p className="mt-0.5 type-caption text-stone-400">{description}</p>
      </div>
      {/*
        버튼 자체는 44px 터치 영역만 잡고 배경을 두지 않는다.
        트랙을 버튼에 직접 그리면 mobile-web의 전역 min-height:44px가 h-5.5를 덮어
        40x44 정사각이 되면서 알약이 원으로 뭉개진다.
      */}
      <button
        aria-checked={checked}
        aria-label={label}
        className={cx(
          'ml-auto flex h-11 min-w-11 shrink-0 items-center justify-end rounded-lg bg-transparent',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={cx(
            'flex h-5.5 w-10 shrink-0 items-center rounded-full px-0.5 transition-colors',
            checked ? 'bg-brand-600' : 'bg-stone-300',
          )}
        >
          <span
            className={cx(
              'size-4.5 rounded-full bg-white transition-transform',
              checked && 'translate-x-4.5',
            )}
          />
        </span>
      </button>
    </div>
  )
}
