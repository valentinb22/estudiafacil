import clsx from 'clsx'
import { Bell as BellIcon, CalendarClock, ClipboardCheck, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconButton } from '../../components/ui/Button'
import { SubjectChip } from '../../components/ui/Display'
import { useExams, useNow, useTasks } from '../../lib/hooks'
import { fmtDateTime, relative } from '../../lib/time'
import { collectAlerts, toneDot, toneText } from './alerts'

/** Campana de la cabecera: tareas y exámenes de los próximos 7 días (y lo vencido). */
export function Bell() {
  const tasks = useTasks()
  const exams = useExams()
  const now = useNow(30_000)
  const items = useMemo(() => collectAlerts(tasks, exams, now), [tasks, exams, now])
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const urgentCount = items.filter((i) => i.tone === 'danger').length

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = items.length
    ? `Avisos: ${items.length} ${items.length === 1 ? 'pendiente' : 'pendientes'}`
    : 'Avisos: sin pendientes próximos'

  return (
    <div ref={wrap} className="sm:relative">
      <IconButton
        ref={btn}
        label={label}
        active={open}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="relative"
      >
        <BellIcon />
        {items.length > 0 && (
          <span
            aria-hidden
            className={clsx(
              'tnum absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold leading-none ring-2 ring-bg',
              urgentCount ? 'bg-danger text-white' : 'bg-accent text-accent-ink',
            )}
          >
            {items.length > 9 ? '9+' : items.length}
          </span>
        )}
      </IconButton>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Avisos próximos"
          className="fixed inset-x-2 top-[3.75rem] z-50 flex max-h-[calc(100dvh-4.5rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-h-[min(32rem,calc(100dvh-5rem))]"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-serif text-xl leading-none">Avisos</h2>
              <p className="mt-1 text-xs text-ink-3">Próximos 7 días y vencidos</p>
            </div>
            <IconButton size="sm" label="Cerrar avisos" onClick={() => setOpen(false)}>
              <X />
            </IconButton>
          </header>

          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-ink-2">Nada urgente por ahora. Buen momento para repasar.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {items.map((it) => {
                const Icon = it.kind === 'task' ? ClipboardCheck : CalendarClock
                const when =
                  it.urgency === 'overdue'
                    ? `Venció ${relative(it.at, now)}`
                    : `${it.kind === 'task' ? 'Vence' : 'Es'} ${relative(it.at, now)}`
                return (
                  <li key={it.key}>
                    <Link
                      to={it.href}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                    >
                      <span className="relative mt-0.5 shrink-0 text-ink-3">
                        <Icon className="size-4" aria-hidden />
                        <span className={clsx('absolute -right-1 -top-1 size-2 rounded-full ring-2 ring-surface', toneDot[it.tone])} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{it.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <SubjectChip subjectId={it.subjectId} />
                          <span className="text-xs text-ink-3">{it.kind === 'task' ? 'Tarea' : 'Examen'}</span>
                          <span className={clsx('tnum font-mono text-xs xs:hidden', toneText[it.tone])}>{when}</span>
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-right xs:block">
                        <span className={clsx('tnum block font-mono text-xs', toneText[it.tone])}>{when}</span>
                        <span className="tnum mt-1 block font-mono text-[11px] text-ink-3">{fmtDateTime(it.at)}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
