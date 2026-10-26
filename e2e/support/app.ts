import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { DAY, HOUR, NOW, STORAGE_KEY, type Mode, type StoredState } from './state'

/** The label the app shows under the time in each mode. Tests name the modes by their keys. */
const MODE_LABELS: Record<Mode, string> = { focus: 'Focus', short: 'Short break', long: 'Long break' }

export interface NewTask {
  title: string
  /** Estimate in minutes */
  est?: number
}

/** The three open tasks most tests start with */
export const THREE_TASKS: NewTask[] = [
  { title: 'Write report', est: 75 },
  { title: 'Review pull requests', est: 50 },
  { title: 'Plan sprint' },
]

/** The file that Export JSON downloads. It is the app's only public data format. */
export interface ExportedData {
  tasks: {
    id: string
    title: string
    estMs: number
    sessions: number
    spentMs: number
    done: boolean
    createdAt: number
    doneAt: number | null
  }[]
  stats: Record<string, { focusMs: number; pomos: number; otherMs: number; otherSessions: number }>
}

/**
 * Page object for the app. Locators use roles, accessible names and visible text, never ids or classes,
 * so the tests also check what assistive technology sees.
 */
export class App {
  readonly page: Page

  readonly timerRegion: Locator
  readonly time: Locator
  readonly timeInput: Locator
  readonly mode: Locator
  readonly mainButton: Locator
  readonly startButton: Locator
  readonly skipButton: Locator
  readonly finishButton: Locator
  readonly roundText: Locator
  readonly currentTask: Locator

  readonly taskList: Locator
  readonly addTaskButton: Locator
  readonly addForm: Locator
  readonly editForm: Locator
  readonly todaySummary: Locator

  readonly history: Locator
  readonly historyToggle: Locator
  readonly historyDays: Locator

  readonly settingsButton: Locator
  readonly shortcutsButton: Locator
  readonly settingsDialog: Locator
  readonly shortcutsDialog: Locator
  readonly confirmDialog: Locator
  readonly importDialog: Locator

  readonly snackbar: Locator
  readonly announcer: Locator

  constructor(page: Page) {
    this.page = page

    // Before Start the time is a button that edits it. While the interval runs, the button is disabled.
    this.time = page.getByRole('button', { name: / remaining(\. Edit time)?$/ })
    this.timeInput = page.getByRole('textbox', { name: /^Set time for this interval/ })
    this.timerRegion = page.getByRole('region', { name: 'Timer' })
    this.mode = this.timerRegion.getByText(new RegExp(`^(${Object.values(MODE_LABELS).join('|')})$`))
    // The main button starts a waiting interval and skips a running one. The Skip button next to it only shows before
    // Start, so skipButton finds whichever of the two skips at the moment.
    this.mainButton = page.getByRole('button', { name: /^(Start|Skip)$/ })
    this.startButton = page.getByRole('button', { name: 'Start', exact: true })
    this.skipButton = page.getByRole('button', { name: /^Skip( to next step)?$/ })
    this.finishButton = page.getByRole('button', { name: 'Finish', exact: true })
    this.roundText = page.getByText(/^(Session \d+ of \d+|\d+ of \d+ sessions done)$/)
    this.currentTask = this.timerRegion.getByText(/^(Working on |(Add|Choose) a task to track time)/)

    this.taskList = page.getByRole('list', { name: 'Tasks' })
    this.addTaskButton = page
      .getByRole('button', { name: 'Add task', exact: true })
      .and(page.getByTitle('Add task (N)'))
    this.addForm = page.getByRole('form', { name: 'New task' })
    this.editForm = page.getByRole('form', { name: 'Edit task' })
    this.todaySummary = page.getByText(/^Today .+ focused · \d+ pomodoros?$/)

    this.historyToggle = page.getByText(/^\s*History\s+· /)
    this.history = page.getByRole('group').filter({ has: this.historyToggle })
    this.historyDays = this.history.getByRole('heading', { level: 3 })

    this.settingsButton = page.getByRole('button', { name: 'Settings' })
    this.shortcutsButton = page.getByRole('button', { name: 'Keyboard shortcuts' })
    this.settingsDialog = page.getByRole('dialog', { name: 'Settings' })
    this.shortcutsDialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    this.confirmDialog = page.getByRole('dialog', { name: 'Delete all data?' })
    this.importDialog = page.getByRole('dialog', { name: 'Replace all tasks?' })

    this.snackbar = page.getByRole('status').getByRole('paragraph')
    this.announcer = page.locator('[aria-live="assertive"]')
  }

