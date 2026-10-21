import type { Page } from '@playwright/test'
import { test as base, expect } from '@playwright/test'
import { App } from './app'
import { NOW } from './state'

interface Fixtures {
  app: App
  cleanConsole: void
}

export const test = base.extend<Fixtures>({
  cleanConsole: [
    async ({ page }, use) => {
      const messages = collectConsole(page)
      await use()
      expect(messages, 'browser console messages').toEqual([])
    },
    { auto: true },
  ],
  // The fake clock starts at NOW and runs. All tabs of a test share it.
  app: async ({ page }, use) => {
    await page.clock.install({ time: NOW })
    await use(new App(page))
  },
})

export { expect }

/** Logged by Playwright itself when serviceWorkers: 'block' (playwright.config.ts) stops the app's registration. */
const PLAYWRIGHT_SW_BLOCKED = 'Service Worker registration blocked by Playwright'

export function collectConsole(page: Page): string[] {
  const messages: string[] = []
  page.on('console', (message) => {
    if (message.text() !== PLAYWRIGHT_SW_BLOCKED) messages.push(`[${message.type()}] ${message.text()}`)
  })
  page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`))
  return messages
}

interface ShownNotification {
  title: string
  body: string | undefined
}

/**
 * Records notifications since the page last loaded, instead of showing them, whether the app sends them through its
 * service worker or directly. By default the page reports that its window is not focused, which is when the app
 * notifies. Returns a function that reads the recorded notifications.
 */
export async function recordNotifications(
  page: Page,
  { windowFocused = false } = {},
): Promise<() => Promise<ShownNotification[]>> {
  await page.addInitScript((windowFocused) => {
    // Also runs on the blank page of App.reopenAt, which has no service worker API
    if (location.protocol === 'about:') return
    const shown: ShownNotification[] = []
    const record = (title: string, options?: NotificationOptions) => shown.push({ title, body: options?.body })
    ServiceWorkerRegistration.prototype.showNotification = async (title, options) => {
      record(title, options)
    }
    const Real = window.Notification
    const Recorder = function (title: string, options?: NotificationOptions) {
      record(title, options)
      return { close() {} }
    }
    Object.defineProperty(Recorder, 'permission', { get: () => Real.permission })
    Object.defineProperty(window, 'Notification', { value: Recorder })
    Object.assign(window, { __notifications: shown })
    document.hasFocus = () => windowFocused
  }, windowFocused)
  return () => page.evaluate(() => (window as unknown as { __notifications: ShownNotification[] }).__notifications)
}

/**
 * Counts the chimes the app plays since the page last loaded. Returns a function that reads the count.
 * Each chime is three tones.
 */
export async function recordChimes(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    let tones = 0
    const createOscillator = AudioContext.prototype.createOscillator
    AudioContext.prototype.createOscillator = function () {
      tones++
      return createOscillator.call(this)
    }
    Object.assign(window, { __tones: () => tones })
  })
  return async () => (await page.evaluate(() => (window as unknown as { __tones: () => number }).__tones())) / 3
}
