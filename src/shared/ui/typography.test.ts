import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const sourceRoot = join(process.cwd(), 'src')
const legacyTextSizePattern = /\btext-(?:4xl|3xl|2xl|xl|lg|base|sm|xs)\b/g
const arbitraryPixelTextSizePattern = /\btext-\[\d+(?:\.\d+)?px\]/g

describe('typography system', () => {
  it('uses semantic typography classes instead of local font sizes', () => {
    const violations = collectSourceFiles(sourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      const matches = [
        ...(source.match(legacyTextSizePattern) ?? []),
        ...(source.match(arbitraryPixelTextSizePattern) ?? []),
      ]

      return matches.map((match) => `${relative(sourceRoot, filePath)}: ${match}`)
    })

    expect(violations).toEqual([])
  })
})

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      return collectSourceFiles(path)
    }

    if (!['.ts', '.tsx'].includes(extname(entry.name)) || entry.name.includes('.test.')) {
      return []
    }

    return [path]
  })
}