  async open(): Promise<void> {
    await this.page.goto('./')
    await expect(this.time).toBeVisible()
  }

  /** Opens the app with the three tasks of THREE_TASKS, added through the form, and works on "Write report". */
  async openWithTasks(): Promise<void> {
    await this.open()
    await this.addTasks(THREE_TASKS)
    await this.workOn('Write report')
  }

  /**
   * Opens the app after four days of work, done through the app on a paused clock. The clock runs on from NOW.
   * Each day has one focus session of 25 minutes:
   *
   * - Sun, Oct 18: on "Older task", which is then finished.
   * - Mon, Oct 19: on "Old task from yesterday", estimated at 25 minutes. No task is finished on this day.
   * - Yesterday: on "Old task from yesterday" again, which is then finished. "Write report" (estimated at 75 minutes) and
   *   "Review pull requests" (50 minutes) are added.
   * - Today, at 8:00: on "Done today", which is then finished. Afterwards the user works on "Write report".
   */
  async openWithHistory(): Promise<void> {
    await this.page.clock.setSystemTime(NOW - 3 * DAY)
    await this.page.clock.pauseAt(NOW - 3 * DAY + HOUR)
    await this.open()
    await this.addTasks([{ title: 'Older task' }])
    await this.workOn('Older task')
    await this.completeFocusSession()
    await this.finishButton.click()

    await this.page.clock.pauseAt(NOW - 2 * DAY + HOUR)
    await this.addTasks([{ title: 'Old task from yesterday', est: 25 }])
    await this.workOn('Old task from yesterday')
    await this.completeFocusSession()

    await this.page.clock.pauseAt(NOW - DAY + HOUR)
    await this.completeFocusSession()
    await this.finishButton.click()
    await this.addTasks([
      { title: 'Write report', est: 75 },
      { title: 'Review pull requests', est: 50 },
    ])

    await this.page.clock.pauseAt(NOW - HOUR)
    await this.addTasks([{ title: 'Done today' }])
    await this.workOn('Done today')
    await this.completeFocusSession()
    await this.finishButton.click()
    await this.workOn('Write report')
    await this.page.clock.pauseAt(NOW)
    await this.page.clock.resume()
  }

  /**
   * Opens the app with data written straight into its storage, as a broken browser profile might have left it. A string
   * is stored as it is. Later reloads keep the app's own changes. Only for tests of stored data. Other tests build
   * their data through the app.
   */
  async openWithStoredData(data: StoredState | string): Promise<void> {
    await this.page.addInitScript(
      ([key, value]) => {
        if (sessionStorage.getItem('e2e-seeded')) return
        localStorage.setItem(key, value)
        sessionStorage.setItem('e2e-seeded', '1')
      },
      [STORAGE_KEY, typeof data === 'string' ? data : JSON.stringify(data)] as const,
    )
    await this.open()
  }

  /**
   * Opens the app in another tab of the same browser. All tabs share one fake clock, so moving the clock in one tab
   * moves it in all of them. `beforeOpen` runs on the new page before the app loads, for example to record chimes.
   */
  async openOtherTab(beforeOpen?: (page: Page) => Promise<void>): Promise<App> {
    const other = new App(await this.page.context().newPage())
    await beforeOpen?.(other.page)
    await other.open()
    return other
  }

