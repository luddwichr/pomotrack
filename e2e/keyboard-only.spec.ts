import { expect, test } from './support/fixtures'
import { FOCUS_SESSION, MINUTE } from './support/state'

// A user without a mouse goes through the whole app with Tab, Shift+Tab, Enter, Space, Escape and the arrow keys.
// The app's own shortcuts are not used, because they are covered by the shortcut tests of each feature.
test('the whole app can be used with standard keys only', async ({ app }) => {
  const { page } = app
  await app.open()

  // Skip past the timer to the empty task list
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to tasks' })).toBeFocused()
  await page.keyboard.press('Enter')

  // Add three tasks
  await app.tabTo(app.addTaskButton)
  await page.keyboard.press('Enter')
  await expect(app.titleField(app.addForm)).toBeFocused()
  await page.keyboard.type('Write report')
  await app.tabTo(app.addForm.getByRole('spinbutton', { name: 'Estimate in minutes' }))
  await page.keyboard.press('ArrowUp')
  await app.tabTo(app.addForm.getByRole('button', { name: 'Add task' }))
  await page.keyboard.press('Enter')
  await expect(app.titleField(app.addForm), 'the form stays open for the next task').toBeFocused()
  await page.keyboard.type('Review pull requests')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Plan sprint')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(app.addTaskButton).toBeFocused()
  await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
  await expect(app.task('Write report')).toContainText('0 min / 30 min')

  // Work on a task
  await app.tabTo(app.workButton('Write report'), { back: true })
  await page.keyboard.press('Enter')
  await expect(app.currentTask).toHaveText('Working on Write report')

  // Run a focus session
  await app.tabTo(app.startButton, { back: true })
  await page.keyboard.press('Enter')
  await expect(app.mainButton).toHaveText('Skip')
  await page.clock.fastForward(FOCUS_SESSION)
  await app.expectMode('short')
  await expect(app.task('Write report')).toContainText('25 min / 30 min')

  // Change the time of the break, start it and skip it with the main button
  await app.tabTo(app.time, { back: true })
  await page.keyboard.press('Enter')
  await expect(app.timeInput).toBeFocused()
  await page.keyboard.type('3')
  await page.keyboard.press('Enter')
  await expect(app.time).toHaveText('03:00')
  await expect(app.time).toBeFocused()
  await app.tabTo(app.startButton)
  await page.keyboard.press('Enter')
  await expect(app.mainButton).toHaveText('Skip')
  await expect(app.mainButton, 'the started interval is skipped with the same button').toBeFocused()
  await page.clock.fastForward(MINUTE)
  await page.keyboard.press('Enter')
  await app.expectMode('focus')

  // Finish the current task. It moves to the history, and focus moves to the open tasks to select the next one.
  await app.tabTo(app.finishButton)
  await page.keyboard.press('Enter')
  await expect(app.currentTask).toHaveText('Choose a task to track time on it.')
  await expect(app.workButton('Review pull requests')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(app.currentTask).toHaveText('Working on Review pull requests')
  await app.expectTasks(['Review pull requests', 'Plan sprint'])

  // Edit a task
  await app.tabTo(app.button('Edit Review pull requests'))
  await page.keyboard.press('Enter')
  await expect(app.titleField(app.editForm)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Review open pull requests')
  await page.keyboard.press('Enter')
  await expect(app.button('Edit Review open pull requests')).toBeFocused()

  // Move another task to the top
  await app.tabTo(app.button('Move Plan sprint'))
  await page.keyboard.press('ArrowUp')
  await app.expectTasks(['Plan sprint', 'Review open pull requests'])

  // The finished task is in the history
  await app.tabTo(app.historyToggle)
  await page.keyboard.press('Enter')
  await app.expectHistory(['Write report'])

  // Change a setting
  await app.tabTo(app.settingsButton, { back: true })
  await page.keyboard.press('Enter')
  await expect(app.settingsDialog).toBeVisible()
  await app.tabTo(app.settingsDialog.getByRole('switch', { name: 'Sound' }))
  await page.keyboard.press('Space')
  await page.keyboard.press('Escape')
  await expect(app.settingsDialog).toBeHidden()
  await expect(app.settingsButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(app.settingsDialog.getByRole('switch', { name: 'Sound' })).not.toBeChecked()
  await page.keyboard.press('Escape')
})
