/* eslint-disable react-refresh/only-export-components -- shared admin UI and helpers intentionally live together */
import type { CSSProperties, ReactNode } from 'react'
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

/**
 * 패널 제목 + 시안의 "관리자 / {제목}" 표시줄.
 *
 * 표시줄은 h1과 같은 말을 되풀이하고 상위 위치는 사이드바가 이미 알려주므로
 * 보조기기에는 숨긴다.
 */
export function AdminPanelHeading({ id, title }: { id?: string; title: string }) {
  return (
    <div className="flex min-w-0 shrink-0 flex-col gap-1.5">
      <p aria-hidden="true" className="flex items-center gap-1.5 type-caption text-stone-400">
        <span>관리자</span>
        <span className="text-stone-300">/</span>
        <span className="font-medium text-stone-600">{title}</span>
      </p>
      <h1 className="type-admin-title font-bold text-stone-950" id={id}>{title}</h1>
    </div>
  )
}

export type AdminMetricItem = {
  /** 라벨 오른쪽에 붙는 배지(위험도 등). */
  badge?: ReactNode
  danger?: boolean
  /** 증감 배지. 비교 기준이 되는 과거 값이 실제로 있을 때만 넘긴다. */
  delta?: { description?: string; note?: string; up: boolean | null; value: string }
  detail?: string
  label: string
  /** 스파크라인 원본 값. 시계열 API가 있는 지표에만 준다. */
  series?: number[]
  seriesLabel?: string
  seriesTrend?: boolean | null
  unit?: string
  value: string
}

/**
 * 관리자 콘솔 상단 KPI 묶음.
 *
 * 시안은 타일을 따로 띄우지 않고 카드 하나를 세로 구분선으로 나눈다.
 * 패널마다 제각각이던 타일 구현을 여기로 모았다.
 */
