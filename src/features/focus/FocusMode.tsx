import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AudioWaveform, Check, CloudRain, Headphones, NotebookPen, Pause, Play, RotateCcw, Volume1, Waves, Wind, X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from '../../components/ui/Button'
import { ProgressBar, SubjectChip } from '../../components/ui/Display'
import { SegmentedControl, Textarea } from '../../components/ui/Form'
import { create, db } from '../../lib/db'
import { playAlarm } from '../../lib/sound'
import { useUI } from '../../lib/store'
import { fmtDate } from '../../lib/time'
import type { Exam, ExamTopic } from '../../lib/types'
import type { AmbientKind } from './ambient'
import { AMBIENTS, playAmbient, setAmbientVolume, stopAmbient } from './ambient'

type Preset = '15' | '25' | '50'
type Status = 'idle' | 'running' | 'paused' | 'done'

const PRESETS: { value: Preset; label: string }[] = [
  { value: '15', label: '15 min · Rápido' },
  { value: '25', label: '25 min · Clásico' },
  { value: '50', label: '50 min · Profundo' },
]

const IDEAS_KEY = 'ef-focus-ideas'
const VOLUME_KEY = 'ef-focus-volume'

const readLS = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* almacenamiento no disponible */
  }
}

const mmss = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const preparation = (topics: ExamTopic[]) =>
  topics.length
    ? topics.reduce((acc, t) => acc + (t.level === 'mastered' ? 1 : t.level === 'review' ? 0.5 : 0), 0) / topics.length
    : 0

export function FocusMode() {
  const open = useUI((s) => s.focusOpen)
  if (!open) return null
  return createPortal(<FocusOverlay />, document.body)
}

function FocusOverlay() {
  const closeFocus = useUI((s) => s.closeFocus)
  const examId = useUI((s) => s.focusExamId)
  const exam = useLiveQuery(
    async () => (examId ? await db.exams.get(examId) : undefined),
    [examId],
  )
  const liveExam = exam && !exam.deleted ? exam : undefined
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  // Esc cierra, bloqueo de scroll del body y gestión de foco.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeFocus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      stopAmbient()
      prevFocus?.focus?.()
    }
  }, [closeFocus])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-bg text-ink"
    >
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
        <header className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-serif text-2xl italic leading-none text-ink-2">
            Modo Focus
          </h2>
          <IconButton ref={closeRef} label="Salir del modo Focus (Esc)" onClick={closeFocus}>
            <X />
          </IconButton>
        </header>

        <div className="mt-6 grid flex-1 gap-10 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
          <Timer exam={liveExam} />
          <aside className="flex min-w-0 flex-col gap-8">
            {liveExam && <ExamContext exam={liveExam} />}
            <IdeaPad subjectId={liveExam?.subjectId} />
            <AmbientPanel />
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Temporizador                                                        */
/* ------------------------------------------------------------------ */

