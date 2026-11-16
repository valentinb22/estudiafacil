import { useEffect } from 'react'
import { alive, db } from '../../lib/db'
import { DAY, fmtDateTime, relative } from '../../lib/time'

const KEY = 'ef-notified'
const TICK = 60_000

function readNotified(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const v: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function saveNotified(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-300)))
  } catch {
    /* almacenamiento no disponible */
  }
}

function notify(title: string, body: string, tag: string) {
  try {
    const n = new Notification(title, { body, tag, icon: `${import.meta.env.BASE_URL}favicon.svg` })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* algunos navegadores móviles sólo permiten notificaciones vía service worker */
  }
}

async function check() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const now = Date.now()
  const [tasks, exams] = await Promise.all([db.tasks.toArray(), db.exams.toArray()])
  const notified = readNotified()
  const seen = new Set(notified)
  let changed = false

  for (const t of alive(tasks)) {
    if (t.status === 'done') continue
    const remindAt = t.dueAt - (t.remindBeforeMin ?? 0) * 60_000
    // El vencimiento forma parte de la clave: si se reprograma, vuelve a avisar.
    const key = `task:${t.id}:${t.dueAt}`
    if (remindAt > now || seen.has(key)) continue
    const when = t.dueAt < now ? `Venció ${relative(t.dueAt, now)}` : `Vence ${relative(t.dueAt, now)}`
    notify(`Tarea: ${t.title}`, `${when} · ${fmtDateTime(t.dueAt)}`, key)
    seen.add(key)
    notified.push(key)
    changed = true
  }

  for (const e of alive(exams)) {
    if (e.at < now || e.at - now > DAY) continue
    const key = `exam:${e.id}:${e.at}`
    if (seen.has(key)) continue
    const where = e.location ? ` · ${e.location}` : ''
    notify(`Examen: ${e.title}`, `Es ${relative(e.at, now)} · ${fmtDateTime(e.at)}${where}`, key)
    seen.add(key)
    notified.push(key)
    changed = true
  }

  if (changed) saveNotified(notified)
}

/** Revisa cada minuto recordatorios de tareas y exámenes próximos y lanza notificaciones del sistema. */
export function NotificationWatcher() {
  useEffect(() => {
    const run = () => {
      check().catch(() => {
        /* sin acceso a la base local */
      })
    }
    run()
    const t = setInterval(run, TICK)
    const onVisible = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return null
}
