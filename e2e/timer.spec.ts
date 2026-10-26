import { expect, recordChimes, recordNotifications, test } from './support/fixtures'
import { FOCUS_SESSION, HOUR, MINUTE, NOW, SHORT_BREAK } from './support/state'

test.describe('pomodoro cycle', () => {
  test('the app starts with a 25 minute focus session that waits for Start', async ({ app }) => {
    await app.open()
    await expect(app.page).toHaveTitle('Pomotrack')
    await expect(app.time).toHaveText('25:00')
    await app.expectMode('focus')
    await expect(app.mainButton).toHaveText('Start')
    await expect(app.skipButton).toHaveAccessibleName('Skip to next step')
    await expect(app.roundText).toHaveText('Session 1 of 4')
  })

  test('Start runs the interval, the main button turns into Skip, and the tab title shows the countdown', async ({
    app,
  }) => {
    await app.open()
    await app.pauseClock()
    await app.startButton.click()
    await expect(app.mainButton).toHaveText('Skip')
    await expect(app.skipButton, 'the Skip button next to it is gone, only the main button skips').toHaveCount(1)

    await app.page.clock.fastForward(61_000)
    await expect(app.announcer).toHaveText('Focus started, 25 minutes')
    await expect(app.time).toHaveText('23:59')
    await expect(app.page).toHaveTitle('23:59 · Focus')

    await app.mainButton.click()
    await expect(app.page, 'without a running interval the title is the app name').toHaveTitle('Pomotrack')
  })

  test('a focus session that runs to its end counts a pomodoro and leads to a 5 minute short break', async ({
    app,
  }) => {
    await app.open()
    await app.run()

    await app.expectMode('short')
    await expect(app.time).toHaveText('05:00')
    await expect(app.mainButton, 'the break waits for Start').toHaveText('Start')
    await expect(app.roundText).toHaveText('1 of 4 sessions done')
    await expect(app.snackbar).toHaveText('Focus session done. Time for a short break.')
    await expect(app.todaySummary).toHaveText('Today 25 min focused · 1 pomodoro')

    await app.run()
    await app.expectMode('focus')
    await expect(app.snackbar).toHaveText('Break is over. Time to focus.')
    await expect(app.roundText).toHaveText('Session 2 of 4')
  })

  test('the fourth focus session is followed by a 10 minute long break, after which a new round starts', async ({
    app,
  }) => {
    await app.open()
    for (let session = 1; session <= 3; session++) await app.completeFocusSession()
    await expect(app.roundText).toHaveText('Session 4 of 4')

    await app.run()
    await app.expectMode('long')
    await expect(app.time).toHaveText('10:00')
    await expect(app.roundText).toHaveText('4 of 4 sessions done')

    await app.run()
    await app.expectMode('focus')
    await expect(app.snackbar).toHaveText('Long break is over. Time to focus.')
    await expect(app.roundText).toHaveText('Session 1 of 4')
  })

  test('each mode has its own color, in light and dark theme, and the browser UI takes the color of the page', async ({
    app,
  }) => {
    await app.page.emulateMedia({ reducedMotion: 'reduce' })
    await app.open()
    // The color of the page, and the color the page asks the browser to use for its address bar or title bar
    const colors = () =>
      app.page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.color = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? ''
        document.body.append(probe)
        const browserUi = getComputedStyle(probe).color
        probe.remove()
        return { page: getComputedStyle(document.body).backgroundColor, browserUi }
      })
    const seen = new Set<string>()
    const expectOwnColor = async (step: string) => {
      // A change of the device theme reaches the page a moment after it happens
      const matches = async () => {
        const { page, browserUi } = await colors()
        return browserUi === page
      }
      await expect.poll(matches, step).toBe(true)
      const { page } = await colors()
      expect(seen, `${step} has a color of its own`).not.toContain(page)
      seen.add(page)
    }

    await expectOwnColor('focus, light')
    await app.skipButton.click()
    await expectOwnColor('short break, light')
    // The device switches to dark theme while the app is open
    await app.page.emulateMedia({ colorScheme: 'dark' })
    await expectOwnColor('short break, dark')
    await app.skipButton.click()
    await expectOwnColor('focus, dark')
  })

  test('Skip moves on to the next interval, and a skipped focus session counts toward the round', async ({ app }) => {
    await app.open()
    const cycle = ['short', 'focus', 'short', 'focus', 'short', 'focus', 'long'] as const
    for (const mode of cycle) {
      await app.skipButton.click()
      await app.expectMode(mode)
    }
    await expect(app.roundText, 'skipped before they started, they still count').toHaveText('4 of 4 sessions done')
    await expect(app.todaySummary, 'sessions that never ran add no time').toHaveText(
      'Today 0 min focused · 0 pomodoros',
    )

    await app.skipButton.click()
    await app.expectMode('focus')
    await expect(app.roundText, 'a new round starts after the long break').toHaveText('Session 1 of 4')
  })

  test('a skipped focus session keeps its focus time but counts no pomodoro', async ({ app }) => {
    await app.openWithTasks()
    await app.run(10 * MINUTE)
    await app.mainButton.click()

    await app.expectMode('short')
    await expect(app.mainButton, 'the break waits for Start').toHaveText('Start')
    await expect(app.roundText).toHaveText('1 of 4 sessions done')
    await expect(app.snackbar).toHaveText('Skipped focus. Time for a short break. Press Start when you are.')
    await expect(app.todaySummary).toHaveText('Today 10 min focused · 0 pomodoros')
    await expect(app.task('Write report')).toContainText('10 min / 1 h 15 min')
    await expect(app.task('Write report'), 'the task was worked on in the session').toContainText('1 session')
  })

  test('the round carries over to the next day and over a reload', async ({ app }) => {
    await app.open()
    for (let i = 0; i < 4; i++) await app.skipButton.click()
    await expect(app.roundText).toHaveText('Session 3 of 4')

    await app.page.clock.fastForward(2 * 24 * HOUR)
    await app.page.reload()
    await expect(app.roundText).toHaveText('Session 3 of 4')
  })

  test('a running interval keeps running across a reload', async ({ app }) => {
    await app.open()
    await app.run(5 * MINUTE)
    await app.page.reload()

    await expect(app.mainButton).toHaveText('Skip')
    await expect(app.time).toHaveText('20:00')
  })

  test('setting the device clock back does not change the time left, and no focus time counts twice', async ({
    app,
  }) => {
    await app.open()
    await app.run(10 * MINUTE)
    await expect(app.time).toHaveText('15:00')

    await app.page.clock.setSystemTime(NOW - HOUR)
    await app.page.clock.runFor(60_000)
    await expect(app.time).toHaveText('14:00')

    await app.page.clock.fastForward(14 * MINUTE)
    await app.expectMode('short')
    await expect(app.todaySummary).toHaveText('Today 25 min focused · 1 pomodoro')
  })

  test('setting the device clock back while the app is closed never leaves more time than the interval has', async ({
    app,
  }) => {
    await app.open()
    await app.run(10 * MINUTE)
    await app.page.goto('about:blank')
    await app.page.clock.setSystemTime(NOW - HOUR)
    await app.open()
    await expect(app.mainButton).toHaveText('Skip')
    await expect(app.time).toHaveText('25:00')
    await app.page.clock.runFor(MINUTE)
    await expect(app.time).toHaveText('24:00')
  })
})

