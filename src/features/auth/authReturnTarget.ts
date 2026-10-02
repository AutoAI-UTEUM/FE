import type { Location, To } from 'react-router-dom'

import { routes } from '../../app/routes'

const AUTH_RETURN_STATE_KEY = 'authReturnTo'
const MAX_DECODE_PASSES = 5
const SENSITIVE_PARAMETER_NAMES = new Set([
  'authorization',
  'code',
  'credential',
  'idtoken',
  'password',
  'passwd',
  'pwd',
  'refreshtoken',
  'secret',
  'token',
  'accesstoken',
])
const PUBLIC_AUTH_PATHS = new Set([
  routes.login,
  routes.signup,
  routes.forgotPassword,
  routes.resetPassword,
  routes.authCallback,
])

interface AuthReturnTarget {
  hash: string
  pathname: string
  search: string
}

export function createAuthReturnState(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  origin: string,
): Record<string, AuthReturnTarget> | undefined {
  const target = validateAuthReturnTarget(location, origin)
  return target ? { [AUTH_RETURN_STATE_KEY]: target } : undefined
}

export function getAuthReturnTarget(
  state: unknown,
  origin: string,
): To | null {
  if (!isRecord(state)) return null
  return validateAuthReturnTarget(state[AUTH_RETURN_STATE_KEY], origin)
}

function validateAuthReturnTarget(
  value: unknown,
  origin: string,
): AuthReturnTarget | null {
  if (!isRecord(value)) return null

  const { hash, pathname, search } = value
  if (
    typeof pathname !== 'string' ||
    typeof search !== 'string' ||
    typeof hash !== 'string' ||
    !hasSafeComponentShape(pathname, search, hash)
  ) {
    return null
  }

  let baseOrigin: string
  let parsed: URL
  try {
    baseOrigin = new URL(origin).origin
    parsed = new URL(`${pathname}${search}${hash}`, `${baseOrigin}/`)
  } catch {
    return null
  }

  if (
    parsed.origin !== baseOrigin ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== pathname ||
    parsed.search !== search ||
    parsed.hash !== hash ||
    !hasSafeDecodedPath(pathname, baseOrigin) ||
    isPublicAuthPath(parsed.pathname) ||
    hasSensitiveParameters(parsed.searchParams) ||
    hasSensitiveHash(parsed.hash)
  ) {
    return null
  }

  return { hash, pathname, search }
}

function hasSafeComponentShape(
  pathname: string,
  search: string,
  hash: string,
): boolean {
  return (
    pathname.startsWith('/') &&
    !pathname.startsWith('//') &&
    !pathname.includes('\\') &&
    !pathname.includes('?') &&
    !pathname.includes('#') &&
    (search === '' || (search.startsWith('?') && !search.includes('#'))) &&
    (hash === '' || hash.startsWith('#')) &&
    !hasControlCharacters(`${pathname}${search}${hash}`)
  )
}

function hasSafeDecodedPath(pathname: string, origin: string): boolean {
  let current = pathname

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    if (
      !current.startsWith('/') ||
      current.startsWith('//') ||
      current.includes('\\') ||
      hasControlCharacters(current)
    ) {
      return false
    }

    let normalized: URL
    try {
      normalized = new URL(current, `${origin}/`)
    } catch {
      return false
    }
    if (normalized.origin !== origin || isPublicAuthPath(normalized.pathname)) {
      return false
    }

    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      return false
    }
    if (decoded === current) return true
    current = decoded
  }

  return false
}

function isPublicAuthPath(pathname: string): boolean {
  const normalized = pathname.length > 1
    ? pathname.replace(/\/+$/, '').toLowerCase()
    : pathname
  return [...PUBLIC_AUTH_PATHS].some((path) => path.toLowerCase() === normalized)
}

function hasSensitiveParameters(parameters: URLSearchParams): boolean {
  return [...parameters.keys()].some(hasSensitiveParameterName)
}

function hasSensitiveHash(hash: string): boolean {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  const parameterPattern = /(?:^|[?&;])([^=?&#;]+)=/g
  for (const match of fragment.matchAll(parameterPattern)) {
    let key: string
    try {
      key = decodeURIComponent(match[1])
    } catch {
      return true
    }
    if (hasSensitiveParameterName(key)) return true
  }
  return false
}

function hasSensitiveParameterName(name: string): boolean {
  let current = name

  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    if (SENSITIVE_PARAMETER_NAMES.has(normalizeParameterName(current))) {
      return true
    }

    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      return true
    }
    if (decoded === current) return false
    current = decoded
  }

  return true
}

function normalizeParameterName(name: string): string {
  return name
    .replace(/^[?&;]+/, '')
    .toLowerCase()
    .replace(/[-_]/g, '')
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
