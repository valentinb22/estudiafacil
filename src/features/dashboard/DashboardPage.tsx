import clsx from 'clsx'
import {
  AlertTriangle, ArrowUpRight, BookOpen, CalendarClock, CalendarPlus, Check, ClipboardCheck, ClipboardPlus,
  Headphones, MapPin, Mic, Pause, Play, Target, Timer,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Badge, Card, EmptyState, ProgressBar, SubjectChip } from '../../components/ui/Display'
import { update } from '../../lib/db'
import { useAudios, useExams, useNow, useSubjectMap, useSubjects, useTasks } from '../../lib/hooks'
import { usePlayer } from '../../lib/player'
import { playChime } from '../../lib/sound'
import { useUI } from '../../lib/store'
import { DAY, fmtDate, fmtDateTime, fmtDuration, fmtTime, parts, relative, urgency } from '../../lib/time'
import type { AudioItem, Exam, Task } from '../../lib/types'
import { collectAlerts, toneDot, toneText } from '../notifications/alerts'
import { NotificationToggle } from '../notifications/NotificationToggle'

const longDate = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const greeting = (h: number) => (h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches')

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function DashboardPage() {
  const now = useNow(30_000)
  const subjects = useSubjects()
  const tasks = useTasks()
  const exams = useExams()
  const audios = useAudios()

  const pending = useMemo(() => tasks.filter((t) => t.status !== 'done').sort((a, b) => a.dueAt - b.dueAt), [tasks])
  const upcomingExams = useMemo(() => exams.filter((e) => e.at >= now), [exams, now])
  const alerts = useMemo(
    () => collectAlerts(tasks, exams, now, { taskHorizon: DAY, examHorizon: 3 * DAY }),
    [tasks, exams, now],
  )
  const weekExams = upcomingExams.filter((e) => e.at - now < 7 * DAY).length
  const nextExam = upcomingExams[0]

  const date = longDate.format(now)
  const summary =
    pending.length || weekExams
      ? `Tienes ${plural(pending.length, 'tarea pendiente', 'tareas pendientes')} y ${plural(weekExams, 'examen', 'exámenes')} esta semana.`
      : 'Todo al día. Buen momento para adelantar o repasar.'

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Cabecera editorial */}
      <header className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
            <time dateTime={new Date(now).toISOString().slice(0, 10)}>{date}</time>
          </p>
          <h1 className="mt-2 font-serif text-[2.6rem] leading-[0.95] tracking-tight sm:text-6xl">
            {greeting(new Date(now).getHours())}<span className="italic text-accent">.</span>
          </h1>
          <p className="mt-3 max-w-prose text-sm text-ink-2 sm:text-[15px]">{summary}</p>
        </div>
        <NotificationToggle className="self-start md:self-end" />
      </header>

      {alerts.length > 0 && <UrgentBanner alerts={alerts} now={now} />}

      {/* KPIs */}
      <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi to="/materias" icon={<BookOpen />} label="Materias cursando" value={subjects.length} />
        <Kpi
          to="/tareas"
          icon={<ClipboardCheck />}
          label="Tareas pendientes"
          value={pending.length}
          note={alerts.some((a) => a.kind === 'task') ? `${alerts.filter((a) => a.kind === 'task').length} urgentes` : undefined}
        />
        <Kpi
          to="/examenes"
          icon={<CalendarClock />}
          label="Próximos exámenes"
          value={upcomingExams.length}
          note={weekExams ? `${weekExams} esta semana` : undefined}
        />
        <Kpi to="/estudio?tab=audios" icon={<Headphones />} label="Audios de memorización" value={audios.length} />
      </section>

      {/* Cuerpo asimétrico */}
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="space-y-6 lg:col-span-7">
          <NextExam exam={nextExam} />
          <UpcomingTasks tasks={pending.slice(0, 4)} total={pending.length} now={now} />
        </div>
        <aside className="space-y-6 lg:col-span-5">
          <QuickActions />
          <RecentAudios audios={audios} />
        </aside>
      </div>
    </div>
  )
}

/* ───────────────────────── Bloques ───────────────────────── */

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-serif text-2xl leading-none tracking-tight">{children}</h2>
      {action}
    </div>
  )
}

