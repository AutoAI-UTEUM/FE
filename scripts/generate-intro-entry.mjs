import { copyFile, mkdir } from 'node:fs/promises'

// Nginx serves known SPA routes and real files. Give the public introduction
// its own entry so direct visits work without changing the server allowlist.
const output = new URL('../dist/', import.meta.url)
await mkdir(new URL('intro/', output), { recursive: true })
await copyFile(new URL('index.html', output), new URL('intro/index.html', output))
console.log('Generated public introduction entry: /intro/')
