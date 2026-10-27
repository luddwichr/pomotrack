import { readdirSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { chromium } from '@playwright/test'
import { App } from './support/app'
import { collectConsole, expect, test } from './support/fixtures'

test.use({ serviceWorkers: 'allow' })

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload()
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

test('the manifest names the app and links PNG icons in 192 and 512 px', async ({ request }) => {
  const manifest = await (await request.get('manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ short_name: 'Pomotrack', display: 'standalone', start_url: './', scope: './' })
  for (const size of ['192', '512']) {
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png' }),
    )
    const icon = await request.get(`icon-${size}.png`)
    expect(icon.headers()['content-type']).toBe('image/png')
  }
})

test('the app loads offline after the first visit', async ({ page, context }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  await context.setOffline(true)
  await page.reload()
  await expect(new App(page).time).toHaveText('25:00')
})

test('the service worker stores every file of the app for offline use', async ({ page, baseURL }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  const cached = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys()).find((key) => key.startsWith('pomotrack-')) ?? '')
    return (await cache.keys()).map((request) => request.url)
  })
  // sw.js itself is kept by the browser, index.html is cached as the folder
  const files = readdirSync('dist', { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'sw.js')
    .map((entry) => `${entry.parentPath}/${entry.name}`.replace(/^dist\/?/, '').replace(/^index\.html$/, ''))
  expect(cached.sort()).toEqual(files.map((file) => new URL(file, baseURL).href).sort())
})

test('a reload picks up a new deploy instead of a stale cached copy', async ({ page, context, baseURL }) => {
  await page.goto('./')
  await waitForServiceWorker(page)

  // Simulate a deploy: the server now returns a changed page. Context routes also see service worker requests.
  await context.route(
    (url) => url.href === baseURL,
    async (route) => {
      const response = await route.fetch()
      const body = (await response.text()).replace('<head>', '<head><meta name="e2e-deploy" content="v2">')
      await route.fulfill({ response, body })
    },
  )
  await page.reload()
  await expect(page.locator('meta[name="e2e-deploy"]')).toHaveCount(1)

  await context.unrouteAll()
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('meta[name="e2e-deploy"]')).toHaveCount(1)
})

test('a server error shows the copy of the app that worked last time', async ({ page, context, baseURL }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  await context.route(
    (url) => url.href === baseURL,
    (route) => route.fulfill({ status: 503, body: 'Service unavailable' }),
  )
  await page.reload()
  await expect(new App(page).time).toHaveText('25:00')
})

test('opening another file of the app in a tab does not replace the offline copy of the app', async ({
  page,
  context,
}) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  // In another tab, because Chromium asks for a favicon.ico next to a file shown on its own, which is a 404 here
  const otherTab = await context.newPage()
  await otherTab.goto('icon-192.png')
  await otherTab.goto('manifest.webmanifest')
  await otherTab.close()
  await context.setOffline(true)
  await page.goto('./')
  await expect(new App(page).time).toHaveText('25:00')
})

test('the service worker leaves caches of other apps on the same origin alone', async ({ page }) => {
  // GitHub Pages serves all projects of a user from one origin
  await page.goto('./')
  await waitForServiceWorker(page)
  const keys = await page.evaluate(async () => {
    await caches.open('other-app-cache')
    await (await navigator.serviceWorker.getRegistration())?.unregister()
    const registration = await navigator.serviceWorker.register('sw.js')
    const worker = registration.installing ?? registration.waiting ?? registration.active
    if (worker && worker.state !== 'activated') {
      await new Promise((done) =>
        worker.addEventListener('statechange', () => worker.state === 'activated' && done(null)),
      )
    }
    return caches.keys()
  })
  expect(keys).toContain('other-app-cache')
  expect(keys.some((key) => key.startsWith('pomotrack-'))).toBe(true)
})

test('Chromium considers the app installable and the Install button appears', async ({ baseURL }, testInfo) => {
  // Installability needs a regular profile. The default test contexts are incognito.
  const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), { baseURL: baseURL ?? '' })
  try {
    const page = context.pages()[0] ?? (await context.newPage())
    const messages = collectConsole(page)
    await page.goto('./')
    await waitForServiceWorker(page)

    const cdp = await context.newCDPSession(page)
    const { errors } = await cdp.send('Page.getAppManifest')
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
    expect(errors).toEqual([])
    expect(installabilityErrors).toEqual([])
    await expect(new App(page).button('Install')).toBeVisible({ timeout: 15_000 })
    expect(messages, 'browser console messages').toEqual([])
  } finally {
    await context.close()
  }
})