function Timer({ exam }: { exam?: Exam }) {
  const [preset, setPreset] = useState<Preset>('25')
  const duration = Number(preset) * 60_000
  const [status, setStatus] = useState<Status>('idle')
  const [remaining, setRemaining] = useState(duration)
  const endAt = useRef(0)
  const examRef = useRef(exam)
  useEffect(() => {
    examRef.current = exam
  }, [exam])

  const finish = useCallback(() => {
    setStatus('done')
    setRemaining(0)
    playAlarm()
    notifyDone(examRef.current)
  }, [])

  // Tic basado en marca de tiempo objetivo: preciso aunque la pestaña esté en segundo plano.
  useEffect(() => {
    if (status !== 'running') return
    const tick = () => {
      const r = endAt.current - Date.now()
      if (r <= 0) finish()
      else setRemaining(r)
    }
    tick()
    const iv = setInterval(tick, 250)
    const to = setTimeout(tick, Math.max(0, endAt.current - Date.now()) + 20)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(iv)
      clearTimeout(to)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [status, finish])

  // Título del documento mientras corre (se restaura al pausar/cerrar).
  const running = status === 'running'
  useEffect(() => {
    if (!running) return
    const original = document.title
    return () => {
      document.title = original
    }
  }, [running])
  const label = mmss(remaining)
  useEffect(() => {
    if (running) document.title = `${label} · Focus`
  }, [running, label])

  const start = () => {
    endAt.current = Date.now() + (status === 'done' ? duration : remaining)
    if (status === 'done') setRemaining(duration)
    setStatus('running')
  }
  const pause = () => {
    setRemaining(Math.max(0, endAt.current - Date.now()))
    setStatus('paused')
  }
  const reset = () => {
    setStatus('idle')
    setRemaining(duration)
  }
  const changePreset = (p: Preset) => {
    setPreset(p)
    setStatus('idle')
    setRemaining(Number(p) * 60_000)
  }

  const progress = status === 'done' ? 1 : 1 - remaining / duration
  const R = 140
  const C = 2 * Math.PI * R

  return (
    <section aria-label="Temporizador" className="flex min-w-0 flex-col items-center text-center">
      <SegmentedControl label="Duración de la sesión" value={preset} onChange={changePreset} options={PRESETS} />

      <div className="relative mt-8 aspect-square w-[min(78vw,340px)] sm:mt-10">
        <svg viewBox="0 0 300 300" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
          <circle cx="150" cy="150" r={R} fill="none" strokeWidth="3" className="stroke-line" />
          <circle
            cx="150"
            cy="150"
            r={R}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            className={clsx(
              'transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none',
              status === 'done' ? 'stroke-ok' : 'stroke-accent',
            )}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {status === 'done' ? (
            <>
              <span className="flex size-10 items-center justify-center rounded-full bg-ok-soft text-ok">
                <Check className="size-5" />
              </span>
              <p className="mt-3 font-serif text-4xl leading-none sm:text-5xl">Sesión completada</p>
              <p className="mt-2 max-w-[14rem] text-sm text-ink-2">Tómate 5 minutos de descanso.</p>
            </>
          ) : (
            <>
              <span
                role="timer"
                aria-label={`Tiempo restante ${label}`}
                className="font-serif text-[clamp(4rem,22vw,7.5rem)] leading-none tabular-nums tracking-tight"
              >
                {label}
              </span>
              <span className="mt-2 font-mono text-xs uppercase tracking-wider text-ink-3">
                {status === 'running' ? 'Concentración' : status === 'paused' ? 'En pausa' : `${preset} minutos`}
              </span>
            </>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {status === 'done' ? 'Sesión completada. Tómate un descanso.' : status === 'paused' ? 'Temporizador en pausa.' : ''}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10">
        {status === 'running' ? (
          <Button variant="primary" className="h-11 min-w-36" icon={<Pause />} onClick={pause}>
            Pausar
          </Button>
        ) : (
          <Button variant="primary" className="h-11 min-w-36" icon={<Play />} onClick={start}>
            {status === 'paused' ? 'Reanudar' : status === 'done' ? 'Otra sesión' : 'Empezar'}
          </Button>
        )}
        <Button
          variant="ghost"
          className="h-11"
          icon={<RotateCcw />}
          onClick={reset}
          disabled={status === 'idle'}
        >
          Reiniciar
        </Button>
      </div>
    </section>
  )
}

function notifyDone(exam?: Exam) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const title = 'Sesión Focus completada'
    const options: NotificationOptions = {
      body: exam ? `${exam.title}: tómate un descanso de 5 minutos.` : 'Tómate un descanso de 5 minutos.',
      tag: 'ef-focus',
    }
    const fallback = () => {
      try {
        new Notification(title, options)
      } catch {
        /* sin notificaciones */
      }
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => (reg ? reg.showNotification(title, options) : fallback()))
        .catch(fallback)
    } else fallback()
  } catch {
    /* sin notificaciones */
  }
}

/* ------------------------------------------------------------------ */
/* Contexto del examen                                                 */
/* ------------------------------------------------------------------ */

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wider text-ink-3">{children}</h3>
}

