import { BookOpenCheck } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'

import {
  SERVICE_NAME,
  SERVICE_NAME_ENGLISH,
  SERVICE_NAME_EXPANSION,
} from '../../shared/config/brand'
import { routes } from '../routes'

export function AuthLayout() {
  return (
    <main className="auth-light grid min-h-screen bg-white text-stone-900 lg:grid-cols-[minmax(480px,39vw)_minmax(0,1fr)]">
      <aside className="hidden border-r border-stone-200 bg-stone-100 px-10 py-16 lg:flex lg:flex-col lg:justify-between">
        <Link
          to={routes.classrooms}
          className="flex items-center gap-2.5 self-start rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
        >
          <span className="flex size-6 items-center justify-center rounded-[7px] bg-brand-600 text-white">
            <BookOpenCheck aria-hidden="true" size={13} />
          </span>
          <span className="flex items-baseline gap-2">
            <span className="type-body font-bold">{SERVICE_NAME}</span>
            <span className="type-micro font-semibold text-stone-400">
              {SERVICE_NAME_ENGLISH}
            </span>
          </span>
        </Link>

        <div className="flex flex-col gap-4">
          <p className="max-w-sm type-display font-bold leading-[1.35]">
            강의 자료를 읽고,
            <br />
            바로 물어보세요.
          </p>
          <p className="max-w-sm type-body leading-relaxed text-stone-500">
            PDF를 보면서 AI 학습 도우미와
            <br />
            대화하는 학습 플랫폼
          </p>
          <div className="mt-2 max-w-sm border-l-2 border-brand-300 pl-3">
            <p className="type-caption font-bold text-brand-700">
              {SERVICE_NAME_ENGLISH}
            </p>
            <p className="mt-1 type-caption leading-relaxed text-stone-500">
              {SERVICE_NAME_EXPANSION}
            </p>
          </div>
        </div>

        <p className="type-micro text-stone-400">
          © 2026 {SERVICE_NAME} · {SERVICE_NAME_ENGLISH}
        </p>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-[440px]">
          <Link
            to={routes.classrooms}
            className="mb-8 flex items-center gap-2.5 rounded-lg lg:hidden"
          >
            <span className="flex size-8 items-center justify-center rounded-[9px] bg-brand-600 text-white">
              <BookOpenCheck aria-hidden="true" size={17} />
            </span>
            <span className="flex flex-col">
              <span className="type-dialog-title font-bold">{SERVICE_NAME}</span>
              <span className="type-micro font-semibold text-stone-400">
                {SERVICE_NAME_ENGLISH}
              </span>
            </span>
          </Link>

          <p className="mb-7 type-caption leading-relaxed text-stone-400 lg:hidden">
            {SERVICE_NAME_EXPANSION}
          </p>

          <Outlet />
        </div>
      </section>
    </main>
  )
}