  /** Deletes all data through the settings. */
  async deleteAllData(): Promise<void> {
    await this.settingsButton.click()
    await this.settingsDialog.getByRole('button', { name: 'Delete all data' }).click()
    await this.confirmDialog.getByRole('button', { name: 'Delete' }).click()
    await expect(this.settingsDialog).toBeHidden()
  }

  /** Closes the app, moves the clock to `time` while it is closed, and opens it again. The clock stays paused. */
  async reopenAt(time: number): Promise<void> {
    await this.page.goto('about:blank')
    await this.page.clock.pauseAt(time)
    await this.open()
  }

  /**
   * Hides the page, as when the user switches to another tab or minimizes the window, or shows it again.
   * Playwright pages are always visible, so the page is told so.
   */
  async setVisible(visible: boolean): Promise<void> {
    await this.page.evaluate((visible) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (visible ? 'visible' : 'hidden'),
      })
      document.dispatchEvent(new Event('visibilitychange'))
    }, visible)
  }

  async blur(): Promise<void> {
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  }

  /** Presses a global shortcut. Focus is removed first, because keys like Space would activate a focused button. */
  async shortcut(key: string): Promise<void> {
    await this.blur()
    await this.page.keyboard.press(key)
  }

  /** Presses Tab, or Shift+Tab with `back`, until `target` has focus, the way a keyboard user moves to a control. */
  async tabTo(target: Locator, { back = false } = {}): Promise<void> {
    await expect(target).toBeVisible()
    for (let presses = 0; presses < 50; presses++) {
      if (await target.evaluate((el) => el === document.activeElement)) return
      await this.page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
    }
    await expect(target, 'reachable with the Tab key').toBeFocused()
  }

  button(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true })
  }

  titleField(form: Locator): Locator {
    return form.getByRole('textbox', { name: 'Task', exact: true })
  }

  estimateField(form: Locator): Locator {
    return form.getByRole('spinbutton', { name: 'Estimate in minutes' })
  }

  async expectMode(mode: Mode, message?: string): Promise<void> {
    await expect(this.mode, message).toHaveText(MODE_LABELS[mode])
  }

  async setTime(value: string): Promise<void> {
    await this.time.click()
    await this.timeInput.fill(value)
    await this.timeInput.press('Enter')
  }

  /**
   * Starts the interval and lets `ms` of it pass on a paused clock, so exactly that much time is tracked.
   * Without `ms`, the interval runs to its end.
   */
  async run(ms?: number): Promise<void> {
    await this.pauseClock()
    await this.startButton.click()
    if (ms !== undefined) await this.page.clock.fastForward(ms)
    else await this.runToEnd()
  }

  /** Lets the running interval run to its end. */
  async runToEnd(): Promise<void> {
    const label = await this.time.getAttribute('aria-label')
    const [, h, m, s] = /^(?:(\d+):)?(\d+):(\d+)/.exec(label ?? '') ?? []
    const left = ((Number(h ?? 0) * 60 + Number(m)) * 60 + Number(s)) * 1000
    const mode = await this.mode.textContent()
    await this.page.clock.fastForward(left)
    await expect(this.mode).not.toHaveText(mode ?? '')
  }

  /** Runs a whole focus session and skips the break after it, so the next session can start. */
  async completeFocusSession(): Promise<void> {
    await this.expectMode('focus')
    await this.run()
    await this.skipButton.click()
    await this.expectMode('focus')
  }

  /** Pauses the fake clock at the next full second, so tests can move it by exact amounts. */
  async pauseClock(): Promise<void> {
    const now = await this.page.evaluate(() => Date.now())
    await this.page.clock.pauseAt(Math.floor(now / 1000) * 1000 + 1000)
  }

  task(title: string): Locator {
    return this.itemIn(this.taskList, title)
  }

  historyItem(title: string): Locator {
    return this.itemIn(this.history, title)
  }

  private itemIn(container: Locator, title: string): Locator {
    return container.getByRole('listitem').filter({ has: this.page.getByText(title, { exact: true }) })
  }

  /** Each listed task has a Work on button, named by the task title. */
  async expectTasks(titles: string[]): Promise<void> {
    await expectNames(
      this.taskList.getByRole('button', { name: /^Work on / }),
      titles.map((title) => `Work on ${title}`),
    )
  }

  /** The Work on button of a listed task, or of Other */
  workButton(title: string): Locator {
    return this.page.getByRole('button', { name: `Work on ${title}`, exact: true })
  }

  async expectHistory(titles: string[]): Promise<void> {
    const items = this.history.getByRole('listitem')
    await expect(items).toHaveCount(titles.length)
    for (const [i, title] of titles.entries())
      await expect(items.nth(i).getByText(title, { exact: true })).toBeVisible()
  }

  /** Starts working on a task, or on Other, with its Work on button */
  async workOn(title: string): Promise<void> {
    await this.workButton(title).click()
    await expect(this.currentTask).toHaveText(`Working on ${title}`)
  }

  /** Adds a task through the form. The form stays open for the next task. */
  async addTask(title: string, { est }: Omit<NewTask, 'title'> = {}): Promise<void> {
    if (await this.addTaskButton.isVisible()) await this.addTaskButton.click()
    await this.titleField(this.addForm).fill(title)
    if (est !== undefined) await this.estimateField(this.addForm).fill(String(est))
    await this.addForm.getByRole('button', { name: 'Add task' }).click()
  }

  /** Adds tasks through the form and closes it. */
  async addTasks(tasks: NewTask[]): Promise<void> {
    for (const { title, ...fields } of tasks) await this.addTask(title, fields)
    await this.titleField(this.addForm).press('Escape')
    await expect(this.addForm).toBeHidden()
  }

  /** Turns on browser notifications in the settings. The browser must allow them. */
  async turnOnNotifications(): Promise<void> {
    await this.settingsButton.click()
    await this.settingsDialog.getByRole('switch', { name: 'Browser notifications' }).check()
    await this.settingsDialog.getByRole('button', { name: 'Done' }).click()
  }

  /** Downloads the Export JSON file from the settings and reads it. The settings are closed again afterwards. */
  async exportJson(): Promise<{ filename: string; data: ExportedData }> {
    await this.settingsButton.click()
    const download = this.page.waitForEvent('download')
    await this.settingsDialog.getByRole('button', { name: 'Export JSON' }).click()
    const file = await download
    const data = JSON.parse(await readFile(await file.path(), 'utf8')) as ExportedData
    await this.settingsDialog.getByRole('button', { name: 'Done' }).click()
    return { filename: file.suggestedFilename(), data }
  }

  /**
   * Chooses a file for Import JSON in the settings. Into an app without data, the file is imported right away.
   * Otherwise the app asks first, in importDialog. A string is the file content as it is.
   */
  async chooseImportFile(content: ExportedData | string): Promise<void> {
    await this.settingsButton.click()
    const chooser = this.page.waitForEvent('filechooser')
    await this.settingsDialog.getByRole('button', { name: 'Import JSON' }).click()
    await (
      await chooser
    ).setFiles({
      name: 'pomotrack.json',
      mimeType: 'application/json',
      buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)),
    })
  }

  /** Drags a task by its handle onto a part of another task. `whileHeld` runs before the mouse button is released. */
  async dragTask(title: string, onto: string, heightFraction: number, whileHeld?: () => Promise<void>): Promise<void> {
    const handle = await this.button(`Move ${title}`).boundingBox()
    const target = await this.task(onto).boundingBox()
    if (!handle || !target) throw new Error('Task not visible')
    const x = handle.x + handle.width / 2
    await this.page.mouse.move(x, handle.y + handle.height / 2)
    await this.page.mouse.down()
    await this.page.mouse.move(x, target.y + target.height * heightFraction, { steps: 8 })
    await whileHeld?.()
    await this.page.mouse.up()
  }
}

async function expectNames(elements: Locator, names: string[]): Promise<void> {
  await expect(elements).toHaveCount(names.length)
  for (const [i, name] of names.entries()) await expect(elements.nth(i)).toHaveAccessibleName(name)
}
