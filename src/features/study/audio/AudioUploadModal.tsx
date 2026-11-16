import { ChevronDown, Music, Pause, Play, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button, IconButton } from '../../../components/ui/Button'
import { Field, Input, Textarea } from '../../../components/ui/Form'
import { Modal } from '../../../components/ui/Modal'
import { SubjectSelect } from '../../../components/ui/SubjectSelect'
import { create, putBlob } from '../../../lib/db'
import { fmtBytes, fmtDuration } from '../../../lib/time'
import { audioMimeOf, nextAudioOrder, readDuration, titleFromFilename } from './utils'

interface Draft {
  key: string
  file: File
  title: string
  script: string
  showScript: boolean
  duration?: number
}

/**
 * Subida de audios desde la PC o el celular: elige materia, edita el título de cada archivo,
 * escucha una vista previa y, si quieres, adjunta el guion que estás leyendo.
 */
export function AudioUploadModal({
  files,
  defaultSubjectId,
  onClose,
  onDone,
}: {
  files: File[]
  defaultSubjectId?: string
  onClose: () => void
  onDone: (count: number) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    files.map((file, i) => ({
      key: `${i}-${file.name}-${file.size}`,
      file,
      title: titleFromFilename(file.name),
      script: '',
      showScript: files.length === 1,
    })),
  )
  const [subjectId, setSubjectId] = useState(defaultSubjectId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Duraciones en segundo plano (no bloquean el formulario).
  useEffect(() => {
    let alive = true
    files.forEach((file, i) => {
      void readDuration(file).then((d) => {
        if (!alive) return
        setDrafts((ds) => ds.map((x, j) => (j === i ? { ...x, duration: d } : x)))
      })
    })
    return () => {
      alive = false
    }
  }, [files])

  const patch = (key: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)))
  const valid = drafts.length > 0 && drafts.every((d) => d.title.trim())

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    setError('')
    try {
      let order = await nextAudioOrder()
      for (const d of drafts) {
        const blobId = await putBlob(new Blob([d.file], { type: audioMimeOf(d.file) }))
        await create('audios', {
          title: d.title.trim(),
          subjectId,
          blobId,
          mime: audioMimeOf(d.file),
          size: d.file.size,
          durationSec: d.duration,
          script: d.script.trim() || undefined,
          order: order++,
        })
      }
      onDone(drafts.length)
      onClose()
    } catch {
      setError('No se pudo guardar. Revisa el espacio disponible en el dispositivo.')
      setSaving(false)
    }
  }

  const n = drafts.length
  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={n === 1 ? 'Subir audio' : `Subir ${n} audios`}
      size="lg"
      footer={
        <>
          {error && (
            <p role="alert" className="mr-auto text-xs text-danger">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => save()} disabled={!valid || saving}>
            {saving ? 'Guardando…' : n === 1 ? 'Guardar audio' : `Guardar ${n} audios`}
          </Button>
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Materia" hint={n > 1 ? 'Se aplica a todos los audios.' : undefined}>
          {(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}
        </Field>

        <ul className="flex flex-col gap-3">
          {drafts.map((d, i) => (
            <li key={d.key} className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="flex items-center gap-2">
                <PreviewButton file={d.file} title={d.title} />
                <div className="min-w-0 flex-1">
                  <Input
                    value={d.title}
                    onChange={(e) => patch(d.key, { title: e.target.value })}
                    aria-label={`Título del audio ${i + 1}`}
                    placeholder="Título"
                    required
                  />
                </div>
                {n > 1 && (
                  <IconButton label={`Quitar ${d.title || d.file.name}`} onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>
                    <X />
                  </IconButton>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 text-xs text-ink-2">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Music className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{d.file.name}</span>
                </span>
                <span className="font-mono tnum">
                  {d.duration ? fmtDuration(d.duration) : '–:––'} · {fmtBytes(d.file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => patch(d.key, { showScript: !d.showScript })}
                  aria-expanded={d.showScript}
                  className="inline-flex items-center gap-1 rounded font-medium text-accent hover:underline"
                >
                  {d.script ? 'Guion adjunto' : 'Adjuntar guion'}
                  <ChevronDown className={`size-3 transition-transform ${d.showScript ? 'rotate-180' : ''}`} aria-hidden />
                </button>
              </div>
              {d.showScript && (
                <Textarea
                  value={d.script}
                  onChange={(e) => patch(d.key, { script: e.target.value })}
                  placeholder="Pega el texto que lees en el audio para verlo mientras escuchas."
                  aria-label={`Guion del audio ${d.title || i + 1}`}
                  className="mt-2 min-h-28 text-sm"
                />
              )}
            </li>
          ))}
        </ul>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/** Escucha previa del archivo antes de guardarlo. */
function PreviewButton({ file, title }: { file: File; title: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState<string>()
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) void a.play().catch(() => setPlaying(false))
    else a.pause()
  }
  return (
    <>
      <audio
        ref={ref}
        src={url}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <IconButton label={playing ? `Pausar ${title}` : `Escuchar ${title}`} onClick={toggle} active={playing}>
        {playing ? <Pause /> : <Play />}
      </IconButton>
    </>
  )
}
