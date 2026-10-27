import { snackbar } from './alerts.js'
import { $ } from './dom.js'
import { esc, fmtDuration, plural } from './format.js'
import { dayKey, parseDayKey } from './model.js'
import { state, statsFor } from './store.js'

const hist = { root: $('#history'), body: $('#historyBody'), count: $('#historyCount') }

function historyDays() {
  const days = new Map()
  const day = (key) => days.get(key) || days.set(key, []).get(key)
  for (const t of state.tasks) if (t.done) day(dayKey(new Date(t.doneAt))).push(t)
  for (const [key, st] of Object.entries(state.stats)) if (st.focusMs > 0 || st.pomos > 0) day(key)
  for (const tasks of days.values()) tasks.sort((a, b) => a.doneAt - b.doneAt)
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

function fmtDay(key) {
  const date = parseDayKey(key)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (key === dayKey()) return 'Today'
  if (key === dayKey(yesterday)) return 'Yesterday'
  const opts = { weekday: 'short', day: 'numeric', month: 'short' }
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  // In the language of the app, not the one of the browser
  return date.toLocaleDateString(document.documentElement.lang, opts)
}

const dayMetaText = (st) => `${fmtDuration(st.focusMs)} focused · ${plural(st.pomos, 'pomodoro')}`

function historyMetaHTML(spentMs, estMs, sessions) {
  const spent = fmtDuration(spentMs)
  const est = estMs > 0 ? fmtDuration(estMs) : ''
  return `${plural(sessions, 'session')} · <span aria-hidden="true">${spent}${est ? ` / ${est}` : ''}</span><span class="visually-hidden">${spent} tracked${est ? ` of ${est} estimated` : ''}</span>`
}
const otherHistoryMetaHTML = (st) => historyMetaHTML(st.otherMs, 0, st.otherSessions)

const historyItemHTML = (title, metaHTML, id = '') => `
    <li class="history-item">
      <div class="h-main">
        <span class="h-title">${esc(title)}</span>
      </div>
      <span class="h-meta"${id ? ` id="${id}"` : ''}>${metaHTML}</span>
    </li>`

function historyDayHTML(key, tasks) {
  const st = statsFor(key)
  const items = tasks.map((t) => historyItemHTML(t.title, historyMetaHTML(t.spentMs, t.estMs, t.sessions)))
  if (st.otherMs > 0) items.push(historyItemHTML('Other', otherHistoryMetaHTML(st), `ho-${key}`))
  return `
      <section class="history-day" aria-labelledby="hd-${key}">
        <h3 id="hd-${key}"><span>${esc(fmtDay(key))}</span><span class="day-meta">${dayMetaText(st)}</span></h3>
        ${tasks.length ? '' : '<p class="history-none">No tasks finished</p>'}
        ${items.length ? `<ul>${items.join('')}</ul>` : ''}
      </section>`
}

export function renderHistory() {
  const days = historyDays()
  hist.root.hidden = !days.length
  const n = days.reduce((sum, [, tasks]) => sum + tasks.length, 0)
  hist.count.textContent = `· ${plural(n, 'task')}, ${plural(days.length, 'day')}`
  if (!hist.root.open) {
    hist.body.innerHTML = ''
    return
  }
  hist.body.innerHTML = days.map(([key, tasks]) => historyDayHTML(key, tasks)).join('')
}

// Updates today's totals in place, so the history is not rebuilt while a focus session runs
export function renderHistoryToday(today) {
  const todayMeta = hist.root.open && hist.body.querySelector(`#hd-${dayKey()} .day-meta`)
  const otherLine = hist.root.open && hist.body.querySelector(`#ho-${dayKey()}`)
  if (todayMeta && (otherLine || !today.otherMs)) {
    todayMeta.textContent = dayMetaText(today)
    if (otherLine) otherLine.innerHTML = otherHistoryMetaHTML(today)
  }
  // Today or its Other line is not in the history yet, or the history is closed and only its count may change
  else renderHistory()
}

export function toggleHistory() {
  if (hist.root.hidden) {
    snackbar('No history yet. Finished tasks show up here.')
    return
  }
  hist.root.open = !hist.root.open
  hist.root.querySelector('summary').focus()
}

hist.root.addEventListener('toggle', renderHistory)
