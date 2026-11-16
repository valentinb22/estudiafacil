import clsx from 'clsx'
import { Mic, MicOff, Pause, Play, RotateCcw, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Field, Input, Textarea } from '../../../components/ui/Form'
import { Modal } from '../../../components/ui/Modal'
import { SubjectSelect } from '../../../components/ui/SubjectSelect'
import { create, putBlob } from '../../../lib/db'
import { usePlayer } from '../../../lib/player'
import { useUI } from '../../../lib/store'
import { fmtBytes, fmtDuration } from '../../../lib/time'
import { nextAudioOrder, pickRecorderMime, tokenColor } from './utils'

type Phase = 'idle' | 'requesting' | 'recording' | 'paused' | 'done' | 'error'
type ErrorKind = 'unsupported' | 'denied' | 'notfound' | 'other'

const ERRORS: Record<ErrorKind, { title: string; text: string }> = {
  unsupported: {
    title: 'Tu navegador no permite grabar',
    text: 'Prueba con una versión reciente de Chrome, Edge, Firefox o Safari. También puedes subir un audio grabado con otra app.',
  },
  denied: {
    title: 'Sin permiso para usar el micrófono',
    text: 'Habilita el micrófono para este sitio desde el ícono del candado en la barra de direcciones y vuelve a intentarlo.',
  },
  notfound: {
    title: 'No encontramos un micrófono',
    text: 'Conecta un micrófono o auriculares con micrófono y vuelve a intentarlo.',
  },
  other: {
    title: 'No se pudo iniciar la grabación',
    text: 'Cierra otras apps que estén usando el micrófono y vuelve a intentarlo.',
  },
}

const defaultTitle = () =>
  `Grabación ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(Date.now())}`

const BAR_W = 3
const BAR_GAP = 2

