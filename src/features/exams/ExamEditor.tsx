import { Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Modal'
import { SubjectSelect } from '../../components/ui/SubjectSelect'
import { create, update } from '../../lib/db'
import { useUI } from '../../lib/store'
import { DAY, fromLocalInput, toLocalInput } from '../../lib/time'
import type { Exam, ExamTopic, ExamType } from '../../lib/types'
import { EXAM_TYPES, LEVELS, parseTopics } from './examUtils'

interface Draft {
  title: string
  type: ExamType
  subjectId?: string
  at: string
  location: string
  weight: string
  targetGrade: string
  notes: string
  topics: ExamTopic[]
}

function defaultAt(): number {
  const d = new Date(Date.now() + 7 * DAY)
  d.setHours(9, 0, 0, 0)
  return d.getTime()
}

function toDraft(exam: Exam | null, subjectId?: string): Draft {
  return {
    title: exam?.title ?? '',
    type: exam?.type ?? 'parcial',
    subjectId: exam ? exam.subjectId : subjectId,
    at: toLocalInput(exam?.at ?? defaultAt()),
    location: exam?.location ?? '',
    weight: exam?.weight != null ? String(exam.weight) : '',
    targetGrade: exam?.targetGrade != null ? String(exam.targetGrade) : '',
    notes: exam?.notes ?? '',
    topics: exam?.topics.map((t) => ({ ...t })) ?? [],
  }
}

const num = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function ExamEditor({
  open,
  exam,
  onClose,
  onDelete,
}: {
  open: boolean
  exam: Exam | null
  onClose: () => void
  onDelete?: (exam: Exam) => void
}) {
  const subjectFilter = useUI((s) => s.subjectFilter)
  const [d, setD] = useState<Draft>(() => toDraft(exam, subjectFilter ?? undefined))
  const [bulk, setBulk] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setD(toDraft(exam, subjectFilter ?? undefined))
      setBulk('')
    }
    // Sólo al abrir o cambiar de examen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exam?.id])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))
  const valid = d.title.trim() && d.at && Number.isFinite(fromLocalInput(d.at))

  const addBulk = () => {
    const parsed = parseTopics(bulk)
    if (!parsed.length) return
    set('topics', [...d.topics, ...parsed])
    setBulk('')
  }

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    const pending = parseTopics(bulk)
    const data = {
      title: d.title.trim(),
      type: d.type,
      subjectId: d.subjectId,
      at: fromLocalInput(d.at),
      location: d.location.trim() || undefined,
      weight: num(d.weight),
      targetGrade: num(d.targetGrade),
      notes: d.notes.trim() || undefined,
      topics: [...d.topics.filter((t) => t.name.trim()), ...pending].map((t) => ({ ...t, name: t.name.trim() })),
    }
    try {
      if (exam) await update('exams', exam.id, data)
      else await create('exams', data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={exam ? 'Editar examen' : 'Nuevo examen'}
      size="lg"
      footer={
        <>
          {exam && onDelete && (
            <Button variant="danger" icon={<Trash2 />} className="mr-auto" onClick={() => onDelete(exam)}>
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid || saving}>
            {exam ? 'Guardar cambios' : 'Crear examen'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Título" className="sm:col-span-2">
          {(id) => (
            <Input
              id={id}
              value={d.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Ej.: Primer parcial de Análisis"
              required
            />
          )}
        </Field>
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={d.type} onChange={(e) => set('type', e.target.value as ExamType)}>
              {EXAM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Materia">
          {(id) => <SubjectSelect id={id} value={d.subjectId} onChange={(v) => set('subjectId', v)} />}
        </Field>
        <Field label="Fecha y hora">
          {(id) => (
            <Input
              id={id}
              type="datetime-local"
              value={d.at}
              onChange={(e) => set('at', e.target.value)}
              className="font-mono tnum"
              required
            />
          )}
        </Field>
        <Field label="Lugar">
          {(id) => (
            <Input id={id} value={d.location} onChange={(e) => set('location', e.target.value)} placeholder="Aula 204" />
          )}
        </Field>
        <Field label="Peso en la nota final (%)">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="any"
              value={d.weight}
              onChange={(e) => set('weight', e.target.value)}
              placeholder="30"
              className="font-mono tnum"
            />
          )}
        </Field>
        <Field label="Nota objetivo">
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={d.targetGrade}
              onChange={(e) => set('targetGrade', e.target.value)}
              placeholder="8"
              className="font-mono tnum"
            />
          )}
        </Field>
        <Field label="Notas" className="sm:col-span-2">
          {(id) => (
            <Textarea
              id={id}
              value={d.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Qué entra, qué llevar, condiciones…"
              rows={3}
            />
          )}
        </Field>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>

      <section className="mt-6 border-t border-line pt-5" aria-labelledby="topics-heading">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 id="topics-heading" className="text-sm font-semibold">
            Temas
          </h3>
          <span className="font-mono text-xs text-ink-3 tnum">{d.topics.length}</span>
        </div>

        {d.topics.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {d.topics.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2">
                <Input
                  aria-label={`Tema ${i + 1}`}
                  value={t.name}
                  onChange={(e) =>
                    set(
                      'topics',
                      d.topics.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className="min-w-0 flex-1"
                />
                <Select
                  aria-label={`Nivel de «${t.name || `tema ${i + 1}`}»`}
                  value={t.level}
                  onChange={(e) =>
                    set(
                      'topics',
                      d.topics.map((x) =>
                        x.id === t.id ? { ...x, level: e.target.value as ExamTopic['level'] } : x,
                      ),
                    )
                  }
                  className="w-28 shrink-0 text-[13px] sm:w-32"
                >
                  {LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </Select>
                <IconButton
                  label={`Quitar «${t.name || `tema ${i + 1}`}»`}
                  size="sm"
                  onClick={() => set('topics', d.topics.filter((x) => x.id !== t.id))}
                >
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        <Field label="Agregar temas" hint="Uno por línea. Puedes pegar un índice entero; se quitan viñetas y números.">
          {(id) => (
            <Textarea
              id={id}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  addBulk()
                }
              }}
              placeholder={'Límites\nDerivadas\nIntegrales'}
              rows={3}
              className="font-mono text-[13px]"
            />
          )}
        </Field>
        <div className="mt-2 flex justify-end">
          <Button size="sm" icon={<Plus />} onClick={addBulk} disabled={!bulk.trim()}>
            Agregar {parseTopics(bulk).length > 1 ? `${parseTopics(bulk).length} temas` : 'tema'}
          </Button>
        </div>
      </section>
    </Modal>
  )
}

