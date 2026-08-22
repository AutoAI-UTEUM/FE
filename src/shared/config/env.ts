const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:'])

export function normalizeApiBaseUrl(value: string | undefined): string {
  const candidate = value?.trim()

  if (!candidate) {
    throw new Error('VITE_API_BASE_URL 환경 변수가 필요합니다.')
  }

  // 같은 도메인 배포(FE와 API가 한 오리진): '/api' 또는 '/' → 상대 경로 호출.
  // 요청 경로가 이미 /api로 시작하므로 base는 빈 문자열이 된다.
  if (candidate === '/api' || candidate === '/') {
    return ''
  }

  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
    throw new Error(
      'VITE_API_BASE_URL은 절대 URL이거나 같은 도메인용 "/api"여야 합니다.',
    )
  }

  let url: URL

  try {
    url = new URL(candidate)
  } catch {
    throw new Error('VITE_API_BASE_URL은 유효한 절대 URL이어야 합니다.')
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    throw new Error('VITE_API_BASE_URL은 http 또는 https URL이어야 합니다.')
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_API_BASE_URL에는 인증 정보, 쿼리, 해시를 포함할 수 없습니다.')
  }

  return url.toString().replace(/\/+$/, '')
}

export function getApiBaseUrl(): string {
  return normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
}

export function getGoogleClientId(): string | null {
  return normalizeGoogleClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID)
}

export function normalizeGoogleClientId(value: string | undefined): string | null {
  return value?.trim() || null
}
