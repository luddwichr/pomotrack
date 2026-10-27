import { announce } from './alerts.js'
import { esc, icon } from './format.js'
import { MAX_EST_MIN, MIN } from './model.js'

export function taskFormHTML(task) {
  const id = task ? task.id : 'new'
  return `
    <form class="task-form" data-form="${id}" aria-label="${task ? 'Edit task' : 'New task'}" novalidate>
      <div class="field">
        <label for="title-${id}">Task</label>
        <input type="text" id="title-${id}" name="title" maxlength="200" required autocomplete="off"
               placeholder="What are you working on?" value="${esc(task?.title ?? '')}">
      </div>
      <div class="field">
        <span class="field-label" id="est-label-${id}">Estimate in minutes</span>
        <div class="stepper" role="group" aria-labelledby="est-label-${id}">
          <button type="button" class="icon-btn tonal state-layer" data-step="-1" aria-label="5 minutes less">${icon('remove')}</button>
          <input type="number" name="est" min="0" max="${MAX_EST_MIN}" step="5" value="${task ? Math.round(task.estMs / MIN) : 25}" aria-labelledby="est-label-${id}" aria-describedby="est-help-${id}">
          <button type="button" class="icon-btn tonal state-layer" data-step="1" aria-label="5 minutes more">${icon('add')}</button>
        </div>
        <p class="helper" id="est-help-${id}">0 means no estimate.</p>
      </div>
      <div class="form-actions">
        <button type="button" class="btn text state-layer" data-cancel>Cancel</button>
        <button type="submit" class="btn filled state-layer">${task ? 'Save' : 'Add task'}</button>
      </div>
    </form>`
}
export function readForm(form) {
  const title = form.title.value.trim()
  if (!title) {
    form.title.setAttribute('aria-invalid', 'true')
    form.title.focus()
    announce('Task name is required')
    return null
  }
  const est = Math.max(0, Math.min(MAX_EST_MIN, parseInt(form.est.value, 10) || 0))
  return { title, estMs: est * MIN }
}
