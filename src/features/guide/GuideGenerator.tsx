import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { ExternalLink, KeyRound, LoaderCircle, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { SubjectChip } from '../../components/ui/Display'
import { Field, Input, Textarea } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Modal'
import { alive, create, db } from '../../lib/db'
import { useNow, useSubjects } from '../../lib/hooks'
import { isValidSlot, WEEK } from '../../lib/schedule'
import { fmtDateTime, relative } from '../../lib/time'
import type { Exam } from '../../lib/types'
import { examTypeLabel } from '../exams/examUtils'
import { generateGuide, getApiKey, GuideError, isoDate, setApiKey } from './gemini'

/** Lunes primero. */
const WEEK_ORDER = [...WEEK.filter((w) => w.day !== 0), WEEK.find((w) => w.day === 0)!]


export function GuideGenerator({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const now = useNow(60_000)
  const upcoming = useLiveQuery(
    async () => alive(await db.exams.toArray()).filter((e) => e.at > Date.now()).sort((a, b) => a.at - b.at),
    [open],
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const subjects = useSubjects()
  const [startDate, setStartDate] = useState(() => isoDate(now))
  const [extra, setExtra] = useState('')
  const [key, setKey] = useState(getApiKey)
  const [keyDraft, setKeyDraft] = useState('')
  const [editingKey, setEditingKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setStartDate(isoDate(Date.now()))
    setExtra('')
    setError('')
    setKey(getApiKey())
    setKeyDraft('')
    setEditingKey(false)
  }, [open])

  // Preselecciona el examen más próximo cuando cargan.
  const preselected = useRef(false)
  useEffect(() => {
    if (!open) {
      preselected.current = false
      return
    }
    if (!preselected.current && upcoming?.length) {
      preselected.current = true
      setSelected(new Set([upcoming[0].id]))
    }
  }, [open, upcoming])

  const chosen = (upcoming ?? []).filter((e) => selected.has(e.id))
  // Clases de cada día de la semana, para mostrar lo que la IA va a tener en cuenta.
  const week = WEEK_ORDER.map((w) => ({
    ...w,
    classes: subjects
      .flatMap((sub) =>
        (sub.slots ?? []).filter((sl) => isValidSlot(sl) && sl.day === w.day).map((sl) => ({ sl, sub })),
      )
      .sort((x, y) => x.sl.start.localeCompare(y.sl.start)),
  }))
  const hasSchedule = week.some((w) => w.classes.length)

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const saveKey = () => {
    const k = keyDraft.trim()
    if (!k) return
    setApiKey(k)
    setKey(k)
    setKeyDraft('')
    setEditingKey(false)
  }

  const close = () => {
    abort.current?.abort()
    onClose()
  }

  const startValid = /^\d{4}-\d{2}-\d{2}$/.test(startDate)
  const canGenerate = chosen.length > 0 && !!key && !editingKey && startValid && !busy

  const generate = async () => {
    if (!canGenerate) return
    setBusy(true)
    setError('')
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const guide = await generateGuide({ exams: chosen, startDate, extra }, ctrl.signal)
      const id = await create('guides', guide)
      onCreated(id)
      onClose()
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError(e instanceof GuideError ? e.message : 'Algo salió mal al generar la guía. Inténtalo de nuevo.')
    } finally {
      if (abort.current === ctrl) abort.current = null
      setBusy(false)
    }
  }

  const showKeyForm = !key || editingKey

  return (
    <Modal
      open={open}
      onClose={close}
      title="Generar guía de estudio para…"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            onClick={generate}
            disabled={!canGenerate}
          >
            {busy ? 'Generando…' : 'Generar guía'}
          </Button>
        </>
      }
    >
      <fieldset disabled={busy} className="flex flex-col gap-6">
        <section aria-labelledby="g-exams">
          <h3 id="g-exams" className="mb-2 text-sm font-semibold">
            Exámenes y presentaciones
          </h3>
          {upcoming && !upcoming.length ? (
            <p className="rounded-lg border border-dashed border-line px-3 py-4 text-sm text-ink-2">
              No tienes exámenes próximos. Crea uno en la solapa Exámenes y vuelve.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(upcoming ?? []).map((e) => (
                <ExamOption key={e.id} exam={e} checked={selected.has(e.id)} onToggle={() => toggle(e.id)} now={now} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="g-time">
          <h3 id="g-time" className="mb-1 text-sm font-semibold">
            Tus horarios de cursada
          </h3>
          <p className="mb-3 text-xs leading-relaxed text-ink-2">
            La IA decide cuánto estudiar cada día y a qué hora, según tus clases y la cantidad de temas y material de cada
            examen.
          </p>
          {hasSchedule ? (
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {week
                .filter((w) => w.classes.length || (w.day >= 1 && w.day <= 5))
                .map((w) => (
                  <li key={w.day} className="rounded-lg border border-line px-2.5 py-2">
                    <span className="block text-xs font-medium">{w.long}</span>
                    {w.classes.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {w.classes.map(({ sl, sub }) => (
                          <li key={sl.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-2">
                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: sub.color }} aria-hidden />
                            <span className="shrink-0 font-mono tnum">{sl.start}–{sl.end}</span>
                            <span className="truncate">{sub.code || sub.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="mt-1 block text-[11px] text-ink-3">Sin clases</span>
                    )}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
              No cargaste horarios en tus materias. La guía se arma igual, pero sale mejor si los agregas en Materias.
            </p>
          )}
          <Field label="Empezar a estudiar el" className="mt-3 max-w-56">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={startDate}
                min={isoDate(now)}
                onChange={(e) => setStartDate(e.target.value)}
                className="font-mono tnum"
              />
            )}
          </Field>
        </section>

        <Field
          label="Indicaciones para la IA (opcional)"
          hint="Por ejemplo: «el sábado no puedo», «me cuesta Integrales», «prefiero estudiar de noche»."
        >
          {(id) => <Textarea id={id} value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} />}
        </Field>

        <section aria-labelledby="g-key" className="rounded-xl border border-line bg-surface-2/50 p-3">
          <h3 id="g-key" className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <KeyRound className="size-4 text-ink-2" aria-hidden />
            Clave de Gemini
          </h3>
          {showKeyForm ? (
            <>
              <p className="mb-2 text-xs leading-relaxed text-ink-2">
                La guía la arma Gemini, la IA de Google. Necesitas una clave gratuita: entra a{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-accent underline-offset-2 hover:underline"
                >
                  Google AI Studio <ExternalLink className="size-3" aria-hidden />
                </a>
                , toca «Create API key», cópiala y pégala acá. Queda guardada sólo en este dispositivo.
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveKey()
                }}
              >
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Clave de Gemini"
                  placeholder="Pega tu clave"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  className="min-w-0 flex-1 font-mono"
                />
                <Button type="submit" disabled={!keyDraft.trim()}>
                  Guardar
                </Button>
                {key && (
                  <Button variant="ghost" onClick={() => setEditingKey(false)}>
                    Cancelar
                  </Button>
                )}
              </form>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-2">Guardada en este dispositivo (termina en …{key.slice(-4)}).</p>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditingKey(true)}>
                  Cambiar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setApiKey('')
                    setKey('')
                  }}
                >
                  Quitar
                </Button>
              </div>
            </div>
          )}
        </section>
      </fieldset>

      {busy && (
        <p role="status" className="mt-5 flex items-center gap-2 text-sm text-ink-2">
          <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden />
          Gemini está leyendo tus apuntes y armando el plan. Puede tardar hasta un minuto.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-5 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Modal>
  )
}

function ExamOption({ exam, checked, onToggle, now }: { exam: Exam; checked: boolean; onToggle: () => void; now: number }) {
  const mats = exam.materials?.length ?? 0
  return (
    <li>
      <label
        className={clsx(
          'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
          checked ? 'border-accent/50 bg-accent-soft/40' : 'border-line hover:bg-surface-2',
        )}
      >
        <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 size-4 shrink-0 accent-[rgb(var(--accent))]" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium [overflow-wrap:anywhere]">{exam.title}</span>
            <span className="text-xs text-ink-2">{examTypeLabel(exam.type)}</span>
            <SubjectChip subjectId={exam.subjectId} />
          </span>
          <span className="mt-0.5 block text-xs text-ink-2">
            <span className="font-mono tnum">{fmtDateTime(exam.at)}</span> · {relative(exam.at, now)}
            {' · '}
            {exam.topics.length} {exam.topics.length === 1 ? 'tema' : 'temas'} · {mats}{' '}
            {mats === 1 ? 'material' : 'materiales'}
          </span>
        </span>
      </label>
    </li>
  )
}