test.describe('main button', () => {
  test('a click within a second of the click that started the interval does not skip it', async ({ app }) => {
    await app.open()
    await app.pauseClock()
    await app.startButton.click()
    await app.page.clock.fastForward(900)
    await app.mainButton.click()
    await app.expectMode('focus')
    await expect(app.mainButton).toHaveText('Skip')

    await app.page.clock.fastForward(100)
    await app.mainButton.click()
    await app.expectMode('short')
  })

  test('a double click on Start only starts the interval', async ({ app }) => {
    await app.open()
    await app.startButton.dblclick()
    await app.expectMode('focus')
    await expect(app.mainButton).toHaveText('Skip')
  })

  test('a double click on Skip skips one interval and does not start the next one', async ({ app }) => {
    await app.open()
    await app.skipButton.dblclick()
    await app.expectMode('short')

    await app.pauseClock()
    await app.startButton.click()
    await app.page.clock.fastForward(2_000)
    await app.mainButton.dblclick()
    await app.expectMode('focus')
    await expect(app.mainButton).toHaveText('Start')
  })

  test('holding Enter on Start does not skip the interval it started', async ({ app }) => {
    await app.open()
    await app.pauseClock()
    await app.startButton.focus()
    await app.page.keyboard.down('Enter')
    await app.page.clock.fastForward(2_000)
    // Pressing a key that is already down sends a repeated key press
    await app.page.keyboard.down('Enter')
    await app.page.keyboard.up('Enter')
    await app.expectMode('focus')
    await expect(app.mainButton).toHaveText('Skip')
  })

  test('Space on the main button starts the interval, but never skips it', async ({ app }) => {
    await app.open()
    await app.pauseClock()
    await app.startButton.focus()
    await app.page.keyboard.press('Space')
    await expect(app.mainButton).toHaveText('Skip')
    await expect(app.mainButton).toBeFocused()

    await app.page.clock.fastForward(5_000)
    await app.page.keyboard.press('Space')
    await app.expectMode('focus')
    await expect(app.mainButton).toHaveText('Skip')
  })
})

