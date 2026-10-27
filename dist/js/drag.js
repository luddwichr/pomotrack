import { els } from './dom.js'
import { render } from './render.js'
import { listTasks } from './store.js'
import { applyListOrder } from './tasks.js'
import { focusInRow, holdRows } from './tasks-view.js'

els.list.addEventListener('keydown', (e) => {
  const handle = e.target.closest('[data-drag]')
  if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
  e.preventDefault()
  const id = handle.closest('[data-id]').dataset.id
  const ids = listTasks().map((t) => t.id)
  const from = ids.indexOf(id),
    to = from + (e.key === 'ArrowUp' ? -1 : 1)
  if (from < 0 || to < 0 || to >= ids.length) return
  ;[ids[from], ids[to]] = [ids[to], ids[from]]
  applyListOrder(ids, id)
})

let drag = null
// A row is dragged by its handle or by any part of it outside its buttons. Outside the handle, the drag is pending
// until a mouse moves, or until a finger has rested on the row for a moment, so that a swipe still scrolls the page.
const LONG_PRESS_MS = 350
els.list.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || drag) return
  const li = e.target.closest('[data-id]')
  const handle = e.target.closest('[data-drag]')
  if (!li?.querySelector('[data-drag]') || (!handle && e.target.closest('button'))) return
  if (handle || e.pointerType === 'mouse') e.preventDefault()
  holdRows(true)
  drag = { li, id: li.dataset.id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, pending: true }
  if (handle) startDrag()
  else if (e.pointerType !== 'mouse') drag.timer = setTimeout(startDrag, LONG_PRESS_MS)
})
function startDrag() {
  const { li, pointerId, y } = drag
  li.setPointerCapture(pointerId)
  Object.assign(drag, {
    pending: false,
    offset: y - li.getBoundingClientRect().top,
    from: [...els.list.children].indexOf(li),
  })
  li.classList.add('dragging')
  document.body.classList.add('is-dragging')
}
// A finger on a row may scroll the page, and that cannot change while it is down. So a drag cancels its touch moves.
els.list.addEventListener('touchmove', (e) => drag && !drag.pending && e.cancelable && e.preventDefault(), {
  passive: false,
})
// A long press would otherwise open a menu or select text
els.list.addEventListener('contextmenu', (e) => drag && e.preventDefault())
// Moving the dragged row drops its pointer capture, so the drag follows the pointer on the whole window.
// Otherwise a release outside the list would never end the drag, and the list would stop updating.
addEventListener('pointermove', (e) => {
  if (!drag) return
  const y = e.clientY
  if (drag.pending) {
    const moved = Math.hypot(e.clientX - drag.x, y - drag.y)
    if (e.pointerType !== 'mouse') return moved > 8 && endDrag(false)
    if (moved <= 4) return
    startDrag()
  }
  const before =
    [...els.list.children].find((el) => el !== drag.li && y < el.getBoundingClientRect().top + el.offsetHeight / 2) ||
    null
  if (before !== drag.li.nextElementSibling) els.list.insertBefore(drag.li, before)
  drag.li.style.transform = ''
  drag.li.style.transform = `translateY(${y - drag.offset - drag.li.getBoundingClientRect().top}px)`
  // The sticky top bar covers the top of the window
  if (y < els.topBar.getBoundingClientRect().bottom + 48) scrollBy(0, -12)
  else if (y > innerHeight - 48) scrollBy(0, 12)
})
function endDrag(commit) {
  if (!drag) return
  const { li, id, from, pending, timer } = drag
  drag = null
  holdRows(false)
  clearTimeout(timer)
  // Rows were not rendered while the drag was pending either
  if (pending) return render()
  li.style.transform = ''
  li.classList.remove('dragging')
  document.body.classList.remove('is-dragging')
  const order = [...els.list.children].map((el) => el.dataset.id)
  const open = listTasks().map((t) => t.id)
  // Tasks added, finished or deleted during the drag, for example in another tab, make the new order meaningless
  const sameTasks = order.length === open.length && open.every((taskId) => order.includes(taskId))
  if (commit && sameTasks && order.indexOf(id) !== from) applyListOrder(order, id)
  else render()
  focusInRow(id, '[data-drag]')
}
addEventListener('pointerup', () => endDrag(true))
addEventListener('pointercancel', () => endDrag(false))
// A release outside the browser window may never arrive
addEventListener('blur', () => endDrag(false))
