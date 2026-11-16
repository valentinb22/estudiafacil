import clsx from 'clsx'
import { Download, Headphones, Mic, Pause, Pencil, Play, Trash2, Upload } from 'lucide-react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '../../../components/ui/Button'
import { Badge, Card, EmptyState, SubjectChip, Toolbar } from '../../../components/ui/Display'
import { SearchInput, SegmentedControl } from '../../../components/ui/Form'
import { ConfirmModal } from '../../../components/ui/Modal'
import { ReorderButtons, SortableGrid } from '../../../components/ui/Sortable'
import { remove, reorder } from '../../../lib/db'
import { useAudios } from '../../../lib/hooks'
import { usePlayer, type RepeatMode } from '../../../lib/player'
import { useUI } from '../../../lib/store'
import { fmtBytes, fmtDuration } from '../../../lib/time'
import type { AudioItem } from '../../../lib/types'
import { AudioEditModal } from './AudioEditModal'
import { AudioUploadModal } from './AudioUploadModal'
import { usePendingAudioUpload } from './uploadStore'
import { RecorderModal } from './RecorderModal'
import { AUDIO_ACCEPT, downloadAudio, fullOrderFromSubset, isAudioFile } from './utils'

const REPEAT_OPTIONS: { value: RepeatMode; label: string }[] = [
  { value: 'off', label: 'Normal' },
  { value: 'loop-one', label: 'Bucle de 1 audio' },
  { value: 'double-next', label: 'Secuencia 2x y siguiente' },
]
const REPEAT_HINT: Record<RepeatMode, string> = {
  off: 'Reproduce la lista en orden y se detiene al final.',
  'loop-one': 'Repite el mismo audio sin parar.',
  'double-next': 'Escucha cada audio dos veces y pasa al siguiente; al terminar vuelve a empezar.',
}

export function AudiosPanel() {
  const audios = useAudios()
  const subjectFilter = useUI((s) => s.subjectFilter)
  const [params, setParams] = useSearchParams()

  const [query, setQuery] = useState('')
  const [recOpen, setRecOpen] = useState(false)
  const [editing, setEditing] = useState<AudioItem | null>(null)
  const [deleting, setDeleting] = useState<AudioItem | null>(null)
  const [pending, setPending] = useState<File[] | null>(null)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState('')
  const [optimistic, setOptimistic] = useState<string[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const repeat = usePlayer((s) => s.repeat)
  const setRepeat = usePlayer((s) => s.setRepeat)
  const setQueue = usePlayer((s) => s.setQueue)

  // Orden optimista mientras Dexie confirma el reordenamiento (animación sin saltos)
  useEffect(() => setOptimistic(null), [audios])
  const ordered = useMemo(() => {
    if (!optimistic) return audios
    const pos = new Map(optimistic.map((id, i) => [id, i]))
    return [...audios].sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9))
  }, [audios, optimistic])

  // Mantiene la cola del reproductor sincronizada con el orden actual
  const idsKey = ordered.map((a) => a.id).join(',')
  useEffect(() => {
    setQueue(idsKey ? idsKey.split(',') : [])
  }, [idsKey, setQueue])

  // ?record=1 abre la grabadora y se limpia el parámetro
  useEffect(() => {
    if (params.get('record') !== '1') return
    setRecOpen(true)
    const next = new URLSearchParams(params)
    next.delete('record')
    if (next.get('tab') && next.get('tab') !== 'audios') next.set('tab', 'audios')
    setParams(next, { replace: true })
  }, [params, setParams])

  // Audios elegidos desde otra pantalla (acción rápida del Panel)
  const handoff = usePendingAudioUpload((s) => s.files)
  useEffect(() => {
    if (!handoff) return
    usePendingAudioUpload.getState().set(null)
    setPending(handoff)
  }, [handoff])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ordered
    return ordered.filter((a) => a.title.toLowerCase().includes(q) || a.script?.toLowerCase().includes(q))
  }, [ordered, query])

  const onReorder = useCallback(async (ids: string[]) => {
    const full = await fullOrderFromSubset(ids)
    setOptimistic(full)
    await reorder('audios', full)
  }, [])

  /** Abre la ventana de subida con los archivos de audio elegidos o soltados. */
  const pickFiles = (list: File[]) => {
    const audiosOnly = list.filter(isAudioFile)
    const skipped = list.length - audiosOnly.length
    setStatus(skipped ? `${skipped === 1 ? '1 archivo no era' : `${skipped} archivos no eran`} de audio y se omitió.` : '')
    if (audiosOnly.length) setPending(audiosOnly)
  }

  const onUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    pickFiles(files)
  }

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragging(true)
  }
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    setDragging(false)
    pickFiles(Array.from(e.dataTransfer.files))
  }

  const closeRec = useCallback(() => setRecOpen(false), [])
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeDelete = useCallback(() => setDeleting(null), [])

  const confirmDelete = () => {
    if (!deleting) return
    const p = usePlayer.getState()
    if (p.currentId === deleting.id) p.stop()
    void remove('audios', deleting.id)
  }

  const actions = (
    <>
      <Button variant="primary" icon={<Mic />} onClick={() => setRecOpen(true)}>
        Grabar
      </Button>
      <Button icon={<Upload />} onClick={() => fileRef.current?.click()}>
        Subir audio
      </Button>
    </>
  )

  const visibleIds = visible.map((a) => a.id)

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={onDrop}
      className={clsx('relative rounded-xl', dragging && 'outline-dashed outline-2 outline-offset-4 outline-accent')}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-accent-soft/70 pt-24">
          <p className="rounded-lg bg-surface px-4 py-2 text-sm font-medium text-accent shadow-card">Suelta los audios para subirlos</p>
        </div>
      )}
      <input ref={fileRef} type="file" accept={AUDIO_ACCEPT} multiple hidden onChange={onUpload} />

      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Buscar por título o guion…"
          className="min-w-0 flex-1 basis-56"
        />
        <div className="flex flex-wrap gap-2">{actions}</div>
      </Toolbar>

      <div className="mb-5 flex flex-col gap-1.5">
        <SegmentedControl label="Modo de repetición" value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
        <p className="text-xs text-ink-2">{REPEAT_HINT[repeat]}</p>
      </div>

      <p className="sr-only" aria-live="polite">
        {status}
      </p>
      {status && <p className="-mt-2 mb-4 text-xs text-ink-2">{status}</p>}

      {audios.length === 0 ? (
        <EmptyState
          icon={<Headphones />}
          title="Todavía no tienes audios"
          description="Graba una explicación con tu voz o sube audios para repasar mientras viajas."
          action={<div className="flex flex-wrap justify-center gap-2">{actions}</div>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="Ningún audio coincide con tu búsqueda."
          action={
            <Button size="sm" onClick={() => setQuery('')}>
              Limpiar búsqueda
            </Button>
          }
        />
      ) : (
        <SortableGrid
          items={visible}
          onReorder={onReorder}
          className="grid gap-3 lg:grid-cols-2"
          renderItem={(a, i, handle) => (
            <AudioCard
              audio={a}
              handle={handle}
              reorderControls={<ReorderButtons index={i} ids={visibleIds} onReorder={onReorder} />}
              onEdit={() => setEditing(a)}
              onDelete={() => setDeleting(a)}
              queue={ordered.map((x) => x.id)}
            />
          )}
        />
      )}

      {recOpen && <RecorderModal onClose={closeRec} />}
      {editing && <AudioEditModal audio={editing} onClose={closeEdit} />}
      {pending && (
        <AudioUploadModal
          files={pending}
          defaultSubjectId={subjectFilter ?? undefined}
          onClose={() => setPending(null)}
          onDone={(n) => setStatus(n === 1 ? 'Audio subido.' : `${n} audios subidos.`)}
        />
      )}
      <ConfirmModal
        open={!!deleting}
        onClose={closeDelete}
        onConfirm={confirmDelete}
        title="Eliminar audio"
        message={
          <>
            Se eliminará <strong className="text-ink">{deleting?.title}</strong> de este dispositivo. Esta acción no
            se puede deshacer.
          </>
        }
      />
    </div>
  )
}

