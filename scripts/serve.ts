import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'

// The folder that GitHub Pages deploys
const ROOT = resolve(import.meta.dirname, '..', 'dist')
// Loopback only, so the server is not reachable from other machines on the network
const HOST = '127.0.0.1'
const PORT = Number(process.env['PORT'] ?? 4173)
// The app is served from a sub-path, as GitHub Pages serves a project, so a path that only works at the root fails.
// playwright.config.ts uses the same path.
const BASE_PATH = '/pomotrack/'

// Files are served by extension. Anything else, or anything outside the folder, gets a 404.
const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
])

createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?', 1)[0]!
  if (path === '/') return void res.writeHead(302, { location: BASE_PATH }).end()
  const file = path.startsWith(BASE_PATH) && resolve(ROOT, path.slice(BASE_PATH.length) || 'index.html')
  const type = file && file.startsWith(ROOT + sep) && TYPES.get(extname(file))
  if (!file || !type) return void res.writeHead(404).end('Not found')
  try {
    res.writeHead(200, { 'content-type': type }).end(await readFile(file))
  } catch {
    res.writeHead(404).end('Not found')
  }
}).listen(PORT, HOST, () => console.log(`Serving ${ROOT} on http://${HOST}:${PORT}${BASE_PATH}`))
