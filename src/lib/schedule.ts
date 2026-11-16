import type { ScheduleSlot, Subject, Weekday } from './types'

/** Orden de la semana académica: lunes primero. */
export const WEEK: { day: Weekday; short: string; long: string }[] = [
  { day: 1, short: 'Lun', long: 'Lunes' },
  { day: 2, short: 'Mar', long: 'Martes' },
  { day: 3, short: 'Mié', long: 'Miércoles' },
  { day: 4, short: 'Jue', long: 'Jueves' },
  { day: 5, short: 'Vie', long: 'Viernes' },
  { day: 6, short: 'Sáb', long: 'Sábado' },
  { day: 0, short: 'Dom', long: 'Domingo' },
]

export const dayShort = (d: Weekday) => WEEK.find((w) => w.day === d)!.short
export const dayLong = (d: Weekday) => WEEK.find((w) => w.day === d)!.long

/** "HH:MM" → minutos desde medianoche (NaN si es inválido). */
export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return NaN
  return Number(m[1]) * 60 + Number(m[2])
}

export const fromMin = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Franja válida: horas bien formadas y fin posterior al inicio. */
export const isValidSlot = (s: ScheduleSlot) => {
  const a = toMin(s.start)
  const b = toMin(s.end)
  return Number.isFinite(a) && Number.isFinite(b) && b > a
}

const weekIndex = (d: Weekday) => WEEK.findIndex((w) => w.day === d)

/** Ordena por día (lunes primero) y hora de inicio. */
export const sortSlots = (slots: ScheduleSlot[]) =>
  [...slots].sort((a, b) => weekIndex(a.day) - weekIndex(b.day) || toMin(a.start) - toMin(b.start))

/** Resumen corto: "Lun 18:00–20:00 · Mié 14:00–16:00". */
export function summarizeSlots(subject: Pick<Subject, 'slots' | 'schedule'>): string | undefined {
  const slots = (subject.slots ?? []).filter(isValidSlot)
  if (!slots.length) return subject.schedule || undefined
  return sortSlots(slots)
    .map((s) => `${dayShort(s.day)} ${s.start}–${s.end}`)
    .join(' · ')
}

export interface PlacedSlot {
  slot: ScheduleSlot
  subject: Subject
  startMin: number
  endMin: number
  lane: number // columna dentro del día cuando hay superposición
  lanes: number // total de columnas del grupo superpuesto
}

/**
 * Ubica las franjas de un día en "carriles" para que las superpuestas
 * se muestren lado a lado en la grilla semanal.
 */
export function layoutDay(items: { slot: ScheduleSlot; subject: Subject }[]): PlacedSlot[] {
  const sorted = items
    .map((i) => ({ ...i, startMin: toMin(i.slot.start), endMin: toMin(i.slot.end) }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  const out: PlacedSlot[] = []
  let group: PlacedSlot[] = []
  let groupEnd = -1
  let laneEnds: number[] = []

  const flush = () => {
    const lanes = laneEnds.length
    group.forEach((g) => (g.lanes = lanes))
    out.push(...group)
    group = []
    laneEnds = []
  }

  for (const it of sorted) {
    if (group.length && it.startMin >= groupEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= it.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(it.endMin)
    } else laneEnds[lane] = it.endMin
    group.push({ ...it, lane, lanes: 1 })
    groupEnd = Math.max(groupEnd, it.endMin)
  }
  if (group.length) flush()
  return out
}
