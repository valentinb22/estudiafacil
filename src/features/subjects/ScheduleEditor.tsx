import clsx from 'clsx'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Input } from '../../components/ui/Form'
import { uid } from '../../lib/db'
import { dayLong, isValidSlot, toMin, WEEK } from '../../lib/schedule'
import type { ScheduleSlot, Weekday } from '../../lib/types'

/**
 * Editor de horarios con una solapa por día. Cada día puede tener varias franjas
 * (p. ej. teoría a la mañana y práctica a la tarde), cada una con su aula opcional.
 */
export function ScheduleEditor({
  value,
  onChange,
  defaultRoom,
}: {
  value: ScheduleSlot[]
  onChange: (slots: ScheduleSlot[]) => void
  defaultRoom?: string
}) {
  const firstWithSlots = WEEK.find((w) => value.some((s) => s.day === w.day))?.day
  const [day, setDay] = useState<Weekday>(firstWithSlots ?? 1)
  const baseId = useId()

  const ofDay = value.filter((s) => s.day === day).sort((a, b) => toMin(a.start) - toMin(b.start))
  const count = (d: Weekday) => value.filter((s) => s.day === d).length

  const patch = (id: string, p: Partial<ScheduleSlot>) =>
    onChange(value.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const removeSlot = (id: string) => onChange(value.filter((s) => s.id !== id))
  const addSlot = () => {
    // Propone la franja siguiente a la última del día, o la última usada en otro día.
    const last = ofDay.at(-1) ?? value.at(-1)
    const start = ofDay.at(-1)?.end ?? last?.start ?? '18:00'
    const dur = last ? Math.max(30, toMin(last.end) - toMin(last.start)) : 120
    const endMin = Math.min(toMin(start) + dur, 23 * 60 + 59)
    const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`
    onChange([...value, { id: uid(), day, start, end }])
  }
  /** Copia las franjas de este día a otro día que todavía no tenga ninguna. */
  const copyTo = (target: Weekday) => {
    onChange([...value, ...ofDay.map((s) => ({ ...s, id: uid(), day: target }))])
    setDay(target)
  }
  const emptyDays = WEEK.filter((w) => w.day !== day && count(w.day) === 0)

  return (
    <fieldset className="sm:col-span-6">
      <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Horarios de cursada</legend>

      <div
        role="tablist"
        aria-label="Día de la semana"
        className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {WEEK.map((w) => {
          const n = count(w.day)
          const active = w.day === day
          return (
            <button
              key={w.day}
              type="button"
              role="tab"
              id={`${baseId}-tab-${w.day}`}
              aria-selected={active}
              aria-controls={`${baseId}-panel`}
              aria-label={`${w.long}${n ? `, ${n} ${n === 1 ? 'horario' : 'horarios'}` : ''}`}
              onClick={() => setDay(w.day)}
              className={clsx(
                'relative flex h-10 min-w-12 shrink-0 flex-col items-center justify-center rounded-lg border px-2.5 text-[13px] font-medium transition-colors',
                active
                  ? 'border-accent bg-accent-soft text-accent'
                  : n
                    ? 'border-line bg-surface text-ink hover:bg-surface-2'
                    : 'border-line bg-surface-2/60 text-ink-2 hover:text-ink',
              )}
            >
              {w.short}
              {n > 0 && (
                <span
                  aria-hidden
                  className={clsx('absolute bottom-1 size-1 rounded-full', active ? 'bg-accent' : 'bg-ink-2')}
                />
              )}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${day}`}
        className="mt-2 rounded-xl border border-line bg-surface-2/40 p-3"
      >
        {ofDay.length === 0 ? (
          <p className="py-2 text-sm text-ink-2">No cursas los {dayLong(day).toLowerCase()}.</p>
        ) : (
          <ul className="space-y-2">
            {ofDay.map((s, i) => {
              const bad = !isValidSlot(s)
              return (
                <li key={s.id} className="rounded-lg border border-line bg-surface p-2.5">
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2">
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs font-medium text-ink-2">Desde</span>
                      <Input
                        type="time"
                        value={s.start}
                        onChange={(e) => patch(s.id, { start: e.target.value })}
                        className="font-mono tnum"
                        aria-label={`Hora de inicio, franja ${i + 1} del ${dayLong(day)}`}
                      />
                    </label>
                    <span aria-hidden className="pb-2.5 text-ink-3">
                      –
                    </span>
                    <label className="flex min-w-0 flex-col gap-1">
                      <span className="text-xs font-medium text-ink-2">Hasta</span>
                      <Input
                        type="time"
                        value={s.end}
                        onChange={(e) => patch(s.id, { end: e.target.value })}
                        className="font-mono tnum"
                        aria-invalid={bad || undefined}
                        aria-label={`Hora de fin, franja ${i + 1} del ${dayLong(day)}`}
                      />
                    </label>
                    <IconButton label={`Quitar franja ${s.start}–${s.end}`} onClick={() => removeSlot(s.id)}>
                      <Trash2 />
                    </IconButton>
                  </div>
                  <Input
                    value={s.room ?? ''}
                    onChange={(e) => patch(s.id, { room: e.target.value || undefined })}
                    placeholder={defaultRoom ? `Aula (por defecto: ${defaultRoom})` : 'Aula de esta franja (opcional)'}
                    aria-label={`Aula de la franja ${i + 1} del ${dayLong(day)}`}
                    className="mt-2 h-9 text-[13px]"
                  />
                  {bad && (
                    <p role="alert" className="mt-1.5 text-xs text-danger">
                      La hora de fin tiene que ser posterior a la de inicio.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<Plus />} onClick={addSlot}>
            Agregar horario el {dayLong(day).toLowerCase()}
          </Button>
          {ofDay.length > 0 && emptyDays.length > 0 && (
            <label className="relative inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink focus-within:outline focus-within:outline-2 focus-within:outline-accent">
              <Copy className="size-4" aria-hidden />
              Copiar a…
              <select
                value=""
                onChange={(e) => e.target.value && copyTo(Number(e.target.value) as Weekday)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label={`Copiar los horarios del ${dayLong(day)} a otro día`}
              >
                <option value="">Elegir día</option>
                {emptyDays.map((w) => (
                  <option key={w.day} value={w.day}>
                    {w.long}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
    </fieldset>
  )
}
