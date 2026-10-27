import { $, els } from './dom.js'
import { esc, fmtDuration, icon, plural, pluralWord } from './format.js'
import { renderHistory, renderHistoryToday } from './history-view.js'
import { dayKey, OTHER } from './model.js'
import { activeTask, findTask, listTasks, onOther, state, statsFor } from './store.js'
import { readForm, taskFormHTML } from './task-forms.js'
import { addTask, deleteTask, finishTask, toggleWork, updateTask } from './tasks.js'

// The tasks being edited, as they were when their form opened. Several can be edited at once, so opening one
// form never discards what was typed in another. A form is built from its copy, so a change from another tab
// leaves its markup the same and the open form, with what was typed, stays.
export const editing = new Map()

// Crediting focus time while a session runs changes today's totals and the time of what is worked on, nothing else.
// They are updated in place when a shown minute or session count changes, so no row is replaced under a click
// and the history is not rebuilt.
let liveTotals = ''
const liveTotalsKey = () => {
  const today = statsFor(dayKey()),
    task = activeTask()
  return `${fmtDuration(today.focusMs)} ${fmtDuration(task?.spentMs ?? 0)} ${task?.sessions} ${fmtDuration(today.otherMs)} ${today.otherSessions}`
}
export function renderLiveTotals() {
  if (liveTotalsKey() === liveTotals) return
  liveTotals = liveTotalsKey()
  const task = activeTask()
  const today = statsFor(dayKey())
  // The rows no longer match their markup, so the next render replaces them
  const meta = task && els.list.querySelector(`[data-meta="${task.id}"]`)
  if (meta) {
    meta.innerHTML = taskMetaHTML(task)
    rowMarkup.delete(meta.closest('[data-id]'))
  }
  const otherMeta = els.other.querySelector('[data-meta]')
  if (otherMeta) {
    otherMeta.innerHTML = otherMetaHTML(today)
    rowMarkup.delete(els.other)
  }
  renderSummary()
  renderHistoryToday(today)
}

const rowActionHTML = (attr, verb, iconName, title) =>
  `<button type="button" class="icon-btn state-layer" ${attr} aria-label="${verb} ${esc(title)}" title="${verb}">${icon(iconName)}</button>`

const workButtonHTML = (key, title, active) =>
  `<button type="button" class="icon-btn state-layer" data-work aria-pressed="${active}" aria-label="Work on ${esc(title)}" aria-describedby="m-${key}" title="${active ? 'Stop working on this' : 'Work on this'}">${icon(active ? 'pause' : 'play')}</button>`

function metaHTML(spentMs, estMs, sessions) {
  const spent = fmtDuration(spentMs)
  const est = estMs > 0 ? fmtDuration(estMs) : ''
  return `<span title="Time tracked / estimated">${icon('schedule')}<span aria-hidden="true">${spent}${est ? ` / ${est}` : ''}</span><span class="visually-hidden">${spent} tracked${est ? ` of ${est} estimated` : ''}, </span></span>
          <span title="Focus sessions worked in">${icon('timer')}${plural(sessions, 'session')}</span>`
}
const taskMetaHTML = (task) => metaHTML(task.spentMs, task.estMs, task.sessions)
const otherMetaHTML = (today) => `<span>Today</span>${metaHTML(today.otherMs, 0, today.otherSessions)}`

function taskRowHTML(task) {
  const active = task.id === state.activeId
  const draft = editing.get(task.id)
  if (draft) return `<li class="task" data-id="${task.id}">${taskFormHTML(draft)}</li>`
  return `
    <li class="task${active ? ' active' : ''}" data-id="${task.id}">
      <button type="button" class="icon-btn state-layer drag-handle" data-drag aria-label="Move ${esc(task.title)}" aria-describedby="dragHelp" title="Drag to reorder">${icon('drag')}</button>
      <div class="task-main">
        <span class="task-title">${esc(task.title)}</span>
        <span class="task-meta" id="m-${task.id}" data-meta="${task.id}">${taskMetaHTML(task)}</span>
      </div>
      <span class="task-actions">
        ${workButtonHTML(task.id, task.title, active)}
        ${rowActionHTML('data-edit', 'Edit', 'edit', task.title)}
        ${rowActionHTML('data-finish', 'Finish', 'check', task.title)}
        ${rowActionHTML('data-delete', 'Delete', 'delete', task.title)}
      </span>
    </li>`
}

function otherRowHTML() {
  const active = onOther()
  return `
    <div class="task other${active ? ' active' : ''}">
      <div class="task-main">
        <span class="task-title">Other</span>
        <span class="task-meta" id="m-other" data-meta>${otherMetaHTML(statsFor(dayKey()))}</span>
      </div>
      <span class="task-actions">${workButtonHTML('other', 'Other', active)}</span>
    </div>`
}

function renderOther() {
  const html = otherRowHTML().trim()
  if (rowMarkup.get(els.other) === html) return
  const hadFocus = els.other.contains(document.activeElement)
  els.other.innerHTML = html
  rowMarkup.set(els.other, html)
  if (hadFocus) $('[data-work]', els.other).focus({ preventScroll: true })
}

// Rows are not re-rendered while a drag holds them, because that would replace the row being dragged. The drag
// renders them when it ends.
let rowsHeld = false
export const holdRows = (held) => (rowsHeld = held)

const ROW_CONTROLS = ['[data-drag]', '[data-work]', '[data-edit]', '[data-finish]', '[data-delete]']
const rowMarkup = new WeakMap()
const template = document.createElement('template')

