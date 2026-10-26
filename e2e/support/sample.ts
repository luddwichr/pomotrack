import type { ExportedData } from './app'
import { DAY, HOUR, MINUTE, NOW, dayKey, finishedTask, task } from './state'

/**
 * A sample day for the screenshots, as a file of Export JSON. The screenshots work on "Write project proposal".
 * A focus session that runs in the screenshot adds the time it ran to that task and to today, so `focusSoFar` of it
 * is left out of the file.
 */
export function sampleDayFile(focusSoFar = 0): ExportedData {
  return {
    tasks: [
      task({
        id: 't1',
        title: 'Write project proposal',
        estMs: 2 * HOUR,
        sessions: 3,
        spentMs: 52 * MINUTE - focusSoFar,
      }),
      task({ id: 't2', title: 'Review pull requests', estMs: 45 * MINUTE, sessions: 1, spentMs: 25 * MINUTE }),
      task({ id: 't3', title: 'Prepare team meeting' }),
      finishedTask({
        id: 't4',
        title: 'Reply to customer emails',
        estMs: 30 * MINUTE,
        sessions: 2,
        spentMs: 22 * MINUTE,
        doneAt: NOW - 30 * MINUTE,
      }),
      finishedTask({
        id: 'h1',
        title: 'Update onboarding guide',
        estMs: 90 * MINUTE,
        sessions: 4,
        spentMs: 78 * MINUTE,
        doneAt: NOW - DAY,
      }),
      finishedTask({
        id: 'h2',
        title: 'Fix login bug',
        estMs: HOUR,
        sessions: 2,
        spentMs: 47 * MINUTE,
        doneAt: NOW - DAY,
      }),
      finishedTask({
        id: 'h3',
        title: 'Plan sprint',
        estMs: HOUR,
        sessions: 2,
        spentMs: 50 * MINUTE,
        doneAt: NOW - 2 * DAY,
      }),
    ],
    stats: {
      [dayKey(NOW)]: { focusMs: 99 * MINUTE - focusSoFar, pomos: 4, otherMs: 0, otherSessions: 0 },
      [dayKey(NOW - DAY)]: { focusMs: 140 * MINUTE, pomos: 5, otherMs: 15 * MINUTE, otherSessions: 1 },
      [dayKey(NOW - 2 * DAY)]: { focusMs: 75 * MINUTE, pomos: 3, otherMs: 25 * MINUTE, otherSessions: 1 },
    },
  }
}