test.describe('right at the end of a session', () => {
  // The paused clock holds back the app's page timers, so the app has not noticed the end yet when the user acts.
  // Without workers, which keep ticking in real time, the app ticks with page timers.
  test.beforeEach(async ({ app }) => {
    await app.page.addInitScript(() => delete (window as { Worker?: unknown }).Worker)
    await app.openWithTasks()
    await app.pauseClock()
    await app.startButton.click()
    await app.page.clock.setSystemTime(NOW + 26 * MINUTE + 5_000)
  })

  test('a skip completes the session instead of skipping it', async ({ app }) => {
    await app.shortcut('s')
    await app.expectMode('short')
    await expect(app.todaySummary, 'a pomodoro, and no focus time after the end').toHaveText(
      'Today 25 min focused · 1 pomodoro',
    )
  })

  test('working on another task leaves the whole session with the task worked on until its end', async ({ app }) => {
    await app.workOn('Plan sprint')
    await app.expectMode('short')
    await expect(app.task('Write report')).toContainText('25 min / 1 h 15 min')
    await expect(app.task('Plan sprint')).toContainText('0 sessions')
  })
})

test.describe('time of the current interval', () => {
  test('clicking the time opens a field to type a new time for this interval', async ({ app }) => {
    await app.open()
    await app.time.click()
    await expect(app.timeInput).toBeFocused()
    await expect(app.timeInput).toHaveValue('25:00')

    await app.timeInput.fill('1:30:00')
    await app.timeInput.press('Enter')
    await expect(app.time).toHaveText('1:30:00')
    await expect(app.time).toBeFocused()
    await expect(app.announcer).toHaveText('Focus set to 90 minutes')
  })

  test('only the current interval changes, the next one of the same mode has its usual time', async ({ app }) => {
    await app.open()
    await app.setTime('1:30:00')
    await app.skipButton.click()
    await app.skipButton.click()
    await app.expectMode('focus')
    await expect(app.time).toHaveText('25:00')
  })

  test('a changed time is kept after a reload', async ({ app }) => {
    await app.open()
    await app.setTime('15')
    await app.page.reload()
    await expect(app.time).toHaveText('15:00')
  })

  test('Escape discards the typed time', async ({ app }) => {
    await app.open()
    await app.time.click()
    await app.timeInput.fill('15')
    await app.timeInput.press('Escape')
    await expect(app.time).toHaveText('25:00')
    await expect(app.time).toBeFocused()
  })

  test('the interval runs for the time it was set to', async ({ app }) => {
    await app.open()
    await app.setTime('15')
    await app.run()
    await app.expectMode('short')
    await expect(app.todaySummary).toHaveText('Today 15 min focused · 1 pomodoro')
  })

  test('cannot be changed while the interval runs', async ({ app }) => {
    await app.open()
    await app.startButton.click()
    await expect(app.time).toBeDisabled()
    await expect(app.page.getByText('Click to change this interval')).toBeHidden()
    await app.shortcut('e')
    await expect(app.timeInput).toBeHidden()
    await expect(app.snackbar).toHaveText('The time can only be changed before Start.')
  })

  test('accepts minutes, mm:ss and h:mm:ss, from 1 second to 12 hours, with spaces around', async ({ app }) => {
    await app.open()
    for (const [input, shown] of [
      ['15', '15:00'],
      [' 15 ', '15:00'],
      ['15:30', '15:30'],
      ['90:00', '1:30:00'],
      ['0:01', '00:01'],
      ['12:00:00', '12:00:00'],
    ] as const) {
      await app.setTime(input)
      await expect(app.time, input).toHaveText(shown)
    }
  })

  test('rejects ambiguous and out of range times and keeps the field open with an error', async ({ app }) => {
    await app.open()
    // Only a colon separates. 15:5 could mean 15:05 or 15:50, so the seconds need two digits.
    for (const input of [
      'abc',
      '15.30',
      '15,30',
      '15.5',
      '15:5',
      '1 5',
      '15 30',
      '15:60',
      '1:60:00',
      '12:00:01',
      '0',
      '0:00',
      '1000',
      '-5',
    ]) {
      await app.setTime(input)
      await expect(app.timeInput, input).toBeVisible()
      await expect(app.timeInput, input).toHaveAttribute('aria-invalid', 'true')
      await app.timeInput.press('Escape')
    }
    await expect(app.time).toHaveText('25:00')
  })

  test('the arrow keys move to the next or previous whole minute, with Shift to a multiple of 5', async ({ app }) => {
    await app.open()
    await app.time.click()
    for (const [from, key, to] of [
      ['25:00', 'ArrowUp', '26:00'],
      ['15:30', 'ArrowUp', '16:00'],
      ['15:30', 'ArrowDown', '15:00'],
      ['15:30', 'Shift+ArrowUp', '20:00'],
      ['17:00', 'Shift+ArrowDown', '15:00'],
      ['01:00', 'ArrowDown', '01:00'],
      ['00:30', 'ArrowDown', '00:30'],
      ['00:30', 'ArrowUp', '01:00'],
      ['12:00:00', 'ArrowUp', '12:00:00'],
    ] as const) {
      await app.timeInput.fill(from)
      await app.timeInput.press(key)
      await expect(app.timeInput, `${key} from ${from}`).toHaveValue(to)
    }
  })

  test('a click on Start right after typing a time applies the time and starts the interval', async ({ app }) => {
    await app.open()
    await app.pauseClock()
    await app.time.click()
    await app.timeInput.fill('10')
    await app.startButton.click()
    await expect(app.mainButton).toHaveText('Skip')
    await expect(app.time).toHaveText('10:00')
  })

  test('a time of an hour or more fits, also while it is typed', async ({ app }) => {
    await app.open()
    await app.setTime('1:30:00')
    await expect(app.time).toHaveText('1:30:00')
    const time = await app.time.boundingBox()
    const timer = await app.timerRegion.boundingBox()
    expect(time?.width, 'inside the ring, which takes about 60 % of the timer width').toBeLessThan(
      (timer?.width ?? 0) * 0.6,
    )

    await app.time.click()
    await app.timeInput.fill('12:00:00')
    expect(
      await app.timeInput.evaluate((el) => el.scrollWidth <= el.clientWidth),
      'no digit is cut off in the field',
    ).toBe(true)
  })

  test('leaving the field applies the typed time', async ({ app }) => {
    await app.open()
    await app.time.click()
    await app.timeInput.fill('12')
    await app.page.getByRole('heading', { name: 'Tasks' }).click()
    await expect(app.time).toHaveText('12:00')
  })

  test('leaving the field with an invalid time keeps the time as it was, without an error message', async ({ app }) => {
    await app.open()
    await app.time.click()
    await app.timeInput.fill('abc')
    await app.page.getByRole('heading', { name: 'Tasks' }).click()
    await expect(app.time).toHaveText('25:00')
    await app.page.clock.runFor(100)
    await expect(app.announcer).toHaveText('')
  })

  test('leaving the field without a change keeps the interval as it is, without a message', async ({ app }) => {
    await app.open()
    await app.time.click()
    await app.page.getByRole('heading', { name: 'Tasks' }).click()
    await expect(app.timeInput).toBeHidden()
    await expect(app.time).toHaveText('25:00')
    await app.page.clock.runFor(100)
    await expect(app.announcer).toHaveText('')
  })
})

