import clsx from 'clsx'
import { CalendarDays, MapPin } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card, EmptyState, PageHeader } from '../../components/ui/Display'
import { SegmentedControl } from '../../components/ui/Form'
import { GlobalSubjectFilter } from '../../components/ui/SubjectSelect'
import { useNow, useSubjects } from '../../lib/hooks'
import { dayLong, fromMin, isValidSlot, layoutDay, toMin, WEEK } from '../../lib/schedule'
import type { PlacedSlot } from '../../lib/schedule'
import { useUI } from '../../lib/store'
import type { ScheduleSlot, Subject, Weekday } from '../../lib/types'

interface Entry {
  slot: ScheduleSlot
  subject: Subject
}

/** Horarios semanales generados a partir de las franjas cargadas en cada materia. */
export function SchedulePage() {
  const navigate = useNavigate()
  const subjects = useSubjects()
  const filter = useUI((s) => s.subjectFilter)
  const now = useNow(30_000)
  const today = new Date(now).getDay() as Weekday
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  const [mobileDay, setMobileDay] = useState<Weekday>(today)

  const entries: Entry[] = useMemo(
    () =>
      subjects
        .filter((s) => !filter || s.id === filter)
        .flatMap((subject) => (subject.slots ?? []).filter(isValidSlot).map((slot) => ({ slot, subject }))),
    [subjects, filter],
  )

  // Días visibles: lunes a viernes siempre; sábado y domingo sólo si tienen clases.
  const days = WEEK.filter((w) => w.day >= 1 && w.day <= 5 || entries.some((e) => e.slot.day === w.day))

  const byDay = useMemo(() => {
    const m = new Map<Weekday, PlacedSlot[]>()
    for (const w of WEEK) m.set(w.day, layoutDay(entries.filter((e) => e.slot.day === w.day)))
    return m
  }, [entries])

  // Clase en curso y próxima clase de hoy.
  const todays = (byDay.get(today) ?? []).slice().sort((a, b) => a.startMin - b.startMin)
  const current = todays.find((p) => p.startMin <= nowMin && nowMin < p.endMin)
  const next = todays.find((p) => p.startMin > nowMin)

  const sorted = (d: Weekday) => (byDay.get(d) ?? []).slice().sort((a, b) => a.startMin - b.startMin)

  const totalWeekMin = entries.reduce((acc, e) => acc + toMin(e.slot.end) - toMin(e.slot.start), 0)
  const hoursLabel = `${Math.floor(totalWeekMin / 60)} h${totalWeekMin % 60 ? ` ${totalWeekMin % 60} min` : ''}`

  if (!subjects.some((s) => (s.slots ?? []).some(isValidSlot))) {
    return (
      <>
        <PageHeader title="Horarios" description="Tu semana de cursada, armada con los horarios de cada materia." />
        <EmptyState
          icon={<CalendarDays />}
          title="Todavía no cargaste horarios"
          description="Edita una materia y agrega en qué días y horas cursas. La grilla semanal se arma sola."
          action={
            <Button variant="primary" onClick={() => navigate('/materias')}>
              Ir a Materias
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Horarios"
        description={
          entries.length
            ? `${entries.length} ${entries.length === 1 ? 'clase' : 'clases'} por semana · ${hoursLabel} de cursada`
            : 'La materia filtrada no tiene horarios cargados.'
        }
        actions={<GlobalSubjectFilter className="w-48" />}
      />

      {(current || next) && (
        <Card className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          {current && <NowLine label="Ahora" p={current} tone="accent" />}
          {next && <NowLine label="Próxima" p={next} />}
        </Card>
      )}

      {/* Celular: un día a la vez */}
      <div className="md:hidden">
        <SegmentedControl
          label="Día"
          value={String(mobileDay)}
          onChange={(v) => setMobileDay(Number(v) as Weekday)}
          options={days.map((w) => ({
            value: String(w.day),
            label: (
              <span className={clsx(w.day === today && 'underline decoration-accent decoration-2 underline-offset-4')}>
                {w.short}
              </span>
            ),
          }))}
        />
        <div className="mt-4">
          <DayColumn day={mobileDay} items={sorted(mobileDay)} isToday={mobileDay === today} nowMin={nowMin} />
        </div>
      </div>

      {/* Escritorio: una columna de tarjetas por día */}
      <div
        className="hidden gap-3 md:grid"
        style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
      >
        {days.map((w) => (
          <section key={w.day} aria-labelledby={`dia-${w.day}`} className="min-w-0">
            <h2
              id={`dia-${w.day}`}
              className={clsx(
                'mb-2 flex items-center gap-2 px-0.5 text-[13px] font-medium',
                w.day === today ? 'text-accent' : 'text-ink-2',
              )}
            >
              {w.long}
              {w.day === today && (
                <span className="rounded-md bg-accent-soft px-1.5 py-px text-[11px] font-medium text-accent">Hoy</span>
              )}
            </h2>
            <DayColumn day={w.day} items={sorted(w.day)} isToday={w.day === today} nowMin={nowMin} />
          </section>
        ))}
      </div>
    </>
  )
}

const roomOf = (p: { slot: ScheduleSlot; subject: Subject }) => p.slot.room || p.subject.room

/** "10 min", "1 h 30 min". */
function fmtSpan(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

/** Las clases de un día como tarjetas apiladas, con los recreos entre una y otra. */
function DayColumn({
  day,
  items,
  isToday,
  nowMin,
}: {
  day: Weekday
  items: PlacedSlot[]
  isToday: boolean
  nowMin: number
}) {
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[13px] text-ink-3">
        <span className="md:hidden">No tienes clases el {dayLong(day).toLowerCase()}.</span>
        <span className="hidden md:inline">Libre</span>
      </p>
    )
  }
  return (
    <ol className="space-y-0">
      {items.map((p, i) => {
        const prev = items[i - 1]
        const gap = prev ? p.startMin - prev.endMin : 0
        return (
          <li key={p.slot.id}>
            {prev && <Gap min={gap} />}
            <ClassCard p={p} live={isToday && p.startMin <= nowMin && nowMin < p.endMin} past={isToday && p.endMin <= nowMin} />
          </li>
        )
      })}
    </ol>
  )
}

function Gap({ min }: { min: number }) {
  const label = min < 0 ? 'Se superponen' : min === 0 ? 'Sin recreo' : `${min < 60 ? 'Recreo' : 'Libre'} ${fmtSpan(min)}`
  return (
    <div className="flex items-center gap-2 py-1.5 text-[11px] text-ink-3" aria-label={label}>
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className={clsx('font-mono tnum', min < 0 && 'text-warn')}>{label.toLowerCase()}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  )
}

function ClassCard({ p, live, past }: { p: PlacedSlot; live: boolean; past: boolean }) {
  const room = roomOf(p)
  return (
    <article
      className={clsx(
        'relative overflow-hidden rounded-xl border border-line bg-surface px-3 pb-2.5 pt-3 shadow-card',
        live && 'ring-2 ring-accent',
        past && 'opacity-60',
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: p.subject.color }} />
      <p className="font-mono text-[12px] text-ink-2 tnum">
        {p.slot.start}–{p.slot.end}
      </p>
      <h3 className="mt-0.5 text-[14px] font-medium leading-snug [overflow-wrap:anywhere]">{p.subject.name}</h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-ink-2">
        {room && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{room}</span>
          </span>
        )}
        <span className="tnum">{fmtSpan(p.endMin - p.startMin)}</span>
        {live && <span className="font-medium text-accent">En curso</span>}
      </div>
    </article>
  )
}

function NowLine({ label, p, tone }: { label: string; p: PlacedSlot; tone?: 'accent' }) {
  const room = roomOf(p)
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span
        className={clsx(
          'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium',
          tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2',
        )}
      >
        {label}
      </span>
      <span className="size-2 shrink-0 rounded-full" style={{ background: p.subject.color }} aria-hidden />
      <span className="min-w-0 truncate font-medium">{p.subject.name}</span>
      <span className="shrink-0 font-mono text-xs text-ink-2 tnum">
        {fromMin(p.startMin)}–{fromMin(p.endMin)}
        {room ? ` · ${room}` : ''}
      </span>
    </div>
  )
}
