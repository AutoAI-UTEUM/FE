import { BookOpenCheck } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'

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
          <span className="type-body font-bold">EduPilot</span>
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
        </div>

        <p className="type-micro text-stone-400">© 2026 EduPilot</p>
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
            <span className="type-dialog-title font-bold">EduPilot</span>
          </Link>

          <Outlet />
        </div>
      </section>
    </main>
  )
}
