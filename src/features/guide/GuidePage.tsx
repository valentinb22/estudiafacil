import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpenCheck, CalendarRange, Check, ChevronDown, FileWarning, Lightbulb, Paperclip, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge, Card, PageHeader, ProgressBar } from '../../components/ui/Display'
import { ConfirmModal } from '../../components/ui/Modal'
import { alive, db, remove, update } from '../../lib/db'
import { useNow, useSubjectMap } from '../../lib/hooks'
import type { Exam, GuideBlock, StudyGuide } from '../../lib/types'
import { examTypeLabel } from '../exams/examUtils'
import { GuideGenerator } from './GuideGenerator'
import { isoDate, parseIsoDate } from './gemini'

const dayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })
const shortFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

const fmtMin = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

const guideMinutes = (g: StudyGuide) => {
  let total = 0
  let done = 0
  for (const d of g.days)
    for (const b of d.blocks) {
      total += b.minutes
      if (b.done) done += b.minutes
    }
  return { total, done }
}

/** Planes de estudio armados por IA a partir de los exámenes, sus apuntes y el tiempo disponible. */
export function GuidePage() {
  const guides = useLiveQuery(async () => alive(await db.guides.toArray()).sort((a, b) => b.createdAt - a.createdAt), [])
  const [genOpen, setGenOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = guides?.find((g) => g.id === selectedId) ?? guides?.[0]

  const generateButton = (
    <Button variant="primary" icon={<Sparkles />} onClick={() => setGenOpen(true)}>
      Generar guía de estudio para…
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Guía de estudio"
        description="Un plan día por día para tus exámenes, armado por IA con tus apuntes y tu tiempo."
        actions={generateButton}
      />

      {guides && <Intro collapsed={guides.length > 0} />}

      {guides && guides.length > 1 && (
        <nav aria-label="Tus guías" className="scrollbar-none -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {guides.map((g) => {
            const { total, done } = guideMinutes(g)
            const active = g.id === selected?.id
            return (
              <button
                key={g.id}
                type="button"
                aria-current={active || undefined}
                onClick={() => setSelectedId(g.id)}
                className={clsx(
                  'flex w-56 shrink-0 flex-col gap-1.5 rounded-xl border px-3 py-2 text-left transition-colors',
                  active ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface hover:bg-surface-2',
                )}
              >
                <span className="truncate text-[13px] font-medium">{g.title}</span>
                <span className="text-[11px] text-ink-2">Creada el {shortFmt.format(g.createdAt)}</span>
                <ProgressBar value={total ? done / total : 0} label={`Avance de ${g.title}`} />
              </button>
            )
          })}
        </nav>
      )}

      {selected && <GuideView key={selected.id} guide={selected} />}

      <GuideGenerator open={genOpen} onClose={() => setGenOpen(false)} onCreated={(id) => setSelectedId(id)} />
    </>
  )
}

const STEPS = [
  {
    icon: CalendarRange,
    title: 'Elige qué preparar',
    text: 'Uno o varios exámenes, parciales, TPs o presentaciones que tengas cargados.',
  },
  {
    icon: BookOpenCheck,
    title: 'La IA lee tu material',
    text: 'Usa los temas de cada examen y el material de estudio vinculado: apuntes, resúmenes, PDFs y fotos.',
  },
  {
    icon: Sparkles,
    title: 'Recibes un plan a medida',
    text: 'Reparte los temas en los días que quedan según las horas que tienes, con repasos antes de cada examen.',
  },
]

function Intro({ collapsed }: { collapsed: boolean }) {
  const body = (
    <>
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <s.icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-medium">
                {i + 1}. {s.title}
              </span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs leading-relaxed text-ink-2">
        Mientras más completo esté el examen (temas, nivel de cada tema y material vinculado), mejor sale la guía. Después
        puedes ir tachando cada bloque a medida que lo estudias.
      </p>
    </>
  )

  if (collapsed) {
    return (
      <details className="group mb-5 rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          ¿Para qué sirve esta solapa?
          <ChevronDown className="size-4 text-ink-2 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t border-line px-4 py-4">{body}</div>
      </details>
    )
  }
  return (
    <Card className="mb-5 p-4 sm:p-5">
      <h2 className="mb-4 text-base font-semibold">¿Para qué sirve esta solapa?</h2>
      {body}
    </Card>
  )
}

