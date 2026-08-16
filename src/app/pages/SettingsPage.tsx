import { Monitor, Moon, Sun, UserX, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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

type SettingsSection = 'account' | 'appearance' | 'assistant' | 'feedback' | 'notification' | 'profile'

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: 'profile', label: '프로필' },
  { id: 'appearance', label: '화면 모드' },
  { id: 'notification', label: '알림' },
  { id: 'assistant', label: 'AI 학습 도우미' },
  { id: 'feedback', label: '피드백' },
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

  return (
    <PageContainer>
      <PageHeader
        title="설정"
      />
      <SettingsContent />
    </PageContainer>
  )
}

export function SettingsContent({ className }: { className?: string } = {}) {
  const { apiRequest, rawApiRequest, updateUser, user, withdraw } = useAuth()
  const { mode, setMode } = useTheme()
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
    try { await repository.uploadAvatar(file); const blob = await repository.getAvatar(); if (avatarUrl) URL.revokeObjectURL(avatarUrl); const next = URL.createObjectURL(blob); setAvatarUrl(next); if (user) updateUser({ ...user, avatarUrl: '/api/users/me/avatar' }); showToast('프로필 사진을 변경했습니다.', 'success') }
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

  return (
    <>
      <div className={cx('flex flex-col gap-5 lg:flex-row lg:gap-0', className)}>
        <nav aria-label="설정 메뉴" className="flex gap-1 lg:w-36 lg:shrink-0 lg:flex-col lg:gap-0.5 lg:pr-4">
          {SECTIONS.map((item) => (
            <button
              aria-current={section === item.id ? 'page' : undefined}
              className={cx(
                'flex h-9 shrink-0 items-center rounded-lg px-3 type-control',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                item.id === 'account' && 'text-rose-700 lg:mt-4',
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
        </nav>

        <div className="min-w-0 flex-1 space-y-4 lg:border-l lg:border-stone-200 lg:pl-5">
          {section === 'profile' ? (
            <ProfileSection
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

          {section === 'profile' ? (
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
      <input accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAvatar(file); event.target.value = '' }} ref={avatarInputRef} type="file" />
    </>
  )
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
      <p className="mt-1 type-body text-stone-500">
        작업 환경에 맞게 화면 밝기를 조정합니다.
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {THEME_OPTIONS.map((option) => (
          <button
            aria-pressed={mode === option.value}
            className={cx(
              'flex h-12 items-center gap-2.5 rounded-lg border px-3 type-control font-semibold transition-colors',
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

function ProfileSection({
  affiliation,
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
  avatarUrl: string | null
  email: string
  name: string
  onAffiliationChange: (value: string) => void
  onNameChange: (value: string) => void
  onDeleteAvatar: () => void
  onSelectAvatar: () => void
  role: string
}) {
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
      <button
        aria-checked={checked}
        aria-label={label}
        className={cx(
          'ml-auto flex h-5.5 w-10 shrink-0 items-center rounded-full px-0.5 transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          disabled && 'cursor-not-allowed opacity-60',
          checked ? 'bg-brand-600' : 'bg-stone-300',
        )}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={cx(
            'size-4.5 rounded-full bg-white transition-transform',
            checked && 'translate-x-4.5',
          )}
        />
      </button>
    </div>
  )
}
