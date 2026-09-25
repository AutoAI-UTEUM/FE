import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { createGzip } from 'node:zlib'

const distRoot = resolve('dist')
const outputRoot = resolve('qa-artifacts/performance')
const initialBudgetBytes = Number(process.env.QA_INITIAL_GZIP_BUDGET ?? 200 * 1024)
const chunkBudgetBytes = Number(process.env.QA_CHUNK_GZIP_BUDGET ?? 350 * 1024)

if (!existsSync(join(distRoot, 'index.html'))) {
  throw new Error('dist/index.html is missing. Run the production build before bundle analysis.')
}

const indexHtml = readFileSync(join(distRoot, 'index.html'), 'utf8')
const initialAssets = new Set(
  [...indexHtml.matchAll(/(?:src|href)="\/?(assets\/[^"?#]+\.(?:js|css))"/g)].map((match) => match[1]),
)
const assetPaths = walk(join(distRoot, 'assets')).filter((path) => /\.(?:js|css)$/.test(path))
const assets = []

for (const path of assetPaths) {
  const gzipBytes = await gzipSize(path)
  const asset = {
    bytes: statSync(path).size,
    file: relative(distRoot, path).replaceAll('\\', '/'),
    gzipBytes,
    initial: initialAssets.has(relative(distRoot, path).replaceAll('\\', '/')),
  }
  assets.push(asset)
}

assets.sort((left, right) => right.gzipBytes - left.gzipBytes)
const initialGzipBytes = assets.filter((asset) => asset.initial).reduce((sum, asset) => sum + asset.gzipBytes, 0)
const oversizedChunks = assets.filter((asset) => asset.gzipBytes > chunkBudgetBytes)
const report = {
  assets,
  budgets: { chunkBudgetBytes, initialBudgetBytes },
  generatedAt: new Date().toISOString(),
  initialAssets: [...initialAssets],
  initialGzipBytes,
  oversizedChunks,
  passed: initialGzipBytes <= initialBudgetBytes && oversizedChunks.length === 0,
}

mkdirSync(outputRoot, { recursive: true })
writeFileSync(join(outputRoot, 'bundle-budget.json'), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(
  join(outputRoot, 'bundle-summary.md'),
  `# Frontend bundle budget\n\n- Initial gzip: ${formatBytes(initialGzipBytes)} / ${formatBytes(initialBudgetBytes)}\n- Largest chunk: ${assets[0] ? `${basename(assets[0].file)} (${formatBytes(assets[0].gzipBytes)})` : '-'}\n- Oversized chunks: ${oversizedChunks.length}\n- Result: ${report.passed ? 'PASS' : 'FAIL'}\n`,
)

console.log(`Initial JS/CSS gzip: ${formatBytes(initialGzipBytes)} / ${formatBytes(initialBudgetBytes)}`)
console.log(`Largest lazy asset: ${assets[0] ? `${assets[0].file} (${formatBytes(assets[0].gzipBytes)})` : '-'}`)
if (!report.passed) process.exitCode = 1

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function gzipSize(path) {
  return new Promise((resolveSize, reject) => {
    let bytes = 0
    const gzip = createGzip({ level: 9 })
    gzip.on('data', (chunk) => { bytes += chunk.length })
    gzip.on('end', () => resolveSize(bytes))
    gzip.on('error', reject)
    createReadStream(path).on('error', reject).pipe(gzip)
  })
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}
