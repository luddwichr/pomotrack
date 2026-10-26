import { expect, test } from './support/fixtures'
import { DAY, FOCUS_SESSION, MINUTE } from './support/state'

test.describe('adding tasks', () => {
  test('tasks are added with an estimate in minutes, and none of them is worked on by itself', async ({ app }) => {
    await app.open()
    await expect(app.page.getByText('No tasks yet.')).toBeVisible()
    await expect(app.currentTask).toHaveText('Add a task to track time on it.')

    await app.addTaskButton.click()
    const title = app.titleField(app.addForm)
    await expect(title).toBeFocused()
    await app.addTask('Write report', { est: 75 })
    await expect(title, 'the form stays open for the next task').toBeFocused()
    await expect(title).toHaveValue('')
    await app.addTask('Review pull requests')
    await app.addTask('Plan sprint')
    await title.press('Escape')
    await expect(app.addForm).toBeHidden()
    await expect(app.addTaskButton).toBeFocused()

    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
    await expect(app.task('Write report')).toContainText('0 min / 1 h 15 min')
    await expect(app.task('Write report')).toContainText('0 sessions')
    for (const title of ['Write report', 'Review pull requests', 'Plan sprint', 'Other'])
      await expect(app.workButton(title)).toHaveAttribute('aria-pressed', 'false')
    await expect(app.currentTask).toHaveText('Choose a task to track time on it.')
    await expect(app.finishButton).toBeHidden()
  })

  test('a task needs a title', async ({ app }) => {
    await app.open()
    await app.addTaskButton.click()
    const title = app.titleField(app.addForm)
    await title.fill('   ')
    await title.press('Enter')
    await expect(title).toHaveAttribute('aria-invalid', 'true')
    await expect(title).toBeFocused()
    await app.expectTasks([])
  })

  test('the estimate goes from 0 to 720 minutes in steps of 5, and 0 means no estimate', async ({ app }) => {
    await app.open()
    await app.addTaskButton.click()
    const estimate = app.estimateField(app.addForm)
    await expect(estimate, 'one focus session by default').toHaveValue('25')
    await app.addForm.getByRole('button', { name: '5 minutes more' }).click()
    await expect(estimate).toHaveValue('30')
    await estimate.fill('5')
    await app.addForm.getByRole('button', { name: '5 minutes less' }).click()
    await app.addForm.getByRole('button', { name: '5 minutes less' }).click()
    await expect(estimate).toHaveValue('0')
    await app.titleField(app.addForm).fill('No estimate')
    await app.addForm.getByRole('button', { name: 'Add task' }).click()
    await expect(app.workButton('No estimate')).toHaveAccessibleDescription('0 min tracked, 0 sessions')

    await estimate.fill('720')
    await app.addForm.getByRole('button', { name: '5 minutes more' }).click()
    await expect(estimate).toHaveValue('720')

    await app.addTask('Typed too high', { est: 1000 })
    await expect(app.workButton('Typed too high')).toHaveAccessibleDescription(
      '0 min tracked of 12 h estimated, 0 sessions',
    )
  })

  test('adding a task keeps what is worked on', async ({ app }) => {
    await app.open()
    await app.addTasks([{ title: 'Write report' }])
    await app.workOn('Write report')
    await app.addTasks([{ title: 'Plan sprint' }])
    await expect(app.currentTask).toHaveText('Working on Write report')
  })

  test('added tasks are kept after a reload', async ({ app }) => {
    await app.openWithTasks()
    await app.page.reload()
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
    await expect(app.currentTask).toHaveText('Working on Write report')
  })
})

