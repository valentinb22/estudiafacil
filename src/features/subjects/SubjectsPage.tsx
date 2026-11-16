import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpen, CalendarClock, Clock, Filter, FileText, Headphones, ListTodo, MapPin, Pencil, Plus, Trash2, User,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Card, EmptyState, PageHeader, Toolbar } from '../../components/ui/Display'
import { SearchInput } from '../../components/ui/Form'
import { ConfirmModal } from '../../components/ui/Modal'
import { SortableGrid } from '../../components/ui/Sortable'
import { db, remove, reorder } from '../../lib/db'
import { useSubjects } from '../../lib/hooks'
import { useUI } from '../../lib/store'
import type { Subject } from '../../lib/types'
import { SubjectForm } from './SubjectForm'

interface Metrics {
  tasks: number
  exams: number
  files: number
  audios: number
}

const ZERO: Metrics = { tasks: 0, exams: 0, files: 0, audios: 0 }

/** Conteos por materia (ignora borrados). Tareas: no completadas. Exámenes: próximos. */
function useSubjectMetrics(): Map<string, Metrics> {
  return (
    useLiveQuery(async () => {
      const [tasks, exams, files, audios] = await Promise.all([
        db.tasks.toArray(),
        db.exams.toArray(),
        db.files.toArray(),
        db.audios.toArray(),
      ])
      const now = Date.now()
      const m = new Map<string, Metrics>()
      const bump = (sid: string | undefined, k: keyof Metrics) => {
        if (!sid) return
        const cur = m.get(sid) ?? { ...ZERO }
        cur[k]++
        m.set(sid, cur)
      }
      tasks.forEach((t) => !t.deleted && t.status !== 'done' && bump(t.subjectId, 'tasks'))
      exams.forEach((e) => !e.deleted && e.at >= now && bump(e.subjectId, 'exams'))
      files.forEach((f) => !f.deleted && bump(f.subjectId, 'files'))
      audios.forEach((a) => !a.deleted && bump(a.subjectId, 'audios'))
      return m
    }, []) ?? new Map()
  )
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function SubjectsPage() {
  const subjects = useSubjects()
  const metrics = useSubjectMetrics()
  const subjectFilter = useUI((s) => s.subjectFilter)
  const setSubjectFilter = useUI((s) => s.setSubjectFilter)

  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Subject | undefined>()
  const [formOpen, setFormOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Subject | null>(null)

  const filtered = useMemo(() => {
    const nq = norm(q.trim())
    if (!nq) return subjects
    return subjects.filter((s) => norm(`${s.name} ${s.code} ${s.professor ?? ''}`).includes(nq))
  }, [subjects, q])

  const openNew = () => {
    setEditing(undefined)
    setFormOpen(true)
  }
  const openEdit = (s: Subject) => {
    setEditing(s)
    setFormOpen(true)
  }

  const nextOrder = subjects.length ? Math.max(...subjects.map((s) => s.order)) + 1 : 0
  const searching = q.trim().length > 0

  const renderCard = (s: Subject, handle?: ReactNode) => (
    <SubjectCard
      subject={s}
      metrics={metrics.get(s.id) ?? ZERO}
      active={subjectFilter === s.id}
      handle={handle}
      onFilter={() => setSubjectFilter(subjectFilter === s.id ? null : s.id)}
      onEdit={() => openEdit(s)}
      onDelete={() => setToDelete(s)}
    />
  )

  const gridClass = 'grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3'

  return (
    <div>
      <PageHeader
        title="Materias"
        description={
          subjects.length
            ? `${subjects.length} ${subjects.length === 1 ? 'materia' : 'materias'} este cuatrimestre. Arrastra para reordenar.`
            : 'Organiza tus cursos, profesores y horarios.'
        }
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openNew}>
            Nueva materia
          </Button>
        }
      />

      {subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="Todavía no tienes materias"
          description="Crea tu primera materia para agrupar tareas, exámenes, notas y material de estudio."
          action={
            <Button variant="primary" icon={<Plus />} onClick={openNew}>
              Crear materia
            </Button>
          }
        />
      ) : (
        <>
          <Toolbar>
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Buscar por nombre, código o profesor"
              className="w-full sm:max-w-sm"
            />
            {subjectFilter && (
              <Button variant="ghost" size="sm" onClick={() => setSubjectFilter(null)}>
                Quitar filtro global
              </Button>
            )}
          </Toolbar>

          {filtered.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              description={`Ninguna materia coincide con “${q.trim()}”.`}
              action={
                <Button size="sm" onClick={() => setQ('')}>
                  Limpiar búsqueda
                </Button>
              }
            />
          ) : searching ? (
            <div className={gridClass}>
              {filtered.map((s) => (
                <div key={s.id}>{renderCard(s)}</div>
              ))}
            </div>
          ) : (
            <SortableGrid
              items={filtered}
              onReorder={(ids) => reorder('subjects', ids)}
              className={gridClass}
              renderItem={(s, _i, handle) => renderCard(s, handle)}
            />
          )}
        </>
      )}

      <SubjectForm open={formOpen} onClose={() => setFormOpen(false)} subject={editing} nextOrder={nextOrder} />

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Eliminar materia"
        message={
          <>
            Se eliminará <strong className="text-ink">{toDelete?.name}</strong>. Sus tareas, exámenes y archivos se
            conservan, pero quedarán como “General”.
          </>
        }
        onConfirm={() => {
          if (!toDelete) return
          if (subjectFilter === toDelete.id) setSubjectFilter(null)
          void remove('subjects', toDelete.id)
        }}
      />
    </div>
  )
}

