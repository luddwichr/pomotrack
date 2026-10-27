import { announce, chime, notify, snackbar } from './alerts.js'
import { fmtSpoken } from './format.js'
import { freshTimer, LATE_AFTER, LONG_EVERY, MODES, OTHER } from './model.js'
import { activeTask, commit, dayStats, onOther, readStored, reload, save, state, storedJson } from './store.js'

export const isRunning = () => state.timer.endAt !== null
export const isDue = () => isRunning() && Date.now() >= state.timer.endAt
// A clock that was set back never shows more time than the interval has
export const remaining = () =>
  isRunning() ? Math.min(state.timer.durationMs, Math.max(0, state.timer.endAt - Date.now())) : state.timer.durationMs

export function creditFocusTime(until = Date.now()) {
  const t = state.timer
  if (t.mode !== 'focus' || t.segStart == null) return
  const from = t.segStart
  until = Math.min(until, t.endAt)
  // A clock that was set back would otherwise credit the same time twice
  if (until <= from) return
  t.segStart = until
  const task = activeTask()
  const workId = task?.id ?? (onOther() ? OTHER : null)
  const newSession = workId !== null && !t.worked.includes(workId)
  if (newSession) t.worked.push(workId)
  if (task) {
    task.spentMs += until - from
    if (newSession) task.sessions++
  }
  if (onOther() && newSession) dayStats(from).otherSessions++
  for (let start = from; start < until;) {
    const end = Math.min(until, new Date(start).setHours(24, 0, 0, 0))
    const day = dayStats(start)
    day.focusMs += end - start
    if (onOther()) day.otherMs += end - start
    start = end
  }
}

export function start() {
  if (isRunning()) return
  const t = state.timer
  const now = Date.now()
  t.endAt = now + t.durationMs
  if (t.mode === 'focus') t.segStart = now
  commit()
  announce(`${MODES[t.mode].label} started, ${fmtSpoken(t.durationMs)}`)
}

function advance() {
  const mode = state.timer.mode
  if (mode === 'focus') state.focusCount++
  if (mode === 'long') state.focusCount = 0
  state.timer = freshTimer(mode !== 'focus' ? 'focus' : state.focusCount >= LONG_EVERY ? 'long' : 'short')
}

function complete(late = false) {
  const t = state.timer
  creditFocusTime(t.endAt)
  const finished = t.mode
  if (finished === 'focus') dayStats(t.endAt).pomos++
  advance()
  commit()
  const nextMsg = MODES[state.timer.mode].next
  if (late) {
    snackbar(`${MODES[finished].done} while you were away. ${nextMsg}.`)
    return
  }
  chime()
  const task = activeTask()
  notify(MODES[finished].done, nextMsg + (task && state.timer.mode === 'focus' ? `: ${task.title}` : '.'))
  snackbar(`${MODES[finished].done}. ${nextMsg}.`)
}

// An action that arrives after the interval ended, before the next tick noticed, first completes the interval.
// So a skip only completes it, and its focus time goes to what was worked on until its end.
export function catchUp() {
  if (isDue()) endDue(false)
}

export function skip() {
  if (isDue()) {
    catchUp()
    return
  }
  const wasRunning = isRunning()
  creditFocusTime()
  const from = state.timer.mode
  advance()
  commit()
  const msg = `Skipped ${MODES[from].label.toLowerCase()}. ${MODES[state.timer.mode].next}.`
  if (wasRunning) snackbar(`${msg} Press Start when you are.`)
  else announce(msg)
}

export function setIntervalTime(ms) {
  const t = state.timer
  t.durationMs = ms
  commit()
  announce(`${MODES[t.mode].label} set to ${fmtSpoken(ms)}`)
}

// Takes over the state another tab stored. When that tab ended the interval this tab showed, the end shows here
// too, without sound or notification.
export function adopt(raw = readStored()) {
  const before = state.timer
  const ended = isDue()
  // The other tab already moved the interval with the clock
  lastOffset = clockOffset()
  reload(raw)
  if (ended && state.timer.mode !== before.mode) {
    snackbar(`${MODES[before.mode].done}. ${MODES[state.timer.mode].next}.`)
  }
}

// With the app open in several tabs, the focused tab ends the interval and plays the alert. The others wait this
// long, then take the result over, or end the interval themselves when no tab of the app has focus.
const CLAIM_DELAY = 1000
export function endDue(wait = !document.hasFocus()) {
  // Another tab may have completed the interval or deleted all data already, and its storage event may not
  // have arrived yet
  const raw = readStored()
  if (raw !== storedJson) adopt(raw)
  if (!isDue() || (wait && Date.now() - state.timer.endAt < CLAIM_DELAY)) return
  complete(Date.now() - state.timer.endAt > LATE_AFTER)
}

// Setting the device clock back does not change the time left, the running interval moves back with the clock.
// The page's own clock never goes back, so the difference between the two shows how far the device clock went.
const clockOffset = () => Date.now() - performance.now()
let lastOffset = clockOffset()
export function followClock() {
  const offset = clockOffset()
  const back = lastOffset - offset
  lastOffset = offset
  if (back < 1000 || !isRunning()) return
  const t = state.timer
  t.endAt -= back
  if (t.segStart !== null) t.segStart -= back
  save()
}