test.describe('coming back after the interval ended', () => {
  test('a session that ended while the app was closed is completed on the next visit, with all its focus time', async ({
    app,
  }) => {
    await app.openWithTasks()
    await app.run(10 * MINUTE)
    await app.reopenAt(NOW + 30 * MINUTE)

    await app.expectMode('short')
    await expect(app.mainButton, 'only that interval completes, the next one waits for Start').toHaveText('Start')
    await expect(app.snackbar).toHaveText('Focus session done while you were away. Time for a short break.')
    await expect(app.roundText).toHaveText('1 of 4 sessions done')
    await expect(app.task('Write report'), 'the time after the app was closed counts too').toContainText(
      '25 min / 1 h 15 min',
    )
  })

  test('a break that ended while the app was closed is completed on the next visit', async ({ app }) => {
    await app.open()
    await app.skipButton.click()
    await app.run(MINUTE)
    await app.reopenAt(NOW + HOUR)

    await app.expectMode('focus')
    await expect(app.mainButton).toHaveText('Start')
    await expect(app.snackbar).toHaveText('Break is over while you were away. Time to focus.')
  })

  test('a session that ended while the computer was asleep completes silently, and the time asleep counts', async ({
    app,
    context,
  }) => {
    await context.grantPermissions(['notifications'])
    const notifications = await recordNotifications(app.page)
    const chimes = await recordChimes(app.page)
    await app.openWithTasks()
    await app.turnOnNotifications()
    // The click on Start also allows sound, so a chime could play
    await app.run(MINUTE)
    // The clock jumps 2 minutes past the end, as after sleep
    await app.page.clock.setSystemTime(NOW + 30 * MINUTE)

    await app.expectMode('short')
    await expect(app.snackbar).toHaveText('Focus session done while you were away. Time for a short break.')
    expect(await chimes()).toBe(0)
    expect(await notifications()).toEqual([])
    await expect(app.task('Write report')).toContainText('25 min / 1 h 15 min')
  })

  test('a session that ended while the app was in a background tab shows its message when the user comes back', async ({
    app,
  }) => {
    await app.open()
    await app.pauseClock()
    await app.startButton.click()
    await app.setVisible(false)
    await app.page.clock.fastForward(FOCUS_SESSION)
    await app.expectMode('short')
    await app.page.clock.runFor(5_000)
    await expect(app.snackbar).toBeHidden()

    await app.setVisible(true)
    await expect(app.snackbar).toHaveText('Focus session done. Time for a short break.')
  })

  for (const { ago, notified } of [
    { ago: 59_000, notified: true },
    { ago: 61_000, notified: false },
  ]) {
    test(`a session that ended ${ago / 1000} s ago ${notified ? 'still notifies' : 'completes silently'}`, async ({
      app,
      context,
    }) => {
      await context.grantPermissions(['notifications'])
      const notifications = await recordNotifications(app.page)
      await app.open()
      await app.turnOnNotifications()
      await app.pauseClock()
      await app.startButton.click()
      const end = (await app.page.evaluate(() => Date.now())) + FOCUS_SESSION
      await app.reopenAt(end + ago)

      await app.expectMode('short')
      expect(await notifications()).toHaveLength(notified ? 1 : 0)
    })
  }
})

