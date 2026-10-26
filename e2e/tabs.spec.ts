import { expect, recordChimes, recordNotifications, test } from './support/fixtures'
import { FOCUS_SESSION, MINUTE } from './support/state'

// All open tabs of the app share one state. A change in one tab shows up in the others.

test('a change in one tab shows up in the other tabs', async ({ app }) => {
  await app.openWithTasks()
  const otherTab = await app.openOtherTab()

  await app.button('Delete Plan sprint').click()
  await otherTab.expectTasks(['Write report', 'Review pull requests'])
  await otherTab.workOn('Review pull requests')
  await expect(app.currentTask).toHaveText('Working on Review pull requests')
  await otherTab.setTime('15')
  await expect(app.time).toHaveText('15:00')
})

test('an interval started in one tab runs in the others', async ({ app }) => {
  await app.openWithTasks()
  const otherTab = await app.openOtherTab()
  await app.pauseClock()
  await app.startButton.click()
  await app.page.clock.fastForward(MINUTE)
  await expect(otherTab.mainButton).toHaveText('Skip')
  await expect(otherTab.time).toHaveText('24:00')
})

test('when a session ends, the focused tab plays the chime and every tab shows the message', async ({
  app,
  context,
}) => {
  await context.grantPermissions(['notifications'])
  const notificationsHere = await recordNotifications(app.page, { windowFocused: true })
  const chimesHere = await recordChimes(app.page)
  await app.openWithTasks()
  await app.turnOnNotifications()
  let notificationsThere = async () => [] as unknown[]
  let chimesThere = async () => 0
  const otherTab = await app.openOtherTab(async (page) => {
    notificationsThere = await recordNotifications(page)
    chimesThere = await recordChimes(page)
  })
  // A click allows sound in the other tab too, so it could play the chime
  await otherTab.page.getByRole('heading', { name: 'Tasks' }).click()

  await app.startButton.click()
  await app.page.clock.fastForward(FOCUS_SESSION)
  for (const tab of [app, otherTab]) {
    await tab.expectMode('short')
    await expect(tab.snackbar).toHaveText('Focus session done. Time for a short break.')
    await expect(tab.todaySummary, 'the session counts once').toHaveText('Today 25 min focused · 1 pomodoro')
    await expect(tab.task('Write report')).toContainText('25 min / 1 h 15 min')
  }
  expect(await chimesHere()).toBe(1)
  expect(await chimesThere()).toBe(0)
  expect(await notificationsHere(), 'the user is looking at the app').toEqual([])
  expect(await notificationsThere()).toEqual([])
})

test('when a session ends while no tab of the app has focus, one notification is sent', async ({ app, context }) => {
  await context.grantPermissions(['notifications'])
  const notificationsHere = await recordNotifications(app.page)
  await app.open()
  await app.turnOnNotifications()
  let notificationsThere = async () => [] as unknown[]
  const otherTab = await app.openOtherTab(async (page) => {
    notificationsThere = await recordNotifications(page)
  })

  await app.startButton.click()
  await app.page.clock.fastForward(FOCUS_SESSION)
  await app.expectMode('short')
  await otherTab.expectMode('short')
  await app.page.clock.runFor(2_000)
  expect([...(await notificationsHere()), ...(await notificationsThere())]).toEqual([
    { title: 'Focus session done', body: 'Time for a short break.' },
  ])
})

test('an open edit form keeps what was typed when another tab changes its task', async ({ app }) => {
  await app.openWithTasks()
  const otherTab = await app.openOtherTab()

  await app.button('Edit Plan sprint').click()
  await app.titleField(app.editForm).fill('Plan next sprint')
  await otherTab.button('Edit Plan sprint').click()
  await otherTab.titleField(otherTab.editForm).fill('Plan the sprint')
  await otherTab.titleField(otherTab.editForm).press('Enter')

  await expect(app.titleField(app.editForm)).toHaveValue('Plan next sprint')
  await app.titleField(app.editForm).press('Enter')
  await app.expectTasks(['Write report', 'Review pull requests', 'Plan next sprint'])
  await otherTab.expectTasks(['Write report', 'Review pull requests', 'Plan next sprint'])
})

test('an open edit form keeps the focus when another tab removes a task above it', async ({ app }) => {
  await app.openWithTasks()
  const otherTab = await app.openOtherTab()

  await app.button('Edit Plan sprint').click()
  await app.titleField(app.editForm).fill('Plan next')
  await otherTab.button('Delete Write report').click()
  await expect(app.task('Write report')).toHaveCount(0)
  await expect(app.titleField(app.editForm)).toBeFocused()
  await app.page.keyboard.type(' sprint')
  await expect(app.titleField(app.editForm)).toHaveValue('Plan next sprint')
  await app.expectMode('focus', 'the S typed into the form was not taken for the Skip shortcut')
})

test('an open edit form closes when another tab finishes or deletes its task', async ({ app }) => {
  await app.openWithTasks()
  const otherTab = await app.openOtherTab()

  await app.button('Edit Plan sprint').click()
  await app.button('Edit Review pull requests').click()
  await expect(app.editForm).toHaveCount(2)
  await otherTab.button('Finish Plan sprint').click()
  await otherTab.button('Delete Review pull requests').click()

  await app.expectTasks(['Write report'])
  await expect(app.editForm).toHaveCount(0)
})

test('when the interval starts in another tab while its time is being changed, the typed time is discarded', async ({
  app,
}) => {
  await app.open()
  const otherTab = await app.openOtherTab()

  await app.time.click()
  await app.timeInput.fill('3')
  await otherTab.startButton.click()

  await expect(app.mainButton).toHaveText('Skip')
  await expect(app.timeInput).toBeHidden()
  await expect(app.time).toHaveText(/^2[45]:\d\d$/)
  await expect(app.mainButton, 'focus moves from the disabled time to the main button').toBeFocused()
})

test('deleting all data in one tab clears the others, also a running session', async ({ app }) => {
  await app.openWithTasks()
  await app.pauseClock()
  await app.startButton.click()
  const otherTab = await app.openOtherTab()
  await otherTab.deleteAllData()

  await app.expectTasks([])
  await expect(app.mainButton).toHaveText('Start')
  await app.page.clock.fastForward(FOCUS_SESSION)
  await expect(app.todaySummary, 'the session that was running is gone').toHaveText('Today 0 min focused · 0 pomodoros')
  await app.page.reload()
  await app.expectTasks([])
})
