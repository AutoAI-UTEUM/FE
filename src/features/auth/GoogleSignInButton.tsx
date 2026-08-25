import { useEffect, useRef, useState } from 'react'

import { getGoogleClientId } from '../../shared/config/env'

interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleAccountsId {
  initialize: (options: {
    auto_select?: boolean
    callback: (response: GoogleCredentialResponse) => void
    client_id: string
  }) => void
  renderButton: (
    parent: HTMLElement,
    options: {
      locale?: string
      shape?: 'rectangular'
      size?: 'large'
      text?: 'continue_with'
      theme?: 'outline'
      type?: 'standard'
      width?: number
    },
  ) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId
      }
    }
  }
}

interface GoogleSignInButtonProps {
  disabled?: boolean
  onCredential: (idToken: string) => void
}

const GIS_SCRIPT_ID = 'google-identity-services'
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

export function GoogleSignInButton({
  disabled = false,
  onCredential,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onCredential)
  const [loadError, setLoadError] = useState(false)
  const clientId = getGoogleClientId()

  useEffect(() => {
    callbackRef.current = onCredential
  }, [onCredential])

  useEffect(() => {
    if (!clientId) return

    let active = true

    void loadGoogleIdentityServices()
      .then(() => {
        if (!active || !containerRef.current || !window.google) return

        window.google.accounts.id.initialize({
          auto_select: false,
          callback: (response) => {
            const idToken = response.credential?.trim()
            if (idToken) callbackRef.current(idToken)
          },
          client_id: clientId,
        })

        const container = containerRef.current
        const width = Math.max(
          240,
          Math.floor(container.getBoundingClientRect().width || 440),
        )
        container.replaceChildren()
        window.google.accounts.id.renderButton(container, {
          locale: 'ko',
          shape: 'rectangular',
          size: 'large',
          text: 'continue_with',
          theme: 'outline',
          type: 'standard',
          width,
        })
      })
      .catch(() => {
        if (active) setLoadError(true)
      })

    return () => {
      active = false
    }
  }, [clientId])

  if (!clientId) {
    return (
      <p className="text-center type-caption text-stone-400" role="status">
        Google 로그인 설정을 준비 중입니다.
      </p>
    )
  }

  if (loadError) {
    return (
      <p className="text-center type-caption text-rose-700" role="alert">
        Google 로그인을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
      </p>
    )
  }

  return (
    <div
      aria-busy={disabled}
      aria-disabled={disabled}
      className={disabled ? 'pointer-events-none opacity-60' : undefined}
    >
      <div
        className="google-signin-button h-11 w-full min-w-full max-w-full overflow-hidden rounded-lg"
        ref={containerRef}
      />
    </div>
  )
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GIS_SCRIPT_ID)
    const handleLoad = () => resolve()
    const handleError = () => reject(new Error('GIS script failed to load'))

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true })
      existingScript.addEventListener('error', handleError, { once: true })
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.defer = true
    script.id = GIS_SCRIPT_ID
    script.src = GIS_SCRIPT_URL
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    document.head.append(script)
  })
}