/** Modal de grabación. Se monta sólo mientras está abierto (al desmontar libera el micrófono). */
export function RecorderModal({ onClose }: { onClose: () => void }) {
  const subjectFilter = useUI((s) => s.subjectFilter)
  const theme = useUI((s) => s.theme)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorKind | null>(null)
  const [elapsed, setElapsed] = useState(0) // ms
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const [title, setTitle] = useState(defaultTitle)
  const [subjectId, setSubjectId] = useState<string | undefined>(subjectFilter ?? undefined)
  const [script, setScript] = useState('')
  const [saving, setSaving] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const levelsRef = useRef<number[]>([])
  const rafRef = useRef(0)
  const accRef = useRef(0) // ms acumulados antes de la última reanudación
  const startedRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  phaseRef.current = phase

  const supported =
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  // ---------- Dibujo de la forma de onda ----------
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)

    const analyser = analyserRef.current
    if (analyser && phaseRef.current === 'recording') {
      const data = new Uint8Array(analyser.fftSize)
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / data.length)
      levelsRef.current.push(Math.min(1, rms * 3.2))
      const max = Math.ceil(w / (BAR_W + BAR_GAP)) + 1
      if (levelsRef.current.length > max) levelsRef.current.splice(0, levelsRef.current.length - max)
    }

    const mid = h / 2
    g.fillStyle = tokenColor('line')
    g.fillRect(0, mid - 0.5, w, 1)

    const active = phaseRef.current === 'recording'
    g.fillStyle = tokenColor(active ? 'accent' : 'ink-3', active ? 1 : 0.6)
    const levels = levelsRef.current
    for (let i = levels.length - 1, x = w - BAR_W; i >= 0 && x > -BAR_W; i--, x -= BAR_W + BAR_GAP) {
      const bh = Math.max(2, levels[i] * (h - 8))
      g.beginPath()
      if (typeof g.roundRect === 'function') g.roundRect(x, mid - bh / 2, BAR_W, bh, 1.5)
      else g.rect(x, mid - bh / 2, BAR_W, bh)
      g.fill()
    }
  }, [])

  // Bucle de animación + temporizador mientras hay sesión de grabación
  useEffect(() => {
    if (phase !== 'recording') {
      draw()
      return
    }
    const loop = () => {
      draw()
      setElapsed(accRef.current + (performance.now() - startedRef.current))
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase, draw, theme])

  // Redibuja al cambiar de tamaño
  useEffect(() => {
    const c = canvasRef.current
    if (!c || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => draw())
    ro.observe(c)
    return () => ro.disconnect()
  }, [draw])

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    analyserRef.current = null
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
  }, [])

  // Limpieza total al desmontar
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelAnimationFrame(rafRef.current)
      const rec = recRef.current
      if (rec && rec.state !== 'inactive') {
        rec.ondataavailable = null
        rec.onstop = null
        rec.stop()
      }
      releaseMic()
    }
  }, [releaseMic])

  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setPreviewUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  // ---------- Acciones ----------
  const start = async () => {
    if (!supported) {
      setError('unsupported')
      setPhase('error')
      return
    }
    setError(null)
    setPhase('requesting')
    usePlayer.getState().setPlaying(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      // El modal se cerró mientras se pedía permiso: liberar el micrófono y salir.
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream

      try {
        const ctx = new AudioContext()
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        src.connect(analyser)
        ctxRef.current = ctx
        analyserRef.current = analyser
      } catch {
        /* sin visualización: la grabación sigue funcionando */
      }

      const mime = pickRecorderMime()
      let rec: MediaRecorder
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      } catch {
        // isTypeSupported puede mentir (Safari antiguos): usar el formato por defecto del navegador.
        rec = new MediaRecorder(stream)
      }
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      rec.onstop = () => {
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0]
        setBlob(new Blob(chunks, { type }))
        setPhase('done')
        releaseMic()
      }
      recRef.current = rec
      levelsRef.current = []
      accRef.current = 0
      startedRef.current = performance.now()
      setElapsed(0)
      setBlob(null)
      rec.start(250)
      setPhase('recording')
    } catch (e) {
      releaseMic()
      const name = (e as DOMException)?.name
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'notfound'
            : 'other',
      )
      setPhase('error')
    }
  }

  const pause = () => {
    const rec = recRef.current
    if (!rec || rec.state !== 'recording') return
    rec.pause()
    accRef.current += performance.now() - startedRef.current
    setElapsed(accRef.current)
    setPhase('paused')
  }

  const resume = () => {
    const rec = recRef.current
    if (!rec || rec.state !== 'paused') return
    rec.resume()
    startedRef.current = performance.now()
    setPhase('recording')
  }

  const stop = () => {
    const rec = recRef.current
    if (!rec || rec.state === 'inactive') return
    if (rec.state === 'recording') accRef.current += performance.now() - startedRef.current
    setElapsed(accRef.current)
    rec.stop()
  }

  const discard = () => {
    setBlob(null)
    setElapsed(0)
    levelsRef.current = []
    setPhase('idle')
  }

  const save = async () => {
    if (!blob || !title.trim()) return
    setSaving(true)
    try {
      const blobId = await putBlob(blob)
      await create('audios', {
        title: title.trim(),
        subjectId,
        blobId,
        mime: blob.type,
        size: blob.size,
        durationSec: Math.round(accRef.current / 100) / 10,
        script: script.trim() || undefined,
        order: await nextAudioOrder(),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const live = phase === 'recording' || phase === 'paused'
  const errInfo = error ? ERRORS[error] : null

  return (
    <Modal
      open
      onClose={onClose}
      title="Grabar audio"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={phase !== 'done' || !blob || !title.trim() || saving}>
            {saving ? 'Guardando…' : 'Guardar audio'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Zona de grabación */}
        <section aria-label="Grabadora" className="rounded-xl border border-line bg-surface-2/50 p-4">
          {errInfo ? (
            <div className="flex flex-col items-center py-4 text-center" role="alert">
              <MicOff className="mb-3 size-7 text-danger" aria-hidden />
              <p className="font-medium">{errInfo.title}</p>
              <p className="mt-1 max-w-sm text-sm text-ink-2">{errInfo.text}</p>
              {error !== 'unsupported' && (
                <Button className="mt-4" icon={<RotateCcw />} onClick={start}>
                  Reintentar
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] font-medium" aria-live="polite">
                  <span
                    className={clsx(
                      'size-2.5 rounded-full',
                      phase === 'recording' ? 'animate-pulse bg-danger' : live ? 'bg-warn' : 'bg-ink-3',
                    )}
                    aria-hidden
                  />
                  <span className="text-ink-2">
                    {phase === 'recording'
                      ? 'Grabando'
                      : phase === 'paused'
                        ? 'En pausa'
                        : phase === 'requesting'
                          ? 'Pidiendo acceso al micrófono…'
                          : phase === 'done'
                            ? 'Grabación lista'
                            : 'Listo para grabar'}
                  </span>
                </div>
                <span className="font-mono text-2xl tnum" role="timer">
                  <span className="sr-only">Tiempo grabado: </span>
                  {fmtDuration(elapsed / 1000)}
                </span>
              </div>

              <canvas
                ref={canvasRef}
                className="mt-3 h-20 w-full"
                role="img"
                aria-label="Forma de onda del micrófono en tiempo real"
              />

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {(phase === 'idle' || phase === 'requesting') && (
                  <Button
                    variant="primary"
                    icon={<Mic />}
                    onClick={start}
                    disabled={phase === 'requesting'}
                    className="h-11 px-5"
                  >
                    Empezar a grabar
                  </Button>
                )}
                {live && (
                  <>
                    {phase === 'recording' ? (
                      <Button icon={<Pause />} onClick={pause} className="h-11">
                        Pausar
                      </Button>
                    ) : (
                      <Button icon={<Play />} onClick={resume} className="h-11">
                        Reanudar
                      </Button>
                    )}
                    <Button variant="primary" icon={<Square />} onClick={stop} className="h-11">
                      Detener
                    </Button>
                  </>
                )}
                {phase === 'done' && (
                  <div className="flex w-full flex-col gap-3">
                    {previewUrl && (
                      <audio controls src={previewUrl} className="w-full" aria-label="Escuchar la grabación" />
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-ink-2">{blob && fmtBytes(blob.size)}</span>
                      <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={discard}>
                        Descartar y volver a grabar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <Field label="Título">
          {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} required />}
        </Field>
        <Field label="Materia">
          {(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}
        </Field>
        <Field label="Guion (opcional)" hint="Escríbelo antes de grabar para leerlo; luego lo verás mientras escuchas.">
          {(id) => (
            <Textarea
              id={id}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Puntos clave, definiciones, fórmulas…"
              className="min-h-32"
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
