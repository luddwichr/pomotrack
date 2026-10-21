import { expect, test } from './support/fixtures'
import { FOCUS_SESSION, MINUTE } from './support/state'

test.describe('adding tasks', () => {
  test('tasks are added with an estimate and notes, and the first one becomes current', async ({ app }) => {
    await app.open()
    await expect(app.page.getByText('No tasks yet.')).toBeVisible()
    await expect(app.currentTask).toHaveText('Add a task to track time on it.')

    await app.addTaskButton.click()
    const title = app.titleField(app.addForm)
    await expect(title).toBeFocused()
    await app.addTask('Write report', { est: 3, notes: 'Intro and numbers' })
    await expect(title, 'the form stays open for the next task').toBeFocused()
    await expect(title).toHaveValue('')
    await app.addTask('Review pull requests')
    await app.addTask('Plan sprint')
    await title.press('Escape')
    await expect(app.addForm).toBeHidden()
    await expect(app.addTaskButton).toBeFocused()

    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
    await expect(app.task('Write report')).toContainText('0/3')
    await expect(app.task('Write report')).toContainText('Intro and numbers')
    await expect(app.task('Write report').getByRole('radio')).toBeChecked()
    await expect(app.currentTask).toHaveText('Working on Write report')
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

  test('the estimate goes from 0 to 99 pomodoros, and 0 means no estimate', async ({ app }) => {
    await app.open()
    await app.addTaskButton.click()
    const estimate = app.estimateField(app.addForm)
    await expect(estimate, 'one pomodoro by default').toHaveValue('1')
    await app.addForm.getByRole('button', { name: 'One less' }).click()
    await app.addForm.getByRole('button', { name: 'One less' }).click()
    await expect(estimate).toHaveValue('0')
    await app.titleField(app.addForm).fill('No estimate')
    await app.addForm.getByRole('button', { name: 'Add task' }).click()
    await expect(app.task('No estimate').getByRole('radio')).toHaveAccessibleDescription(/^0 pomodoros/)

    await estimate.fill('99')
    await app.addForm.getByRole('button', { name: 'One more' }).click()
    await expect(estimate).toHaveValue('99')

    await app.addTask('Typed too high', { est: 150 })
    await expect(app.task('Typed too high')).toContainText('0/99')
  })

  test('Ctrl+Enter in the notes adds the task', async ({ app }) => {
    await app.open()
    await app.addTaskButton.click()
    await app.titleField(app.addForm).fill('Write report')
    await app.addForm.getByRole('textbox', { name: 'Notes' }).fill('Intro')
    await app.addForm.getByRole('textbox', { name: 'Notes' }).press('ControlOrMeta+Enter')
    await app.expectTasks(['Write report'])
  })

  test('a new task becomes current only when there is no open task', async ({ app }) => {
    await app.open()
    await app.addTasks([{ title: 'Write report' }, { title: 'Review pull requests' }])
    await expect(app.currentTask).toHaveText('Working on Write report')

    await app.finishButton.click()
    await app.finishButton.click()
    await expect(app.currentTask).toHaveText('Add a task to track time on it.')
    await app.addTasks([{ title: 'Plan sprint' }])
    await expect(app.currentTask).toHaveText('Working on Plan sprint')
  })

  test('added tasks are kept after a reload', async ({ app }) => {
    await app.openWithTasks()
    await app.page.reload()
    await app.expectTasks(['Write report', 'Review pull requests', 'Plan sprint'])
    await expect(app.task('Write report')).toContainText('Intro and numbers')
    await expect(app.currentTask).toHaveText('Working on Write report')
  })
})

test.describe('current task', () => {
  test('clicking a task makes it the current one', async ({ app }) => {
    await app.openWithTasks()
    await app.task('Plan sprint').getByText('Plan sprint').click()
    await expect(app.task('Plan sprint').getByRole('radio')).toBeChecked()
    await expect(app.currentTask).toHaveText('Working on Plan sprint')
  })

  test('the current task is kept after a reload', async ({ app }) => {
    await app.openWithTasks()
    await app.selectTask('Plan sprint')
    await app.page.reload()
    await expect(app.currentTask).toHaveText('Working on Plan sprint')
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
    await app.estimateField(app.editForm).fill('5')
    await app.editForm.getByRole('textbox', { name: 'Notes' }).fill('')
    await app.editForm.getByRole('button', { name: 'Save' }).click()
    await expect(app.task('Write report')).toContainText('0/5')
    await expect(app.task('Write report')).not.toContainText('Intro and numbers')
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
    await app.editForm.getByRole('button', { name: 'One more' }).focus()
    await app.page.keyboard.press('f')
    await app.page.keyboard.press('s')
    await expect(app.currentTask, 'F did not finish the task being edited').toHaveText('Working on Write report')
    await expect(app.editForm).toBeVisible()
    await app.expectMode('focus')
  })
})

test.describe('finishing tasks', () => {
  test('finishing the current task during a session moves it to the history and hands over to the next task', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.run(10 * MINUTE)
    await app.finishButton.click()

    await expect(app.snackbar).toHaveText('Finished "Write report". Now working on "Review pull requests"')
    await expect(app.currentTask).toHaveText('Working on Review pull requests')
    await expect(app.mainButton, 'the timer keeps running').toHaveText('Skip')
    await app.expectTasks(['Review pull requests', 'Plan sprint'])
    await app.historyToggle.click()
    await app.expectHistory(['Write report'])
    await expect(app.historyItem('Write report')).toContainText('0/3 · 10 min')
  })

  test('when the last task in the list is finished, the first open task takes over', async ({ app }) => {
    await app.openWithTasks()
    await app.selectTask('Plan sprint')
    await app.finishButton.click()
    await expect(app.currentTask).toHaveText('Working on Write report')
  })

  test('the Finish button of a row moves that task to the history, and focus moves to the next row', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.button('Finish Review pull requests').click()
    await app.expectTasks(['Write report', 'Plan sprint'])
    await expect(app.button('Finish Plan sprint')).toBeFocused()
    await expect(app.currentTask, 'the current task stays').toHaveText('Working on Write report')
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

  test('after the last open task is finished, there is no current task and focus moves to Add task', async ({
    app,
  }) => {
    await app.open()
    await app.addTasks([{ title: 'Write report' }])
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

  test('deleting the current task hands over to the next open task below it, like finishing it', async ({ app }) => {
    await app.openWithTasks()
    await app.selectTask('Review pull requests')
    await app.button('Delete Review pull requests').click()
    await expect(app.snackbar).toHaveText('Deleted "Review pull requests". Now working on "Plan sprint"')
    await expect(app.currentTask).toHaveText('Working on Plan sprint')

    await app.button('Delete Plan sprint').click()
    await expect(app.currentTask, 'from the last task it wraps around to the first').toHaveText(
      'Working on Write report',
    )
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

  test('reordering does not change the current task', async ({ app }) => {
    await app.openWithTasks()
    await app.dragTask('Write report', 'Plan sprint', 0.8)
    await expect(app.currentTask).toHaveText('Working on Write report')
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
    await expect(app.task('Write report'), 'the row shows the pomodoro of the ended session').toContainText('1/3')
  })
})

test.describe('time tracking', () => {
  test('a finished focus session is credited to the current task and to the day', async ({ app }) => {
    await app.openWithTasks()
    await app.run()

    await app.expectMode('short')
    await expect(app.task('Write report')).toContainText('1/3')
    await expect(app.task('Write report')).toContainText('25 min')
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

  test('focus time goes to the task that was current, the pomodoro to the one current at the end', async ({ app }) => {
    await app.openWithTasks()
    await app.run(24 * MINUTE)
    await app.selectTask('Plan sprint')
    await app.page.clock.fastForward(MINUTE)
    await app.expectMode('short')

    await expect(app.task('Write report')).toContainText('0/3')
    await expect(app.task('Write report')).toContainText('24 min')
    await expect(app.task('Plan sprint')).toContainText('1/1')
    await expect(app.task('Plan sprint')).toContainText('1 min')
  })

  test('without any task, focus time and pomodoros count for the day', async ({ app }) => {
    await app.open()
    await app.run()
    await app.expectMode('short')
    await expect(app.todaySummary).toHaveText('Today 25 min focused · 1 pomodoro')
  })

  test('tracked time is shown rounded to whole minutes', async ({ app }) => {
    await app.open()
    await app.addTasks([{ title: 'Almost 25' }, { title: 'Just over 24' }, { title: 'Half a minute' }])
    for (const [title, ms] of [
      ['Almost 25', 24 * MINUTE + 30_000],
      ['Just over 24', 24 * MINUTE + 29_000],
      ['Half a minute', 29_000],
    ] as const) {
      await app.selectTask(title)
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

  test('J and K select the next and previous open task, skip finished ones, and wrap around', async ({ app }) => {
    await app.open()
    await app.addTasks([
      { title: 'Write report' },
      { title: 'Done' },
      { title: 'Review pull requests' },
      { title: 'Plan sprint' },
    ])
    await app.button('Finish Done').click()
    await app.shortcut('j')
    await expect(app.currentTask).toHaveText('Working on Review pull requests')
    await app.shortcut('k')
    await expect(app.currentTask).toHaveText('Working on Write report')
    await app.shortcut('k')
    await expect(app.currentTask).toHaveText('Working on Plan sprint')
    await app.shortcut('j')
    await expect(app.currentTask).toHaveText('Working on Write report')
  })

  test('F finishes the current task', async ({ app }) => {
    await app.openWithTasks()
    await app.shortcut('f')
    await expect(app.snackbar).toHaveText('Finished "Write report". Now working on "Review pull requests"')
    await app.expectTasks(['Review pull requests', 'Plan sprint'])
  })

  test('Space starts the interval after a task was selected, finished or deleted with the mouse', async ({ app }) => {
    await app.openWithTasks()
    await app.selectTask('Plan sprint')
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
