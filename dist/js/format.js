import { MAX_DURATION, MIN } from './model.js'

export const esc = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`
export const pluralWord = (n, word) => `${word}${n === 1 ? '' : 's'}`
export const plural = (n, word) => `${n} ${pluralWord(n, word)}`

export function fmtClock(ms) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60
  const mm = String(m).padStart(2, '0'),
    ss = String(s).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
export function fmtDuration(ms) {
  const mins = Math.round(ms / MIN)
  if (mins < 1) return ms > 0 ? '<1 min' : '0 min'
  const h = Math.floor(mins / 60),
    m = mins % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}
export function fmtSpoken(ms) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60),
    s = total % 60
  return `${plural(m, 'minute')}${s ? ` ${plural(s, 'second')}` : ''}`
}
// Parses minutes, mm:ss or h:mm:ss into milliseconds, from 1 second to 12 hours. Only a colon separates.
// After a colon, two digits are required, so 15:5 is rejected instead of being read as 15:05.
// Spaces are only allowed around the time, so 1 5 is rejected instead of being read as 15.
export function parseTime(input) {
  const str = input.trim()
  let sec
  if (/^\d{1,3}$/.test(str)) sec = +str * 60
  else if (/^\d{1,3}:\d\d$/.test(str)) {
    const [m, s] = str.split(':').map(Number)
    if (s > 59) return null
    sec = m * 60 + s
  } else if (/^\d{1,2}:\d\d:\d\d$/.test(str)) {
    const [h, m, s] = str.split(':').map(Number)
    if (m > 59 || s > 59) return null
    sec = h * 3600 + m * 60 + s
  } else return null
  return sec >= 1 && sec * 1000 <= MAX_DURATION ? sec * 1000 : null
}
