import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const environment = process.env.QA_ENV ?? 'mock'
const artifactRoot = `qa-artifacts/${environment}`
const reportPath = process.env.QA_RESULTS_PATH ?? `${artifactRoot}/results.json`
const createIssues = process.env.QA_CREATE_ISSUES === 'true'
const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const collectedFailures = collectFailures(report.suites ?? [])
const infrastructureFailures = collectedFailures.filter(isInfrastructureFailure)
const failures = groupFailures(collectedFailures.filter((failure) => !isInfrastructureFailure(failure)))
const drafts = []

for (const failure of failures) {
  const ownership = ownerFor(failure.title)
  const signature = createHash('sha256')
    .update(`${failure.file}|${failure.title}`)
    .digest('hex')
    .slice(0, 16)
  const title = `${ownership.prefix} ${failure.title.replace(/^\[[^\]]+\]\s*/, '')}`
  const body = issueBody(failure, ownership, signature)
  const draft = { body, repository: ownership.repository, signature, title }
  drafts.push(draft)

  if (!createIssues) continue
  try {
    const existing = JSON.parse(gh([
      'issue', 'list', '--repo', ownership.repository, '--state', 'all',
      '--json', 'number,title,body', '--limit', '100',
    ])).find((item) => item.title === title || item.body?.includes(`qa-signature:${signature}`))
    if (existing) {
      gh(['issue', 'comment', String(existing.number), '--repo', ownership.repository, '--body', body])
    } else {
      gh(['issue', 'create', '--repo', ownership.repository, '--title', title, '--body', body])
    }
  } catch (error) {
    draft.issueCreationError = sanitize(error.stderr ?? error.message)
  }
}

mkdirSync(artifactRoot, { recursive: true })
writeFileSync(`${artifactRoot}/issue-drafts.json`, `${JSON.stringify(drafts, null, 2)}\n`)
writeFileSync(`${artifactRoot}/infrastructure-failures.json`, `${JSON.stringify(infrastructureFailures, null, 2)}\n`)
writeFileSync(
  `${artifactRoot}/issue-summary.md`,
  `${failures.length === 0
    ? '# QA issue summary\n\nNo confirmed product failures.\n'
    : `# QA issue summary\n\n${drafts.map((item) => `- ${item.repository}: ${item.title} (${item.signature})`).join('\n')}\n`}
${infrastructureFailures.length > 0
    ? `\n## Test infrastructure failures\n\n${infrastructureFailures.map((item) => `- ${item.project}: ${sanitize(item.error).split('\n')[0]}`).join('\n')}\n`
    : ''}`,
)

function isInfrastructureFailure(failure) {
  return failure.error.includes('browserType.launch:')
    || failure.error.includes('spawn UNKNOWN')
    || failure.error.includes('Executable doesn\'t exist')
}

function collectFailures(suites, inheritedFile = '') {
  const failures = []
  for (const suite of suites) {
    const file = suite.file ?? inheritedFile
    for (const spec of suite.specs ?? []) {
      for (const currentTest of spec.tests ?? []) {
        const failedResults = (currentTest.results ?? []).filter((result) => result.status === 'failed' || result.status === 'timedOut')
        if (currentTest.status === 'unexpected' && failedResults.length > 0) {
          const finalResult = failedResults.at(-1)
          failures.push({
            error: finalResult.error?.message ?? finalResult.errors?.map((item) => item.message).join('\n') ?? 'Unknown failure',
            file,
            project: currentTest.projectName,
            title: spec.title,
          })
        }
      }
    }
    failures.push(...collectFailures(suite.suites ?? [], file))
  }
  return failures
}

function groupFailures(failures) {
  const grouped = new Map()
  for (const failure of failures) {
    const key = `${failure.file}|${failure.title}`
    const current = grouped.get(key) ?? { ...failure, errors: [], projects: [] }
    if (!current.projects.includes(failure.project)) current.projects.push(failure.project)
    if (!current.errors.includes(failure.error)) current.errors.push(failure.error)
    grouped.set(key, current)
  }
  return [...grouped.values()].map((failure) => ({
    ...failure,
    error: failure.errors.join('\n\n--- Additional viewport/browser failure ---\n\n'),
    project: failure.projects.join(', '),
  }))
}

function ownerFor(title) {
  if (title.startsWith('[AI]')) return { prefix: '[AI]', repository: 'AutoAI-UTEUM/BE' }
  if (title.startsWith('[FE/BE]')) return { prefix: '[FE/BE][성능 조사 필요]', repository: 'AutoAI-UTEUM/FE' }
  if (title.startsWith('[BE/AI]')) return { prefix: '[BE/AI][조사 필요]', repository: 'AutoAI-UTEUM/BE' }
  if (title.startsWith('[BE]')) return { prefix: '[BE]', repository: 'AutoAI-UTEUM/BE' }
  return { prefix: '[FE]', repository: 'AutoAI-UTEUM/FE' }
}

function issueBody(failure, ownership, signature) {
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : 'local run (see qa-artifacts)'
  return `## 자동 QA 재현 결과\n\n- 환경: ${environment}\n- 시각: ${new Date().toISOString()}\n- 프로젝트: ${failure.project}\n- 테스트: ${failure.title}\n- 담당 분류: ${ownership.prefix}\n- 실행 증거: ${runUrl}\n\n## 오류\n\n\`\`\`text\n${sanitize(failure.error).slice(0, 6000)}\n\`\`\`\n\n재시도 후에도 동일하게 실패했습니다. 스크린샷·동영상·trace·네트워크 기록은 실행 artifact를 확인해 주세요.\n\n<!-- qa-signature:${signature} -->`
}

function sanitize(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/(cookie|password|token)(["'=:\s]+)[^\s,"'}]+/gi, '$1$2[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}
