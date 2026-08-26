export type DevelopmentPart = 'AI' | 'BE' | 'FE'

export interface DevelopmentUpdate {
  author: string
  committedAt: string
  date: string
  message: string
  part: DevelopmentPart
  repositoryName: string
  sha: string
  url: string
}

export interface MonthlyDevelopmentUpdates {
  availableParts: DevelopmentPart[]
  repositoryUrls: Partial<Record<DevelopmentPart, string>>
  updates: DevelopmentUpdate[]
}

interface GithubRepositoryDto {
  default_branch: string
  html_url: string
  name: string
}

interface GithubCommitDto {
  commit: {
    author: { date: string; name: string } | null
    committer: { date: string; name: string } | null
    message: string
  }
  html_url: string
  sha: string
}

type Fetcher = typeof fetch

const ORGANIZATION = 'AutoAI-UTEUM'
const API_BASE_URL = 'https://api.github.com'
const KOREAN_TIME_ZONE = 'Asia/Seoul'

export function createGithubUpdatesRepository(fetcher: Fetcher = fetch) {
  let repositoriesPromise: Promise<GithubRepositoryDto[]> | undefined
  const monthlyCache = new Map<string, Promise<MonthlyDevelopmentUpdates>>()

  async function listRepositories(): Promise<GithubRepositoryDto[]> {
    repositoriesPromise ??= requestJson<GithubRepositoryDto[]>(
      fetcher,
      `${API_BASE_URL}/orgs/${ORGANIZATION}/repos?type=public&sort=full_name&per_page=100`,
    )
    try {
      return await repositoriesPromise
    } catch (error) {
      repositoriesPromise = undefined
      throw error
    }
  }

  async function loadMonth(year: number, month: number): Promise<MonthlyDevelopmentUpdates> {
    const cacheKey = `${year}-${month}`
    const cached = monthlyCache.get(cacheKey)
    if (cached) return cached

    const request = listRepositories().then(async (repositories) => {
      const matched = repositories.flatMap((repository) => {
        const part = classifyRepository(repository.name)
        return part ? [{ part, repository }] : []
      })
      const availableParts = [...new Set(matched.map(({ part }) => part))]
        .sort(compareParts)
      const repositoryUrls = matched.reduce<Partial<Record<DevelopmentPart, string>>>(
        (current, { part, repository }) => ({ ...current, [part]: repository.html_url }),
        {},
      )
      const { since, until } = getKoreanMonthRange(year, month)
      const updates = (await Promise.all(matched.map(async ({ part, repository }) => {
        const query = new URLSearchParams({
          per_page: '100',
          sha: repository.default_branch,
          since,
          until,
        })
        const commits = await requestJson<GithubCommitDto[]>(
          fetcher,
          `${API_BASE_URL}/repos/${ORGANIZATION}/${encodeURIComponent(repository.name)}/commits?${query}`,
          [409],
        )
        return commits.map((commit): DevelopmentUpdate => {
          const author = commit.commit.author ?? commit.commit.committer
          const committedAt = author?.date ?? ''
          return {
            author: author?.name ?? 'GitHub 사용자',
            committedAt,
            date: toKoreanDateKey(committedAt),
            message: getCommitTitle(commit.commit.message),
            part,
            repositoryName: repository.name,
            sha: commit.sha.slice(0, 7),
            url: commit.html_url,
          }
        })
      }))).flat().sort((left, right) => right.committedAt.localeCompare(left.committedAt))

      return { availableParts, repositoryUrls, updates }
    })

    monthlyCache.set(cacheKey, request)
    try {
      return await request
    } catch (error) {
      monthlyCache.delete(cacheKey)
      throw error
    }
  }

  return { loadMonth }
}

async function requestJson<T>(
  fetcher: Fetcher,
  url: string,
  emptyStatuses: number[] = [],
): Promise<T> {
  const response = await fetcher(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (emptyStatuses.includes(response.status)) return [] as T
  if (response.ok) return response.json() as Promise<T>
  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub 조회 한도를 초과했습니다. 잠시 후 다시 확인해 주세요.')
  }
  throw new Error('GitHub 개발 현황을 불러오지 못했습니다.')
}

function classifyRepository(name: string): DevelopmentPart | null {
  const normalized = name.toLowerCase().replace(/[_\s]+/g, '-')
  if (matchesPart(normalized, 'ai') || normalized.includes('artificial-intelligence')) return 'AI'
  if (matchesPart(normalized, 'be') || normalized.includes('backend') || normalized.includes('server')) return 'BE'
  if (matchesPart(normalized, 'fe') || normalized.includes('frontend') || normalized.includes('client')) return 'FE'
  return null
}

function matchesPart(name: string, part: string): boolean {
  return name === part || name.startsWith(`${part}-`) || name.endsWith(`-${part}`)
}

function getCommitTitle(message: string): string {
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (/^merge pull request\b/i.test(lines[0] ?? '') && lines[1]) return lines[1]
  return lines[0] || '변경사항 업데이트'
}

function compareParts(left: DevelopmentPart, right: DevelopmentPart): number {
  return ['AI', 'BE', 'FE'].indexOf(left) - ['AI', 'BE', 'FE'].indexOf(right)
}

function getKoreanMonthRange(year: number, month: number) {
  return {
    since: new Date(Date.UTC(year, month, 0, 15)).toISOString(),
    until: new Date(Date.UTC(year, month + 1, 0, 14, 59, 59, 999)).toISOString(),
  }
}

function toKoreanDateKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: KOREAN_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}