test.describe('working on a task', () => {
  test('only the Work on button of a task starts working on it, and pressing it again stops', async ({ app }) => {
    await app.openWithTasks()
    await app.task('Plan sprint').getByText('Plan sprint').click()
    await expect(app.currentTask, 'a click on the task itself changes nothing').toHaveText('Working on Write report')

    await app.workButton('Plan sprint').click()
    await expect(app.workButton('Plan sprint')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.workButton('Write report')).toHaveAttribute('aria-pressed', 'false')
    await expect(app.currentTask).toHaveText('Working on Plan sprint')
    await expect(app.announcer).toHaveText('Working on Plan sprint')

    await app.workButton('Plan sprint').click()
    await expect(app.workButton('Plan sprint')).toHaveAttribute('aria-pressed', 'false')
    await expect(app.currentTask).toHaveText('Choose a task to track time on it.')
    await expect(app.finishButton).toBeHidden()
  })

  test('what is worked on is kept after a reload', async ({ app }) => {
    await app.openWithTasks()
    await app.workOn('Plan sprint')
    await app.page.reload()
    await expect(app.currentTask).toHaveText('Working on Plan sprint')
    await app.workOn('Other')
    await app.page.reload()
    await expect(app.currentTask).toHaveText('Working on Other')
  })

  test('Other is always there, also without tasks, and can be worked on like a task', async ({ app }) => {
    await app.open()
    await expect(app.workButton('Other')).toHaveAccessibleDescription('Today 0 min tracked, 0 sessions')
    await app.workOn('Other')
    await expect(app.workButton('Other')).toHaveAttribute('aria-pressed', 'true')
    await expect(app.finishButton, 'Other cannot be finished').toBeHidden()
    await app.addTasks([{ title: 'Write report' }])
    await app.workOn('Write report')
    await expect(app.workButton('Other')).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('editing tasks', () => {
  test('tasks can be edited, and Escape or Cancel discards the changes', async ({ app }) => {
    await app.openWithTasks()
    const edit = app.button('Edit Plan sprint')
    await edit.click()
    const title = app.titleField(app.editForm)
    await expect(title).toBeFocused()
    await title.fill('Plan next sprint')
    await title.press('Escape')
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
    await expect(edit).toBeFocused()

    await edit.click()
    await title.fill('Plan next sprint')
    await app.editForm.getByRole('button', { name: 'Cancel' }).click()
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])

    await edit.click()
    await title.fill('Plan next sprint')
    await title.press('Enter')
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan next sprint'])
    await expect(app.button('Edit Plan next sprint'), 'focus returns to the Edit button').toBeFocused()

    await app.button('Edit Write report').click()
    await expect(app.estimateField(app.editForm)).toHaveValue('75')
    await app.estimateField(app.editForm).fill('90')
    await app.editForm.getByRole('button', { name: 'Save' }).click()
    await expect(app.task('Write report')).toContainText('0 min / 1 h 30 min')
  })

  test('renaming the current task renames it under the timer', async ({ app }) => {
    await app.openWithTasks()
    await app.button('Edit Write report').click()
    await app.titleField(app.editForm).fill('Write the report')
    await app.titleField(app.editForm).press('Enter')
    await expect(app.currentTask).toHaveText('Working on Write the report')
  })

  test('several tasks can be edited at once, without losing what was typed', async ({ app }) => {
    await app.openWithTasks()
    await app.button('Edit Plan sprint').click()
    await app.titleField(app.editForm).fill('Plan next sprint')
    await app.button('Edit Write report').click()
    await expect(app.editForm).toHaveCount(2)
    await expect(app.titleField(app.editForm.nth(1))).toHaveValue('Plan next sprint')
  })

  test('an edit form keeps what was typed when the session ends', async ({ app }) => {
    await app.openWithTasks()
    await app.pauseClock()
    await app.startButton.click()
    await app.button('Edit Write report').click()
    await app.titleField(app.editForm).fill('Write the report')
    await app.page.clock.fastForward(FOCUS_SESSION)
    await app.expectMode('short')
    await expect(app.titleField(app.editForm)).toHaveValue('Write the report')
    await expect(app.titleField(app.editForm)).toBeFocused()
  })

  test('shortcuts are paused while typing in a text field', async ({ app }) => {
    await app.open()
    await app.addTaskButton.click()
    await app.titleField(app.addForm).pressSequentially('s f 1 2 ?')
    await app.expectMode('focus')
    await expect(app.titleField(app.addForm)).toHaveValue('s f 1 2 ?')
  })

  test('shortcuts are paused anywhere in a task form, also on its buttons', async ({ app }) => {
    await app.openWithTasks()
    await app.button('Edit Write report').click()
    await app.editForm.getByRole('button', { name: '5 minutes more' }).focus()
    await app.page.keyboard.press('f')
    await app.page.keyboard.press('s')
    await expect(app.currentTask, 'F did not finish the task being edited').toHaveText('Working on Write report')
    await expect(app.editForm).toBeVisible()
    await app.expectMode('focus')
  })
})

test.describe('finishing tasks', () => {
  test('finishing the task worked on during a session moves it to the history, and nothing is worked on until the user chooses', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.run(10 * MINUTE)
    await app.finishButton.click()

    await expect(app.snackbar).toHaveText('Finished "Write report"')
    await expect(app.currentTask).toHaveText('Choose a task to track time on it.')
    await expect(app.finishButton).toBeHidden()
    const next = app.workButton('Review pull requests')
    await expect(next, 'focus moves to the open tasks, so the next one can be chosen').toBeFocused()
    await expect(next).toHaveAttribute('aria-pressed', 'false')
    await expect(app.mainButton, 'the timer keeps running').toHaveText('Skip')
    await app.expectTasks(['Review pull requests', 'Plan sprint'])
    await app.historyToggle.click()
    await app.expectHistory(['Write report'])
    await expect(app.historyItem('Write report')).toContainText('1 session · 10 min / 1 h 15 min')
  })

  test('the Finish button of a row moves that task to the history, and focus moves to the next row', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.button('Finish Review pull requests').click()
    await app.expectTasks(['Write report', 'Plan sprint'])
    await expect(app.button('Finish Plan sprint')).toBeFocused()
    await expect(app.currentTask, 'the work on the other task goes on').toHaveText('Working on Write report')
    await expect(app.historyToggle).toHaveText('History · 1 task, 1 day')
  })

  test('a double click on Finish finishes one task', async ({ app }) => {
    await app.openWithTasks()
    await app.finishButton.dblclick()
    await app.expectTasks(['Review pull requests', 'Plan sprint'])

    await app.button('Finish Review pull requests').dblclick()
    await app.expectTasks(['Plan sprint'])
  })

  test('finishing a task closes its edit form without saving the changes', async ({ app }) => {
    await app.openWithTasks()
    await app.button('Edit Write report').click()
    await app.titleField(app.editForm).fill('Write the report')
    await app.finishButton.click()
    await expect(app.editForm).toHaveCount(0)
    await app.historyToggle.click()
    await app.expectHistory(['Write report'])
  })

  test('after the last open task is finished, nothing is worked on and focus moves to Add task', async ({ app }) => {
    await app.open()
    await app.addTasks([{ title: 'Write report' }])
    await app.workOn('Write report')
    await app.finishButton.focus()
    await app.page.keyboard.press('Enter')
    await expect(app.currentTask).toHaveText('Add a task to track time on it.')
    await expect(app.finishButton).toBeHidden()
    await expect(app.page.getByText('No open tasks. Add one to keep tracking.')).toBeVisible()
    await expect(app.addTaskButton).toBeFocused()

    await app.shortcut('f')
    await expect(app.snackbar).toHaveText('No current task to finish.')
  })
})