function ExamContext({ exam }: { exam: Exam }) {
  const prep = preparation(exam.topics)
  const pending = exam.topics.filter((t) => t.level !== 'mastered')
  return (
    <section aria-label="Examen en preparación" className="flex flex-col gap-3">
      <SectionTitle>Preparando</SectionTitle>
      <div className="min-w-0">
        <SubjectChip subjectId={exam.subjectId} />
        <p className="mt-2 font-serif text-2xl leading-tight">{exam.title}</p>
      </div>
      {exam.topics.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <ProgressBar value={prep} tone={prep >= 1 ? 'ok' : 'accent'} label="Preparación" className="flex-1" />
            <span className="font-mono text-xs tabular-nums text-ink-2">{Math.round(prep * 100)}%</span>
          </div>
          {pending.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto pr-1 text-sm" aria-label="Temas por dominar">
              {pending.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={clsx('size-1.5 shrink-0 rounded-full', t.level === 'review' ? 'bg-warn' : 'bg-ink-3')}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="shrink-0 text-xs text-ink-3">{t.level === 'review' ? 'Repasar' : 'Sin ver'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ok">Dominas todos los temas.</p>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-3">Este examen todavía no tiene temas.</p>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Bloc de ideas                                                       */
/* ------------------------------------------------------------------ */

function IdeaPad({ subjectId }: { subjectId?: string }) {
  const [text, setText] = useState(() => readLS(IDEAS_KEY) ?? '')
  const [saved, setSaved] = useState(false)
  const id = useId()

  useEffect(() => {
    writeLS(IDEAS_KEY, text)
  }, [text])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(t)
  }, [saved])

  const save = async () => {
    const body = text.trim()
    if (!body) return
    await create('notes', {
      title: `Ideas de sesión Focus — ${fmtDate(Date.now())}`,
      body,
      tags: ['focus'],
      pinned: false,
      subjectId,
    })
    setText('')
    setSaved(true)
  }

  return (
    <section className="flex flex-col gap-3">
      <label htmlFor={id}>
        <SectionTitle>Anota ideas sin distraerte</SectionTitle>
      </label>
      <Textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Una duda, algo para buscar después…"
        className="min-h-28 font-mono text-[13px]"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ok" aria-live="polite">
          {saved ? 'Nota guardada' : ''}
        </span>
        <Button size="sm" icon={<NotebookPen />} onClick={save} disabled={!text.trim()}>
          Guardar como nota
        </Button>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Sonido ambiental                                                    */
/* ------------------------------------------------------------------ */

const AMBIENT_ICONS: Record<AmbientKind, ReactNode> = {
  rain: <CloudRain />,
  brown: <Waves />,
  alpha: <AudioWaveform />,
  white: <Wind />,
}

function AmbientPanel() {
  const [kind, setKind] = useState<AmbientKind | null>(null)
  const [volume, setVolume] = useState(() => {
    const raw = readLS(VOLUME_KEY)
    const v = raw === null ? NaN : Number(raw)
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.6
  })
  const volId = useId()

  useEffect(() => {
    setAmbientVolume(volume)
    writeLS(VOLUME_KEY, String(volume))
  }, [volume])

  const toggle = (k: AmbientKind) => {
    if (kind === k) {
      stopAmbient()
      setKind(null)
    } else {
      setAmbientVolume(volume)
      playAmbient(k)
      setKind(k)
    }
  }

  const hint = AMBIENTS.find((a) => a.kind === kind)?.hint

  return (
    <section aria-label="Sonido ambiental" className="flex flex-col gap-3">
      <SectionTitle>Sonido ambiental</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {AMBIENTS.map((a) => (
          <button
            key={a.kind}
            type="button"
            aria-pressed={kind === a.kind}
            onClick={() => toggle(a.kind)}
            className={clsx(
              'flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-[13px] font-medium transition-colors duration-150 [&>svg]:size-4 [&>svg]:shrink-0',
              kind === a.kind
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
          >
            {AMBIENT_ICONS[a.kind]}
            <span className="min-w-0 leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
      {hint && (
        <p className="flex items-center gap-1.5 text-xs text-ink-2">
          <Headphones className="size-3.5 shrink-0" aria-hidden="true" />
          {hint}
        </p>
      )}
      <div className="flex items-center gap-3">
        <label htmlFor={volId} className="text-ink-3">
          <Volume1 className="size-4" aria-hidden="true" />
          <span className="sr-only">Volumen</span>
        </label>
        <input
          id={volId}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="h-10 min-w-0 flex-1 cursor-pointer accent-accent"
        />
        <span className="w-9 text-right font-mono text-xs tabular-nums text-ink-2">{Math.round(volume * 100)}%</span>
      </div>
    </section>
  )
}
