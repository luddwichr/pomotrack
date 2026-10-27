import { showPendingSnack } from './alerts.js'
import { $ } from './dom.js'
import { dayKey, KEY } from './model.js'
import { render } from './render.js'
import { adopt, creditFocusTime, endDue, followClock, isDue } from './timer.js'
import { renderTime } from './timer-view.js'
import { renderLiveTotals, renderTasks } from './tasks-view.js'
import { setOnChange } from './store.js'
// Modules whose event listeners have to be registered, also if no other module imports them
import './tasks-view.js'
import './drag.js'
import './timer-view.js'
import './shortcuts.js'
import './dialogs.js'

// A double click acts as a single click. Otherwise its second click would hit what took the place of the first,
// like the Delete button of the next task, or start the break that a skip just brought up.
// Only the buttons that step the estimate keep counting.
document.addEventListener(
  'click',
  (e) => {
    if (e.detail > 1 && e.target.closest('button:not([data-step])')) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  },
  true,
)

let installPrompt
window.addEventListener('beforeinstallprompt', (e) => {
  installPrompt = e
  $('#installBtn').hidden = false
})
// Also after an install from the browser menu
window.addEventListener('appinstalled', () => {
  installPrompt = null
  $('#installBtn').hidden = true
})
$('#installBtn').addEventListener('click', async () => {
  if (!installPrompt) return
  installPrompt.prompt()
  await installPrompt.userChoice
  installPrompt = null
  $('#installBtn').hidden = true
})
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}

// All open tabs share one state. A change in another tab replaces this tab's state, the last save wins.
window.addEventListener('storage', (e) => {
  if (e.key === KEY || e.key === null) adopt()
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') showPendingSnack()
  tick()
})

let renderedDay = dayKey()
function tick() {
  followClock()
  if (dayKey() !== renderedDay) {
    renderedDay = dayKey()
    renderTasks()
  }
  if (isDue()) {
    renderTime()
    endDue()
    return
  }
  // Focus time is credited as it passes, so the totals on screen and in the export are current.
  // It is saved with the next change, until then the stored segStart still covers it.
  creditFocusTime()
  renderTime()
  renderLiveTotals()
}

// Browsers throttle page timers in background tabs but not worker timers. Without a worker, the page ticks itself.
const tickHere = () => setInterval(tick, 250)
try {
  const worker = new Worker(
    URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),250)'], { type: 'text/javascript' })),
  )
  worker.onmessage = tick
  worker.onerror = tickHere
} catch {
  tickHere()
}

setOnChange(render)
render()
tick()