function SubjectCard({
  subject: s,
  metrics,
  active,
  handle,
  onFilter,
  onEdit,
  onDelete,
}: {
  subject: Subject
  metrics: Metrics
  active: boolean
  handle?: ReactNode
  onFilter: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const details: { icon: ReactNode; label: string; value?: string }[] = [
    { icon: <User />, label: 'Profesor/a', value: s.professor },
    { icon: <MapPin />, label: 'Aula', value: s.room },
    { icon: <Clock />, label: 'Horario', value: s.schedule },
  ]
  const shown = details.filter((d) => d.value)

  return (
    <Card
      className={clsx(
        'relative flex h-full flex-col overflow-hidden transition-shadow duration-150',
        active && 'ring-2 ring-accent',
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: s.color }} />
      <div className="flex flex-1 flex-col p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {s.code && (
                <span className="font-mono text-xs font-medium uppercase tracking-wide text-ink-2 tnum">{s.code}</span>
              )}
              {s.credits != null && (
                <span className="text-xs text-ink-2">
                  · <span className="font-mono tnum">{s.credits}</span> {s.credits === 1 ? 'crédito' : 'créditos'}
                </span>
              )}
            </div>
            <h2 className="mt-0.5 font-serif text-2xl leading-tight tracking-tight [overflow-wrap:anywhere]">
              {s.name}
            </h2>
          </div>
          <div className="-mr-2 -mt-1 flex shrink-0 items-center">{handle}</div>
        </div>

        {shown.length > 0 && (
          <dl className="mt-3 space-y-1 text-sm text-ink-2">
            {shown.map((d) => (
              <div key={d.label} className="flex items-start gap-2">
                <dt className="mt-0.5 shrink-0 text-ink-3 [&>svg]:size-3.5" title={d.label}>
                  {d.icon}
                  <span className="sr-only">{d.label}</span>
                </dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">{d.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <dl className="mt-4 grid grid-cols-4 gap-1 border-t border-line pt-3">
          <Metric icon={<ListTodo />} label="Tareas pendientes" short="Tareas" value={metrics.tasks} />
          <Metric icon={<CalendarClock />} label="Exámenes próximos" short="Exámenes" value={metrics.exams} />
          <Metric icon={<FileText />} label="Archivos" short="Archivos" value={metrics.files} />
          <Metric icon={<Headphones />} label="Audios" short="Audios" value={metrics.audios} />
        </dl>

        <div className="mt-auto flex items-center gap-1 pt-4">
          <Button
            size="sm"
            variant={active ? 'primary' : 'secondary'}
            icon={<Filter />}
            aria-pressed={active}
            onClick={onFilter}
          >
            {active ? 'Filtrando' : 'Filtrar app'}
          </Button>
          <div className="ml-auto flex items-center">
            <IconButton size="sm" label={`Editar ${s.name}`} onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton
              size="sm"
              label={`Eliminar ${s.name}`}
              onClick={onDelete}
              className="hover:!bg-danger-soft hover:!text-danger"
            >
              <Trash2 />
            </IconButton>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Metric({ icon, label, short, value }: { icon: ReactNode; label: string; short: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col" title={label}>
      <dt className="flex items-center gap-1 truncate text-[11px] text-ink-2 [&>svg]:size-3 [&>svg]:shrink-0">
        {icon}
        <span className="truncate" aria-hidden>
          {short}
        </span>
        <span className="sr-only">{label}</span>
      </dt>
      <dd className={clsx('font-serif text-2xl leading-none tnum', value === 0 && 'text-ink-3')}>{value}</dd>
    </div>
  )
}
