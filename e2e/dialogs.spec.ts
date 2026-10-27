import { expect, test } from './support/fixtures'
import { FOCUS_SESSION, MINUTE, task } from './support/state'

// Scrollbars take room, as in a desktop browser. Playwright hides them by default.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test.describe('settings', () => {
  test('settings are kept after a reload', async ({ app }) => {
    await app.open()
    await app.settingsButton.click()
    await app.settingsDialog.getByRole('switch', { name: 'Sound' }).uncheck()
    await app.page.reload()
    await app.settingsButton.click()
    await expect(app.settingsDialog.getByRole('switch', { name: 'Sound' })).not.toBeChecked()
  })

  test('notifications stay off when the browser does not allow them', async ({ app, context }) => {
    await context.clearPermissions()
    await app.open()
    await app.settingsButton.click()
    const notify = app.settingsDialog.getByRole('switch', { name: 'Browser notifications' })
    await notify.click()
    await expect(app.settingsDialog.getByRole('status'), 'the message shows in the dialog').toHaveText(
      'Notifications are not allowed. Check the notification permission in your browser site settings.',
    )
    await expect(notify).not.toBeChecked()
    await app.page.reload()
    await app.settingsButton.click()
    await expect(notify).not.toBeChecked()
  })

  test('the settings say when notifications are on but the browser does not allow them right now', async ({
    app,
    context,
  }) => {
    await context.grantPermissions(['notifications'])
    await app.open()
    await app.turnOnNotifications()
    await context.clearPermissions()

    await app.settingsButton.click()
    const notify = app.settingsDialog.getByRole('switch', { name: 'Browser notifications' })
    const hint = app.settingsDialog.getByText(/This browser does not allow notifications right now/)
    await expect(notify, 'the switch shows the setting').toBeChecked()
    await expect(hint).toBeVisible()
    await expect(notify).toHaveAccessibleDescription(/This browser does not allow notifications right now/)

    await app.settingsDialog.getByRole('button', { name: 'Done' }).click()
    await context.grantPermissions(['notifications'])
    await app.settingsButton.click()
    await expect(hint).toBeHidden()
    await expect(notify).toHaveAccessibleDescription('Shown when an interval ends and this window is not focused.')
  })

  test('messages that come while a dialog is open show inside the dialog', async ({ app }) => {
    await app.open()
    await app.pauseClock()
    await app.startButton.click()
    await app.settingsButton.click()
    await app.page.clock.fastForward(FOCUS_SESSION)
    await app.expectMode('short')

    const message = 'Focus session done. Time for a short break.'
    await expect(app.settingsDialog.getByRole('status')).toHaveText(message)
    await app.page.clock.runFor(100)
    await expect(app.settingsDialog.locator('[aria-live="assertive"]')).toHaveText(message)
  })
})

test.describe('dialogs', () => {
  test('Escape closes a dialog and focus returns to the button that opened it', async ({ app }) => {
    await app.open()
    await app.settingsButton.click()
    await app.settingsDialog.getByRole('switch', { name: 'Sound' }).focus()
    await app.page.keyboard.press('Escape')
    await expect(app.settingsDialog, 'also with focus on a switch').toBeHidden()
    await expect(app.settingsButton).toBeFocused()

    await app.shortcutsButton.click()
    await expect(app.shortcutsDialog).toBeVisible()
    await app.page.keyboard.press('Escape')
    await expect(app.shortcutsDialog).toBeHidden()
    await expect(app.shortcutsButton).toBeFocused()
  })

  test('a click on the backdrop closes a dialog', async ({ app }) => {
    await app.open()
    await app.shortcutsButton.click()
    await expect(app.shortcutsDialog).toBeVisible()
    await app.page.mouse.click(5, 5)
    await expect(app.shortcutsDialog).toBeHidden()
  })

  test('the page behind an open dialog does not scroll, and the dialog does', async ({ app }) => {
    await app.page.setViewportSize({ width: 390, height: 400 })
    await app.openWithHistory()
    await app.settingsButton.click()
    const scrolled = await app.page.evaluate(() => scrollY)
    // Over the backdrop, then over the dialog. Once the dialog has scrolled, the first wheel is handled too.
    await app.page.mouse.move(5, 200)
    await app.page.mouse.wheel(0, 500)
    const dialog = await app.settingsDialog.boundingBox()
    await app.page.mouse.move(dialog!.x + dialog!.width / 2, dialog!.y + dialog!.height / 2)
    await app.page.mouse.wheel(0, 2000)
    await expect.poll(() => app.settingsDialog.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await app.page.evaluate(() => scrollY)).toBe(scrolled)
  })

  test('the page does not shift sideways when a dialog takes its scrollbar away', async ({ app }) => {
    await app.page.setViewportSize({ width: 1200, height: 500 })
    await app.openWithHistory()
    const left = async () => (await app.startButton.boundingBox())!.x
    const before = await left()
    await app.settingsButton.click()
    expect(await left()).toBe(before)
    await app.settingsDialog.getByRole('button', { name: 'Delete all data' }).click()
    expect(await left(), 'also with a second dialog on top').toBe(before)
  })

  test('the Keyboard shortcuts button lists all shortcuts', async ({ app }) => {
    await app.open()
    await app.shortcutsButton.click()
    await expect(app.shortcutsDialog.getByRole('rowheader')).toHaveText([
      'Start',
      'Skip to next step',
      'Edit time of this interval, before Start',
      'New task',
      'Finish current task',
      'Work on next or previous task',
      'Move task (on its drag handle)',
      'Show or hide history',
      'Show this list',
      'Cancel editing, close dialog',
    ])
    await expect(app.shortcutsDialog.getByRole('cell')).toHaveText([
      'Space',
      'S',
      'E',
      'N',
      'F',
      'J K',
      '↑ ↓',
      'H',
      '?',
      'Esc',
    ])
    await app.shortcutsDialog.getByRole('button', { name: 'Close' }).click()
    await expect(app.shortcutsDialog).toBeHidden()
    await expect(app.shortcutsButton).toBeFocused()
  })
})

