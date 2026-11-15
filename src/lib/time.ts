const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** "en 2 d 4 h", "en 35 min", "vencida hace 3 h" */
export function relative(target: number, now = Date.now()): string {
  const diff = target - now
  const abs = Math.abs(diff)
  let s: string
  if (abs < MIN) s = 'menos de 1 min'
  else if (abs < HOUR) s = `${Math.floor(abs / MIN)} min`
  else if (abs < DAY) {
    const h = Math.floor(abs / HOUR)
    const m = Math.floor((abs % HOUR) / MIN)
    s = m ? `${h} h ${m} min` : `${h} h`
  } else {
    const d = Math.floor(abs / DAY)
    const h = Math.floor((abs % DAY) / HOUR)
    s = h ? `${d} d ${h} h` : `${d} d`
  }
  return diff >= 0 ? `en ${s}` : `hace ${s}`
}

/** Partes para cuentas regresivas grandes. */
export function parts(target: number, now = Date.now()) {
  const diff = Math.max(0, target - now)
  return {
    past: target < now,
    days: Math.floor(diff / DAY),
    hours: Math.floor((diff % DAY) / HOUR),
    minutes: Math.floor((diff % HOUR) / MIN),
    seconds: Math.floor((diff % MIN) / 1000),
  }
}

export type Urgency = 'overdue' | 'urgent' | 'soon' | 'later'

/** overdue: vencida · urgent: < 24 h · soon: < 72 h · later */
export function urgency(target: number, now = Date.now()): Urgency {
  const d = target - now
  if (d < 0) return 'overdue'
  if (d < DAY) return 'urgent'
  if (d < 3 * DAY) return 'soon'
  return 'later'
}

const dateFmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

export const fmtDate = (t: number) => dateFmt.format(t)
export const fmtTime = (t: number) => timeFmt.format(t)
export const fmtDateTime = (t: number) => `${dateFmt.format(t)} · ${timeFmt.format(t)}`

/** Para <input type="datetime-local"> */
export function toLocalInput(t: number): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromLocalInput = (s: string) => new Date(s).getTime()

export const fmtDuration = (sec: number) => {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export const fmtBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`

export { MIN, HOUR, DAY }