test.describe('deleting tasks', () => {
  test('a deleted task leaves the list, also after a reload, and focus moves to the task that took its place', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.button('Delete Review pull requests').click()
    await app.expectTasks(['Write report', 'Plan sprint'])
    await expect(app.snackbar).toHaveText('Deleted "Review pull requests"')
    await expect(app.button('Delete Plan sprint')).toBeFocused()

    await app.button('Delete Plan sprint').click()
    await expect(app.button('Delete Write report'), 'the last row hands focus to the row above').toBeFocused()
    await app.button('Delete Write report').click()
    await expect(app.addTaskButton).toBeFocused()
    await expect(app.page.getByText('No tasks yet.')).toBeVisible()

    await app.page.reload()
    await app.expectTasks([])
  })

  test('a double click on Delete deletes one task, not the one that takes its place', async ({ app }) => {
    await app.openWithTasks()
    await app.button('Delete Write report').dblclick()
    await app.expectTasks(['Review pull requests', 'Plan sprint'])
  })

  test('holding Enter on a Delete button deletes one task', async ({ app }) => {
    await app.openWithTasks()
    await app.button('Delete Write report').focus()
    // Pressing a key that is already down sends a repeated key press
    await app.page.keyboard.down('Enter')
    await app.page.keyboard.down('Enter')
    await app.page.keyboard.up('Enter')
    await app.expectTasks(['Review pull requests', 'Plan sprint'])
  })

  test('deleting the task worked on stops the work on it, like finishing it', async ({ app }) => {
    await app.openWithTasks()
    await app.workOn('Review pull requests')
    await app.button('Delete Review pull requests').click()
    await expect(app.snackbar).toHaveText('Deleted "Review pull requests"')
    await expect(app.currentTask).toHaveText('Choose a task to track time on it.')
  })

  test('the focus time and pomodoros of a deleted task stay in the totals of the day', async ({ app }) => {
    await app.openWithTasks()
    await app.completeFocusSession()
    await app.run(10 * MINUTE)
    await app.button('Delete Write report').click()
    await expect(app.todaySummary).toHaveText('Today 35 min focused · 1 pomodoro')
  })
})