test.describe('export', () => {
  test('Export JSON downloads all tasks and the focus time and pomodoros of each day, in milliseconds', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.completeFocusSession()
    await app.run(10 * MINUTE + 30_123)
    await app.mainButton.click()
    await app.button('Finish Review pull requests').click()
    const finishedAt = await app.page.evaluate(() => Date.now())

    const { filename, data } = await app.exportJson()
    expect(filename).toBe('pomotrack-2026-10-21.json')
    const focusMs = 35 * MINUTE + 30_123
    const added = { id: expect.any(String), createdAt: expect.any(Number) }
    expect(data).toEqual({
      tasks: [
        {
          ...added,
          title: 'Write report',
          estMs: 75 * MINUTE,
          sessions: 2,
          spentMs: focusMs,
          done: false,
          doneAt: null,
        },
        {
          ...added,
          title: 'Review pull requests',
          estMs: 50 * MINUTE,
          sessions: 0,
          spentMs: 0,
          done: true,
          doneAt: finishedAt,
        },
        { ...added, title: 'Plan sprint', estMs: 25 * MINUTE, sessions: 0, spentMs: 0, done: false, doneAt: null },
      ],
      stats: { '2026-10-21': { focusMs, pomos: 1, otherMs: 0, otherSessions: 0 } },
    })
  })

  test('Export JSON during a session has the focus time up to that moment', async ({ app }) => {
    await app.openWithTasks()
    await app.run(10 * MINUTE)

    const { data } = await app.exportJson()
    expect(data.tasks[0]).toMatchObject({ title: 'Write report', spentMs: 10 * MINUTE })
    expect(data.stats['2026-10-21']).toEqual({ focusMs: 10 * MINUTE, pomos: 0, otherMs: 0, otherSessions: 0 })
  })
})