test.describe('alerts', () => {
  test('a notification is sent when a session ends while the window is in the background', async ({ app, context }) => {
    await context.grantPermissions(['notifications'])
    const notifications = await recordNotifications(app.page)
    await app.open()
    await app.turnOnNotifications()

    await app.startButton.click()
    await app.page.clock.fastForward(FOCUS_SESSION)
    await app.expectMode('short')
    expect(await notifications()).toEqual([{ title: 'Focus session done', body: 'Time for a short break.' }])
  })

  test('the notification at the end of a break names the current task', async ({ app, context }) => {
    await context.grantPermissions(['notifications'])
    const notifications = await recordNotifications(app.page)
    await app.openWithTasks()
    await app.turnOnNotifications()
    await app.skipButton.click()
    await app.startButton.click()
    await app.page.clock.fastForward(SHORT_BREAK)
    await app.expectMode('focus')
    expect(await notifications()).toEqual([{ title: 'Break is over', body: 'Time to focus: Write report' }])
  })

  test('the notification at the end of a break names no task without one', async ({ app, context }) => {
    await context.grantPermissions(['notifications'])
    const notifications = await recordNotifications(app.page)
    await app.open()
    await app.turnOnNotifications()
    await app.skipButton.click()
    await app.startButton.click()
    await app.page.clock.fastForward(SHORT_BREAK)
    await app.expectMode('focus')
    expect(await notifications()).toEqual([{ title: 'Break is over', body: 'Time to focus.' }])
  })

  test('no notification is sent while the window has focus', async ({ app, context }) => {
    await context.grantPermissions(['notifications'])
    const notifications = await recordNotifications(app.page, { windowFocused: true })
    await app.open()
    await app.turnOnNotifications()
    await app.run()
    await app.expectMode('short')
    expect(await notifications()).toEqual([])
  })

  test('no notification is sent while notifications are off in the settings', async ({ app, context }) => {
    await context.grantPermissions(['notifications'])
    const notifications = await recordNotifications(app.page)
    await app.open()
    await app.startButton.click()
    await app.page.clock.fastForward(FOCUS_SESSION)
    await app.expectMode('short')
    await app.page.clock.runFor(2_000)
    expect(await notifications()).toEqual([])
  })

  test('a chime plays when an interval ends, unless the sound is off', async ({ app }) => {
    const chimes = await recordChimes(app.page)
    await app.open()
    await app.run()
    await app.expectMode('short')
    expect(await chimes()).toBe(1)

    await app.settingsButton.click()
    await app.settingsDialog.getByRole('switch', { name: 'Sound' }).uncheck()
    await app.settingsDialog.getByRole('button', { name: 'Done' }).click()
    await app.run()
    await app.expectMode('focus')
    expect(await chimes()).toBe(1)
  })

  test('turning the sound on allows it right away, without another click', async ({ app }) => {
    const chimes = await recordChimes(app.page)
    await app.open()
    await app.settingsButton.click()
    await app.settingsDialog.getByRole('switch', { name: 'Sound' }).uncheck()
    await app.settingsDialog.getByRole('button', { name: 'Done' }).click()
    await app.setTime('0:10')
    await app.pauseClock()
    await app.startButton.click()
    await app.page.reload()

    await app.settingsButton.click()
    await app.settingsDialog.getByRole('switch', { name: 'Sound' }).check()
    // The dialog stays open, so no other click or key press reaches the page
    await app.page.clock.fastForward(10_000)
    await app.expectMode('short')
    expect(await chimes()).toBe(1)
  })

  test('after a reload, the first click or key press on the page allows sound again', async ({ app }) => {
    const chimes = await recordChimes(app.page)
    await app.open()
    await app.startButton.click()
    await app.page.reload()
    await app.page.clock.fastForward(FOCUS_SESSION)
    await app.expectMode('short')
    expect(await chimes(), 'browsers block sound until a click or key press on the page').toBe(0)

    await app.startButton.click()
    await app.page.reload()
    await app.page.getByRole('heading', { name: 'Tasks' }).click()
    await app.page.clock.fastForward(SHORT_BREAK)
    await app.expectMode('focus')
    expect(await chimes()).toBe(1)

    await app.startButton.click()
    await app.page.reload()
    await app.page.keyboard.press('x')
    await app.page.clock.fastForward(FOCUS_SESSION)
    await app.expectMode('short')
    expect(await chimes(), 'counted since the last reload').toBe(1)
  })
})

