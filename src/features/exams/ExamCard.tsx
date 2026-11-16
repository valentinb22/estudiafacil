import clsx from 'clsx'
import { CalendarClock, MapPin, Pencil, Percent, Play, Target } from 'lucide-react'
import { Button, IconButton } from '../../components/ui/Button'
import { Badge, Card, ProgressBar, SubjectChip } from '../../components/ui/Display'
import { update } from '../../lib/db'
import { useNow, useSubjectMap } from '../../lib/hooks'
import { useUI } from '../../lib/store'
import { fmtDateTime, parts, relative, urgency } from '../../lib/time'
import type { Exam, TopicLevel } from '../../lib/types'
import { ExamMaterialsList } from './ExamMaterials'
import { examTypeLabel, levelLabel, nextLevel, preparation } from './examUtils'

const p2 = (n: number) => String(n).padStart(2, '0')

function Countdown({ at }: { at: number }) {
  const now = useNow(1000)
  const p = parts(at, now)
  const u = urgency(at, now)
  if (p.past) {
    return <p className="font-mono text-sm text-ink-2 tnum">{relative(at, now)}</p>
  }
  const tone = u === 'urgent' ? 'text-danger' : u === 'soon' ? 'text-warn' : 'text-ink'
  return (
    <div role="timer" className={clsx('flex items-baseline gap-2', tone)} aria-label={`Faltan ${relative(at, now).replace(/^en /, '')}`}>
      {p.days > 0 && (
        <span className="font-serif text-4xl leading-none tnum">
          {p.days}
          <span className="ml-1 font-sans text-sm text-ink-2">{p.days === 1 ? 'día' : 'días'}</span>
        </span>
      )}
      <span className={clsx('font-mono tnum', p.days > 0 ? 'text-sm text-ink-2' : 'text-2xl')} aria-hidden>
        {p2(p.hours)}:{p2(p.minutes)}:{p2(p.seconds)}
      </span>
    </div>
  )
}

const levelStyles: Record<TopicLevel, string> = {
  unseen: 'border-line text-ink-2',
  review: 'border-warn/40 bg-warn-soft text-warn',
  mastered: 'border-ok/40 bg-ok-soft text-ok',
}
const levelDot: Record<TopicLevel, string> = {
  unseen: 'border border-ink-3',
  review: 'bg-warn',
  mastered: 'bg-ok',
}

export function ExamCard({
  exam,
  isNext,
  onEdit,
}: {
  exam: Exam
  isNext?: boolean
  onEdit: (exam: Exam) => void
}) {
  const subject = useSubjectMap().get(exam.subjectId ?? '')
  const openFocus = useUI((s) => s.openFocus)
  const now = useNow(60_000)
  const past = exam.at < now
  const prep = preparation(exam)
  const pct = prep == null ? null : Math.round(prep * 100)

  const cycle = (topicId: string) =>
    update('exams', exam.id, {
      topics: exam.topics.map((t) => (t.id === topicId ? { ...t, level: nextLevel(t.level) } : t)),
    })

  return (
    <Card
      className={clsx('relative flex flex-col overflow-hidden p-4 sm:p-5', past && 'opacity-60')}
      role="article"
      aria-label={exam.title}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: subject?.color ?? 'rgb(var(--line))' }}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <SubjectChip subjectId={exam.subjectId} />
          <Badge tone={exam.type === 'final' ? 'accent' : 'neutral'}>{examTypeLabel(exam.type)}</Badge>
          {isNext && <Badge tone="hl">Próximo</Badge>}
        </div>
        <IconButton label={`Editar «${exam.title}»`} size="sm" onClick={() => onEdit(exam)} className="-mr-1 -mt-1">
          <Pencil />
        </IconButton>
      </div>

      <h2 className="mt-3 text-lg font-semibold leading-snug [overflow-wrap:anywhere]">
        {isNext ? <mark className="box-decoration-clone bg-hl-soft px-0.5 text-ink">{exam.title}</mark> : exam.title}
      </h2>

      <div className="mt-3">
        <Countdown at={exam.at} />
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-2">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Fecha</dt>
          <CalendarClock className="size-3.5 text-ink-3" aria-hidden />
          <dd className="font-mono tnum">{fmtDateTime(exam.at)}</dd>
        </div>
        {exam.location && (
          <div className="flex min-w-0 items-center gap-1.5">
            <dt className="sr-only">Lugar</dt>
            <MapPin className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <dd className="truncate">{exam.location}</dd>
          </div>
        )}
        {exam.weight != null && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Peso en la nota final</dt>
            <Percent className="size-3.5 text-ink-3" aria-hidden />
            <dd>
              <span className="font-mono tnum">{exam.weight}%</span> de la nota
            </dd>
          </div>
        )}
        {exam.targetGrade != null && (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Nota objetivo</dt>
            <Target className="size-3.5 text-ink-3" aria-hidden />
            <dd>
              Objetivo <span className="font-mono tnum">{exam.targetGrade}</span>
            </dd>
          </div>
        )}
      </dl>

      {exam.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2 line-clamp-4">{exam.notes}</p>}

      <ExamMaterialsList refs={exam.materials} />

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-2">Preparación</p>
            <p className="font-serif text-3xl leading-none tnum">
              {pct == null ? '—' : pct}
              {pct != null && <span className="text-xl text-ink-2">%</span>}
            </p>
          </div>
          {!past && (
            <Button size="sm" variant="primary" icon={<Play />} onClick={() => openFocus(exam.id)}>
              Iniciar repaso
            </Button>
          )}
        </div>
        <ProgressBar
          value={prep ?? 0}
          tone={pct != null && pct >= 80 ? 'ok' : 'accent'}
          label={`Preparación de «${exam.title}»`}
          className="mt-3"
        />

        {exam.topics.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-1.5" aria-label="Temas">
            {exam.topics.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span
                  className={clsx(
                    'min-w-0 flex-1 break-words text-sm',
                    t.level === 'mastered' ? 'text-ink-2' : 'text-ink',
                  )}
                >
                  {t.name}
                </span>
                <button
                  type="button"
                  onClick={() => cycle(t.id)}
                  aria-label={`${t.name}: ${levelLabel(t.level)}. Cambiar a ${levelLabel(nextLevel(t.level))}`}
                  title="Cambiar estado"
                  className={clsx(
                    'inline-flex h-8 w-[6.25rem] shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors duration-150 hover:brightness-95',
                    levelStyles[t.level],
                  )}
                >
                  <span aria-hidden className={clsx('size-2 shrink-0 rounded-full', levelDot[t.level])} />
                  {levelLabel(t.level)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-ink-2">
            Sin temas cargados.{' '}
            <button type="button" className="font-medium text-accent hover:underline" onClick={() => onEdit(exam)}>
              Agrega temas
            </button>
          </p>
        )}
      </div>
    </Card>
  )
}
