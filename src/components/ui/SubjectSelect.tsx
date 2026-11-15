import { useSubjects } from '../../lib/hooks'
import { useUI } from '../../lib/store'
import { Select } from './Form'

/** Selector de materia para formularios. Valor '' = sin materia. */
export function SubjectSelect({
  value,
  onChange,
  id,
  allowNone = true,
}: {
  value?: string
  onChange: (id: string | undefined) => void
  id?: string
  allowNone?: boolean
}) {
  const subjects = useSubjects()
  return (
    <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowNone && <option value="">General (sin materia)</option>}
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.code ? `${s.code} · ${s.name}` : s.name}
        </option>
      ))}
    </Select>
  )
}

/** Selector conectado al filtro global (cabecera y vistas). */
export function GlobalSubjectFilter({ className }: { className?: string }) {
  const subjects = useSubjects()
  const value = useUI((s) => s.subjectFilter)
  const set = useUI((s) => s.setSubjectFilter)
  const current = subjects.find((s) => s.id === value)
  return (
    <div className={className}>
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 size-2 -translate-y-1/2 rounded-full"
          style={{ background: current?.color ?? 'rgb(var(--ink-3))' }}
        />
        <Select
          aria-label="Filtrar por materia"
          value={value ?? ''}
          onChange={(e) => set(e.target.value || null)}
          className="h-9 pl-7 text-[13px]"
        >
          <option value="">Todas las materias</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code || s.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
