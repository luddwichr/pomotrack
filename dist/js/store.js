import { dayKey, KEY, normalize, OTHER } from './model.js'

// The stored JSON as this tab last read or wrote it. When the stored value differs, another tab has changed it.
// A failed save leaves it unchanged, so this tab does not mistake its own older state for another tab's change.
export let storedJson = null
export function readStored() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
function load(raw) {
  storedJson = raw
  try {
    return normalize(JSON.parse(storedJson))
  } catch {
    return normalize(null)
  }
}
export function save() {
  const json = JSON.stringify(state)
  try {
    localStorage.setItem(KEY, json)
    storedJson = json
  } catch {}
}

export let state = load(readStored())

// Called after every change, to show it. main.js sets it, so the state and its changes know nothing about the page.
let onChange = () => {}
export function setOnChange(fn) {
  onChange = fn
}
export function commit() {
  save()
  onChange()
}
export function reload(raw = readStored()) {
  state = load(raw)
  onChange()
}
export function clearStored() {
  try {
    localStorage.removeItem(KEY)
    storedJson = null
  } catch {}
  state = normalize(null)
}
const EMPTY_STATS = { focusMs: 0, pomos: 0, otherMs: 0, otherSessions: 0 }
export const statsFor = (key) => state.stats[key] || EMPTY_STATS
export const dayStats = (time) => (state.stats[dayKey(new Date(time))] ??= { ...EMPTY_STATS })
export const findTask = (id) => state.tasks.find((t) => t.id === id)
export const activeTask = () => state.tasks.find((t) => t.id === state.activeId && !t.done) || null
export const onOther = () => state.activeId === OTHER
export const listTasks = () => state.tasks.filter((t) => !t.done)