function AudioCard({
  audio,
  handle,
  reorderControls,
  onEdit,
  onDelete,
  queue,
}: {
  audio: AudioItem
  handle: ReactNode
  reorderControls: ReactNode
  onEdit: () => void
  onDelete: () => void
  queue: string[]
}) {
  const isCurrent = usePlayer((s) => s.currentId === audio.id)
  const playing = usePlayer((s) => s.playing)
  const repeat = usePlayer((s) => s.repeat)
  const pass = usePlayer((s) => s.pass)
  const isPlaying = isCurrent && playing

  const onPlay = () => {
    const p = usePlayer.getState()
    if (isCurrent) p.toggle()
    else p.play(audio.id, queue)
  }

  return (
    <Card className={clsx('flex h-full flex-col gap-3 p-4 transition-colors sm:p-5', isCurrent && 'border-accent/60')}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onPlay}
          aria-label={isPlaying ? `Pausar ${audio.title}` : `Reproducir ${audio.title}`}
          aria-pressed={isPlaying}
          className={clsx(
            'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors',
            isCurrent ? 'bg-accent text-accent-ink' : 'bg-accent-soft text-accent hover:bg-accent hover:text-accent-ink',
          )}
        >
          {isPlaying ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium" title={audio.title}>
            {audio.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <SubjectChip subjectId={audio.subjectId} />
            <span className="font-mono text-xs text-ink-2 tnum">
              {audio.durationSec ? fmtDuration(audio.durationSec) : '—:—'}
            </span>
            <span className="text-xs text-ink-2">· {fmtBytes(audio.size)}</span>
            {isCurrent && repeat === 'double-next' && (
              <Badge tone="accent" className="font-mono tnum">
                Pase {pass}/2
              </Badge>
            )}
            {isCurrent && repeat !== 'double-next' && <Badge tone="accent">{isPlaying ? 'Sonando' : 'En pausa'}</Badge>}
          </div>
        </div>
        {handle}
      </div>

      {audio.script && <p className="line-clamp-2 whitespace-pre-line text-sm text-ink-2">{audio.script}</p>}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-1 border-t border-line pt-2">
        {reorderControls}
        <div className="flex items-center">
          <IconButton size="sm" label={`Descargar ${audio.title}`} onClick={() => downloadAudio(audio)}>
            <Download />
          </IconButton>
          <IconButton size="sm" label={`Editar ${audio.title}`} onClick={onEdit}>
            <Pencil />
          </IconButton>
          <IconButton
            size="sm"
            label={`Eliminar ${audio.title}`}
            onClick={onDelete}
            className="hover:!bg-danger-soft hover:!text-danger"
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </Card>
  )
}
