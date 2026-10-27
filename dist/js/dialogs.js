import { enableNotifications, snackbar, unlockAudio } from './alerts.js'
import { $ } from './dom.js'
import { plural } from './format.js'
import { dayKey, isObject, normalizeActiveId, normalizeStats, normalizeTasks } from './model.js'
import { render } from './render.js'
import { clearStored, save, state } from './store.js'
import { closeAddForm, editing } from './tasks-view.js'
import { creditFocusTime } from './timer.js'

document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => {
    const clickedBackdrop = e.target === d
    if (clickedBackdrop || e.target.closest('[data-close]')) d.close()
  })
  // Messages shown in the dialog go back to the page. See showIn.
  d.addEventListener('close', () => document.body.append($('#snackbar'), $('#announcer')))
})
// A dialog opened from another one finds the scrollbar of the page gone already
function showModal(dialog) {
  const root = document.documentElement
  if (!$('dialog:modal')) root.style.setProperty('--scrollbar-width', `${innerWidth - root.clientWidth}px`)
  dialog.showModal()
}
export const showShortcuts = () => showModal($('#shortcutsDialog'))
$('#shortcutsBtn').addEventListener('click', showShortcuts)
const settingsForm = $('#settingsForm')
function renderNotifyHint() {
  const blocked = state.settings.notify && (!('Notification' in window) || Notification.permission !== 'granted')
  $('#notifyBlocked').hidden = !blocked
  settingsForm.elements.notify.setAttribute('aria-describedby', blocked ? 'notifyHelp notifyBlocked' : 'notifyHelp')
}
$('#settingsBtn').addEventListener('click', () => {
  for (const key of ['notify', 'sound']) settingsForm.elements[key].checked = state.settings[key]
  renderNotifyHint()
  showModal($('#settingsDialog'))
})

settingsForm.addEventListener('change', async (e) => {
  const input = e.target
  if (input.name === 'notify' && input.checked && !(await enableNotifications())) {
    input.checked = false
    return
  }
  state.settings[input.name] = input.checked
  // The click on the switch came before sound was on, so it did not allow audio yet
  if (input.name === 'sound') unlockAudio()
  renderNotifyHint()
  save()
  render()
})

$('#exportBtn').addEventListener('click', () => {
  const json = JSON.stringify({ tasks: state.tasks, stats: state.stats }, null, 2)
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([json], { type: 'application/json' })),
    download: `pomotrack-${dayKey()}.json`,
  })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
})

function parseImport(text) {
  try {
    const raw = JSON.parse(text)
    if (!isObject(raw) || !Array.isArray(raw.tasks) || !isObject(raw.stats)) return null
    return { tasks: normalizeTasks(raw.tasks), stats: normalizeStats(raw.stats) }
  } catch {
    return null
  }
}
function importData({ tasks, stats }) {
  creditFocusTime()
  state.tasks = tasks
  state.stats = stats
  state.activeId = normalizeActiveId(tasks, state.activeId)
  editing.clear()
  save()
  $('#settingsDialog').close()
  render()
  snackbar(`Imported ${plural(tasks.length, 'task')}`)
}
let pendingImport = null
$('#importBtn').addEventListener('click', () => $('#importFile').click())
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  const data = parseImport(await file.text())
  if (!data) snackbar('This file is not a Pomotrack export. Nothing was changed.')
  else if (state.tasks.length || Object.keys(state.stats).length) {
    pendingImport = data
    showModal($('#importDialog'))
  } else importData(data)
})
$('#confirmImport').addEventListener('click', () => {
  const data = pendingImport
  $('#importDialog').close()
  if (data) importData(data)
})
$('#importDialog').addEventListener('close', () => (pendingImport = null))

$('#wipeBtn').addEventListener('click', () => showModal($('#confirmDialog')))
$('#confirmWipe').addEventListener('click', () => {
  clearStored()
  editing.clear()
  closeAddForm(false)
  $('#confirmDialog').close()
  $('#settingsDialog').close()
  render()
  snackbar('All data deleted')
})