test.describe('reordering tasks', () => {
  test('tasks can be reordered with the arrow keys on the drag handle', async ({ app }) => {
    await app.openWithTasks()
    const handle = app.button('Move Plan sprint')
    await handle.focus()
    await handle.press('ArrowUp')
    await app.expectTasks(['Write report', 'Plan sprint', 'Review pull requests'])
    await expect(handle).toBeFocused()
    await expect(app.announcer).toHaveText('Moved to position 2 of 3')

    await handle.press('ArrowDown')
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
  })

  test('tasks can be reordered by dragging the handle, and the order is kept', async ({ app }) => {
    await app.openWithTasks()
    await app.dragTask('Write report', 'Plan sprint', 0.8)
    await app.expectTasks(['Review pull requests', 'Plan sprint', 'Write report'])
    await app.dragTask('Write report', 'Review pull requests', 0.1)
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
    await app.dragTask('Review pull requests', 'Plan sprint', 0.8)

    await app.page.reload()
    await app.expectTasks(['Write report', 'Plan sprint', 'Review pull requests'])
  })

  test('reordering does not change what is worked on', async ({ app }) => {
    await app.openWithTasks()
    await app.dragTask('Write report', 'Plan sprint', 0.8)
    await expect(app.currentTask).toHaveText('Working on Write report')
  })

  test('dragging a task to just below the top bar scrolls the page up', async ({ app }) => {
    await app.page.setViewportSize({ width: 390, height: 600 })
    await app.openWithTasks()
    await app.page.mouse.wheel(0, 2000)
    await expect.poll(() => app.page.evaluate(() => scrollY)).toBeGreaterThan(0)
    const scrolled = await app.page.evaluate(() => scrollY)
    const bar = await app.page.getByRole('banner').boundingBox()
    await app.dragTask('Plan sprint', 'Plan sprint', 0.5, async () => {
      const x = (await app.button('Move Plan sprint').boundingBox())!.x + 10
      await app.page.mouse.move(x, bar!.y + bar!.height + 20, { steps: 8 })
      await expect.poll(() => app.page.evaluate(() => scrollY)).toBeLessThan(scrolled)
    })
  })

  test('a drag released outside the list ends there, and the list keeps updating', async ({ app }) => {
    await app.openWithTasks()
    await app.dragTask('Write report', 'Plan sprint', 0.8, async () => {
      const region = await app.timerRegion.boundingBox()
      if (region) await app.page.mouse.move(region.x + 10, region.y + region.height - 10, { steps: 4 })
    })
    await app.expectTasks(['Review pull requests', 'Plan sprint', 'Write report'])
    await app.addTasks([{ title: 'Fix login bug' }])
    await app.expectTasks(['Review pull requests', 'Plan sprint', 'Write report', 'Fix login bug'])
  })

  test('a drag is cancelled when the window loses focus', async ({ app }) => {
    await app.openWithTasks()
    await app.dragTask('Write report', 'Plan sprint', 0.8, async () => {
      await app.page.evaluate(() => window.dispatchEvent(new Event('blur')))
    })
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
    await app.addTasks([{ title: 'Fix login bug' }])
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint', 'Fix login bug'])
  })

  test('a session that ends during a drag does not disturb the drag', async ({ app }) => {
    await app.openWithTasks()
    await app.run(FOCUS_SESSION - 5_000)
    await app.dragTask('Write report', 'Plan sprint', 0.8, async () => {
      await app.page.clock.fastForward(10_000)
      await app.expectMode('short')
    })

    await app.expectTasks(['Review pull requests', 'Plan sprint', 'Write report'])
    await expect(app.task('Write report'), 'the row shows the time of the ended session').toContainText(
      '25 min / 1 h 15 min',
    )
  })
})

