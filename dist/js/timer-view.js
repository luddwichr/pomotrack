import { announce, snackbar } from './alerts.js'
import { els } from './dom.js'
import { esc, fmtClock, icon, parseTime } from './format.js'
import { LONG_EVERY, MAX_DURATION, MIN, MODES } from './model.js'
import { state } from './store.js'
import { activeTask, listTasks } from './store.js'
import { finishActive, workTitle } from './tasks.js'
import { focusAddTask, focusInRow } from './tasks-view.js'
import { isRunning, remaining, setIntervalTime, skip, start } from './timer.js'

// The main button skips a running interval, except right after a click started it, so a double click only starts
const SKIP_DELAY = 1000
// The arrow keys stop at 1 minute and 12 hours, and never raise a time that is below 1 minute.
function stepTimeInput(e) {
  e.preventDefault()
  const ms = parseTime(e.target.value) ?? state.timer.durationMs
  const step = (e.shiftKey ? 5 : 1) * MIN
  const next = e.key === 'ArrowUp' ? (Math.floor(ms / step) + 1) * step : (Math.ceil(ms / step) - 1) * step
  e.target.value = fmtClock(Math.max(Math.min(ms, MIN), Math.min(MAX_DURATION, next)))
  e.target.removeAttribute('aria-invalid')
  fitTime(e.target, e.target.value)
}

// A time with hours gets a smaller font to fit inside the ring
const fitTime = (el, text) => el.classList.toggle('hours', text.trim().length > 5)

export function renderTime(force = false) {
  const ms = remaining()
  const clock = fmtClock(ms)
  if (!force && els.timeBtn.textContent === clock) return
  const t = state.timer
  const progress = 1 - ms / t.durationMs
  els.ring.setAttribute('stroke-dashoffset', String(100 - progress * 100))
  els.ring.style.opacity = progress > 0 ? 1 : 0 // round caps would draw a dot at 0 %
  els.timeBtn.textContent = clock
  fitTime(els.timeBtn, clock)
  els.timeBtn.setAttribute('aria-label', `${clock} remaining${isRunning() ? '' : '. Edit time'}`)
  document.title = isRunning() ? `${clock} · ${MODES[t.mode].label}` : 'Pomotrack'
}

// The browser UI, like the address bar or the title bar of the installed app, takes the color of the page.
// It changes with the mode and with the light or dark theme of the device.
function renderThemeColor() {
  const surface = getComputedStyle(els.body).getPropertyValue('--surface').trim()
  if (els.themeMeta.content !== surface) els.themeMeta.content = surface
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderThemeColor)

export function renderTimer() {
  const t = state.timer,
    running = isRunning()
  // The interval started or changed while its time was being edited, so the typed time no longer applies
  if (editingMode && (editingMode !== t.mode || running)) cancelTimeEdit()
  els.body.dataset.mode = t.mode
  renderThemeColor()
  els.modeLabel.textContent = MODES[t.mode].label
  // While the interval runs, the main button skips it and takes over from the Skip button next to it.
  // The time can only be edited before Start. Focus on a control that goes away moves to the main button.
  if (running && [els.skipBtn, els.timeBtn].includes(document.activeElement)) els.startBtn.focus()
  // Its content is only replaced when it changes. Content replaced under the pointer loses the click, like the
  // click on Start that also applies a typed time.
  if (els.startBtn.classList.contains('running') !== running) {
    els.startBtn.classList.toggle('running', running)
    els.startBtn.title = running ? 'Skip to next step (S)' : 'Start (Space)'
    els.startBtn.innerHTML = running ? `${icon('skip')}<span>Skip</span>` : `${icon('play')}<span>Start</span>`
  }
  els.skipBtn.hidden = running
  els.timeBtn.disabled = running
  els.editHint.hidden = running
  if (running) els.timeBtn.removeAttribute('aria-describedby')
  else els.timeBtn.setAttribute('aria-describedby', 'editHint')

  const filled = Math.min(state.focusCount, LONG_EVERY)
  els.dots.innerHTML = Array.from(
    { length: LONG_EVERY },
    (_, i) => `<span class="${i < filled ? 'done' : i === filled && t.mode === 'focus' ? 'now' : ''}"></span>`,
  ).join('')
  els.roundText.textContent =
    t.mode === 'focus'
      ? `Session ${Math.min(state.focusCount + 1, LONG_EVERY)} of ${LONG_EVERY}`
      : `${filled} of ${LONG_EVERY} sessions done`

  const task = activeTask()
  const open = listTasks()
  els.currentText.innerHTML = state.activeId
    ? `Working on <strong>${esc(workTitle())}</strong>`
    : open.length
      ? 'Choose a task to track time on it.'
      : 'Add a task to track time on it.'
  // Finishing the task hides the Finish button, so its focus moves on to choosing or adding the next task
  if (!task && document.activeElement === els.finishBtn) {
    if (!open.length || !focusInRow(open[0].id, '[data-work]')) focusAddTask()
  }
  els.finishBtn.hidden = !task
  renderTime(true)
}

let clickStartedAt = -Infinity
els.startBtn.addEventListener('click', () => {
  if (!isRunning()) {
    clickStartedAt = performance.now()
    start()
  } else if (performance.now() - clickStartedAt >= SKIP_DELAY) skip()
})
els.skipBtn.addEventListener('click', skip)
els.finishBtn.addEventListener('click', finishActive)
let editingMode = null
// The time the field showed when editing began. Leaving it unchanged keeps the interval as it is.
let editingFrom = ''
export function beginTimeEdit() {
  if (editingMode) return
  if (isRunning()) {
    snackbar('The time can only be changed before Start.')
    return
  }
  editingMode = state.timer.mode
  editingFrom = els.timeInput.value = fmtClock(state.timer.durationMs)
  fitTime(els.timeInput, editingFrom)
  els.timeInput.removeAttribute('aria-invalid')
  els.timeBtn.hidden = true
  els.timeInput.hidden = false
  els.timeInput.focus()
  els.timeInput.select()
}
function endTimeEdit(commit) {
  if (!editingMode) return true
  commit &&= els.timeInput.value.trim() !== editingFrom
  const ms = commit ? parseTime(els.timeInput.value) : null
  if (commit && ms == null) {
    els.timeInput.setAttribute('aria-invalid', 'true')
    announce('Invalid time. Use minutes like 15 or mm:ss like 15:30.')
    return false
  }
  editingMode = null
  els.timeInput.hidden = true
  els.timeBtn.hidden = false
  if (commit) setIntervalTime(ms)
  return true
}
function cancelTimeEdit() {
  const hadFocus = document.activeElement === els.timeInput
  endTimeEdit(false)
  if (hadFocus) els.timeBtn.focus()
}
els.timeBtn.addEventListener('click', beginTimeEdit)
els.timeInput.addEventListener('input', () => fitTime(els.timeInput, els.timeInput.value))
els.timeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (endTimeEdit(true)) els.timeBtn.focus()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelTimeEdit()
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') stepTimeInput(e)
})
// Leaving the field applies a valid changed time, and drops an invalid one without a message
els.timeInput.addEventListener('blur', () => endTimeEdit(parseTime(els.timeInput.value) != null))