test.describe('import', () => {
  test('Import JSON brings back the tasks and the totals of an exported file, without asking in an app without data', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.completeFocusSession()
    await app.button('Finish Plan sprint').click()
    const { data } = await app.exportJson()
    await app.deleteAllData()

    await app.chooseImportFile(data)
    await expect(app.settingsDialog).toBeHidden()
    await expect(app.importDialog, 'no data would be lost, so there is nothing to confirm').toBeHidden()
    await expect(app.snackbar).toHaveText('Imported 3 tasks')
    await app.expectTasks(['Write report', 'Review pull requests'])
    await expect(app.currentTask, 'the import does not start work on a task').toHaveText(
      'Choose a task to track time on it.',
    )
    await expect(app.task('Write report')).toContainText('25 min / 1 h 15 min')
    await expect(app.task('Write report')).toContainText('1 session')
    await expect(app.todaySummary).toHaveText('Today 25 min focused · 1 pomodoro')
    await app.historyToggle.click()
    await app.expectHistory(['Plan sprint'])
    expect((await app.exportJson()).data, 'the same data as in the file').toEqual(data)
  })

  test('importing over existing data asks first, and Cancel keeps the data', async ({ app }) => {
    await app.openWithTasks()
    const file = { tasks: [task({ id: 'x', title: 'Imported task' })], stats: {} }
    await app.chooseImportFile(file)
    await expect(app.importDialog).toBeVisible()
    await expect(app.importDialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await app.importDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(app.importDialog).toBeHidden()
    await app.settingsDialog.getByRole('button', { name: 'Done' }).click()
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])

    await app.chooseImportFile(file)
    await app.importDialog.getByRole('button', { name: 'Replace' }).click()
    await expect(app.settingsDialog).toBeHidden()
    await app.expectTasks(['Imported task'])
    await expect(app.currentTask, 'the current task is gone, and the import does not select another one').toHaveText(
      'Choose a task to track time on it.',
    )
  })

  test('an import keeps the settings, the timer and the round, and a running session counts for the imported tasks', async ({
    app,
  }) => {
    await app.open()
    await app.settingsButton.click()
    await app.settingsDialog.getByRole('switch', { name: 'Sound' }).uncheck()
    await app.settingsDialog.getByRole('button', { name: 'Done' }).click()
    await app.skipButton.click()
    await app.skipButton.click()
    await app.run(10 * MINUTE)

    await app.chooseImportFile({ tasks: [task({ id: 'x', title: 'Imported task' })], stats: {} })
    await app.importDialog.getByRole('button', { name: 'Replace' }).click()
    await app.workOn('Imported task')
    await expect(app.mainButton, 'the session keeps running').toHaveText('Skip')
    await expect(app.time).toHaveText('15:00')
    await expect(app.roundText).toHaveText('Session 2 of 4')
    await expect(app.todaySummary, 'the totals are the ones of the file').toHaveText(
      'Today 0 min focused · 0 pomodoros',
    )

    await app.page.clock.fastForward(15 * MINUTE)
    await app.expectMode('short')
    await expect(app.task('Imported task')).toContainText('1 session')
    await expect(app.task('Imported task')).toContainText('15 min')
    await expect(app.todaySummary).toHaveText('Today 15 min focused · 1 pomodoro')
    await app.settingsButton.click()
    await expect(app.settingsDialog.getByRole('switch', { name: 'Sound' })).not.toBeChecked()
  })

  test('a file that is not an export is rejected, and nothing changes', async ({ app }) => {
    await app.openWithTasks()
    for (const content of ['not json', '{"tasks": "none"}', '[]']) {
      await app.chooseImportFile(content)
      await expect(app.settingsDialog.getByRole('status'), content).toHaveText(
        'This file is not a Pomotrack export. Nothing was changed.',
      )
      await expect(app.importDialog).toBeHidden()
      await app.settingsDialog.getByRole('button', { name: 'Done' }).click()
    }
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
  })
})

test.describe('delete all data', () => {
  test('asks for confirmation first', async ({ app }) => {
    await app.openWithTasks()
    await app.settingsButton.click()
    await app.settingsDialog.getByRole('button', { name: 'Delete all data' }).click()
    await expect(app.confirmDialog).toBeVisible()
    await expect(app.confirmDialog.getByRole('button', { name: 'Cancel' })).toBeFocused()

    await app.confirmDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(app.settingsDialog).toBeVisible()
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
  })

  test('Escape in the confirmation closes only the confirmation', async ({ app }) => {
    await app.open()
    await app.settingsButton.click()
    const deleteAll = app.settingsDialog.getByRole('button', { name: 'Delete all data' })
    await deleteAll.click()
    await app.page.keyboard.press('Escape')
    await expect(app.confirmDialog).toBeHidden()
    await expect(app.settingsDialog).toBeVisible()
    await expect(deleteAll).toBeFocused()

    await app.page.keyboard.press('Escape')
    await expect(app.settingsDialog).toBeHidden()
  })

  test('removes tasks, tracked time, the timer, the round and the settings', async ({ app }) => {
    await app.openWithTasks()
    await app.completeFocusSession()
    await app.button('Finish Plan sprint').click()
    await app.settingsButton.click()
    await app.settingsDialog.getByRole('switch', { name: 'Sound' }).uncheck()
    await app.settingsDialog.getByRole('button', { name: 'Done' }).click()
    await app.startButton.click()

    await app.deleteAllData()
    await expect(app.snackbar).toHaveText('All data deleted')
    await app.expectTasks([])
    await expect(app.historyToggle).toBeHidden()
    await expect(app.todaySummary).toHaveText('Today 0 min focused · 0 pomodoros')
    await expect(app.time).toHaveText('25:00')
    await expect(app.mainButton).toHaveText('Start')
    await expect(app.roundText).toHaveText('Session 1 of 4')
    await app.settingsButton.click()
    await expect(app.settingsDialog.getByRole('switch', { name: 'Sound' })).toBeChecked()

    await app.page.reload()
    await app.expectTasks([])
    await expect(app.page.getByText('No tasks yet.')).toBeVisible()
  })
})

test.describe('keyboard shortcuts', () => {
  test('? shows the keyboard shortcuts, and app shortcuts pause while a dialog is open', async ({ app }) => {
    await app.open()
    await app.shortcut('?')
    await expect(app.shortcutsDialog).toBeVisible()

    await app.page.keyboard.press('n')
    await app.page.keyboard.press('s')
    await app.page.keyboard.press('Escape')
    await expect(app.shortcutsDialog).toBeHidden()
    await expect(app.addForm).toBeHidden()
    await app.expectMode('focus')
  })
})
