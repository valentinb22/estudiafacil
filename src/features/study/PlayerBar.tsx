import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronDown, Download, FileText, Pause, Play, Repeat, Repeat1, RotateCcw, RotateCw, SkipBack, SkipForward, X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { IconButton } from '../../components/ui/Button'
import { Badge, SubjectChip } from '../../components/ui/Display'
import { db } from '../../lib/db'
import { useBlobUrl, useSubjectMap } from '../../lib/hooks'
import { SPEEDS, usePlayer } from '../../lib/player'
import { fmtDuration } from '../../lib/time'
import { downloadAudio } from './audio/utils'

const APP_PADDING = 112 // pb-28 de AppShell

/** Reproductor flotante global. No renderiza nada si no hay audio actual. */
export function PlayerBar() {
  const currentId = usePlayer((s) => s.currentId)
  return currentId ? <PlayerBarInner currentId={currentId} /> : null
}

function PlayerBarInner({ currentId }: { currentId: string }) {
  const playing = usePlayer((s) => s.playing)
  const speed = usePlayer((s) => s.speed)
  const repeat = usePlayer((s) => s.repeat)
  const pass = usePlayer((s) => s.pass)
  const { setPlaying, toggle, setSpeed, stop } = usePlayer.getState()

  const res = useLiveQuery(
    async () => ({ id: currentId, row: await db.audios.get(currentId) }),
    [currentId],
  )
  const item = res?.id === currentId && res.row && !res.row.deleted ? res.row : undefined
  const url = useBlobUrl(item?.blobId)
  const subjects = useSubjectMap()

  const audioRef = useRef<HTMLAudioElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [scriptOpen, setScriptOpen] = useState(false)
  const [barH, setBarH] = useState(0)
  const scriptId = useId()

  // El audio actual se borró: cerrar el reproductor
  useEffect(() => {
    if (res && res.id === currentId && (!res.row || res.row.deleted)) stop()
  }, [res, currentId, stop])

  // Quitar de la cola los audios borrados (también por sincronización, con AudiosPanel desmontado):
  // si no, "Siguiente" caería en uno borrado y el reproductor se cerraría.
  const aliveIds = useLiveQuery(
    async () => (await db.audios.toArray()).filter((a) => !a.deleted).map((a) => a.id),
    [],
  )
  useEffect(() => {
    if (!aliveIds) return
    const ok = new Set(aliveIds)
    const { queue, setQueue } = usePlayer.getState()
    if (queue.some((id) => !ok.has(id))) setQueue(queue.filter((id) => ok.has(id)))
  }, [aliveIds])

  // Reproducir / pausar según el estado global
  useEffect(() => {
    const a = audioRef.current
    if (!a || !url) return
    if (playing) {
      a.play().catch((e: DOMException) => {
        if (e?.name === 'NotAllowedError') setPlaying(false)
      })
    } else a.pause()
  }, [playing, url, setPlaying])

  // Velocidad (también al cambiar de fuente: la carga reinicia playbackRate)
  const applySpeed = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    a.defaultPlaybackRate = speed
    a.playbackRate = speed
  }, [speed])
  useEffect(applySpeed, [applySpeed, url])

  useEffect(() => {
    setTime(0)
    setDuration(item?.durationSec ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Espaciador para que la barra no tape el final del contenido
  useEffect(() => {
    const el = barRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---------- Acciones ----------
  const restart = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    a.currentTime = 0
    a.play().catch(() => {})
  }, [])

  const goNext = useCallback(() => {
    const before = usePlayer.getState().currentId
    usePlayer.getState().next()
    if (usePlayer.getState().currentId === before) restart()
  }, [restart])

  const goPrev = useCallback(() => {
    const a = audioRef.current
    if (a && a.currentTime > 3) {
      a.currentTime = 0
      return
    }
    const before = usePlayer.getState().currentId
    usePlayer.getState().prev()
    if (usePlayer.getState().currentId === before) restart()
  }, [restart])

  const seekBy = useCallback((d: number) => {
    const a = audioRef.current
    if (!a) return
    const max = isFinite(a.duration) ? a.duration : Number.MAX_SAFE_INTEGER
    a.currentTime = Math.min(max, Math.max(0, a.currentTime + d))
    setTime(a.currentTime)
  }, [])

  const onEnded = () => {
    const a = audioRef.current
    const s = usePlayer.getState()
    if (!a) return
    if (s.repeat === 'loop-one') return restart()
    if (s.repeat === 'double-next' && s.pass === 1) {
      s.setPass(2)
      return restart()
    }
    if (s.repeat === 'off') {
      const i = s.currentId ? s.queue.indexOf(s.currentId) : -1
      if (i === -1 || i === s.queue.length - 1) {
        s.setPlaying(false)
        a.currentTime = 0
        setTime(0)
        return
      }
    }
    goNext() // en "double-next" vuelve al primero al terminar (bucle continuo)
  }

  // ---------- Media Session ----------
  const subject = item?.subjectId ? subjects.get(item.subjectId) : undefined
  useEffect(() => {
    if (!('mediaSession' in navigator) || !item) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title,
        artist: subject?.name ?? 'General',
        album: 'EstudiaFácil',
      })
    } catch {
      /* MediaMetadata no disponible */
    }
  }, [item, subject?.name])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  }, [playing])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const ms = navigator.mediaSession
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => usePlayer.getState().setPlaying(true)],
      ['pause', () => usePlayer.getState().setPlaying(false)],
      ['previoustrack', () => goPrev()],
      ['nexttrack', () => goNext()],
      ['seekbackward', (d) => seekBy(-(d.seekOffset ?? 5))],
      ['seekforward', (d) => seekBy(d.seekOffset ?? 5)],
      [
        'seekto',
        (d) => {
          const a = audioRef.current
          if (a && d.seekTime != null) a.currentTime = d.seekTime
        },
      ],
      ['stop', () => usePlayer.getState().stop()],
    ]
    for (const [action, h] of handlers) {
      try {
        ms.setActionHandler(action, h)
      } catch {
        /* acción no soportada */
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null)
        } catch {
          /* acción no soportada */
        }
      }
      ms.metadata = null
      ms.playbackState = 'none'
    }
  }, [goNext, goPrev, seekBy])

  const total = duration || item?.durationSec || 0
  const hasScript = !!item?.script?.trim()
  const speedLabel = (s: number) => `${s}x`.replace('.', ',')

  return (
    <>
      {/* Espaciador en el flujo del documento (AppShell ya reserva pb-28) */}
      <div aria-hidden style={{ height: Math.max(0, barH + 16 - APP_PADDING) }} />

      <div
        ref={barRef}
        role="region"
        aria-label="Reproductor de audio"
        className="fixed inset-x-0 bottom-0 z-30 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4"
      >
        <audio
          ref={audioRef}
          src={url}
          preload="auto"
          onLoadedMetadata={(e) => {
            applySpeed()
            const d = e.currentTarget.duration
            if (isFinite(d) && d > 0) setDuration(d)
          }}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration
            if (isFinite(d) && d > 0) setDuration(d)
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => !usePlayer.getState().playing && setPlaying(true)}
          onPause={(e) => !e.currentTarget.ended && usePlayer.getState().playing && setPlaying(false)}
          onEnded={onEnded}
        />

        <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
          {scriptOpen && hasScript && (
            <div
              id={scriptId}
              className="max-h-[min(14rem,40dvh)] overflow-y-auto border-b border-line bg-surface-2/40 px-4 py-3 sm:px-5"
            >
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-2">Guion</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{item?.script}</p>
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 sm:px-4 md:grid-cols-[auto_minmax(0,1fr)_auto]">
            {/* Info */}
            <div className="col-start-1 row-start-1 min-w-0 md:col-start-2">
              <p className="truncate text-sm font-medium" title={item?.title}>
                {item?.title ?? 'Cargando…'}
              </p>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <SubjectChip subjectId={item?.subjectId} className="h-5" />
                {repeat === 'double-next' && (
                  <Badge tone="accent" className="h-5 font-mono tnum">
                    Pase {pass}/2
                  </Badge>
                )}
                {repeat === 'loop-one' && (
                  <span className="inline-flex items-center gap-1 text-xs text-ink-2" title="Bucle de 1 audio">
                    <Repeat1 className="size-3.5" aria-hidden />
                    <span className="hidden xs:inline">Bucle</span>
                  </span>
                )}
                {repeat === 'double-next' && (
                  <Repeat className="size-3.5 shrink-0 text-ink-2" role="img" aria-label="Secuencia 2x y siguiente" />
                )}
              </div>
            </div>

            {/* Acciones */}
            <div className="col-start-2 row-start-1 flex items-center md:col-start-3">
              <div role="group" aria-label="Velocidad" className="mr-1 hidden items-center gap-0.5 lg:flex">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                    className={clsx(
                      'h-7 rounded-md px-1.5 font-mono text-xs tnum transition-colors',
                      speed === s ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    {speedLabel(s)}
                  </button>
                ))}
              </div>
              <IconButton
                size="sm"
                label={scriptOpen ? 'Ocultar guion' : 'Ver guion'}
                active={scriptOpen && hasScript}
                disabled={!hasScript}
                aria-expanded={scriptOpen && hasScript}
                aria-controls={scriptId}
                onClick={() => setScriptOpen((o) => !o)}
              >
                {scriptOpen && hasScript ? <ChevronDown /> : <FileText />}
              </IconButton>
              <IconButton size="sm" label="Descargar audio" disabled={!item} onClick={() => item && downloadAudio(item)}>
                <Download />
              </IconButton>
              <IconButton
                size="sm"
                label="Cerrar reproductor"
                onClick={() => {
                  audioRef.current?.pause()
                  stop()
                }}
              >
                <X />
              </IconButton>
            </div>

            {/* Controles */}
            <div className="col-span-2 row-start-3 flex items-center justify-between gap-2 md:col-span-1 md:col-start-1 md:row-start-1">
              <div className="flex items-center gap-0.5">
                <IconButton label="Anterior" onClick={goPrev}>
                  <SkipBack />
                </IconButton>
                <IconButton label="Retroceder 5 segundos" onClick={() => seekBy(-5)}>
                  <RotateCcw />
                </IconButton>
                <button
                  type="button"
                  onClick={toggle}
                  disabled={!url}
                  aria-label={playing ? 'Pausar' : 'Reproducir'}
                  className="mx-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
                </button>
                <IconButton label="Adelantar 5 segundos" onClick={() => seekBy(5)}>
                  <RotateCw />
                </IconButton>
                <IconButton label="Siguiente" onClick={goNext}>
                  <SkipForward />
                </IconButton>
              </div>
              <select
                aria-label="Velocidad de reproducción"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="h-9 cursor-pointer rounded-lg border border-line bg-surface-2/60 px-2 font-mono text-xs tnum focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 lg:hidden"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {speedLabel(s)}
                  </option>
                ))}
              </select>
            </div>

            {/* Progreso */}
            <div className="col-span-2 row-start-2 flex items-center gap-2 md:col-span-3">
              <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-2 tnum">{fmtDuration(time)}</span>
              <input
                type="range"
                min={0}
                max={total || 0}
                step={0.1}
                value={Math.min(time, total || time)}
                disabled={!total}
                onChange={(e) => {
                  const a = audioRef.current
                  const v = Number(e.target.value)
                  if (a) a.currentTime = v
                  setTime(v)
                }}
                aria-label="Posición de reproducción"
                aria-valuetext={`${fmtDuration(time)} de ${fmtDuration(total)}`}
                className="h-6 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-default"
              />
              <span className="w-10 shrink-0 font-mono text-xs text-ink-2 tnum">{fmtDuration(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