function GuideView({ guide }: { guide: StudyGuide }) {
  const now = useNow(60_000)
  const today = isoDate(now)
  const subjects = useSubjectMap()
  const exams = useLiveQuery(async () => (await db.exams.bulkGet(guide.examIds)).filter(Boolean) as Exam[], [guide.examIds.join()])
  const examMap = new Map((exams ?? []).map((e) => [e.id, e]))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { total, done } = guideMinutes(guide)

  const toggleBlock = (blockId: string) =>
    update('guides', guide.id, {
      days: guide.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, done: !b.done } : b)),
      })),
    })

  const colorOf = (b: GuideBlock) => {
    const e = b.examId ? examMap.get(b.examId) : undefined
    return (e?.subjectId && subjects.get(e.subjectId)?.color) || 'rgb(var(--ink-3))'
  }

  return (
    <article aria-labelledby="guide-title">
      <Card className="mb-5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="guide-title" className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">
              {guide.title}
            </h2>
            <p className="mt-0.5 text-xs text-ink-2">
              Creada el {shortFmt.format(guide.createdAt)} · {guide.days.length} {guide.days.length === 1 ? 'día' : 'días'} ·{' '}
              {fmtMin(total)} de estudio
            </p>
          </div>
          <IconButton label="Eliminar guía" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 />
          </IconButton>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {guide.examIds.map((id) => {
            const e = examMap.get(id)
            if (!e || e.deleted) return null
            const color = (e.subjectId && subjects.get(e.subjectId)?.color) || 'rgb(var(--ink-3))'
            return (
              <span
                key={id}
                className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-line px-2 text-xs text-ink-2"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                <span className="truncate font-medium text-ink">{e.title}</span>
                <span className="shrink-0">
                  {examTypeLabel(e.type)} · {shortFmt.format(e.at)}
                </span>
              </span>
            )
          })}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-xs text-ink-2">
            <span>Avance</span>
            <span className="font-mono tnum">
              {fmtMin(done)} de {fmtMin(total)}
            </span>
          </div>
          <ProgressBar value={total ? done / total : 0} tone={done >= total && total > 0 ? 'ok' : 'accent'} label="Avance de la guía" />
        </div>

        {guide.summary && <p className="mt-4 text-sm leading-relaxed">{guide.summary}</p>}

        {guide.skipped?.length ? (
          <p className="mt-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            <FileWarning className="mt-px size-4 shrink-0" aria-hidden />
            <span>La IA no pudo leer: {guide.skipped.join(', ')}.</span>
          </p>
        ) : null}
      </Card>

      <ol className="flex flex-col gap-4">
        {guide.days.map((d) => {
          const date = parseIsoDate(d.date)
          const isToday = d.date === today
          const past = d.date < today
          const mins = d.blocks.reduce((a, b) => a + b.minutes, 0)
          const allDone = d.blocks.every((b) => b.done)
          const examsThatDay = (exams ?? []).filter((e) => isoDate(e.at) === d.date)
          return (
            <li key={d.date}>
              <section aria-labelledby={`d-${d.date}`} className={clsx(past && allDone && 'opacity-60')}>
                <h3
                  id={`d-${d.date}`}
                  className={clsx(
                    'mb-2 flex flex-wrap items-center gap-2 px-0.5 text-[13px] font-medium first-letter:uppercase',
                    isToday ? 'text-accent' : 'text-ink-2',
                  )}
                >
                  <span className="first-letter:uppercase">{dayFmt.format(date)}</span>
                  {isToday && <Badge tone="accent">Hoy</Badge>}
                  {examsThatDay.map((e) => (
                    <Badge key={e.id} tone="danger">
                      {examTypeLabel(e.type)}: {e.title}
                    </Badge>
                  ))}
                  <span className="ml-auto font-mono text-xs font-normal text-ink-3 tnum">{fmtMin(mins)}</span>
                </h3>
                <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                  {d.blocks.map((b) => {
                    const e = b.examId ? examMap.get(b.examId) : undefined
                    return (
                      <li key={b.id} className="border-b border-line last:border-b-0">
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2/60">
                          <input type="checkbox" checked={b.done} onChange={() => toggleBlock(b.id)} className="peer sr-only" />
                          <span
                            aria-hidden
                            className={clsx(
                              'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent',
                              b.done ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface',
                            )}
                          >
                            {b.done && <Check className="size-3.5" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-3">
                              <span
                                className={clsx(
                                  'text-sm font-medium leading-snug [overflow-wrap:anywhere]',
                                  b.done && 'text-ink-2 line-through',
                                )}
                              >
                                {b.topic}
                              </span>
                              <span className="shrink-0 font-mono text-xs text-ink-2 tnum">{fmtMin(b.minutes)}</span>
                            </span>
                            {b.activity && (
                              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">{b.activity}</span>
                            )}
                            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
                              {e && (
                                <span className="inline-flex min-w-0 items-center gap-1.5">
                                  <span className="size-2 shrink-0 rounded-full" style={{ background: colorOf(b) }} aria-hidden />
                                  <span className="truncate">{e.title}</span>
                                </span>
                              )}
                              {b.material && (
                                <span className="inline-flex min-w-0 items-center gap-1 [overflow-wrap:anywhere]">
                                  <Paperclip className="size-3 shrink-0" aria-hidden />
                                  {b.material}
                                </span>
                              )}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </li>
          )
        })}
      </ol>

      {guide.tips.length > 0 && (
        <Card className="mt-6 p-4 sm:p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="size-4 text-hl" aria-hidden />
            Consejos
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-2">
            {guide.tips.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove('guides', guide.id)}
        title="Eliminar guía"
        message={`Se eliminará la guía «${guide.title}». Los exámenes y apuntes no se tocan.`}
      />
    </article>
  )
}
