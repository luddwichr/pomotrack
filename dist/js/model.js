export const KEY = 'pomotrack.v1'
export const MIN = 60_000
export const MAX_DURATION = 12 * 60 * MIN
export const LATE_AFTER = MIN
export const MODES = {
  focus: { label: 'Focus', durationMs: 25 * MIN, done: 'Focus session done', next: 'Time to focus' },
  short: { label: 'Short break', durationMs: 5 * MIN, done: 'Break is over', next: 'Time for a short break' },
  long: { label: 'Long break', durationMs: 10 * MIN, done: 'Long break is over', next: 'Time for a long break' },
}
export const LONG_EVERY = 4
const DEFAULT_SETTINGS = { notify: false, sound: true }
// Working on something outside the listed tasks. It is not a valid task id, see isId.
export const OTHER = '@other'
export const MAX_EST_MIN = 720

export const freshTimer = (mode) => ({
  mode,
  durationMs: MODES[mode].durationMs,
  endAt: null,
  segStart: null,
  worked: [],
})

export const isObject = (v) => !!v && typeof v === 'object'
const isTime = (v) => Number.isFinite(v)
const isDuration = (ms) => Number.isInteger(ms) && ms >= 1000 && ms <= MAX_DURATION
const count = (v) => (Number.isFinite(v) && v >= 0 ? v : 0)
// Task ids end up in HTML attributes and selectors, so they are limited to the characters the app itself uses
const isId = (v) => typeof v === 'string' && /^[\w-]{1,64}$/.test(v)
export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseDayKey = (key) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
// A day that exists, written the way dayKey writes it
const isDayKey = (key) => /^\d{4}-\d{2}-\d{2}$/.test(key) && dayKey(parseDayKey(key)) === key

// Stored data is checked field by field. Unknown fields are dropped, invalid ones fall back to their defaults.
function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS }
  for (const key of ['notify', 'sound']) if (typeof raw[key] === 'boolean') s[key] = raw[key]
  return s
}
function normalizeTask(t) {
  if (!isObject(t) || !isId(t.id) || typeof t.title !== 'string') return null
  const done = t.done === true && isTime(t.doneAt)
  return {
    id: t.id,
    title: t.title,
    estMs: count(t.estMs),
    sessions: count(t.sessions),
    spentMs: count(t.spentMs),
    done,
    createdAt: isTime(t.createdAt) ? t.createdAt : Date.now(),
    doneAt: done ? t.doneAt : null,
  }
}
export function normalizeStats(raw) {
  const stats = {}
  for (const [key, st] of Object.entries(raw)) {
    if (!isDayKey(key) || !isObject(st)) continue
    stats[key] = {
      focusMs: count(st.focusMs),
      pomos: count(st.pomos),
      otherMs: count(st.otherMs),
      otherSessions: count(st.otherSessions),
    }
  }
  return stats
}
// Focus time not yet credited starts at segStart. It only exists while a focus session runs,
// and lies between the start and the end of that session. Without a valid segStart it is the start.
function normalizeTimer(raw) {
  const t = isObject(raw) ? raw : {}
  const mode = Object.hasOwn(MODES, t.mode) ? t.mode : 'focus'
  const durationMs = isDuration(t.durationMs) ? t.durationMs : MODES[mode].durationMs
  // A clock that was set back while the app was closed never leaves more time than the interval has
  const endAt = isTime(t.endAt) ? Math.min(t.endAt, Date.now() + durationMs) : null
  let segStart = null
  if (mode === 'focus' && endAt !== null) {
    const startAt = endAt - durationMs
    segStart = isTime(t.segStart) && t.segStart >= startAt && t.segStart <= endAt ? t.segStart : startAt
  }
  // What got focus time in the running session, so each task and Other count the session once
  const worked = segStart !== null && Array.isArray(t.worked) ? t.worked.filter((id) => isId(id) || id === OTHER) : []
  return { mode, durationMs, endAt, segStart, worked }
}
export function normalizeTasks(raw) {
  const ids = new Set()
  return (Array.isArray(raw) ? raw : []).map(normalizeTask).filter((t) => t && !ids.has(t.id) && ids.add(t.id))
}
export function normalizeActiveId(tasks, id) {
  return id === OTHER || tasks.some((t) => t.id === id && !t.done) ? id : null
}
export function normalize(raw) {
  const s = isObject(raw) ? raw : {}
  const tasks = normalizeTasks(s.tasks)
  return {
    settings: normalizeSettings(isObject(s.settings) ? s.settings : {}),
    tasks,
    activeId: normalizeActiveId(tasks, s.activeId),
    focusCount: Number.isInteger(s.focusCount) && s.focusCount >= 0 ? s.focusCount : 0,
    stats: normalizeStats(isObject(s.stats) ? s.stats : {}),
    timer: normalizeTimer(s.timer),
  }
}
