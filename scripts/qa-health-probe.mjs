import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'

const environments = [
  { baseUrl: 'https://dev.uteum.com', name: 'dev' },
  { baseUrl: 'https://www.uteum.com', name: 'prod' },
]
const paths = ['/', '/api/health', '/api/health/ready', '/robots.txt']
const outputRoot = 'qa-artifacts/health'
const timestamp = new Date().toISOString()
const records = []

for (const environment of environments) {
  for (const path of paths) {
    const startedAt = performance.now()
    try {
      const response = await fetch(`${environment.baseUrl}${path}`, {
        headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Uteum-QA-Health-Probe/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      })
      records.push({
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        environment: environment.name,
        ok: response.ok,
        path,
        status: response.status,
        timestamp,
      })
    } catch (error) {
      records.push({
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        environment: environment.name,
        error: error instanceof Error ? error.message : String(error),
        ok: false,
        path,
        status: 0,
        timestamp,
      })
    }
  }
}

mkdirSync(outputRoot, { recursive: true })
for (const record of records) {
  appendFileSync(`${outputRoot}/samples.ndjson`, `${JSON.stringify(record)}\n`)
}
writeFileSync(`${outputRoot}/latest.json`, `${JSON.stringify({ records, timestamp }, null, 2)}\n`)

const failures = records.filter((record) => !record.ok)
console.table(records.map(({ durationMs, environment, path, status }) => ({ durationMs, environment, path, status })))
if (failures.length > 0) process.exitCode = 1
