import clsx from 'clsx'
import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Button, IconButton } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Modal'
import { create, uid, update } from '../../lib/db'
import { isValidSlot } from '../../lib/schedule'
import { professorsOf } from '../../lib/subjects'
import type { ScheduleSlot, Subject } from '../../lib/types'
import { ScheduleEditor } from './ScheduleEditor'

/** Paleta curada: tonos apagados, legibles sobre papel y pizarra. */
export const PALETTE = [
  { hex: '#C2553D', name: 'Terracota' },
  { hex: '#D08C2E', name: 'Ocre' },
  { hex: '#B8A033', name: 'Mostaza' },
  { hex: '#6B8E4E', name: 'Oliva' },
  { hex: '#2F8A6E', name: 'Jade' },
  { hex: '#3C7FA6', name: 'Azul acero' },
  { hex: '#4F62B0', name: 'Índigo' },
  { hex: '#7D5BA6', name: 'Violeta' },
  { hex: '#B5547E', name: 'Frambuesa' },
  { hex: '#7A6A5C', name: 'Sepia' },
] as const

interface FormState {
  name: string
  code: string
  color: string
  professors: { id: string; name: string }[]
  room: string
  slots: ScheduleSlot[]
}

const empty = (color: string): FormState => ({
  name: '', code: '', color, professors: [{ id: uid(), name: '' }], room: '', slots: [],
})

const fromSubject = (s: Subject): FormState => ({
  name: s.name,
  code: s.code,
  color: s.color,
  professors: (professorsOf(s).length ? professorsOf(s) : ['']).map((name) => ({ id: uid(), name })),
  room: s.room ?? '',
  slots: s.slots ?? [],
})

export function SubjectForm({
  open,
  onClose,
  subject,
  nextOrder,
}: {
  open: boolean
  onClose: () => void
  subject?: Subject
  nextOrder: number
}) {
  const [f, setF] = useState<FormState>(() => empty(PALETTE[0].hex))
  // Remonta el editor de horarios al cargar otra materia para que abra en el primer día con clases.
  const [loadKey, setLoadKey] = useState(0)

  useEffect(() => {
    if (!open) return
    setF(subject ? fromSubject(subject) : empty(PALETTE[nextOrder % PALETTE.length].hex))
    setLoadKey((k) => k + 1)
    // Sólo al abrir: si `nextOrder` cambia con el modal abierto (p. ej. llega una materia por
    // sincronización) no hay que borrar lo que el usuario está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))
  const valid = f.name.trim().length > 0 && f.slots.every(isValidSlot)
  const isCustom = !PALETTE.some((p) => p.hex.toLowerCase() === f.color.toLowerCase())

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!valid) return
    const data = {
      name: f.name.trim(),
      code: f.code.trim().toUpperCase(),
      color: f.color,
      professors: (() => {
        const list = [...new Set(f.professors.map((p) => p.name.trim()).filter(Boolean))]
        return list.length ? list : undefined
      })(),
      professor: undefined, // reemplazado por `professors`
      room: f.room.trim() || undefined,
      slots: f.slots.map((x) => ({ ...x, room: x.room?.trim() || undefined })),
      // Al guardar con horarios estructurados se descarta el texto libre y los créditos antiguos.
      schedule: f.slots.length ? undefined : subject?.schedule,
      credits: undefined,
    }
    if (subject) await update('subjects', subject.id, data)
    else await create('subjects', { ...data, order: nextOrder })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={subject ? 'Editar materia' : 'Nueva materia'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid} onClick={() => submit()}>
            {subject ? 'Guardar cambios' : 'Crear materia'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Field label="Nombre" className="sm:col-span-4">
          {(id) => (
            <Input
              id={id}
              required
              value={f.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Análisis Matemático I"
            />
          )}
        </Field>
        <Field label="Código" className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              value={f.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder="AM1"
              className="font-mono uppercase"
              maxLength={12}
            />
          )}
        </Field>
        <ProfessorsField
          value={f.professors}
          onChange={(professors) => set('professors', professors)}
        />
        <Field label="Aula" className="sm:col-span-2">
          {(id) => <Input id={id} value={f.room} onChange={(e) => set('room', e.target.value)} placeholder="Aula 204" />}
        </Field>
        <ScheduleEditor key={loadKey} value={f.slots} onChange={(slots) => set('slots', slots)} defaultRoom={f.room.trim() || undefined} />

        <fieldset className="sm:col-span-6">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Color</legend>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color de la materia">
            {PALETTE.map((p) => {
              const active = p.hex.toLowerCase() === f.color.toLowerCase()
              return (
                <button
                  key={p.hex}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={p.name}
                  title={p.name}
                  onClick={() => set('color', p.hex)}
                  className={clsx(
                    'flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow',
                    active ? 'ring-2 ring-ink' : 'hover:ring-2 hover:ring-line',
                  )}
                  style={{ background: p.hex }}
                >
                  {active && <Check className="size-4 text-white" strokeWidth={3} />}
                </button>
              )
            })}
            <label
              className={clsx(
                'relative flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line pl-1 pr-3 text-xs font-medium text-ink-2 hover:bg-surface-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                isCustom && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
              )}
            >
              <span className="size-7 rounded-full border border-line" style={{ background: f.color }} />
              Personalizado
              <input
                type="color"
                value={f.color}
                onChange={(e) => set('color', e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Color personalizado"
              />
            </label>
          </div>
        </fieldset>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  )
}

/** Lista editable de docentes: una fila por persona, Enter agrega otra. */
function ProfessorsField({
  value,
  onChange,
}: {
  value: { id: string; name: string }[]
  onChange: (v: { id: string; name: string }[]) => void
}) {
  const add = () => {
    const id = uid()
    // flushSync: la fila nueva existe en el DOM antes de mover el foco (tipeo rápido tras Enter).
    flushSync(() => onChange([...value, { id, name: '' }]))
    document.getElementById(`prof-${id}`)?.focus()
  }
  return (
    <fieldset className="flex flex-col gap-1.5 sm:col-span-4">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">
        {value.length > 1 ? `Profesores (${value.length})` : 'Profesor/a'}
      </legend>
      <ul className="flex flex-col gap-2">
        {value.map((p, i) => (
          <li key={p.id} className="flex items-center gap-1.5">
            <Input
              id={`prof-${p.id}`}
              value={p.name}
              onChange={(e) => onChange(value.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && i === value.length - 1 && p.name.trim()) {
                  e.preventDefault()
                  add()
                }
              }}
              placeholder={i === 0 ? 'Dra. García (titular)' : 'Lic. Pérez (práctica)'}
              aria-label={`Profesor/a ${i + 1}`}
            />
            {value.length > 1 && (
              <IconButton
                label={`Quitar ${p.name.trim() || `profesor/a ${i + 1}`}`}
                onClick={() => onChange(value.filter((x) => x.id !== p.id))}
              >
                <X />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      <div>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={add} className="-ml-2">
          Agregar profesor/a
        </Button>
      </div>
    </fieldset>
  )
}
