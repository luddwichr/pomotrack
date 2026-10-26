import { expect, test } from './support/fixtures'
import { DAY, FOCUS_SESSION, MINUTE, NOW } from './support/state'

test('the list holds the open tasks, finished tasks are in the collapsed history', async ({ app }) => {
  await app.openWithHistory()
  await app.expectTasks(['Write report', 'Review pull requests'])
  await expect(app.historyToggle).toHaveText('History · 3 tasks, 4 days')
  await expect(app.historyDays).toHaveCount(0)
})

test('the history lists the days newest first, with their focus totals and the tasks finished on them', async ({
  app,
}) => {
  await app.openWithHistory()
  await app.historyToggle.click()
  await expect(app.historyDays).toHaveText(
    [
      'Today 25 min focused · 1 pomodoro',
      'Yesterday 25 min focused · 1 pomodoro',
      'Mon, Oct 19 25 min focused · 1 pomodoro',
      'Sun, Oct 18 25 min focused · 1 pomodoro',
    ],
    { useInnerText: true },
  )
  await expect(
    app.history.getByRole('region', { name: /^Mon, Oct 19/ }),
    'a day with focus time but no finished task',
  ).toContainText('No tasks finished')
  await app.expectHistory(['Done today', 'Old task from yesterday', 'Older task'])

  await app.historyToggle.click()
  await expect(app.historyDays).toHaveCount(0)
})

test('a finished task shows its sessions, and its focus time of all days against the estimate, under the day it was finished', async ({
  app,
}) => {
  await app.openWithHistory()
  await app.historyToggle.click()
  const yesterday = app.history.getByRole('region', { name: /^Yesterday/ })
  await expect(yesterday.getByRole('heading'), 'the day total only has the focus time of that day').toHaveText(
    'Yesterday 25 min focused · 1 pomodoro',
    { useInnerText: true },
  )
  await expect(yesterday.getByRole('listitem')).toContainText('2 sessions · 50 min / 25 min')
})

test('the tasks of a day are listed in the order they were finished', async ({ app }) => {
  await app.open()
  await app.addTasks([{ title: 'Write report' }, { title: 'Review pull requests' }, { title: 'Plan sprint' }])
  await app.button('Finish Plan sprint').click()
  await app.button('Finish Write report').click()
  await app.historyToggle.click()
  await app.expectHistory(['Plan sprint', 'Write report'])
})

test('days of an earlier year show the year', async ({ app }) => {
  await app.page.clock.setSystemTime(new Date('2025-12-25T10:00:00+01:00'))
  await app.open()
  await app.addTasks([{ title: 'Last year' }])
  await app.button('Finish Last year').click()
  await app.page.clock.pauseAt(NOW)
  await app.historyToggle.click()
  await expect(app.historyDays).toHaveText(['Thu, Dec 25, 2025 0 min focused · 0 pomodoros'], {
    useInnerText: true,
  })
})

test('a finished task moves to the history right away', async ({ app }) => {
  await app.open()
  await app.addTasks([{ title: 'Write report' }])
  await expect(app.historyToggle, 'no history before a task is finished').toBeHidden()
  await app.button('Finish Write report').click()

  await app.expectTasks([])
  await app.historyToggle.click()
  await expect(app.historyDays).toHaveText(['Today 0 min focused · 0 pomodoros'], { useInnerText: true })
  await app.expectHistory(['Write report'])
})

test('a day with focus time shows up in the history, also without a finished task', async ({ app }) => {
  await app.open()
  await expect(app.historyToggle).toBeHidden()
  await app.run(MINUTE)
  await app.mainButton.click()
  await expect(app.historyToggle).toHaveText('History · 0 tasks, 1 day')
})

test('at midnight, Today becomes Yesterday and the summary starts a new day', async ({ app }) => {
  await app.openWithHistory()
  await expect(app.todaySummary).toHaveText('Today 25 min focused · 1 pomodoro')
  await app.historyToggle.click()

  await app.page.clock.fastForward(new Date('2026-10-22T00:00:05+02:00').getTime() - NOW)
  await expect(app.historyDays.first()).toHaveText('Yesterday 25 min focused · 1 pomodoro', { useInnerText: true })
  await expect(app.todaySummary).toHaveText('Today 0 min focused · 0 pomodoros')
})

test('a focus session across midnight splits its focus time between the two days', async ({ app }) => {
  await app.page.clock.pauseAt(new Date('2026-10-21T23:50:00+02:00'))
  await app.open()
  await app.startButton.click()
  await app.page.clock.fastForward(FOCUS_SESSION)
  await app.expectMode('short')

  await expect(app.todaySummary, 'the pomodoro counts for the day it ends on').toHaveText(
    'Today 15 min focused · 1 pomodoro',
  )
  await app.historyToggle.click()
  await expect(app.historyDays).toHaveText(
    ['Today 15 min focused · 1 pomodoro', 'Yesterday 10 min focused · 0 pomodoros'],
    { useInnerText: true },
  )
})

test('a session that ended yesterday while the app was closed counts for yesterday', async ({ app }) => {
  await app.page.clock.setSystemTime(NOW - DAY)
  await app.open()
  await app.run(MINUTE)
  await app.reopenAt(NOW)

  await expect(app.todaySummary).toHaveText('Today 0 min focused · 0 pomodoros')
  await app.historyToggle.click()
  await expect(app.historyDays).toHaveText(['Yesterday 25 min focused · 1 pomodoro'], { useInnerText: true })
})

test.describe('in a browser set to another language', () => {
  test.use({ locale: 'de-DE' })

  test('the days are written in the language of the app', async ({ app }) => {
    await app.openWithHistory()
    await app.historyToggle.click()
    await expect(app.historyDays.nth(2)).toHaveText('Mon, Oct 19 25 min focused · 1 pomodoro', { useInnerText: true })
  })
})

test.describe('keyboard shortcuts', () => {
  test('H shows and hides the history', async ({ app }) => {
    await app.openWithHistory()
    await app.shortcut('h')
    await expect(app.historyDays).toHaveCount(4)
    await expect(app.historyToggle).toBeFocused()
    await app.shortcut('h')
    await expect(app.historyDays).toHaveCount(0)
  })

  test('H without any history says so', async ({ app }) => {
    await app.open()
    await app.shortcut('h')
    await expect(app.snackbar).toHaveText('No history yet. Finished tasks show up here.')
  })
})