function SeeAll({ to, children = 'Ver todo' }: { to: string; children?: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-accent">
      {children}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  )
}

function UrgentBanner({ alerts, now }: { alerts: ReturnType<typeof collectAlerts>; now: number }) {
  const hasDanger = alerts.some((a) => a.tone === 'danger')
  return (
    <section
      aria-labelledby="urgent-title"
      role="region"
      className={clsx(
        'rounded-xl border p-4 sm:p-5',
        hasDanger ? 'border-danger/30 bg-danger-soft/60' : 'border-warn/30 bg-warn-soft/60',
      )}
    >
      <h2 id="urgent-title" className={clsx('flex items-center gap-2 text-sm font-semibold', hasDanger ? 'text-danger' : 'text-warn')}>
        <AlertTriangle className="size-4" aria-hidden />
        {alerts.length === 1 ? 'Requiere tu atención' : `${alerts.length} cosas requieren tu atención`}
      </h2>
      <ul className="mt-3 divide-y divide-line/70">
        {alerts.map((a) => {
          const when =
            a.urgency === 'overdue'
              ? `venció ${relative(a.at, now)}`
              : `${a.kind === 'task' ? 'vence' : 'es'} ${relative(a.at, now)}`
          return (
            <li key={a.key}>
              <Link
                to={a.href}
                className="group flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm focus-visible:outline-none"
              >
                <span className={clsx('size-2 shrink-0 rounded-full', toneDot[a.tone])} aria-hidden />
                <span className="text-xs font-medium uppercase tracking-wide text-ink-3">
                  {a.kind === 'task' ? 'Tarea' : 'Examen'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium group-hover:underline group-focus-visible:underline">
                  {a.title}
                </span>
                <SubjectChip subjectId={a.subjectId} className="hidden xs:inline-flex" />
                <span className={clsx('tnum w-full pl-5 font-mono text-xs xs:w-auto xs:pl-0', toneText[a.tone])}>
                  {when}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Kpi({ to, icon, label, value, note }: { to: string; icon: ReactNode; label: string; value: number; note?: string }) {
  return (
    <Link
      to={to}
      className="group flex min-h-32 flex-col justify-between rounded-xl border border-line bg-surface p-4 transition-colors duration-150 hover:border-ink-3 focus-visible:border-accent focus-visible:outline-none sm:p-5"
    >
      <span className="flex items-start justify-between gap-2 text-ink-3">
        <span className="[&>svg]:size-[18px]" aria-hidden>
          {icon}
        </span>
        <ArrowUpRight
          className="size-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </span>
      <span>
        <span className="tnum block font-serif text-5xl leading-none tracking-tight sm:text-6xl">{value}</span>
        <span className="mt-2 block text-[13px] font-medium leading-tight text-ink-2">{label}</span>
        {note && <span className="mt-0.5 block font-mono text-[11px] text-ink-3">{note}</span>}
      </span>
    </Link>
  )
}

function NextExam({ exam }: { exam?: Exam }) {
  const openFocus = useUI((s) => s.openFocus)
  const subjects = useSubjectMap()

  if (!exam)
    return (
      <section aria-labelledby="next-exam-title">
        <SectionTitle>
          <span id="next-exam-title">Próximo examen</span>
        </SectionTitle>
        <EmptyState
          icon={<CalendarClock />}
          title="No tienes exámenes programados"
          description="Programa tu próximo examen para ver la cuenta regresiva y seguir tu avance por temas."
          action={
            <Link
              to="/examenes?new=1"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent/90"
            >
              <CalendarPlus className="size-4" aria-hidden />
              Programar examen
            </Link>
          }
        />
      </section>
    )

  const total = exam.topics.length
  const mastered = exam.topics.filter((t) => t.level === 'mastered').length
  const color = exam.subjectId ? subjects.get(exam.subjectId)?.color : undefined

  return (
    <section aria-labelledby="next-exam-title">
      <SectionTitle action={<SeeAll to="/examenes">Ver exámenes</SeeAll>}>
        <span id="next-exam-title">Próximo examen</span>
      </SectionTitle>
      <Card className="relative overflow-hidden p-4 sm:p-6">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1"
          style={{ background: color ?? 'rgb(var(--line))' }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="hl">Lo importante ahora</Badge>
          <SubjectChip subjectId={exam.subjectId} />
          <span className="text-xs capitalize text-ink-3">{exam.type}</span>
        </div>
        <h3 className="mt-3 text-xl font-semibold leading-snug sm:text-2xl">{exam.title}</h3>
        <p className="tnum mt-1 font-mono text-[13px] text-ink-2">{fmtDateTime(exam.at)}</p>

        <Countdown at={exam.at} />

        <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm">
          <div className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-ink-3">
              <MapPin className="size-3.5" aria-hidden /> Lugar
            </dt>
            <dd className="mt-1 truncate font-medium">{exam.location || 'Sin definir'}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-ink-3">
              <Target className="size-3.5" aria-hidden /> Peso en la nota
            </dt>
            <dd className="tnum mt-1 font-mono font-medium">{exam.weight != null ? `${exam.weight}%` : '—'}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-ink-3">Temas dominados</span>
            <span className="tnum font-mono text-ink-2">
              {total ? `${mastered}/${total}` : 'Sin temas cargados'}
            </span>
          </div>
          <ProgressBar
            value={total ? mastered / total : 0}
            tone={total && mastered === total ? 'ok' : 'accent'}
            label={`Temas dominados: ${mastered} de ${total}`}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" icon={<Timer />} onClick={() => openFocus(exam.id)} className="h-11 sm:h-10">
            Modo Focus
          </Button>
          <Link
            to="/examenes"
            className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink sm:h-10"
          >
            Ver temas
          </Link>
        </div>
      </Card>
    </section>
  )
}

/** Cuenta regresiva aislada para que sólo ella se re-renderice cada segundo. */
function Countdown({ at }: { at: number }) {
  const now = useNow(1000)
  const p = parts(at, now)
  const cells: [number, string][] = [
    [p.days, p.days === 1 ? 'día' : 'días'],
    [p.hours, 'h'],
    [p.minutes, 'min'],
    [p.seconds, 's'],
  ]
  return (
    <div className="my-5" role="timer" aria-label={`Faltan ${p.days} días, ${p.hours} horas y ${p.minutes} minutos`}>
      <div className="grid grid-cols-4 gap-1 xs:gap-3" aria-hidden>
        {cells.map(([n, l], i) => (
          <div key={l} className={clsx('min-w-0', i > 0 && 'border-l border-line pl-2 xs:pl-3')}>
            <span className="tnum block font-serif text-4xl leading-none tracking-tight xs:text-5xl sm:text-6xl">
              {String(n).padStart(2, '0')}
            </span>
            <span className="mt-1 block font-mono text-[11px] uppercase tracking-wider text-ink-3">{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UpcomingTasks({ tasks, total, now }: { tasks: Task[]; total: number; now: number }) {
  const complete = async (t: Task) => {
    playChime()
    await update('tasks', t.id, { status: 'done', completedAt: Date.now() })
  }
  return (
    <section aria-labelledby="upcoming-title">
      <SectionTitle action={total > 0 ? <SeeAll to="/tareas">Ver las {total}</SeeAll> : undefined}>
        <span id="upcoming-title">Próximas entregas</span>
      </SectionTitle>
      {tasks.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="No tienes entregas pendientes"
          description="Agrega tus trabajos prácticos y tareas para no perder ninguna fecha."
          action={
            <Link
              to="/tareas?new=1"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
            >
              <ClipboardPlus className="size-4" aria-hidden />
              Nueva tarea
            </Link>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {tasks.map((t) => {
              const u = urgency(t.dueAt, now)
              const tone = u === 'overdue' || u === 'urgent' ? 'danger' : u === 'soon' ? 'warn' : 'neutral'
              return (
                <li key={t.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={false}
                    aria-label={`Marcar "${t.title}" como completada`}
                    onClick={() => complete(t)}
                    className="group grid size-10 shrink-0 place-items-center rounded-lg hover:bg-surface-2"
                  >
                    <span className="grid size-5 place-items-center rounded-md border-[1.5px] border-ink-3 text-transparent transition-colors group-hover:border-accent group-hover:text-accent group-focus-visible:border-accent">
                      <Check className="size-3.5" strokeWidth={3} aria-hidden />
                    </span>
                  </button>
                  <div className="min-w-0 flex-1">
                    <Link to="/tareas" className="block truncate text-sm font-medium hover:underline">
                      {t.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <SubjectChip subjectId={t.subjectId} />
                      {t.priority === 'high' && <Badge tone="danger">Alta</Badge>}
                      {t.checklist.length > 0 && (
                        <span className="tnum font-mono text-[11px] text-ink-3">
                          {t.checklist.filter((c) => c.done).length}/{t.checklist.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={clsx('tnum font-mono text-xs', toneText[tone])}>
                      {u === 'overdue' ? 'vencida' : relative(t.dueAt, now)}
                    </p>
                    <p className="tnum mt-0.5 font-mono text-[11px] text-ink-3">
                      {fmtDate(t.dueAt)} · {fmtTime(t.dueAt)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </section>
  )
}

function QuickActions() {
  const openFocus = useUI((s) => s.openFocus)
  const tile =
    'group flex min-h-[5.5rem] flex-col justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left text-sm font-medium transition-colors duration-150 hover:border-ink-3 focus-visible:border-accent focus-visible:outline-none sm:p-4'
  const ic = 'size-[18px] text-ink-3 transition-colors group-hover:text-accent'
  return (
    <section aria-labelledby="quick-title">
      <SectionTitle>
        <span id="quick-title">Acciones rápidas</span>
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/tareas?new=1" className={tile}>
          <ClipboardPlus className={ic} aria-hidden />
          Nueva tarea
        </Link>
        <Link to="/estudio?tab=audios&record=1" className={tile}>
          <Mic className={ic} aria-hidden />
          Grabar audio
        </Link>
        <Link to="/examenes?new=1" className={tile}>
          <CalendarPlus className={ic} aria-hidden />
          Programar examen
        </Link>
        <button type="button" onClick={() => openFocus()} className={tile}>
          <Timer className={ic} aria-hidden />
          Iniciar Pomodoro
        </button>
      </div>
    </section>
  )
}

function RecentAudios({ audios }: { audios: AudioItem[] }) {
  const play = usePlayer((s) => s.play)
  const toggle = usePlayer((s) => s.toggle)
  const currentId = usePlayer((s) => s.currentId)
  const playing = usePlayer((s) => s.playing)
  const recent = useMemo(() => [...audios].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4), [audios])
  const queue = useMemo(() => audios.map((a) => a.id), [audios])

  return (
    <section aria-labelledby="audios-title">
      <SectionTitle action={audios.length > 0 ? <SeeAll to="/estudio?tab=audios" /> : undefined}>
        <span id="audios-title">Audios recientes</span>
      </SectionTitle>
      {recent.length === 0 ? (
        <EmptyState
          icon={<Headphones />}
          title="Aún no tienes audios"
          description="Graba tus resúmenes y repásalos en el transporte o mientras caminas."
          action={
            <Link
              to="/estudio?tab=audios&record=1"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
            >
              <Mic className="size-4" aria-hidden />
              Grabar audio
            </Link>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {recent.map((a) => {
              const isCurrent = currentId === a.id
              const isPlaying = isCurrent && playing
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => (isCurrent ? toggle() : play(a.id, queue))}
                    aria-label={isPlaying ? `Pausar ${a.title}` : `Reproducir ${a.title}`}
                    aria-pressed={isPlaying}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none sm:px-4"
                  >
                    <span
                      className={clsx(
                        'grid size-9 shrink-0 place-items-center rounded-full border transition-colors',
                        isCurrent ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-2',
                      )}
                    >
                      {isPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="ml-0.5 size-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block truncate text-sm font-medium', isCurrent && 'text-accent')}>
                        {a.title}
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <SubjectChip subjectId={a.subjectId} />
                      </span>
                    </span>
                    {a.durationSec != null && (
                      <span className="tnum shrink-0 font-mono text-xs text-ink-3">{fmtDuration(a.durationSec)}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </section>
  )
}
