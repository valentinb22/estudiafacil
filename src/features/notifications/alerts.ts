import { DAY, urgency, type Urgency } from '../../lib/time'
import type { Exam, Task } from '../../lib/types'

export interface AlertItem {
  key: string
  kind: 'task' | 'exam'
  id: string
  title: string
  at: number
  subjectId?: string
  urgency: Urgency
  tone: 'danger' | 'warn' | 'neutral'
  href: string
}

/**
 * Reúne tareas pendientes (incluidas vencidas) y exámenes futuros dentro de los horizontes dados,
 * ordenados por fecha (lo vencido primero).
 */
export function collectAlerts(
  tasks: Task[],
  exams: Exam[],
  now: number,
  { taskHorizon = 7 * DAY, examHorizon = 7 * DAY }: { taskHorizon?: number; examHorizon?: number } = {},
): AlertItem[] {
  const out: AlertItem[] = []
  for (const t of tasks) {
    if (t.status === 'done' || t.dueAt - now >= taskHorizon) continue
    out.push(make('task', t.id, t.title, t.dueAt, t.subjectId, now))
  }
  for (const e of exams) {
    if (e.at < now || e.at - now >= examHorizon) continue
    out.push(make('exam', e.id, e.title, e.at, e.subjectId, now))
  }
  return out.sort((a, b) => a.at - b.at)
}

function make(kind: AlertItem['kind'], id: string, title: string, at: number, subjectId: string | undefined, now: number): AlertItem {
  const u = urgency(at, now)
  return {
    key: `${kind}:${id}`,
    kind,
    id,
    title,
    at,
    subjectId,
    urgency: u,
    tone: u === 'overdue' || u === 'urgent' ? 'danger' : u === 'soon' ? 'warn' : 'neutral',
    href: kind === 'task' ? '/tareas' : '/examenes',
  }
}

export const toneText = { danger: 'text-danger', warn: 'text-warn', neutral: 'text-ink-2' } as const
export const toneDot = { danger: 'bg-danger', warn: 'bg-warn', neutral: 'bg-ink-3' } as const
