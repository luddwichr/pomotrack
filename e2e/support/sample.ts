import type { ExportedData } from './app'
import { DAY, MINUTE, NOW, dayKey, finishedTask, task } from './state'

/**
 * A sample day for the screenshots, as a file of Export JSON. "Write project proposal" is the first open task, so it
 * becomes the current task. A focus session that runs in the screenshot adds the time it ran to that task and to
 * today, so `focusSoFar` of it is left out of the file.
 */
export function sampleDayFile(focusSoFar = 0): ExportedData {
  return {
    tasks: [
      task({
        id: 't1',
        title: 'Write project proposal',
        est: 4,
        pomos: 2,
        spentMs: 52 * MINUTE - focusSoFar,
        notes: 'Budget section still missing',
      }),
      task({ id: 't2', title: 'Review pull requests', est: 2, pomos: 1, spentMs: 25 * MINUTE }),
      task({ id: 't3', title: 'Prepare team meeting' }),
      finishedTask({
        id: 't4',
        title: 'Reply to customer emails',
        pomos: 1,
        spentMs: 22 * MINUTE,
        doneAt: NOW - 30 * MINUTE,
      }),
      finishedTask({
        id: 'h1',
        title: 'Update onboarding guide',
        est: 3,
        pomos: 3,
        spentMs: 78 * MINUTE,
        notes: 'Added screenshots and an FAQ',
        doneAt: NOW - DAY,
      }),
      finishedTask({ id: 'h2', title: 'Fix login bug', est: 2, pomos: 2, spentMs: 47 * MINUTE, doneAt: NOW - DAY }),
      finishedTask({ id: 'h3', title: 'Plan sprint', est: 2, pomos: 2, spentMs: 50 * MINUTE, doneAt: NOW - 2 * DAY }),
    ],
    stats: {
      [dayKey(NOW)]: { focusMs: 99 * MINUTE - focusSoFar, pomos: 4 },
      [dayKey(NOW - DAY)]: { focusMs: 125 * MINUTE, pomos: 5 },
      [dayKey(NOW - 2 * DAY)]: { focusMs: 75 * MINUTE, pomos: 3 },
    },
  }
}
