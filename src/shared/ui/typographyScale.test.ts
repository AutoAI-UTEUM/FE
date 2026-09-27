import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

/**
 * 데스크톱 글자 확대 규칙에 상한을 달면 그보다 큰 모니터만 규칙에서 빠져
 * 노트북보다 글자가 작아진다. 27인치(2560×1440)에서 실제로 그랬다.
 * 브라우저 없이 재현되지 않는 회귀라 소스에서 막는다.
 */
describe('데스크톱 타이포그래피 확대 규칙', () => {
  const rule = css.match(/@media \(min-width: 1280px\)[^{]*\{/)

  it('1280px 이상을 여는 규칙이 있다', () => {
    expect(rule).not.toBeNull()
  })

  it('상한을 두지 않는다 — 큰 모니터가 규칙에서 빠지면 안 된다', () => {
    expect(rule?.[0]).not.toMatch(/max-width/)
    expect(rule?.[0]).not.toMatch(/max-height/)
  })

  it('본문 크기를 기본값보다 키운다', () => {
    const block = css.slice(css.indexOf(rule?.[0] ?? ''))
    expect(block).toMatch(/\.type-auth-description,\s*\.type-body\s*\{\s*font-size: 1rem/)
  })
})
