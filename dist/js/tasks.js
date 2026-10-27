import { announce, snackbar } from './alerts.js'
import { OTHER } from './model.js'
import { activeTask, commit, findTask, listTasks, onOther, state } from './store.js'
import { catchUp, creditFocusTime } from './timer.js'

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const workTitle = () => (onOther() ? 'Other' : activeTask()?.title)

// Only the user chooses what they work on: a task, Other, or nothing
function workOn(id) {
  catchUp()
  if (state.activeId === id) return
  creditFocusTime()
  state.activeId = id
  commit()
  announce(id ? `Working on ${workTitle()}` : 'Not working on anything')
}
export const toggleWork = (id) => workOn(state.activeId === id ? null : id)

export function addTask({ title, estMs }) {
  catchUp()
  const task = {
    id: uid(),
    title,
    estMs,
    sessions: 0,
    spentMs: 0,
    done: false,
    createdAt: Date.now(),
    doneAt: null,
  }
  state.tasks.push(task)
  commit()
  announce(`Added task ${title}`)
}

export function updateTask(id, fields) {
  const task = findTask(id)
  if (!task) return
  Object.assign(task, fields)
  commit()
}

function release(id) {
  if (state.activeId !== id) return
  creditFocusTime()
  state.activeId = null
}

export function finishTask(id) {
  catchUp()
  const task = findTask(id)
  if (!task || task.done) return
  release(id)
  task.done = true
  task.doneAt = Date.now()
  commit()
  snackbar(`Finished "${task.title}"`)
}

export function finishActive() {
  const task = activeTask()
  if (task) finishTask(task.id)
  else snackbar('No current task to finish.')
}

export function deleteTask(id) {
  catchUp()
  const task = findTask(id)
  if (!task) return
  release(id)
  state.tasks = state.tasks.filter((t) => t !== task)
  commit()
  snackbar(`Deleted "${task.title}"`)
}

// J and K work on the next or previous open task, with Other after the last one, wrapping around.
// Without anything being worked on, J starts with the first task and K with Other.
export function moveActive(dir) {
  const ids = [...listTasks().map((t) => t.id), OTHER]
  const i = ids.indexOf(state.activeId)
  workOn(i < 0 ? ids.at(dir > 0 ? 0 : -1) : ids[(i + dir + ids.length) % ids.length])
}
// Finished tasks keep their place in the stored order, only the open tasks are rearranged
export function applyListOrder(ids, movedId) {
  const byId = new Map(state.tasks.map((t) => [t.id, t]))
  let i = 0
  state.tasks = state.tasks.map((t) => (t.done ? t : byId.get(ids[i++])))
  commit()
  announce(`Moved to position ${ids.indexOf(movedId) + 1} of ${ids.length}`)
}
