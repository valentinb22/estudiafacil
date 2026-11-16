import { update } from '../../lib/db'
import { playChime } from '../../lib/sound'
import type { Priority, Task, TaskStatus } from '../../lib/types'

export const REMINDERS = [
  { value: 15, label: '15 min antes' },
  { value: 60, label: '1 h antes' },
  { value: 180, label: '3 h antes' },
  { value: 1440, label: '1 día antes' },
  { value: 2880, label: '2 días antes' },
  { value: 10080, label: '1 semana antes' },
] as const

export const reminderLabel = (min: number) =>
  REMINDERS.find((r) => r.value === min)?.label ?? `${min} min antes`

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

/** Cambia el estado; al completar suena y registra la fecha. */
export async function setTaskStatus(task: Task, status: TaskStatus) {
  if (status === 'done') playChime()
  await update('tasks', task.id, {
    status,
    completedAt: status === 'done' ? Date.now() : undefined,
  })
}