export function AdminMetricStrip({ ariaLabel, inlineGraph = false, items }: { ariaLabel?: string; inlineGraph?: boolean; items: AdminMetricItem[] }) {
  return (
    <div
      aria-label={ariaLabel}
      className="shrink-0 rounded-3xl border border-stone-200 bg-white px-6 py-4"
      role={ariaLabel ? 'group' : undefined}
    >
      {/*
        auto-fit을 쓰면 줄바꿈 위치를 CSS만 알아서, 새 줄 첫 칸에도 세로 구분선이
        남는다. 열 수를 구간별로 못박아 두고 각 줄 첫 칸만 선을 끈다.
      */}
      <div
        className="grid grid-cols-1 gap-y-[18px] sm:grid-cols-2 xl:[grid-template-columns:repeat(var(--metric-columns),minmax(0,1fr))]"
        style={{ '--metric-columns': items.length } as CSSProperties}
      >
        {items.map((item) => (
          <div
            className={`@container relative flex min-w-0 flex-col gap-2.5 border-stone-100 max-sm:px-0 sm:max-xl:[&:nth-child(odd)]:border-l-0 sm:max-xl:[&:nth-child(odd)]:pl-0 sm:border-l xl:border-l xl:first:border-l-0 ${inlineGraph ? 'px-3' : 'px-6 xl:first:pl-0'}`}
            key={item.label}
          >
            {/*
              배지는 절대 위치로 띄운다. 라벨을 감싸면 라벨·값·설명이 한 부모를
              공유한다는 전제가 깨져 읽기 순서와 테스트가 함께 무너진다.
            */}
            {item.badge ? <span className="absolute top-0 right-0">{item.badge}</span> : null}
            <p className="type-caption font-medium text-stone-950">{item.label}</p>
            {/*
              숫자와 추이선을 나란히 두기 좁으면 아래로 내린다.
              숨겨 버리면 시계열이 있는 지표에서 추이를 읽을 수단이 사라진다.
            */}
            <div className={`flex min-w-0 items-end justify-between gap-2 ${inlineGraph ? 'gap-1 @max-[11.25rem]:flex-col @max-[11.25rem]:items-stretch' : '@max-[13.5rem]:flex-col @max-[13.5rem]:items-stretch @max-[13.5rem]:gap-1'}`}>
              <span className="flex min-w-0 items-baseline gap-0.5">
                <span
                  className={`truncate type-metric-hero font-medium tabular-nums ${inlineGraph ? 'type-metric-inline-compact' : ''} ${item.danger ? 'text-rose-700' : 'text-stone-950'}`}
                  title={`${item.value}${item.unit ?? ''}`}
                >
                  {item.value}
                </span>
                {item.unit ? <span className="type-metric-compact font-medium text-stone-950">{item.unit}</span> : null}
              </span>
              {item.series ? <Sparkline compact={inlineGraph} label={item.seriesLabel ?? `${item.label} 추이`} trend={item.seriesTrend === undefined ? item.delta?.up : item.seriesTrend} values={item.series} /> : null}
            </div>
            <div aria-description={item.delta?.description} className="flex items-center gap-2" title={item.delta?.description}>
              {item.delta ? (
                <>
                  <span
                    aria-hidden="true"
                    className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-white ${item.delta.up === null ? 'bg-stone-400' : item.delta.up ? 'bg-accent-blue-600' : 'bg-rose-600'}`}
                  >
                    <svg className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 16 16">
                      {item.delta.up === null ? <path d="M3 8h10m-4-4 4 4-4 4" /> : item.delta.up ? <path d="M8 13V3m-4 4 4-4 4 4" /> : <path d="M8 3v10m-4-4 4 4 4-4" />}
                    </svg>
                  </span>
                  <span className={`type-micro font-bold ${item.delta.up === null ? 'text-stone-500' : item.delta.up ? 'text-accent-blue-700' : 'text-rose-700'}`}>
                    {item.delta.value}
                  </span>
                </>
              ) : null}
              <span className="truncate type-micro text-stone-400">
                {item.delta?.note ?? item.detail ?? (item.value === '-' ? '데이터 없음' : '현재 조회 값')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 추세만 읽히면 되는 크기라 축도 눈금도 두지 않는다. */
function Sparkline({ compact = false, label, trend, values }: { compact?: boolean; label: string; trend?: boolean | null; values: number[] }) {
  if (values.length === 0) return null
  const first = values[0]
  const last = values[values.length - 1]
  const direction = trend === undefined ? Math.sign(last - first) : trend === null ? 0 : trend ? 1 : -1
  const stroke = direction > 0 ? 'var(--color-rose-700)' : direction < 0 ? 'var(--color-accent-blue-600)' : '#1B2436'
  if (values.length === 1) {
    return <svg aria-label={`${label} · 측정값 1개`} className={compact ? 'h-11 w-[64px] shrink-0 @max-[15rem]:w-[48px] @max-[11.25rem]:self-end' : 'h-11 w-[96px] shrink-0 @max-[13.5rem]:w-full'} role="img" viewBox="0 0 120 48"><circle cx="60" cy="24" fill={stroke} r="4" /></svg>
  }
  const highest = Math.max(...values)
  const lowest = Math.min(...values)
  const padding = Math.max(1, (highest - lowest) * 0.15)
  const max = highest + padding
  const min = lowest - padding
  const span = max - min
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 120
    const y = 44 - ((value - min) / span) * 40
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  })
  const line = `M${points.join(' L')}`
  return (
    <svg
      aria-label={label}
      className={compact ? 'h-11 w-[64px] shrink-0 @max-[15rem]:w-[48px] @max-[11.25rem]:self-end' : 'h-11 w-[96px] shrink-0 @max-[13.5rem]:w-full'}
      preserveAspectRatio="none"
      role="img"
      viewBox="0 0 120 48"
    >
      <path d={`${line} L120 48 L0 48 Z`} fill={stroke} fillOpacity="0.14" />
      <path d={line} fill="none" stroke={stroke} strokeLinejoin="round" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
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