test.describe('time tracking', () => {
  test('a finished focus session is credited to the task worked on and to the day', async ({ app }) => {
    await app.openWithTasks()
    await app.run()

    await app.expectMode('short')
    await expect(app.task('Write report')).toContainText('25 min / 1 h 15 min')
    await expect(app.task('Write report')).toContainText('1 session')
    await expect(app.todaySummary).toHaveText('Today 25 min focused · 1 pomodoro')
  })

  test('the totals count up while a session runs', async ({ app }) => {
    await app.openWithTasks()
    // A finished task, so that the history shows, with today in it
    await app.addTasks([{ title: 'Done' }])
    await app.button('Finish Done').click()
    await app.historyToggle.click()
    await app.run(10 * MINUTE)

    await expect(app.task('Write report')).toContainText('10 min')
    await expect(app.todaySummary).toHaveText('Today 10 min focused · 0 pomodoros')
    await expect(app.historyDays).toHaveText(['Today 10 min focused · 0 pomodoros'], { useInnerText: true })
  })

  test('a task counts each focus session it got time in once, also when it got only part of it', async ({ app }) => {
    await app.openWithTasks()
    await app.run(10 * MINUTE)
    await app.workOn('Plan sprint')
    await app.page.clock.fastForward(5 * MINUTE)
    await app.workOn('Write report')
    await app.page.clock.fastForward(10 * MINUTE)
    await app.expectMode('short')
    await app.skipButton.click()
    await app.workOn('Plan sprint')
    await app.run(5 * MINUTE)

    await expect(app.task('Write report')).toContainText('20 min / 1 h 15 min')
    await expect(app.task('Write report')).toContainText('1 session')
    await expect(app.task('Plan sprint')).toContainText('10 min / 25 min')
    await expect(app.task('Plan sprint')).toContainText('2 sessions')
    await expect(app.task('Review pull requests')).toContainText('0 sessions')
    await expect(app.todaySummary).toHaveText('Today 30 min focused · 1 pomodoro')
  })

  test('focus time on Other counts for Other on that day, with the sessions it got time in', async ({ app }) => {
    await app.openWithTasks()
    await app.workOn('Other')
    await app.run(10 * MINUTE)
    await expect(app.workButton('Other')).toHaveAccessibleDescription('Today 10 min tracked, 1 session')
    await expect(app.todaySummary).toHaveText('Today 10 min focused · 0 pomodoros')

    await app.historyToggle.click()
    await app.expectHistory(['Other'])
    await expect(app.historyItem('Other')).toContainText('1 session · 10 min')
    await expect(app.historyToggle, 'Other is not a finished task').toHaveText('History · 0 tasks, 1 day')

    await app.page.clock.fastForward(DAY)
    await expect(app.workButton('Other'), 'a new day starts at 0').toHaveAccessibleDescription(
      'Today 0 min tracked, 0 sessions',
    )
    await expect(app.historyItem('Other'), 'the session went on until its end').toContainText('1 session · 25 min')
  })

  test('without anything worked on, focus time and pomodoros count only for the day', async ({ app }) => {
    await app.openWithTasks()
    await app.workButton('Write report').click()
    await app.run()
    await app.expectMode('short')
    await expect(app.todaySummary).toHaveText('Today 25 min focused · 1 pomodoro')
    await expect(app.task('Write report')).toContainText('0 sessions')
    await expect(app.workButton('Other')).toHaveAccessibleDescription('Today 0 min tracked, 0 sessions')
  })

  test('tracked time is shown rounded to whole minutes', async ({ app }) => {
    await app.open()
    await app.addTasks([{ title: 'Almost 25' }, { title: 'Just over 24' }, { title: 'Half a minute' }])
    for (const [title, ms] of [
      ['Almost 25', 24 * MINUTE + 30_000],
      ['Just over 24', 24 * MINUTE + 29_000],
      ['Half a minute', 29_000],
    ] as const) {
      await app.workOn(title)
      await app.run(ms)
      await app.mainButton.click()
      await app.skipButton.click()
    }
    await expect(app.task('Almost 25')).toContainText('25 min')
    await expect(app.task('Just over 24')).toContainText('24 min')
    await expect(app.task('Half a minute')).toContainText('<1 min')
    await expect(app.todaySummary).toHaveText('Today 49 min focused · 0 pomodoros')
  })
})

