import { describe, expect, it, vi } from 'vitest'

import { createGithubUpdatesRepository } from './githubUpdatesRepository'

describe('githubUpdatesRepository', () => {
  it('classifies public repositories and maps commits to Korean calendar dates', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/orgs/AutoAI-UTEUM/repos')) {
        return jsonResponse([
          { default_branch: 'main', html_url: 'https://github.com/AutoAI-UTEUM/BE', name: 'BE' },
          { default_branch: 'develop', html_url: 'https://github.com/AutoAI-UTEUM/FE', name: 'FE' },
          { default_branch: 'main', html_url: 'https://github.com/AutoAI-UTEUM/docs', name: 'docs' },
        ])
      }
      const isBackend = url.includes('/repos/AutoAI-UTEUM/BE/commits')
      return jsonResponse([{
        commit: {
          author: {
            date: isBackend ? '2026-08-22T16:30:00Z' : '2026-08-23T03:00:00Z',
            name: isBackend ? 'BE 개발자' : 'FE 개발자',
          },
          committer: null,
          message: isBackend
            ? 'Merge pull request #12 from AutoAI-UTEUM/overview\n\nfeat: 개요 API 추가'
            : 'fix: 개요 탭 상태 처리',
        },
        html_url: isBackend ? 'https://github.com/backend-commit' : 'https://github.com/frontend-commit',
        sha: isBackend ? 'abcdef123456' : '123456abcdef',
      }])
    })

    const repository = createGithubUpdatesRepository(fetcher)
    const result = await repository.loadMonth(2026, 7)

    expect(result.availableParts).toEqual(['BE', 'FE'])
    expect(result.updates).toHaveLength(2)
    expect(result.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        date: '2026-08-23',
        message: 'feat: 개요 API 추가',
        part: 'BE',
        sha: 'abcdef1',
      }),
      expect.objectContaining({ part: 'FE' }),
    ]))
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('returns a friendly rate-limit error and allows a retry', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(jsonResponse([]))
    const repository = createGithubUpdatesRepository(fetcher)

    await expect(repository.loadMonth(2026, 7)).rejects.toThrow(
      'GitHub 조회 한도를 초과했습니다.',
    )
    await expect(repository.loadMonth(2026, 7)).resolves.toEqual({
      availableParts: [],
      repositoryUrls: {},
      updates: [],
    })
  })
})

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
