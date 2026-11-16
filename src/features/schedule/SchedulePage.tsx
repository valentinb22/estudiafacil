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

const HOUR_PX = 56 // alto de una hora en la grilla

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

  // Rango horario de la grilla: de la primera a la última clase, en horas enteras.
  const [fromH, toH] = useMemo(() => {
    if (!entries.length) return [8, 18]
    const starts = entries.map((e) => toMin(e.slot.start))
    const ends = entries.map((e) => toMin(e.slot.end))
    return [Math.floor(Math.min(...starts) / 60), Math.ceil(Math.max(...ends) / 60)]
  }, [entries])
  const hours = Array.from({ length: toH - fromH }, (_, i) => fromH + i)

  // Clase en curso y próxima clase de hoy.
  const todays = (byDay.get(today) ?? []).slice().sort((a, b) => a.startMin - b.startMin)
  const current = todays.find((p) => p.startMin <= nowMin && nowMin < p.endMin)
  const next = todays.find((p) => p.startMin > nowMin)

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

      {/* Celular: agenda por día */}
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
        <DayAgenda
          day={mobileDay}
          items={(byDay.get(mobileDay) ?? []).slice().sort((a, b) => a.startMin - b.startMin)}
          isToday={mobileDay === today}
          nowMin={nowMin}
        />
      </div>

      {/* Escritorio: grilla semanal */}
      <Card className="hidden overflow-hidden md:block">
        <div
          className="grid"
          style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <div className="border-b border-line" />
          {days.map((w) => (
            <div
              key={w.day}
              className={clsx(
                'border-b border-l border-line px-2 py-2.5 text-center text-[13px] font-medium',
                w.day === today ? 'text-accent' : 'text-ink-2',
              )}
            >
              {w.long}
              {w.day === today && <span className="sr-only"> (hoy)</span>}
            </div>
          ))}

          {/* Columna de horas */}
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-ink-2 tnum"
                style={{ top: i * HOUR_PX }}
              >
                {i === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>

          {days.map((w) => (
            <div
              key={w.day}
              className={clsx('relative border-l border-line', w.day === today && 'bg-accent-soft/30')}
              style={{
                height: hours.length * HOUR_PX,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, rgb(var(--line)) ${HOUR_PX - 1}px, rgb(var(--line)) ${HOUR_PX}px)`,
              }}
            >
              {(byDay.get(w.day) ?? []).map((p) => (
                <SlotBlock key={p.slot.id} p={p} fromMin={fromH * 60} />
              ))}
              {w.day === today && nowMin >= fromH * 60 && nowMin <= toH * 60 && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger"
                  style={{ top: ((nowMin - fromH * 60) / 60) * HOUR_PX }}
                >
                  <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-danger" />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

const roomOf = (p: { slot: ScheduleSlot; subject: Subject }) => p.slot.room || p.subject.room

function SlotBlock({ p, fromMin }: { p: PlacedSlot; fromMin: number }) {
  const top = ((p.startMin - fromMin) / 60) * HOUR_PX
  const height = Math.max(((p.endMin - p.startMin) / 60) * HOUR_PX, 22)
  const width = 100 / p.lanes
  const compact = height < 52
  const room = roomOf(p)
  return (
    <div
      className="absolute p-0.5"
      style={{ top, height, left: `${p.lane * width}%`, width: `${width}%` }}
      title={`${p.subject.name} · ${p.slot.start}–${p.slot.end}${room ? ` · ${room}` : ''}`}
    >
      <div
        className="relative h-full overflow-hidden rounded-md border border-line bg-surface pl-2.5 pr-1.5 py-1 shadow-sm"
        style={{ background: `color-mix(in srgb, ${p.subject.color} 12%, rgb(var(--surface)))` }}
      >
        <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: p.subject.color }} />
        <p className="truncate text-[12px] font-semibold leading-tight">{p.subject.code || p.subject.name}</p>
        {!compact && (
          <>
            <p className="truncate font-mono text-[11px] text-ink-2 tnum">
              {p.slot.start}–{p.slot.end}
            </p>
            {room && <p className="truncate text-[11px] text-ink-2">{room}</p>}
          </>
        )}
      </div>
    </div>
  )
}

function DayAgenda({
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
      <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-2">
        No tienes clases el {dayLong(day).toLowerCase()}.
      </p>
    )
  }
  return (
    <ol className="mt-4 space-y-2">
      {items.map((p) => {
        const live = isToday && p.startMin <= nowMin && nowMin < p.endMin
        const past = isToday && p.endMin <= nowMin
        const room = roomOf(p)
        return (
          <li key={p.slot.id}>
            <Card className={clsx('relative flex gap-3 overflow-hidden p-3 pl-4', live && 'ring-2 ring-accent', past && 'opacity-60')}>
              <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: p.subject.color }} />
              <div className="w-14 shrink-0 font-mono text-[13px] leading-tight tnum">
                <div>{p.slot.start}</div>
                <div className="text-ink-2">{p.slot.end}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight [overflow-wrap:anywhere]">{p.subject.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-2">
                  {p.subject.code && <span className="font-mono">{p.subject.code}</span>}
                  {room && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      {room}
                    </span>
                  )}
                  {live && <span className="font-medium text-accent">En curso</span>}
                </div>
              </div>
            </Card>
          </li>
        )
      })}
    </ol>
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
