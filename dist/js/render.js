import { renderTasks } from './tasks-view.js'
import { renderTimer } from './timer-view.js'

export function render() {
  renderTimer()
  renderTasks()
}
