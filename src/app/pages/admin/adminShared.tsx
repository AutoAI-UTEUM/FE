/* eslint-disable react-refresh/only-export-components -- shared admin UI and helpers intentionally live together */
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../../features/auth'
import { ApiClientError } from '../../../shared/api'
import { Button } from '../../../shared/ui'
import { routes } from '../../routes'

export type AdminErrorInfo = { forbidden: boolean; message: string }

export function PanelMessage({
  action,
  message,
  tone = 'default',
}: {
  action?: ReactNode
  message: string
  tone?: 'default' | 'error'
}) {
  return (
    <div
      className={tone === 'error'
        ? 'flex flex-wrap items-center justify-between gap-3 border-b border-rose-100 bg-rose-50 px-4 py-3 type-body text-rose-700'
        : 'px-4 py-10 text-center type-body text-stone-500'}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <span>{message}</span>
      {action}
    </div>
  )
}

export function AdminErrorMessage({ error }: { error: AdminErrorInfo }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const action = error.forbidden ? (
    <Button
      onClick={() => {
        void logout().finally(() => navigate(routes.login, { replace: true }))
      }}
      size="sm"
      variant="secondary"
    >
      다시 로그인
    </Button>
  ) : undefined
  return <PanelMessage action={action} message={error.message} tone="error" />
}

export function Metric({
  caption,
  label,
  tone = 'default',
  value,
}: {
  caption?: string
  label: string
  tone?: 'default' | 'danger'
  value: string
}) {
  return (
    <div className="border-b border-stone-100 px-4 py-4 sm:border-r sm:last:border-r-0">
      <p className="type-caption text-stone-500">{label}</p>
      <p className={`mt-1 type-section-title font-bold ${tone === 'danger' ? 'text-rose-700' : 'text-stone-950'}`}>
        {value}
      </p>
      {caption ? <p className="mt-1 type-caption text-stone-400">{caption}</p> : null}
    </div>
  )
}

export function formatCount(value: number | null | undefined) {
  return value == null ? '-' : value.toLocaleString('ko-KR')
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function toAdminError(error: unknown): AdminErrorInfo {
  if (error instanceof ApiClientError && error.status === 403) {
    return {
      forbidden: true,
      message: '관리자 권한이 변경되었어요. 다시 로그인하면 현재 권한에 맞는 화면으로 이동합니다.',
    }
  }
  return {
    forbidden: false,
    message: error instanceof Error ? error.message : '관리자 정보를 불러오지 못했습니다.',
  }
}
