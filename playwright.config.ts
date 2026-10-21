import { defineConfig, devices } from '@playwright/test'
import { TIME_ZONE } from './e2e/support/state'

const PORT = 4173
// scripts/serve.ts serves the app from this sub-path, like GitHub Pages serves a project.
// Tests open pages with relative URLs, like './', so they stay under it.
const BASE_URL = `http://127.0.0.1:${PORT}/pomotrack/`
const isCI = !!process.env['CI']

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: 'docs/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  projects: [
    {
      name: 'chromium',
      // The full Chromium in new headless mode, which behaves like the real browser for permissions and installation
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  use: {
    baseURL: BASE_URL,
    // Fixed locale and time zone, so dates in the history and the fake clock (NOW in e2e/support/state.ts) are stable
    locale: 'en-US',
    timezoneId: TIME_ZONE,
    // The app's service worker would keep cached files between reloads, so it is off by default.
    // e2e/pwa.spec.ts turns it on to test offline use and installation.
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node scripts/serve.ts',
    url: BASE_URL,
    env: { PORT: String(PORT) },
    reuseExistingServer: !isCI,
    timeout: 10_000,
  },
})
