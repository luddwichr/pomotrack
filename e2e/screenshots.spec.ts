import type { App } from './support/app'
import { expect, test } from './support/fixtures'
import { sampleDayFile } from './support/sample'
import { FOCUS_SESSION, LONG_BREAK, MINUTE, NOW, SHORT_BREAK, type Mode } from './support/state'

test.use({ reducedMotion: 'reduce', viewport: { width: 1200, height: 900 } })

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['notifications'])
})

const DURATION: Record<Mode, number> = { focus: FOCUS_SESSION, short: SHORT_BREAK, long: LONG_BREAK }
// From the start of a round, two focus sessions are done in focus and in the short break, four in the long break
const SKIPS: Record<Mode, number> = { focus: 4, short: 3, long: 7 }

/**
 * Opens the app on the sample day the way a user gets there: turn on notifications, import the sample file, and skip
 * to an interval of `mode`. With `left`, the interval is started and runs until `left` is to go.
 * The clock ends paused at NOW, so every run shows the same times.
 */
async function openSampleDay(app: App, mode: Mode, left?: number): Promise<void> {
  const ran = left === undefined ? 0 : DURATION[mode] - left
  // Ten seconds more, so the message about the import is gone
  const start = NOW - ran - 10_000
  await app.page.clock.setSystemTime(start - 1_000)
  await app.page.clock.pauseAt(start)
  await app.open()
  await app.turnOnNotifications()
  await app.chooseImportFile(sampleDayFile(mode === 'focus' ? ran : 0))
  for (let i = 0; i < SKIPS[mode]; i++) await app.skipButton.click()
  await app.expectMode(mode)
  await app.page.clock.fastForward(10_000)
  if (left !== undefined) {
    await app.startButton.click()
    await app.page.clock.fastForward(ran)
  }
  await app.blur()
  await app.page.mouse.move(0, 0)
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme })
    const png = (name: string) => `${name}-${colorScheme}.png`

    test('timer and task list', async ({ app, page }) => {
      await openSampleDay(app, 'focus', 14 * MINUTE + 12_000)
      await expect(page).toHaveScreenshot(png('timer'))
    })

    test('short break', async ({ app, page }) => {
      await openSampleDay(app, 'short', 3 * MINUTE + 5_000)
      await expect(page).toHaveScreenshot(png('short-break'))
    })

    test('long break', async ({ app, page }) => {
      await openSampleDay(app, 'long', 7 * MINUTE + 41_000)
      await expect(page).toHaveScreenshot(png('long-break'))
    })

    test('history of earlier days', async ({ app, page }) => {
      await openSampleDay(app, 'focus', 14 * MINUTE + 12_000)
      await app.historyToggle.click()
      await app.expectHistory(['Reply to customer emails', 'Update onboarding guide', 'Fix login bug', 'Plan sprint'])
      await app.blur()
      await page.mouse.move(0, 0)
      await expect(page.getByRole('region', { name: 'Tasks', exact: true })).toHaveScreenshot(png('history'))
    })

    test('settings', async ({ app, page }) => {
      await openSampleDay(app, 'focus', 14 * MINUTE + 12_000)
      await app.settingsButton.click()
      await app.blur()
      await expect(page).toHaveScreenshot(png('settings'))
    })

    // Opened during a long break, to show that dialogs keep neutral colors outside of focus mode
    test('keyboard shortcuts', async ({ app, page }) => {
      await openSampleDay(app, 'long')
      await app.shortcutsButton.click()
      await app.blur()
      await expect(page).toHaveScreenshot(png('shortcuts'))
    })

    test('phone', async ({ app, page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await openSampleDay(app, 'focus', 14 * MINUTE + 12_000)
      await expect(page).toHaveScreenshot(png('mobile'))
    })
  })
}
