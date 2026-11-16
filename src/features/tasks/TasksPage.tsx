import { ClipboardCheck, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { EmptyState, PageHeader, Toolbar } from '../../components/ui/Display'
import { SearchInput, SegmentedControl } from '../../components/ui/Form'
import { ConfirmModal } from '../../components/ui/Modal'
import { GlobalSubjectFilter } from '../../components/ui/SubjectSelect'
import { remove } from '../../lib/db'
import { useNow, useTasks } from '../../lib/hooks'
import { useUI } from '../../lib/store'
import { urgency } from '../../lib/time'
import type { Priority, Task, TaskStatus } from '../../lib/types'
import { TaskCard } from './TaskCard'
import { TaskForm } from './TaskForm'

type StatusFilter = 'all' | TaskStatus
type PriorityFilter = 'all' | Priority

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Vencidas y urgentes primero, luego por fecha; completadas al final (más recientes arriba). */
function smartSort(tasks: Task[], now: number): Task[] {
  const rank = (t: Task) => {
    const u = urgency(t.dueAt, now)
    return u === 'overdue' ? 0 : u === 'urgent' ? 1 : 2
  }
  const open = tasks.filter((t) => t.status !== 'done')
  const done = tasks.filter((t) => t.status === 'done')
  open.sort((a, b) => rank(a) - rank(b) || a.dueAt - b.dueAt || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  done.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))
  return [...open, ...done]
}

export function TasksPage() {
  const tasks = useTasks()
  const now = useNow(30_000)
  const subjectFilter = useUI((s) => s.subjectFilter)
  const [params, setParams] = useSearchParams()

  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [priority, setPriority] = useState<PriorityFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Task | undefined>()
  const [toDelete, setToDelete] = useState<Task | null>(null)

  // ?new=1 abre el formulario de creación y limpia el parámetro.
  useEffect(() => {
    if (params.get('new') !== '1') return
    setEditing(undefined)
    setFormOpen(true)
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next, { replace: true })
  }, [params, setParams])

  const visible = useMemo(() => {
    const nq = norm(q.trim())
    const rows = tasks.filter(
      (t) =>
        (status === 'all' || t.status === status) &&
        (priority === 'all' || t.priority === priority) &&
        (!nq || norm(`${t.title} ${t.description ?? ''}`).includes(nq)),
    )
    return smartSort(rows, now)
  }, [tasks, q, status, priority, now])

  const counts = useMemo(() => {
    const c = { all: tasks.length, pending: 0, in_progress: 0, done: 0, overdue: 0 }
    for (const t of tasks) {
      c[t.status]++
      if (t.status !== 'done' && t.dueAt < now) c.overdue++
    }
    return c
  }, [tasks, now])

  const openNew = () => {
    setEditing(undefined)
    setFormOpen(true)
  }

  const filtersActive = q.trim() !== '' || status !== 'all' || priority !== 'all'
  const clearFilters = () => {
    setQ('')
    setStatus('all')
    setPriority('all')
  }

  const description =
    tasks.length === 0
      ? 'Entregas, trabajos prácticos y pendientes con sus fechas.'
      : `${counts.pending + counts.in_progress} abiertas · ${counts.done} completadas` +
        (counts.overdue ? ` · ${counts.overdue} ${counts.overdue === 1 ? 'vencida' : 'vencidas'}` : '')

  return (
    <div>
      <PageHeader
        title="Tareas y entregas"
        description={description}
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openNew}>
            Nueva tarea
          </Button>
        }
      />

      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Buscar tareas" className="w-full sm:w-64" />
        <GlobalSubjectFilter className="w-full xs:w-auto" />
        <SegmentedControl<StatusFilter>
          label="Filtrar por estado"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'pending', label: 'Pendientes' },
            { value: 'in_progress', label: 'En progreso' },
            { value: 'done', label: 'Completadas' },
          ]}
        />
        <SegmentedControl<PriorityFilter>
          label="Filtrar por prioridad"
          value={priority}
          onChange={setPriority}
          options={[
            { value: 'all', label: 'Toda prioridad' },
            { value: 'high', label: 'Alta' },
            { value: 'medium', label: 'Media' },
            { value: 'low', label: 'Baja' },
          ]}
        />
      </Toolbar>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title={subjectFilter ? 'No hay tareas para esta materia' : 'No tienes tareas cargadas'}
          description="Crea una tarea con su fecha de entrega y te avisaremos antes de que venza."
          action={
            <Button variant="primary" icon={<Plus />} onClick={openNew}>
              Crear tarea
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Ninguna tarea coincide"
          description="Prueba con otros filtros o una búsqueda distinta."
          action={
            filtersActive && (
              <Button size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Tareas">
          {visible.map((t) => (
            <li key={t.id}>
              <TaskCard
                task={t}
                now={now}
                onEdit={() => {
                  setEditing(t)
                  setFormOpen(true)
                }}
                onDelete={() => setToDelete(t)}
              />
            </li>
          ))}
        </ul>
      )}

      <TaskForm open={formOpen} onClose={() => setFormOpen(false)} task={editing} />

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Eliminar tarea"
        message={
          <>
            Se eliminará <strong className="text-ink">{toDelete?.title}</strong> con todos sus pasos.
          </>
        }
        onConfirm={() => toDelete && void remove('tasks', toDelete.id)}
      />
    </div>
  )
}
