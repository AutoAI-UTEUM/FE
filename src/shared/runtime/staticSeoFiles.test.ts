import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8')

describe('production static metadata', () => {
  const indexHtml = readProjectFile('index.html')
  const robots = readProjectFile('public/robots.txt')
  const sitemap = readProjectFile('public/sitemap.xml')
  const notFound = readProjectFile('public/404.html')

  it('uses www.uteum.com as the canonical production host', () => {
    expect(indexHtml).toContain(
      '<link rel="canonical" href="https://www.uteum.com/" />',
    )
    expect(indexHtml).toContain(
      '<meta property="og:url" content="https://www.uteum.com/" />',
    )
    expect(indexHtml).not.toContain('https://uteum.com')
  })

  it('publishes only the canonical root in robots and sitemap', () => {
    expect(robots).toContain(
      'Sitemap: https://www.uteum.com/sitemap.xml',
    )
    expect(robots).toContain('Disallow: /api')
    expect(robots).toContain('Disallow: /classrooms')
    expect(sitemap).toContain('<loc>https://www.uteum.com/</loc>')
  })

  it('keeps the static not-found page out of search results', () => {
    expect(notFound).toContain('<meta name="robots" content="noindex" />')
    expect(notFound).toContain('href="https://www.uteum.com/"')
  })
})
