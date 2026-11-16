import clsx from 'clsx'
import { Bell, Check, CheckCircle2, Circle, CircleDashed, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '../../components/ui/Button'
import { Badge, Card, ProgressBar, SubjectChip } from '../../components/ui/Display'
import { update } from '../../lib/db'
import { fmtDate, fmtDateTime, relative, urgency } from '../../lib/time'
import type { Priority, Task, TaskStatus } from '../../lib/types'
import { PRIORITY_LABEL, reminderLabel, setTaskStatus } from './taskUtils'

const NEXT: Record<TaskStatus, TaskStatus> = { pending: 'in_progress', in_progress: 'done', done: 'pending' }
const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Completada',
}
const PRIORITY_TONE: Record<Priority, 'danger' | 'warn' | 'neutral'> = {
  high: 'danger',
  medium: 'warn',
  low: 'neutral',
}

export function TaskCard({
  task: t,
  now,
  onEdit,
  onDelete,
}: {
  task: Task
  now: number
  onEdit: () => void
  onDelete: () => void
}) {
  const [showSteps, setShowSteps] = useState(true)
  const done = t.status === 'done'
  const u = urgency(t.dueAt, now)
  const total = t.checklist.length
  const doneSteps = t.checklist.filter((c) => c.done).length

  const toggleStep = (id: string) =>
    update('tasks', t.id, { checklist: t.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)) })

  const dueTone = done ? 'text-ink-3' : u === 'overdue' || u === 'urgent' ? 'text-danger' : u === 'soon' ? 'text-warn' : 'text-ink-2'

  const StatusIcon = t.status === 'done' ? CheckCircle2 : t.status === 'in_progress' ? CircleDashed : Circle

  return (
    <Card
      className={clsx(
        'relative flex gap-3 p-4 transition-opacity duration-200 sm:p-5',
        done && 'opacity-60 hover:opacity-90',
        !done && u === 'overdue' && 'border-danger/40',
      )}
    >
      <button
        type="button"
        onClick={() => setTaskStatus(t, NEXT[t.status])}
        aria-label={`Estado: ${STATUS_LABEL[t.status]}. Cambiar a ${STATUS_LABEL[NEXT[t.status]]}`}
        title={`Cambiar a ${STATUS_LABEL[NEXT[t.status]].toLowerCase()}`}
        className={clsx(
          '-ml-1.5 -mt-1.5 flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-surface-2',
          done ? 'text-ok' : t.status === 'in_progress' ? 'text-accent' : 'text-ink-3 hover:text-ink',
        )}
      >
        <StatusIcon className="size-[22px]" strokeWidth={1.75} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3
            className={clsx(
              'min-w-0 flex-1 pt-0.5 font-medium leading-snug [overflow-wrap:anywhere]',
              done && 'text-ink-2 line-through decoration-ink-3',
            )}
          >
            {t.title}
          </h3>
          <div className="-mr-2 -mt-1.5 flex shrink-0">
            <IconButton size="sm" label={`Editar ${t.title}`} onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton
              size="sm"
              label={`Eliminar ${t.title}`}
              onClick={onDelete}
              className="hover:!bg-danger-soft hover:!text-danger"
            >
              <Trash2 />
            </IconButton>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <SubjectChip subjectId={t.subjectId} />
          <Badge tone={done ? 'neutral' : PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
          {t.status === 'in_progress' && <Badge tone="accent">En progreso</Badge>}
          {done && (
            <Badge tone="ok">
              <Check />
              Completada{t.completedAt ? ` · ${fmtDate(t.completedAt)}` : ''}
            </Badge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
          <time dateTime={new Date(t.dueAt).toISOString()} className="font-mono text-ink-2 tnum">
            {fmtDateTime(t.dueAt)}
          </time>
          {!done && (
            <span className={clsx('font-mono font-medium tnum', dueTone)} aria-live="off">
              {u === 'overdue' ? `Vencida ${relative(t.dueAt, now)}` : `Vence ${relative(t.dueAt, now)}`}
            </span>
          )}
          {!done && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-2">
              <Bell className="size-3" aria-hidden />
              Aviso {reminderLabel(t.remindBeforeMin)}
            </span>
          )}
        </div>

        {t.description && (
          <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-ink-2 [overflow-wrap:anywhere]">
            {t.description}
          </p>
        )}

        {total > 0 && (
          <div className="mt-3 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setShowSteps((v) => !v)}
              aria-expanded={showSteps}
              className="flex w-full items-center gap-3 rounded text-left"
            >
              <span className="shrink-0 text-xs font-medium text-ink-2">
                Pasos <span className="font-mono tnum">{doneSteps}/{total}</span>
              </span>
              <ProgressBar
                value={doneSteps / total}
                tone={doneSteps === total ? 'ok' : 'accent'}
                label={`Progreso de pasos: ${doneSteps} de ${total}`}
              />
            </button>
            {showSteps && (
              <ul className="mt-2 space-y-0.5">
                {t.checklist.map((c) => (
                  <li key={c.id}>
                    <label className="flex min-h-9 cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 text-sm hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={c.done}
                        onChange={() => toggleStep(c.id)}
                        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-accent"
                      />
                      <span className={clsx('[overflow-wrap:anywhere]', c.done && 'text-ink-3 line-through')}>
                        {c.text}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
