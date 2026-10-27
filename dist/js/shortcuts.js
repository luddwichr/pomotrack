import { showShortcuts } from './dialogs.js'
import { els } from './dom.js'
import { toggleHistory } from './history-view.js'
import { finishActive, moveActive } from './tasks.js'
import { openAddForm } from './tasks-view.js'
import { isRunning, skip, start } from './timer.js'
import { beginTimeEdit } from './timer-view.js'

// Whether the focused element got its focus through the keyboard, also when the app moved it after a key press.
// :focus-visible cannot tell, because a key press makes the focused element match it.
let lastInput = 'keyboard',
  focusedWithKeyboard = false
addEventListener('pointerdown', () => (lastInput = 'pointer'), true)
// Key combinations, like Alt+Tab to another window and back, do not make the focus show, so they do not count
addEventListener(
  'keydown',
  (e) => {
    const combo = e.ctrlKey || e.metaKey || e.altKey || ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)
    if (!combo) lastInput = 'keyboard'
  },
  true,
)
addEventListener('focusin', () => (focusedWithKeyboard = lastInput === 'keyboard'), true)

document.addEventListener('keydown', (e) => {
  // A held Enter does not repeat the click of a button, which would skip, finish or delete one item after another.
  // Only the buttons that step the estimate keep counting.
  if (e.repeat && e.key === 'Enter' && e.target.closest?.('button:not([data-step])')) e.preventDefault()
  // A held key does not repeat its shortcut. Key combinations belong to the browser, like Ctrl+F to find on the page.
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
  if (document.querySelector('dialog[open]')) return
  const el = document.activeElement ?? document.body
  // Shortcuts pause in text fields, and anywhere in a task form, where F could finish the task being edited
  if (el.matches('input:not([type=checkbox]):not([type=radio])') || el.closest('[data-form]')) return
  if (e.key === ' ') {
    // Space never skips, also not on the main button while the interval runs
    if (el === els.startBtn && isRunning()) {
      e.preventDefault()
      return
    }
    // A control focused with the keyboard handles Space itself. A click leaves the focus on what was clicked,
    // or moves it to the next row, without showing it, so Space would repeat the click on something unseen.
    const focusedControlHandlesSpace = el.tabIndex >= 0 && focusedWithKeyboard
    if (focusedControlHandlesSpace) return
    e.preventDefault()
    start()
    return
  }
  const actions = {
    s: skip,
    e: beginTimeEdit,
    n: openAddForm,
    f: finishActive,
    h: toggleHistory,
    j: () => moveActive(1),
    k: () => moveActive(-1),
    '?': showShortcuts,
  }
  const fn = actions[e.key.length === 1 ? e.key.toLowerCase() : '']
  if (fn) {
    e.preventDefault()
    fn()
  }
})
