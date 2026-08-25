import { useEffect } from 'react'

import { SERVICE_NAME } from '../config/brand'

export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SERVICE_NAME}` : SERVICE_NAME
    return () => {
      document.title = SERVICE_NAME
    }
  }, [title])
}
