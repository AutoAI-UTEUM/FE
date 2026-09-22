import { writeFile } from 'node:fs/promises'

const organization = 'AutoAI-UTEUM'
const token = process.env.GITHUB_TOKEN

if (!token) throw new Error('GITHUB_TOKEN is required to generate the update snapshot.')

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (response.status === 409) return []
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${path}`)
  return response.json()
}

function partOf(name) {
  const normalized = name.toLowerCase().replace(/[_\s]+/g, '-')
  for (const part of ['AI', 'BE', 'FE']) {
    const short = part.toLowerCase()
    if (normalized === short || normalized.startsWith(`${short}-`) || normalized.endsWith(`-${short}`)) return part
  }
  if (normalized.includes('artificial-intelligence')) return 'AI'
  if (normalized.includes('backend') || normalized.includes('server')) return 'BE'
  if (normalized.includes('frontend') || normalized.includes('client')) return 'FE'
  return null
}

function koreanDate(iso) {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit', month: '2-digit', timeZone: 'Asia/Seoul', year: 'numeric',
  }).formatToParts(new Date(iso))
  const value = (type) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function commitTitle(message) {
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return /^merge pull request\b/i.test(lines[0] ?? '') && lines[1]
    ? lines[1]
    : lines[0] || '변경사항 업데이트'
}

const repositories = (await github(`/orgs/${organization}/repos?type=public&sort=full_name&per_page=100`))
  .map((repository) => ({ part: partOf(repository.name), repository }))
  .filter(({ part }) => part !== null)
const availableParts = [...new Set(repositories.map(({ part }) => part))]
  .sort((left, right) => ['AI', 'BE', 'FE'].indexOf(left) - ['AI', 'BE', 'FE'].indexOf(right))
const repositoryUrls = Object.fromEntries(repositories.map(({ part, repository }) => [part, repository.html_url]))
const todayParts = new Intl.DateTimeFormat('en-US', {
  month: 'numeric', timeZone: 'Asia/Seoul', year: 'numeric',
}).formatToParts(new Date())
const year = Number(todayParts.find((part) => part.type === 'year')?.value)
const month = Number(todayParts.find((part) => part.type === 'month')?.value) - 1
const months = {}

for (let offset = 0; offset < 12; offset += 1) {
  const date = new Date(Date.UTC(year, month - offset, 1))
  const targetYear = date.getUTCFullYear()
  const targetMonth = date.getUTCMonth()
  const since = new Date(Date.UTC(targetYear, targetMonth, 0, 15)).toISOString()
  const until = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 14, 59, 59, 999)).toISOString()
  const updates = []

  for (const { part, repository } of repositories) {
    const query = new URLSearchParams({ per_page: '100', sha: repository.default_branch, since, until })
    const commits = await github(`/repos/${organization}/${encodeURIComponent(repository.name)}/commits?${query}`)
    for (const commit of commits) {
      const author = commit.commit.author ?? commit.commit.committer
      const committedAt = author?.date ?? ''
      updates.push({
        author: author?.name ?? 'GitHub 사용자',
        committedAt,
        date: koreanDate(committedAt),
        message: commitTitle(commit.commit.message),
        part,
        repositoryName: repository.name,
        sha: commit.sha.slice(0, 7),
        url: commit.html_url,
      })
    }
  }

  updates.sort((left, right) => right.committedAt.localeCompare(left.committedAt))
  months[`${targetYear}-${targetMonth}`] = { availableParts, repositoryUrls, updates }
}

await writeFile('dist/updates-snapshot.json', JSON.stringify({ generatedAt: new Date().toISOString(), months }))
console.log(`Generated update snapshot for ${Object.keys(months).length} months.`)
