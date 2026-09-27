import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import {
  getCurrentPolicies,
  getPolicyDocument,
  type PolicyDocument,
  type PolicyType,
} from '../../features/auth'
import { getRequestErrorMessage } from '../../shared/api'
import { usePageTitle } from '../../shared/lib/usePageTitle'
import { MarkdownContent } from '../../shared/ui'
import { routes } from '../routes'

export function TermsPage() {
  return <PolicyPage type="TERMS" />
}

export function PrivacyPage() {
  return <PolicyPage type="PRIVACY" />
}

function PolicyPage({ type }: { type: PolicyType }) {
  const fallbackTitle = type === 'TERMS' ? '이용약관' : '개인정보 처리방침'
  usePageTitle(fallbackTitle)
  const [document, setDocument] = useState<PolicyDocument | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void getCurrentPolicies(controller.signal)
      .then((policies) => {
        const current = policies.find((policy) => policy.type === type)
        if (!current) throw new Error(`${fallbackTitle}을 찾을 수 없습니다.`)
        return getPolicyDocument(type, current.version, controller.signal)
      })
      .then(setDocument)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(getRequestErrorMessage(requestError))
      })
    return () => controller.abort()
  }, [fallbackTitle, type])

  return (
    <article className="rounded-xl border border-stone-200 bg-white px-5 py-6 sm:px-8 sm:py-8">
      <header className="border-b border-stone-200 pb-5">
        <p className="type-caption font-semibold text-stone-500">으뜸 법적 고지</p>
        <h1 className="mt-1 type-page-title font-bold text-stone-950">
          {document?.title ?? fallbackTitle}
        </h1>
        {document ? (
          <p className="mt-2 type-caption text-stone-500">
            버전 {document.version}
            {document.effectiveAt
              ? ` · 시행일 ${new Date(document.effectiveAt).toLocaleDateString('ko-KR')}`
              : ''}
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="py-12 text-center">
          <p className="type-body text-rose-700" role="alert">{error}</p>
          <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-700" to={routes.login}>
            로그인으로 돌아가기
          </Link>
        </div>
      ) : document ? (
        <MarkdownContent className="py-6 text-stone-700" content={document.content} />
      ) : (
        <p className="py-12 text-center type-body text-stone-500" role="status">
          문서를 불러오는 중입니다.
        </p>
      )}
    </article>
  )
}
