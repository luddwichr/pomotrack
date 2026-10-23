import type { App } from './support/app'
import { expectNoA11yViolations } from './support/a11y'
import { expect, test } from './support/fixtures'

// Without transitions, colors are measured in their final state
test.use({ reducedMotion: 'reduce' })

test('the skip link is the first Tab stop and moves focus to the tasks', async ({ app }) => {
  await app.open()
  await app.page.keyboard.press('Tab')
  const skipLink = app.page.getByRole('link', { name: 'Skip to tasks' })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toHaveCSS('outline-style', 'solid')
  await app.page.keyboard.press('Enter')
  await expect(app.page.getByRole('heading', { name: 'Tasks' })).toBeFocused()
})

test('each message reaches screen readers once, also when it is shown in the snackbar', async ({ app }) => {
  await app.openWithTasks()
  await app.shortcut('f')
  const message = 'Finished "Write report". Now working on "Review pull requests"'
  await expect(app.snackbar).toHaveText(message)
  await expect(app.announcer).toHaveText(message)
  const liveRegions = app.page.locator(
    '[aria-live]:not([aria-live="off"]), [role="status"]:not([aria-live="off"]), [role="alert"]',
    { hasText: message },
  )
  await expect(liveRegions).toHaveCount(1)
})

test('reduced motion turns off transitions', async ({ app }) => {
  await app.open()
  await expect(app.startButton).toHaveCSS('transition-duration', '0s')
})

const views: { name: string; show: (app: App) => Promise<void> }[] = [
  { name: 'empty app', show: (app) => app.open() },
  { name: 'task list', show: (app) => app.openWithTasks() },
  {
    name: 'running session',
    show: async (app) => {
      await app.openWithTasks()
      await app.startButton.click()
    },
  },
  {
    name: 'short break',
    show: async (app) => {
      await app.openWithTasks()
      await app.skipButton.click()
    },
  },
  {
    name: 'long break',
    show: async (app) => {
      await app.openWithTasks()
      for (let i = 0; i < 7; i++) await app.skipButton.click()
      await app.expectMode('long')
    },
  },
  {
    name: 'history',
    show: async (app) => {
      await app.openWithHistory()
      await app.historyToggle.click()
    },
  },
  {
    name: 'add task form',
    show: async (app) => {
      await app.openWithTasks()
      await app.addTaskButton.click()
    },
  },
  {
    name: 'task edit form',
    show: async (app) => {
      await app.openWithTasks()
      await app.button('Edit Plan sprint').click()
    },
  },
  {
    name: 'time editing',
    show: async (app) => {
      await app.open()
      await app.time.click()
    },
  },
  {
    name: 'settings',
    show: async (app) => {
      await app.open()
      await app.settingsButton.click()
    },
  },
  {
    name: 'keyboard shortcuts',
    show: async (app) => {
      await app.open()
      await app.shortcutsButton.click()
    },
  },
  {
    name: 'import confirmation',
    show: async (app) => {
      await app.openWithTasks()
      await app.chooseImportFile({ tasks: [], stats: {} })
      await expect(app.importDialog).toBeVisible()
    },
  },
  {
    name: 'delete confirmation',
    show: async (app) => {
      await app.open()
      await app.settingsButton.click()
      await app.settingsDialog.getByRole('button', { name: 'Delete all data' }).click()
    },
  },
]

for (const view of views) {
  test(`no axe violations in light and dark theme: ${view.name}`, async ({ app }) => {
    await view.show(app)
    await expectNoA11yViolations(app.page)
    await app.page.emulateMedia({ colorScheme: 'dark' })
    await expectNoA11yViolations(app.page)
  })
}

test.describe('phone', () => {
  test.use({ hasTouch: true })

  for (const width of [320, 390]) {
    test(`the page fits a screen ${width} px wide and has no axe violations`, async ({ app }) => {
      await app.page.setViewportSize({ width, height: 800 })
      await app.openWithHistory()
      await app.startButton.click()
      const cardsFit = await app.page
        .getByRole('region')
        .evaluateAll((cards) =>
          cards.every((el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth),
        )
      expect(cardsFit, 'the timer and the tasks hold their content and fit the screen').toBe(true)
      expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expectNoA11yViolations(app.page)
    })
  }

  test('the top bar stays at the top of the screen while the page scrolls', async ({ app }) => {
    await app.page.setViewportSize({ width: 390, height: 600 })
    await app.openWithHistory()
    await app.page.mouse.wheel(0, 2000)
    await expect.poll(() => app.page.evaluate(() => scrollY)).toBeGreaterThan(0)
    expect((await app.page.getByRole('banner').boundingBox())?.y).toBe(0)
    await expect(app.settingsButton).toBeInViewport()
  })

  test('a control reached with Shift+Tab is not hidden behind the top bar', async ({ app }) => {
    await app.page.setViewportSize({ width: 390, height: 600 })
    await app.openWithHistory()
    const bar = app.page.getByRole('banner')
    const barBottom = async () => {
      const box = (await bar.boundingBox())!
      return box.y + box.height
    }
    const buttonTop = async () => (await app.startButton.boundingBox())!.y
    // Scroll until the Start button is under the top bar. The browser would not scroll to a button it sees on screen.
    await app.page.mouse.wheel(0, (await buttonTop()) - 4)
    await expect.poll(buttonTop).toBeLessThan(await barBottom())
    await app.roundText.click()
    await app.tabTo(app.startButton, { back: true })
    expect(await buttonTop()).toBeGreaterThanOrEqual(await barBottom())
  })
})
