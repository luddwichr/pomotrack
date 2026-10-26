/**
 * The format the app keeps in localStorage. Only storage.spec.ts, which checks broken data, writes it directly.
 * All other tests build their data through the app.
 */
export const STORAGE_KEY = 'pomotrack.v1'
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/**
 * The length of each interval, for tests that run a whole interval. Expected texts, like '25:00' or
 * 'Today 25 min focused', spell the lengths out, because they state what the app must show.
 */
export const FOCUS_SESSION = 25 * MINUTE
export const SHORT_BREAK = 5 * MINUTE
export const LONG_BREAK = 10 * MINUTE

export const NOW = new Date('2026-10-21T09:00:00+02:00').getTime()
export const TIME_ZONE = 'Europe/Berlin'

export type Mode = 'focus' | 'short' | 'long'

export interface Settings {
  notify: boolean
  sound: boolean
}

export interface Task {
  id: string
  title: string
  estMs: number
  /** The focus sessions the task got time in */
  sessions: number
  spentMs: number
  done: boolean
  createdAt: number
  doneAt: number | null
}

export interface Timer {
  mode: Mode
  durationMs: number
  /** Wall-clock end while running, null while the interval waits for Start. */
  endAt: number | null
  /** Start of the focus time that has not yet been credited. Only set while a focus session runs. */
  segStart: number | null
  /** The task ids, and '@other', that got focus time in the running session */
  worked: string[]
}

export interface DayStats {
  focusMs: number
  pomos: number
  otherMs: number
  otherSessions: number
}

export interface StoredState {
  settings: Settings
  tasks: Task[]
  activeId: string | null
  focusCount: number
  stats: Record<string, DayStats>
  timer: Timer
}

export const DEFAULT_SETTINGS: Settings = { notify: false, sound: true }

/** The Swedish locale formats dates as YYYY-MM-DD, like the app's day keys. */
export function dayKey(time: number): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE }).format(time)
}

export function task(fields: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return { estMs: 25 * MINUTE, sessions: 0, spentMs: 0, done: false, createdAt: NOW - DAY, doneAt: null, ...fields }
}

export function finishedTask(fields: Partial<Task> & Pick<Task, 'id' | 'title' | 'doneAt'>): Task {
  return task({ done: true, ...fields })
}

export function timer(mode: Mode, minutes: number, fields: Partial<Timer> = {}): Timer {
  return { mode, durationMs: minutes * MINUTE, endAt: null, segStart: null, worked: [], ...fields }
}

export function storedState(fields: Partial<StoredState> = {}): StoredState {
  return {
    settings: DEFAULT_SETTINGS,
    tasks: [],
    activeId: null,
    focusCount: 0,
    stats: {},
    timer: timer('focus', 25),
    ...fields,
  }
}