test.describe('keyboard shortcuts', () => {
  test('N opens the form for a new task', async ({ app }) => {
    await app.open()
    await app.shortcut('n')
    await expect(app.titleField(app.addForm)).toBeFocused()
  })

  test('J and K work on the next and previous open task, skip finished ones, and wrap around over Other', async ({
    app,
  }) => {
    await app.open()
    await app.addTasks([
      { title: 'Write report' },
      { title: 'Done' },
      { title: 'Review pull requests' },
      { title: 'Plan sprint' },
    ])
    await app.button('Finish Done').click()
    await app.workOn('Write report')
    await app.shortcut('j')
    await expect(app.currentTask).toHaveText('Working on Review pull requests')
    await app.shortcut('k')
    await expect(app.currentTask).toHaveText('Working on Write report')
    await app.shortcut('k')
    await expect(app.currentTask).toHaveText('Working on Other')
    await app.shortcut('k')
    await expect(app.currentTask).toHaveText('Working on Plan sprint')
    await app.shortcut('j')
    await app.shortcut('j')
    await expect(app.currentTask).toHaveText('Working on Write report')
  })

  test('without anything worked on, J works on the first open task and K on Other', async ({ app }) => {
    await app.open()
    await app.addTasks([{ title: 'Write report' }, { title: 'Review pull requests' }])
    await app.shortcut('k')
    await expect(app.currentTask).toHaveText('Working on Other')
    await app.workButton('Other').click()
    await app.shortcut('j')
    await expect(app.currentTask).toHaveText('Working on Write report')
  })

  test('F finishes the current task', async ({ app }) => {
    await app.openWithTasks()
    await app.shortcut('f')
    await expect(app.snackbar).toHaveText('Finished "Write report"')
    await app.expectTasks(['Review pull requests', 'Plan sprint'])
  })

  test('Space starts the interval after work on a task was started, or a task was finished or deleted with the mouse', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.workOn('Plan sprint')
    await app.page.keyboard.press('Space')
    await expect(app.mainButton).toHaveText('Skip')

    // Focus moves to the same button in the next row, where Space must not finish or delete that task too
    await app.button('Finish Write report').click()
    await app.page.keyboard.press('Space')
    await app.button('Delete Review pull requests').click()
    await app.page.keyboard.press('Space')
    await app.expectTasks(['Plan sprint'])
    await app.expectMode('focus', 'Space does not skip the running session')
  })

  test('key combinations with Ctrl, Alt or Cmd are left to the browser', async ({ app }) => {
    await app.openWithTasks()
    for (const key of ['ControlOrMeta+f', 'Alt+f', 'Alt+s']) await app.shortcut(key)
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
    await app.expectMode('focus')
  })
})
