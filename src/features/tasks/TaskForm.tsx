import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Modal'
import { SubjectSelect } from '../../components/ui/SubjectSelect'
import { create, uid, update } from '../../lib/db'
import { useUI } from '../../lib/store'
import { fromLocalInput, toLocalInput } from '../../lib/time'
import type { ChecklistItem, Priority, Task } from '../../lib/types'
import { REMINDERS, reminderLabel } from './taskUtils'

/** Mañana a las 23:59. */
const defaultDue = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(23, 59, 0, 0)
  return d.getTime()
}

interface FormState {
  title: string
  description: string
  subjectId?: string
  due: string
  priority: Priority
  remindBeforeMin: number
  checklist: ChecklistItem[]
}

export function TaskForm({ open, onClose, task }: { open: boolean; onClose: () => void; task?: Task }) {
  const subjectFilter = useUI((s) => s.subjectFilter)
  const [f, setF] = useState<FormState>(() => blank(undefined))
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft('')
    setF(
      task
        ? {
            title: task.title,
            description: task.description ?? '',
            subjectId: task.subjectId,
            due: toLocalInput(task.dueAt),
            priority: task.priority,
            remindBeforeMin: task.remindBeforeMin,
            checklist: task.checklist.map((c) => ({ ...c })),
          }
        : blank(subjectFilter ?? undefined),
    )
    // subjectFilter sólo se usa como valor inicial al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))
  const dueMs = f.due ? fromLocalInput(f.due) : NaN
  const valid = f.title.trim().length > 0 && Number.isFinite(dueMs)

  const addStep = () => {
    const text = draft.trim()
    if (!text) return
    set('checklist', [...f.checklist, { id: uid(), text, done: false }])
    setDraft('')
  }
  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addStep()
    }
  }
  const renameStep = (id: string, text: string) =>
    set('checklist', f.checklist.map((c) => (c.id === id ? { ...c, text } : c)))
  const removeStep = (id: string) => set('checklist', f.checklist.filter((c) => c.id !== id))

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!valid) return
    const pending = draft.trim() ? [{ id: uid(), text: draft.trim(), done: false }] : []
    const checklist = [...f.checklist, ...pending]
      .map((c) => ({ ...c, text: c.text.trim() }))
      .filter((c) => c.text)
    const data = {
      title: f.title.trim(),
      description: f.description.trim() || undefined,
      subjectId: f.subjectId,
      dueAt: dueMs,
      priority: f.priority,
      remindBeforeMin: f.remindBeforeMin,
      checklist,
    }
    if (task) await update('tasks', task.id, data)
    else await create('tasks', { ...data, status: 'pending' })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={task ? 'Editar tarea' : 'Nueva tarea'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => submit()}>
            {task ? 'Guardar cambios' : 'Crear tarea'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Título" className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              required
              value={f.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="TP 2: Derivadas parciales"
            />
          )}
        </Field>
        <Field label="Consigna o descripción" className="sm:col-span-2">
          {(id) => (
            <Textarea
              id={id}
              value={f.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Qué hay que entregar, formato, extensión…"
            />
          )}
        </Field>
        <Field label="Materia">
          {(id) => <SubjectSelect id={id} value={f.subjectId} onChange={(v) => set('subjectId', v)} />}
        </Field>
        <Field label="Entrega">
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              required
              value={f.due}
              onChange={(e) => set('due', e.target.value)}
              className="font-mono tnum"
            />
          )}
        </Field>
        <Field label="Prioridad">
          {(id) => (
            <Select id={id} value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)}>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </Select>
          )}
        </Field>
        <Field label="Recordatorio">
          {(id) => (
            <Select
              id={id}
              value={f.remindBeforeMin}
              onChange={(e) => set('remindBeforeMin', Number(e.target.value))}
            >
              {!REMINDERS.some((r) => r.value === f.remindBeforeMin) && (
                <option value={f.remindBeforeMin}>{reminderLabel(f.remindBeforeMin)}</option>
              )}
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">
            Pasos{f.checklist.length > 0 && <span className="font-mono tnum"> · {f.checklist.length}</span>}
          </legend>
          {f.checklist.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {f.checklist.map((c, i) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right font-mono text-xs text-ink-3 tnum">{i + 1}</span>
                  <Input
                    value={c.text}
                    onChange={(e) => renameStep(c.id, e.target.value)}
                    aria-label={`Paso ${i + 1}`}
                    className="h-9"
                  />
                  <IconButton label={`Quitar paso ${i + 1}`} size="sm" onClick={() => removeStep(c.id)}>
                    <X />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKey}
              placeholder="Agrega un paso y presiona Enter"
              aria-label="Nuevo paso"
              className="h-9"
            />
            <Button size="sm" icon={<Plus />} onClick={addStep} disabled={!draft.trim()}>
              Agregar
            </Button>
          </div>
        </fieldset>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}

function blank(subjectId: string | undefined): FormState {
  return {
    title: '',
    description: '',
    subjectId,
    due: toLocalInput(defaultDue()),
    priority: 'medium',
    remindBeforeMin: 1440,
    checklist: [],
  }
}