export function renderTasks() {
  if (!rowsHeld) renderRows()
  renderOther()
  renderEmpty()
  renderSummary()
  renderHistory()
  liveTotals = liveTotalsKey()
}

function renderRows() {
  const visible = listTasks()
  const visibleIds = new Set(visible.map((t) => t.id))
  // Edit forms of tasks that another tab finished or deleted are gone
  for (const id of editing.keys()) if (!visibleIds.has(id)) editing.delete(id)
  const focused = els.list.contains(document.activeElement) ? document.activeElement : null
  const selection = focused && textSelection(focused)
  const focusKind = focused && ROW_CONTROLS.find((sel) => focused.matches(sel))
  const focusRow = focusKind && focused.closest('[data-id]')
  const focusIndex = focusKind && [...els.list.children].indexOf(focusRow)
  // Rows that left go first, so the rows that stay are not moved, which would take the focus from them
  const old = new Map()
  for (const li of [...els.list.children]) {
    if (visibleIds.has(li.dataset.id)) old.set(li.dataset.id, li)
    else li.remove()
  }
  let prev = null
  for (const task of visible) {
    const html = taskRowHTML(task).trim()
    let li = old.get(task.id)
    old.delete(task.id)
    if (rowMarkup.get(li) !== html) {
      template.innerHTML = html
      const fresh = template.content.firstElementChild
      rowMarkup.set(fresh, html)
      li?.remove()
      li = fresh
    }
    const next = prev ? prev.nextElementSibling : els.list.firstElementChild
    if (li !== next) els.list.insertBefore(li, next)
    prev = li
  }
  if (!focused || document.activeElement === focused) return
  if (focused.isConnected) {
    focused.focus({ preventScroll: true })
    if (selection) focused.setSelectionRange(...selection)
  } else if (focusKind && !focusInRow(focusRow.dataset.id, focusKind)) {
    // The row left the list, so focus moves to the same control in the row that took its place
    focusNearest([...els.list.children], focusIndex, focusKind)
  }
}

// The selection in a text field, which moving the field would lose
function textSelection(el) {
  try {
    return typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd, el.selectionDirection] : null
  } catch {
    return null
  }
}

function renderSummary() {
  const today = statsFor(dayKey())
  els.summary.innerHTML = `<span>Today <strong>${fmtDuration(today.focusMs)}</strong> focused · <strong>${today.pomos}</strong> ${pluralWord(today.pomos, 'pomodoro')}</span>`
}

export function renderEmpty() {
  els.empty.textContent = state.tasks.length
    ? 'No open tasks. Add one to keep tracking.'
    : 'No tasks yet. Add one to see where your focus time goes.'
  els.empty.hidden = els.list.childElementCount > 0 || addFormOpen()
}

function focusNearest(rows, index, selector) {
  const row = rows[Math.min(index, rows.length - 1)]
  const el = row?.querySelector(selector)
  if (el) el.focus({ preventScroll: true })
  else focusAddTask()
}
export const focusAddTask = () => (els.addBtn.hidden ? $('#tasks-heading') : els.addBtn).focus({ preventScroll: true })
export function focusInRow(id, selector) {
  const el = els.list.querySelector(`[data-id="${id}"] ${selector}`)
  el?.focus({ preventScroll: true })
  return !!el
}

els.other.addEventListener('click', (e) => {
  if (e.target.closest('[data-work]')) toggleWork(OTHER)
})
els.list.addEventListener('click', (e) => {
  const li = e.target.closest('[data-id]')
  if (!li) return
  if (e.target.closest('[data-work]')) toggleWork(li.dataset.id)
  else if (e.target.closest('[data-finish]')) finishTask(li.dataset.id)
  else if (e.target.closest('[data-delete]')) deleteTask(li.dataset.id)
  else if (e.target.closest('[data-edit]')) {
    editing.set(li.dataset.id, { ...findTask(li.dataset.id) })
    renderTasks()
    $(`#title-${li.dataset.id}`).focus()
  }
})

const addFormOpen = () => !!els.addSlot.firstElementChild

export function openAddForm() {
  if (!addFormOpen()) els.addSlot.innerHTML = taskFormHTML(null)
  els.addBtn.hidden = true
  renderEmpty()
  $('#title-new').focus()
}
export function closeAddForm(focusAdd = true) {
  els.addSlot.innerHTML = ''
  els.addBtn.hidden = false
  renderEmpty()
  if (focusAdd) els.addBtn.focus()
}
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]')
  if (!form) return
  e.preventDefault()
  const data = readForm(form)
  if (!data) return
  if (form.dataset.form === 'new') {
    addTask(data)
    form.reset()
    form.title.focus()
  } else {
    closeEditForm(form.dataset.form, data)
  }
})

document.addEventListener('click', (e) => {
  const form = e.target.closest('[data-form]')
  if (form) {
    const step = e.target.closest('[data-step]')
    if (step) {
      form.est.stepUp(Number(step.dataset.step))
      return
    }
    if (e.target.closest('[data-cancel]')) cancelForm(form)
  }
})

function cancelForm(form) {
  if (form.dataset.form === 'new') closeAddForm()
  else closeEditForm(form.dataset.form)
}

function closeEditForm(id, changes) {
  editing.delete(id)
  if (changes) updateTask(id, changes)
  else renderTasks()
  focusInRow(id, '[data-edit]')
}

document.addEventListener('keydown', (e) => {
  const form = e.target.closest?.('[data-form]')
  if (form && e.key === 'Escape') {
    e.preventDefault()
    cancelForm(form)
  }
})
document.addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'))
els.addBtn.addEventListener('click', openAddForm)
