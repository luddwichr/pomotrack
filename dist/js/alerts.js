import { $ } from './dom.js'
import { state } from './store.js'

// A modal dialog hides the rest of the page, also from screen readers, so messages go into the open dialog
function showIn(el) {
  const host = document.querySelector('dialog[open]') ?? document.body
  if (el.parentElement !== host) host.append(el)
}

let announceTimer
export function announce(msg) {
  const el = $('#announcer')
  showIn(el)
  el.textContent = ''
  clearTimeout(announceTimer)
  announceTimer = setTimeout(() => {
    el.textContent = msg
  }, 50)
}

// A message that comes while the page is hidden waits until it is visible again
let snackTimer
let pendingSnack = null
export function snackbar(msg) {
  if (document.visibilityState === 'hidden') {
    pendingSnack = msg
    return
  }
  const bar = $('#snackbar')
  showIn(bar)
  $('#snackText').textContent = msg
  bar.classList.add('show')
  clearTimeout(snackTimer)
  snackTimer = setTimeout(() => bar.classList.remove('show'), 4000)
  announce(msg)
}
export function showPendingSnack() {
  if (!pendingSnack) return
  snackbar(pendingSnack)
  pendingSnack = null
}

// Browsers only allow audio after a user gesture on the page. Every click or key press unlocks it, also after a reload.
let audioCtx
export function unlockAudio() {
  // Creating it outside a gesture would only log a warning. Without sound turned on, no audio is needed at all.
  if (!state.settings.sound || navigator.userActivation?.isActive === false) return
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
  } catch {}
}
addEventListener('pointerdown', unlockAudio, true)
addEventListener('keydown', unlockAudio, true)
// On touch screens, only the end of a tap allows audio
addEventListener('click', unlockAudio, true)
export function chime() {
  if (!state.settings.sound || audioCtx?.state !== 'running') return
  const t0 = audioCtx.currentTime
  ;[
    [660, 0],
    [880, 0.18],
    [990, 0.36],
  ].forEach(([freq, dt]) => {
    const osc = audioCtx.createOscillator(),
      gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0 + dt)
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + dt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.6)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start(t0 + dt)
    osc.stop(t0 + dt + 0.65)
  })
}

const NOTIFY_ICON = document.querySelector('link[rel="icon"]').href
export async function notify(title, body) {
  if (!state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return
  const opts = { body, icon: NOTIFY_ICON, badge: NOTIFY_ICON, tag: 'pomotrack', renotify: true }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await reg.showNotification(title, opts)
      return
    }
  } catch {}
  try {
    const n = new Notification(title, opts)
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* Android Chrome only shows notifications through a service worker */
  }
}

export async function enableNotifications() {
  if (!('Notification' in window)) {
    snackbar('This browser does not support notifications.')
    return false
  }
  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    snackbar('Notifications are not allowed. Check the notification permission in your browser site settings.')
    return false
  }
  return true
}
