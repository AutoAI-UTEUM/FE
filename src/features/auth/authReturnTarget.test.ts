import { describe, expect, it } from 'vitest'

import { getAuthReturnTarget } from './authReturnTarget'

const origin = 'https://uteum.example'

function stateFor(
  pathname: string,
  search = '',
  hash = '',
): Record<string, unknown> {
  return { authReturnTo: { hash, pathname, search } }
}

describe('getAuthReturnTarget', () => {
  it('preserves an internal path with its intended query and hash', () => {
    expect(
      getAuthReturnTarget(
        stateFor(
          '/sessions/100',
          '?tab=chat&next=https%3A%2F%2Fdocs.example%2Fhelp',
          '#message-7',
        ),
        origin,
      ),
    ).toEqual({
      hash: '#message-7',
      pathname: '/sessions/100',
      search: '?tab=chat&next=https%3A%2F%2Fdocs.example%2Fhelp',
    })
  })

  it.each([
    ['an absolute external URL', 'https://evil.example/phish'],
    ['a protocol-relative URL', '//evil.example/phish'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a backslash authority', '/\\evil.example/phish'],
    ['an encoded authority', '/%2F%2Fevil.example/phish'],
    ['an encoded backslash', '/%5Cevil.example/phish'],
    ['a double-encoded authority', '/%252F%252Fevil.example/phish'],
    ['a login loop', '/login'],
    ['a case-variant login loop', '/LOGIN/'],
    ['a normalized login loop', '/private/../login'],
    ['a public auth route', '/signup'],
    ['a control character', '/sessions/100\n/admin'],
  ])('rejects %s', (_label, pathname) => {
    expect(getAuthReturnTarget(stateFor(pathname), origin)).toBeNull()
  })

  it.each([
    ['?access_token=secret', ''],
    ['?access%255Ftoken=secret', ''],
    ['?PASSWORD=secret', ''],
    ['', '#id_token=secret'],
    ['', '#%3Fid_token=secret'],
    ['', '#section?credential=secret'],
  ])('rejects sensitive query or hash state (%s%s)', (search, hash) => {
    expect(
      getAuthReturnTarget(stateFor('/sessions/100', search, hash), origin),
    ).toBeNull()
  })

  it('rejects malformed or unstructured history state', () => {
    expect(getAuthReturnTarget(null, origin)).toBeNull()
    expect(getAuthReturnTarget({ authReturnTo: '/sessions/100' }, origin)).toBeNull()
    expect(
      getAuthReturnTarget(
        { authReturnTo: { pathname: '/sessions/100', search: 1, hash: '' } },
        origin,
      ),
    ).toBeNull()
  })
})
