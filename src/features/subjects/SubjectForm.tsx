import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, Input } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Modal'
import { create, update } from '../../lib/db'
import type { Subject } from '../../lib/types'

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
  professor: string
  room: string
  schedule: string
  credits: string
}

const empty = (color: string): FormState => ({
  name: '', code: '', color, professor: '', room: '', schedule: '', credits: '',
})

const fromSubject = (s: Subject): FormState => ({
  name: s.name,
  code: s.code,
  color: s.color,
  professor: s.professor ?? '',
  room: s.room ?? '',
  schedule: s.schedule ?? '',
  credits: s.credits != null ? String(s.credits) : '',
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

  useEffect(() => {
    if (!open) return
    setF(subject ? fromSubject(subject) : empty(PALETTE[nextOrder % PALETTE.length].hex))
    // Sólo al abrir: si `nextOrder` cambia con el modal abierto (p. ej. llega una materia por
    // sincronización) no hay que borrar lo que el usuario está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }))
  const valid = f.name.trim().length > 0
  const isCustom = !PALETTE.some((p) => p.hex.toLowerCase() === f.color.toLowerCase())

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!valid) return
    const credits = f.credits.trim() === '' ? undefined : Number(f.credits)
    const data = {
      name: f.name.trim(),
      code: f.code.trim().toUpperCase(),
      color: f.color,
      professor: f.professor.trim() || undefined,
      room: f.room.trim() || undefined,
      schedule: f.schedule.trim() || undefined,
      credits: credits != null && Number.isFinite(credits) ? credits : undefined,
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
        <Field label="Profesor/a" className="sm:col-span-3">
          {(id) => (
            <Input id={id} value={f.professor} onChange={(e) => set('professor', e.target.value)} placeholder="Dra. García" />
          )}
        </Field>
        <Field label="Aula" className="sm:col-span-3">
          {(id) => <Input id={id} value={f.room} onChange={(e) => set('room', e.target.value)} placeholder="Aula 204" />}
        </Field>
        <Field label="Horario" className="sm:col-span-4">
          {(id) => (
            <Input
              id={id}
              value={f.schedule}
              onChange={(e) => set('schedule', e.target.value)}
              placeholder="Lun y Mié 18:00–20:00"
            />
          )}
        </Field>
        <Field label="Créditos" className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={f.credits}
              onChange={(e) => set('credits', e.target.value)}
              className="font-mono tnum"
            />
          )}
        </Field>

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
