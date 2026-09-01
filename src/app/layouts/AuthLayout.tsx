import { BookOpenCheck, X } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import {
  SERVICE_NAME,
  SERVICE_NAME_ENGLISH,
} from '../../shared/config/brand'
import { ServiceStatusIndicator } from '../../features/health'
import { routes } from '../routes'

export function AuthLayout() {
  const location = useLocation()
  const isLoginPage = location.pathname === routes.login

  return (
    <main className="auth-light grid min-h-screen bg-white text-stone-900 lg:grid-cols-[minmax(520px,46.5vw)_minmax(0,1fr)] mobile-web:min-h-[100dvh]">
      <aside className={`hidden bg-[#131C2B] px-12 py-10 text-white xl:px-14 ${isLoginPage ? 'lg:flex lg:flex-col' : 'lg:flex lg:flex-col lg:justify-between'}`}>
        {!isLoginPage ? (
          <Link
            to={routes.classrooms}
            className="flex items-center gap-2.5 self-start rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#A6ACBB]"
          >
            <span className="flex size-6 items-center justify-center rounded-[7px] bg-[#3C4152] text-white">
              <BookOpenCheck aria-hidden="true" size={13} />
            </span>
            <span className="flex items-baseline gap-2">
              <span className="type-body font-bold text-white">{SERVICE_NAME}</span>
              <span className="type-micro font-semibold text-[#A6ACBB]">
                {SERVICE_NAME_ENGLISH}
              </span>
            </span>
          </Link>
        ) : null}

        <div className={isLoginPage ? 'flex flex-1 flex-col justify-center gap-5' : 'flex flex-col gap-4'}>
          <p className="max-w-sm type-auth-intro font-bold text-white">
            같은 강의,
            <br />
            나에게 맞춘 학습.
            <br />
            <span className="text-[#5B8DEF]">그래서, {SERVICE_NAME}.</span>
          </p>
          <p className="max-w-sm type-auth-description text-[#A6ACBB]">
            이해 속도에 맞춰 설명하고 점검하는
            <br />
            개인 맞춤형 학습 플랫폼, {SERVICE_NAME}
          </p>
        </div>

        <p className="flex items-center gap-1.5 type-micro text-[#8A90A0]">
          {isLoginPage ? (
            <>Powered by <X aria-hidden="true" size={10} /> Grok</>
          ) : (
            <>© 2026 {SERVICE_NAME} ({SERVICE_NAME_ENGLISH})</>
          )}
        </p>
      </aside>

      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 mobile-web:min-h-[100dvh] mobile-web:mobile-safe-x mobile-web:mobile-safe-top mobile-web:mobile-safe-bottom">
        <div className={isLoginPage ? 'w-full max-w-[400px]' : 'w-full max-w-[440px]'}>
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

          <Outlet />

          {!isLoginPage ? (
            <footer
              aria-label="서비스 연결 상태"
              className="mt-8 flex justify-center border-t border-stone-100 pt-4"
            >
              <ServiceStatusIndicator />
            </footer>
          ) : null}
        </div>
      </section>
    </main>
  )
}
