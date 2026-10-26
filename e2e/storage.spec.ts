import { expect, test } from './support/fixtures'
import { MINUTE, NOW, dayKey, storedState, task } from './support/state'

// The app keeps its data in the browser's localStorage. These tests write that storage directly, to check data that
// a broken browser profile may have left. See STORAGE_KEY in support/state.ts.

test('unknown and invalid stored values fall back to the defaults', async ({ app }) => {
  await app.openWithStoredData(
    JSON.stringify({
      settings: { focusMs: 0, shortMs: '5', longEvery: 99, sound: 'yes', theme: 'dark' },
      tasks: [
        { id: 'a', title: 'Only id and title' },
        { id: 'b' },
        'not a task',
        { id: 'c', title: 'Finished without a date', done: true },
        { id: 'a', title: 'Same id as another task' },
        { id: 'd"><b>', title: 'Id that is not plain text' },
      ],
      activeId: 'a',
      focusCount: -1,
      stats: {
        'not a day': { focusMs: 1 },
        '2026-13-45': { focusMs: 1, pomos: 1 },
        [dayKey(NOW)]: { focusMs: 'x', pomos: 2 },
      },
      timer: { mode: 'focus', durationMs: -5, remainingMs: 0, endAt: null, segStart: null },
    }),
  )
  // A task can only be finished at a time, so without a finish date it is open
  await app.expectTasks(['Only id and title', 'Finished without a date'])
  await expect(app.task('Only id and title')).toContainText('0 min')
  await expect(app.time).toHaveText('25:00')
  await expect(app.roundText).toHaveText('Session 1 of 4')
  await expect(app.todaySummary).toHaveText('Today 0 min focused · 2 pomodoros')
  await expect(app.historyToggle, 'only real days are kept').toHaveText('History · 0 tasks, 1 day')

  await app.settingsButton.click()
  await expect(app.settingsDialog.getByRole('switch', { name: 'Sound' })).toBeChecked()
  await expect(app.settingsDialog.getByRole('switch', { name: 'Browser notifications' })).not.toBeChecked()
})

test('a stored task worked on that is gone or finished leaves nothing worked on', async ({ app }) => {
  await app.openWithStoredData(
    storedState({
      tasks: [
        task({ id: 'a', title: 'Finished', done: true, doneAt: NOW - MINUTE }),
        task({ id: 'b', title: 'Write report' }),
      ],
      activeId: 'a',
    }),
  )
  await expect(app.currentTask).toHaveText('Choose a task to track time on it.')
})

test('stored data that is not JSON is replaced by an empty start', async ({ app }) => {
  await app.openWithStoredData('{not json')
  await expect(app.page.getByText('No tasks yet.')).toBeVisible()
  await app.addTasks([{ title: 'Write report' }])
  await app.expectTasks(['Write report'])
})

test('when the browser storage is full, the app keeps working in the open tab', async ({ app }) => {
  await app.openWithTasks()
  await app.page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage is full', 'QuotaExceededError')
    }
  })
  await app.addTasks([{ title: 'Added while storage is full' }])
  await app.run()

  await app.expectMode('short')
  await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint', 'Added while storage is full'])
  await expect(app.todaySummary).toHaveText('Today 25 min focused · 1 pomodoro')
})
