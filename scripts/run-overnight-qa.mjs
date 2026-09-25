import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const deadline = new Date(process.env.QA_DEADLINE ?? '2026-09-20T10:00:00+09:00')
const cleanupAt = new Date(deadline.getTime() - 30 * 60 * 1000)
const retryDelayMs = Number(process.env.QA_RETRY_DELAY_MS ?? 2 * 60 * 1000)
const results = []
const configurationWarnings = credentialWarnings()
const npmCli = process.env.npm_execpath ?? join(
  dirname(process.execPath),
  process.platform === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js',
)

if (Number.isNaN(deadline.getTime())) throw new Error('QA_DEADLINE must be an ISO-8601 timestamp')

await runWithRetry('lint', process.execPath, [npmCli, 'run', 'lint'])
await runWithRetry('typecheck', process.execPath, [npmCli, 'run', 'typecheck'])
await runWithRetry('unit', process.execPath, [npmCli, 'run', 'test:run'])
await runWithRetry('build', process.execPath, [npmCli, 'run', 'build:qa'])
await runWithRetry('bundle-budget', process.execPath, [npmCli, 'run', 'test:performance:bundle'])
await runWithRetry('health', process.execPath, [npmCli, 'run', 'test:qa:health'])
await runE2e('mock', true)
await runE2e('dev', false)
await runE2e('prod', false)

runIssuePass('mock')
runIssuePass('dev')
runIssuePass('prod')
run('commercialization-evidence', process.execPath, ['scripts/prepare-commercialization-review.mjs'])
writeSummary(true)

async function runE2e(environment, fullMatrix) {
  return runWithRetry(`e2e-${environment}`, process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
    QA_ENV: environment,
    QA_FULL_MATRIX: fullMatrix ? '1' : '0',
  })
}

function runIssuePass(environment) {
  run(`issues-${environment}`, process.execPath, ['scripts/report-qa-issues.mjs'], { QA_ENV: environment })
}

async function runWithRetry(name, command, args, extraEnv = {}) {
  const first = run(name, command, args, extraEnv)
  if (first === 0 || Date.now() >= cleanupAt.getTime()) return first

  const availableDelay = Math.max(0, cleanupAt.getTime() - Date.now())
  await sleep(Math.min(retryDelayMs, availableDelay))
  return run(`${name}-retry`, command, args, extraEnv)
}

function run(name, command, args, extraEnv = {}) {
  if (Date.now() >= cleanupAt.getTime()) return 1
  const startedAt = new Date().toISOString()
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    shell: false,
    stdio: 'inherit',
  })
  results.push({
    code: result.status ?? 1,
    error: result.error?.message,
    finishedAt: new Date().toISOString(),
    name,
    startedAt,
  })
  writeSummary()
  return result.status ?? 1
}

function writeSummary(completed = false) {
  mkdirSync('qa-artifacts', { recursive: true })
  writeFileSync('qa-artifacts/overnight-summary.json', `${JSON.stringify({
    completed,
    configurationWarnings,
    deadline: deadline.toISOString(),
    executionPolicy: 'single-pass-with-one-retry-then-commercialization-review',
    results,
  }, null, 2)}\n`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function credentialWarnings() {
  const warnings = []
  for (const environment of ['DEV', 'PROD']) {
    for (const role of ['LEARNER', 'INSTRUCTOR', 'ADMIN']) {
      if (!process.env[`${environment}_QA_${role}_EMAIL`] || !process.env[`${environment}_QA_${role}_PASSWORD`]) {
        warnings.push(`${environment} ${role} authenticated checks will be skipped: QA credentials are not configured`)
      }
    }
  }
  if (process.env.GITHUB_ACTIONS && process.env.QA_CREATE_ISSUES === 'true' && !process.env.GH_TOKEN) {
    warnings.push('Issue creation will fall back to local drafts: GH_TOKEN is not configured')
  }
  return warnings
}