test.describe('keyboard shortcuts', () => {
  test('Space starts, and does not skip a running interval', async ({ app }) => {
    await app.open()
    await app.pauseClock()
    await app.shortcut('Space')
    await expect(app.mainButton).toHaveText('Skip')
    await app.page.clock.fastForward(5_000)
    await app.shortcut('Space')
    await app.expectMode('focus')
    await expect(app.mainButton).toHaveText('Skip')
  })

  test('Space on a button reached with the Tab key activates that button instead of Start', async ({ app }) => {
    await app.open()
    await app.tabTo(app.skipButton)
    await app.page.keyboard.press('Space')
    await app.expectMode('short')
    await expect(app.mainButton).toHaveText('Start')
  })

  test('after a click on a button, Space starts instead of clicking the button again', async ({ app }) => {
    await app.open()
    await app.skipButton.click()
    await app.page.keyboard.press('Space')
    await app.expectMode('short')
    await expect(app.mainButton).toHaveText('Skip')
  })

  test('S skips to the next step, also while the interval runs', async ({ app }) => {
    await app.open()
    await app.shortcut('s')
    await app.expectMode('short')
    await app.shortcut('Space')
    await app.shortcut('s')
    await app.expectMode('focus')
  })

  test('a held key does not repeat its shortcut', async ({ app }) => {
    await app.open()
    await app.blur()
    // Pressing a key that is already down sends a repeated key press
    await app.page.keyboard.down('s')
    await app.page.keyboard.down('s')
    await app.page.keyboard.up('s')
    await app.expectMode('short')
  })

  test('E edits the time of the current interval, and shortcuts pause while typing in it', async ({ app }) => {
    await app.open()
    await app.shortcut('e')
    await expect(app.timeInput).toBeFocused()
    await expect(app.timeInput).toHaveValue('25:00')
    await app.timeInput.pressSequentially('s')
    await app.expectMode('focus')
  })
})
