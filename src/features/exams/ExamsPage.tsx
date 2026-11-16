import { GraduationCap, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { EmptyState, PageHeader, Toolbar } from '../../components/ui/Display'
import { SegmentedControl } from '../../components/ui/Form'
import { ConfirmModal } from '../../components/ui/Modal'
import { remove } from '../../lib/db'
import { useExams, useNow } from '../../lib/hooks'
import type { Exam, ExamType } from '../../lib/types'
import { ExamCard } from './ExamCard'
import { ExamEditor } from './ExamEditor'
import { EXAM_TYPES } from './examUtils'

type When = 'upcoming' | 'past'
type TypeFilter = ExamType | 'all'

export function ExamsPage() {
  const exams = useExams()
  const now = useNow(60_000)
  const [params, setParams] = useSearchParams()
  const [when, setWhen] = useState<When>('upcoming')
  const [type, setType] = useState<TypeFilter>('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const [toDelete, setToDelete] = useState<Exam | null>(null)

  const openNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const closeEditor = useCallback(() => setEditorOpen(false), [])
  const closeConfirm = useCallback(() => setToDelete(null), [])
  const openEdit = (exam: Exam) => {
    setEditing(exam)
    setEditorOpen(true)
  }

  // ?new=1 abre el formulario de creación y limpia el parámetro.
  useEffect(() => {
    if (params.get('new') === '1') {
      openNew()
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const upcomingCount = exams.filter((e) => e.at >= now).length
  const pastCount = exams.length - upcomingCount

  const list = useMemo(() => {
    const rows = exams.filter((e) => (when === 'upcoming' ? e.at >= now : e.at < now))
    const typed = type === 'all' ? rows : rows.filter((e) => e.type === type)
    return when === 'upcoming' ? typed : [...typed].reverse()
  }, [exams, when, type, now])

  const nextId = exams.find((e) => e.at >= now)?.id

  // Mantener actualizado el examen en edición si cambia en la base.
  const editingLive = editing ? (exams.find((e) => e.id === editing.id) ?? editing) : null

  return (
    <div className="pb-12">
      <PageHeader
        title="Exámenes"
        description="Cuenta regresiva, temas y preparación de cada evaluación."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openNew}>
            Nuevo examen
          </Button>
        }
      />

      <Toolbar>
        <SegmentedControl<When>
          label="Mostrar exámenes"
          value={when}
          onChange={setWhen}
          options={[
            { value: 'upcoming', label: <>Próximos <span className="ml-1 font-mono text-ink-2 tnum">{upcomingCount}</span></> },
            { value: 'past', label: <>Pasados <span className="ml-1 font-mono text-ink-2 tnum">{pastCount}</span></> },
          ]}
        />
        <SegmentedControl<TypeFilter>
          label="Filtrar por tipo"
          size="sm"
          value={type}
          onChange={setType}
          options={[{ value: 'all', label: 'Todos' }, ...EXAM_TYPES]}
        />
      </Toolbar>

      {list.length === 0 ? (
        exams.length === 0 ? (
          <EmptyState
            icon={<GraduationCap />}
            title="Todavía no tienes exámenes"
            description="Crea tu primer examen para ver la cuenta regresiva y seguir tu preparación por tema."
            action={
              <Button variant="primary" icon={<Plus />} onClick={openNew}>
                Crear examen
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<GraduationCap />}
            title={when === 'upcoming' ? 'No hay exámenes próximos' : 'No hay exámenes pasados'}
            description="Prueba con otro tipo o cambia el filtro de materia."
            action={
              type !== 'all' ? (
                <Button onClick={() => setType('all')}>Ver todos los tipos</Button>
              ) : when === 'upcoming' ? (
                <Button variant="primary" icon={<Plus />} onClick={openNew}>
                  Crear examen
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((exam) => (
            <ExamCard key={exam.id} exam={exam} isNext={exam.id === nextId} onEdit={openEdit} />
          ))}
        </div>
      )}

      <ExamEditor
        open={editorOpen}
        exam={editingLive}
        onClose={closeEditor}
        onDelete={(exam) => setToDelete(exam)}
      />

      <ConfirmModal
        open={!!toDelete}
        onClose={closeConfirm}
        title="Eliminar examen"
        message={
          <>
            Se eliminará <strong className="text-ink">«{toDelete?.title}»</strong> con todos sus temas.
          </>
        }
        onConfirm={() => {
          if (!toDelete) return
          remove('exams', toDelete.id)
          setEditorOpen(false)
        }}
      />
    </div>
  )
}
