import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BookOpenCheck, CalendarRange, Check, ChevronDown, Coffee, FileWarning, Flag, GraduationCap, Lightbulb, ListChecks,
  Copy, Paperclip, ScrollText, Sparkles, Trash2, UtensilsCrossed,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge, Card, PageHeader, ProgressBar } from '../../components/ui/Display'
import { ConfirmModal } from '../../components/ui/Modal'
import { alive, db, remove, update } from '../../lib/db'
import { useNow, useSubjectMap } from '../../lib/hooks'
import type { Exam, GuideBlock, StudyGuide } from '../../lib/types'
import { examTypeLabel } from '../exams/examUtils'
import { GuideGenerator } from './GuideGenerator'
import { intensityOf, isoDate, parseIsoDate } from './gemini'

const weekdayFmt = new Intl.DateTimeFormat('es', { weekday: 'long' })
const monthDayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' })
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
      if (!isCheckable(b)) continue
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
    text: 'Usa los temas de cada examen, el material de estudio vinculado (apuntes, resúmenes, PDFs y fotos) y tus horarios de clase.',
  },
  {
    icon: Sparkles,
    title: 'Recibes un plan a medida',
    text: 'Según tus horarios de cursada y cuánto tienes que estudiar, reparte los temas en días y horarios libres, con repasos antes de cada examen.',
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
              Creada el {shortFmt.format(guide.createdAt)} ·{' '}
              {guide.intensity ? `Intensidad ${intensityOf(guide.intensity).label.toLowerCase()} · ` : ''}
              {guide.days.length} {guide.days.length === 1 ? 'día' : 'días'} ·{' '}
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

        {guide.request && (
          <p className="mt-4 rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[13px] text-ink-2">
            <span className="font-medium text-ink">Tu pedido:</span> {guide.request}
          </p>
        )}

        {guide.summary && <p className="mt-4 text-sm leading-relaxed">{guide.summary}</p>}

        {guide.skipped?.length ? (
          <p className="mt-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
            <FileWarning className="mt-px size-4 shrink-0" aria-hidden />
            <span>La IA no pudo leer: {guide.skipped.join(', ')}.</span>
          </p>
        ) : null}
      </Card>

      {guide.extras?.length ? (
        <div className="mb-8 flex flex-col gap-3">
          {guide.extras.map((x, i) => (
            <ExtraSection key={i} title={x.title} body={x.body} />
          ))}
        </div>
      ) : null}

      <ol className="flex flex-col gap-8">
        {guide.days.map((d) => {
          const date = parseIsoDate(d.date)
          const isToday = d.date === today
          const past = d.date < today
          const studyMin = d.blocks.filter(isCheckable).reduce((a, b) => a + b.minutes, 0)
          const allDone = d.blocks.filter(isCheckable).every((b) => b.done)
          const timed = d.blocks.filter((b) => b.time)
          const first = timed[0]?.time?.slice(0, 5)
          const lastTime = timed[timed.length - 1]?.time
          const last = lastTime ? lastTime.slice(-5) : undefined
          let n = 0
          return (
            <li key={d.date}>
              <section aria-labelledby={`d-${d.date}`} className={clsx(past && allDone && 'opacity-60')}>
                <header className="mb-3 px-0.5">
                  <h3 id={`d-${d.date}`} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className={clsx('font-serif text-3xl leading-none', isToday && 'text-accent')}>
                      {weekdayFmt.format(date).replace(/^./, (c) => c.toUpperCase())}
                    </span>
                    <span className="text-sm text-ink-2">{monthDayFmt.format(date)}</span>
                    {isToday && <Badge tone="accent">Hoy</Badge>}
                  </h3>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                    {d.title && <span className="font-medium text-ink">{d.title}</span>}
                    {first && last && (
                      <span className="font-mono tnum">
                        {first} – {last}
                      </span>
                    )}
                    {studyMin > 0 && <span>· {fmtMin(studyMin)} de estudio</span>}
                  </p>
                </header>
                <ol className="overflow-hidden rounded-xl border border-line bg-surface">
                  {d.blocks.map((b) => {
                    const numbered = b.kind !== 'class' && b.kind !== 'exam'
                    if (numbered) n++
                    return (
                      <BlockRow
                        key={b.id}
                        block={b}
                        n={numbered ? n : undefined}
                        exam={b.examId ? examMap.get(b.examId) : undefined}
                        color={colorOf(b)}
                        onToggle={() => toggleBlock(b.id)}
                      />
                    )
                  })}
                </ol>
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

/** Bloques que cuentan como estudio (se tildan y suman al avance). Guías viejas no tienen `kind`. */
const isCheckable = (b: GuideBlock) => !b.kind || b.kind === 'study' || b.kind === 'review' || b.kind === 'practice'

const fmtRange = (t?: string) => (t ? t.replace('–', ' – ') : '')

function BlockRow({
  block: b,
  n,
  exam,
  color,
  onToggle,
}: {
  block: GuideBlock
  n?: number
  exam?: Exam
  color: string
  onToggle: () => void
}) {
  const row = 'border-b border-line last:border-b-0'

  // Clase de la cursada: fija, sólo para ubicar el día.
  if (b.kind === 'class') {
    return (
      <li className={clsx(row, 'flex items-center gap-3 bg-surface-2/50 px-3 py-2 text-[13px] text-ink-2')}>
        <GraduationCap className="size-4 shrink-0" style={{ color: b.color }} aria-hidden />
        <span className="w-28 shrink-0 font-mono text-xs tnum">{fmtRange(b.time)}</span>
        <span className="min-w-0 flex-1 truncate">
          {b.topic}
          {b.activity && <span className="text-ink-3"> · {b.activity}</span>}
        </span>
      </li>
    )
  }

  if (b.kind === 'exam') {
    return (
      <li className={clsx(row, 'flex items-center gap-3 bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger')}>
        <Flag className="size-4 shrink-0" aria-hidden />
        <span className="w-28 shrink-0 font-mono text-xs tnum">{b.time}</span>
        <span className="min-w-0 flex-1">
          {b.topic}
          {b.activity && <span className="font-normal"> · {b.activity}</span>}
        </span>
      </li>
    )
  }

  // Descansos, comidas y preparación: filas compactas.
  if (b.kind === 'break' || b.kind === 'meal' || b.kind === 'prep') {
    const Icon = b.kind === 'meal' ? UtensilsCrossed : b.kind === 'break' ? Coffee : ListChecks
    return (
      <li className={clsx(row, 'flex items-start gap-3 px-3 py-2 text-[13px]', b.kind !== 'prep' && 'bg-surface-2/40')}>
        <span className="w-5 shrink-0 pt-px text-right font-mono text-xs text-ink-3 tnum">{n}.</span>
        <span className="w-28 shrink-0 pt-px font-mono text-xs text-ink-2 tnum">{fmtRange(b.time)}</span>
        <span className="min-w-0 flex-1 text-ink-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <Icon className="size-3.5 text-ink-3" aria-hidden />
            {b.topic}
          </span>
          {b.activity && <span className="block text-xs leading-relaxed">{b.activity}</span>}
        </span>
      </li>
    )
  }

  // Bloque de estudio, repaso o simulacro.
  const kindLabel = b.kind === 'review' ? 'Repaso' : b.kind === 'practice' ? 'Simulacro' : undefined
  return (
    <li className={row}>
      <label className="flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-surface-2/50">
        <input type="checkbox" checked={b.done} onChange={onToggle} className="peer sr-only" />
        <span className="w-5 shrink-0 pt-0.5 text-right font-mono text-xs text-ink-3 tnum">{n}.</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={clsx(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                b.done ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface',
              )}
            >
              {b.done && <Check className="size-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                {b.time && <span className="font-mono text-[13px] text-ink-2 tnum">{fmtRange(b.time)}</span>}
                <span className={clsx('text-[15px] font-semibold leading-snug', b.done && 'text-ink-2 line-through')}>
                  {b.topic}
                </span>
                {kindLabel && (
                  <Badge tone={b.kind === 'practice' ? 'warn' : 'neutral'} className="h-5 px-1.5 text-[11px]">
                    {kindLabel}
                  </Badge>
                )}
              </span>
              {b.activity && <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{b.activity}</span>}
              {b.points && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] leading-relaxed marker:text-ink-3">
                  {b.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
              {b.check && (
                <span className="mt-2 block rounded-md bg-accent-soft/60 px-2.5 py-1.5 text-[13px] leading-relaxed text-accent">
                  {b.check}
                </span>
              )}
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
                {!b.time && <span className="font-mono tnum">{fmtMin(b.minutes)}</span>}
                {exam && (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                    <span className="truncate">{exam.title}</span>
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
          </span>
        </span>
      </label>
    </li>
  )
}

/** Sección pedida aparte del cronograma (guion, resumen…), plegable y con botón para copiar. */
function ExtraSection({ title, body }: { title: string; body: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* portapapeles no disponible */
    }
  }
  return (
    <details open className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ScrollText className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 text-[15px] font-semibold [overflow-wrap:anywhere]">{title || 'Pedido'}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-2 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">
        <div className="mb-2 flex justify-end">
          <Button size="sm" variant="ghost" icon={copied ? <Check /> : <Copy />} onClick={copy}>
            {copied ? 'Copiado' : 'Copiar'}
          </Button>
        </div>
        <RichText text={body} />
      </div>
    </details>
  )
}

/** Negrita con **texto**. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

/** Texto con formato mínimo: "## " subtítulos, "- " viñetas, párrafos y **negrita**. */
function RichText({ text }: { text: string }) {
  const out: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (!bullets.length) return
    out.push(
      <ul key={`u${out.length}`} className="list-disc space-y-0.5 pl-5 marker:text-ink-3">
        {bullets.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>,
    )
    bullets = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    if (bullet) {
      bullets.push(bullet[1])
      continue
    }
    flush()
    if (!line) continue
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    if (heading) {
      out.push(
        <h4 key={out.length} className="pt-3 text-sm font-semibold text-ink first:pt-0">
          {inline(heading[1])}
        </h4>,
      )
    } else {
      out.push(<p key={out.length}>{inline(line)}</p>)
    }
  }
  flush()
  return <div className="space-y-2 text-sm leading-relaxed text-ink-2">{out}</div>
}
