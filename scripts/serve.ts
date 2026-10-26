import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'

// The folder that GitHub Pages deploys
const ROOT = resolve(import.meta.dirname, '..', 'dist')
// Loopback only, so the server is not reachable from other machines on the network
const HOST = '127.0.0.1'
const PORT = Number(process.env['PORT'] ?? 4173)
// The app is served from a sub-path, as GitHub Pages serves a project, so a path that only works at the root fails.
// playwright.config.ts uses the same path.
const BASE_PATH = '/pomotrack/'

// Allow-list of request paths. Anything else gets a 404.
const FILES = new Map([
  ['', { file: 'index.html', type: 'text/html; charset=utf-8' }],
  ['sw.js', { file: 'sw.js', type: 'text/javascript; charset=utf-8' }],
  ['manifest.webmanifest', { file: 'manifest.webmanifest', type: 'application/manifest+json' }],
  ['icon.svg', { file: 'icon.svg', type: 'image/svg+xml' }],
  ['icon-192.png', { file: 'icon-192.png', type: 'image/png' }],
  ['icon-512.png', { file: 'icon-512.png', type: 'image/png' }],
])

createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?', 1)[0]!
  if (path === '/') return void res.writeHead(302, { location: BASE_PATH }).end()
  const entry = path.startsWith(BASE_PATH) && FILES.get(path.slice(BASE_PATH.length))
  if (!entry) return void res.writeHead(404).end('Not found')
  try {
    const body = await readFile(resolve(ROOT, entry.file))
    res.writeHead(200, { 'content-type': entry.type }).end(body)
  } catch {
    res.writeHead(500).end('Could not read file')
  }
}).listen(PORT, HOST, () => console.log(`Serving ${ROOT} on http://${HOST}:${PORT}${BASE_PATH}`))
