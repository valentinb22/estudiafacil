import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { ExternalLink, Link2, NotebookPen, Paperclip, Upload, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Badge } from '../../components/ui/Display'
import { Button, IconButton } from '../../components/ui/Button'
import { Input, SearchInput, SegmentedControl, Textarea } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Modal'
import { alive, create, db, putBlob } from '../../lib/db'
import { fmtBytes } from '../../lib/time'
import type { ExamMaterialRef, FileItem, Note, Resource } from '../../lib/types'
import { NoteEditor } from '../notes/NoteEditor'
import { PreviewModal } from '../study/files/FileModals'
import { ACCEPT, CategoryIcon, categoryLabel, guessCategory } from '../study/files/fileMeta'
import { nextOrder } from '../study/files/reorderSubset'
import { hostname, TypeIcon } from '../study/resources/ResourceModal'

type Kind = ExamMaterialRef['kind']

export type Material =
  | { kind: 'file'; id: string; item: FileItem }
  | { kind: 'note'; id: string; item: Note }
  | { kind: 'resource'; id: string; item: Resource }

export interface PendingFile {
  key: string
  file: File
}
export interface PendingNote {
  key: string
  title: string
  body: string
}

const refKey = (r: { kind: Kind; id: string }) => `${r.kind}:${r.id}`

/** Resuelve las referencias de un examen contra la base local (omite lo que se borró). */
export function useMaterials(refs: ExamMaterialRef[] | undefined): Material[] {
  const key = (refs ?? []).map(refKey).join(',')
  return (
    useLiveQuery(async () => {
      const list = refs ?? []
      const ids = (k: Kind) => list.filter((r) => r.kind === k).map((r) => r.id)
      const [files, notes, resources] = await Promise.all([
        db.files.bulkGet(ids('file')),
        db.notes.bulkGet(ids('note')),
        db.resources.bulkGet(ids('resource')),
      ])
      const map = new Map<string, Material>()
      for (const f of files) if (f && !f.deleted) map.set(`file:${f.id}`, { kind: 'file', id: f.id, item: f })
      for (const n of notes) if (n && !n.deleted) map.set(`note:${n.id}`, { kind: 'note', id: n.id, item: n })
      for (const r of resources)
        if (r && !r.deleted) map.set(`resource:${r.id}`, { kind: 'resource', id: r.id, item: r })
      return list.map((r) => map.get(refKey(r))).filter((m): m is Material => !!m)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]) ?? []
  )
}

function materialTitle(m: Material) {
  if (m.kind === 'file') return m.item.name
  if (m.kind === 'note') return m.item.title || m.item.body.split('\n')[0] || 'Nota sin título'
  return m.item.title
}

function materialMeta(m: Material) {
  if (m.kind === 'file') return `${categoryLabel(m.item.category)} · ${fmtBytes(m.item.size)}`
  if (m.kind === 'note') return 'Nota'
  return hostname(m.item.url)
}

function MaterialIcon({ m }: { m: Material }) {
  const cls = 'size-4'
  if (m.kind === 'file') return <CategoryIcon category={m.item.category} className={cls} />
  if (m.kind === 'note') return <NotebookPen className={cls} />
  return <TypeIcon type={m.item.type} className={cls} />
}

function Row({
  icon,
  title,
  meta,
  badge,
  onRemove,
  removeLabel,
}: {
  icon: ReactNode
  title: string
  meta?: string
  badge?: string
  onRemove: () => void
  removeLabel: string
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {meta && <p className="truncate text-xs text-ink-2">{meta}</p>}
      </div>
      {badge && <Badge tone="accent">{badge}</Badge>}
      <IconButton label={removeLabel} size="sm" onClick={onRemove}>
        <X />
      </IconButton>
    </li>
  )
}

/** Sección del editor de exámenes: subir archivos, escribir notas y vincular material existente. */
export function MaterialsEditor({
  subjectId,
  refs,
  onRefsChange,
  pendingFiles,
  onPendingFilesChange,
  pendingNotes,
  onPendingNotesChange,
}: {
  subjectId?: string
  refs: ExamMaterialRef[]
  onRefsChange: (refs: ExamMaterialRef[]) => void
  pendingFiles: PendingFile[]
  onPendingFilesChange: (files: PendingFile[]) => void
  pendingNotes: PendingNote[]
  onPendingNotesChange: (notes: PendingNote[]) => void
}) {
  const materials = useMaterials(refs)
  const inputRef = useRef<HTMLInputElement>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragging, setDragging] = useState(false)

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    const now = Date.now()
    onPendingFilesChange([
      ...pendingFiles,
      ...Array.from(list).map((file, i) => ({ key: `${now}-${i}-${file.name}`, file })),
    ])
  }

  const addNote = () => {
    if (!noteTitle.trim() && !noteBody.trim()) return
    onPendingNotesChange([...pendingNotes, { key: String(Date.now()), title: noteTitle.trim(), body: noteBody }])
    setNoteTitle('')
    setNoteBody('')
    setNoteOpen(false)
  }

  const total = materials.length + pendingFiles.length + pendingNotes.length

  return (
    <section
      className={clsx(
        'mt-6 rounded-xl border-t border-line pt-5 transition-colors',
        dragging && 'bg-accent-soft/40 outline-dashed outline-2 outline-accent',
      )}
      aria-labelledby="materials-heading"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        addFiles(e.dataTransfer.files)
      }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 id="materials-heading" className="text-sm font-semibold">
          Material de estudio
        </h3>
        <span className="font-mono text-xs text-ink-2 tnum">{total}</span>
      </div>

      {total > 0 ? (
        <ul className="mb-3 flex flex-col gap-1.5">
          {materials.map((m) => (
            <Row
              key={refKey(m)}
              icon={<MaterialIcon m={m} />}
              title={materialTitle(m)}
              meta={materialMeta(m)}
              removeLabel={`Quitar «${materialTitle(m)}» del examen`}
              onRemove={() => onRefsChange(refs.filter((r) => refKey(r) !== refKey(m)))}
            />
          ))}
          {pendingFiles.map((p) => {
            const cat = guessCategory(p.file)
            return (
              <Row
                key={p.key}
                icon={<CategoryIcon category={cat} className="size-4" />}
                title={p.file.name}
                meta={`${categoryLabel(cat)} · ${fmtBytes(p.file.size)}`}
                badge="Nuevo"
                removeLabel={`Quitar «${p.file.name}»`}
                onRemove={() => onPendingFilesChange(pendingFiles.filter((x) => x.key !== p.key))}
              />
            )
          })}
          {pendingNotes.map((n) => (
            <Row
              key={n.key}
              icon={<NotebookPen className="size-4" />}
              title={n.title || n.body.split('\n')[0] || 'Nota sin título'}
              meta="Nota"
              badge="Nueva"
              removeLabel={`Quitar la nota «${n.title || 'sin título'}»`}
              onRemove={() => onPendingNotesChange(pendingNotes.filter((x) => x.key !== n.key))}
            />
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-[13px] text-ink-2">
          Sube resúmenes, fotos de apuntes o guías, escribe una nota o vincula algo que ya tengas guardado.
        </p>
      )}

      {noteOpen && (
        <div className="mb-3 space-y-2 rounded-lg border border-line bg-surface-2/40 p-3">
          <Input
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Título de la nota"
            aria-label="Título de la nota"
            autoFocus
          />
          <Textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Resumen, fórmulas, preguntas que pueden tomar…"
            aria-label="Contenido de la nota"
            rows={5}
            className="font-mono text-[13px]"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={addNote} disabled={!noteTitle.trim() && !noteBody.trim()}>
              Agregar nota
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Upload />} onClick={() => inputRef.current?.click()}>
          Subir archivos
        </Button>
        {!noteOpen && (
          <Button size="sm" icon={<NotebookPen />} onClick={() => setNoteOpen(true)}>
            Escribir nota
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<Link2 />} onClick={() => setPickerOpen(true)}>
          Vincular existente
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {(pendingFiles.length > 0 || pendingNotes.length > 0) && (
        <p className="mt-2 text-xs text-ink-2">
          Al guardar, los archivos quedan también en Estudio › Archivos y las notas en Notas.
        </p>
      )}

      <LinkPicker
        open={pickerOpen}
        subjectId={subjectId}
        selected={refs}
        onClose={() => setPickerOpen(false)}
        onConfirm={(next) => {
          onRefsChange(next)
          setPickerOpen(false)
        }}
      />
    </section>
  )
}

/** Guarda archivos y notas nuevos y devuelve sus referencias. */
export async function savePendingMaterials(
  subjectId: string | undefined,
  files: PendingFile[],
  notes: PendingNote[],
): Promise<ExamMaterialRef[]> {
  const out: ExamMaterialRef[] = []
  let order = files.length ? await nextOrder('files') : 0
  for (const { file } of files) {
    const blobId = await putBlob(file)
    const id = await create('files', {
      subjectId,
      name: file.name,
      category: guessCategory(file),
      blobId,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      order: order++,
    })
    out.push({ kind: 'file', id })
  }
  for (const n of notes) {
    const id = await create('notes', {
      subjectId,
      title: n.title || n.body.trim().split('\n')[0].slice(0, 60) || 'Nota',
      body: n.body,
      tags: [],
      pinned: false,
    })
    out.push({ kind: 'note', id })
  }
  return out
}

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'file', label: 'Archivos' },
  { value: 'note', label: 'Notas' },
  { value: 'resource', label: 'Enlaces' },
]

/** Selector para vincular archivos, notas o enlaces que ya existen. */
function LinkPicker({
  open,
  subjectId,
  selected,
  onClose,
  onConfirm,
}: {
  open: boolean
  subjectId?: string
  selected: ExamMaterialRef[]
  onClose: () => void
  onConfirm: (refs: ExamMaterialRef[]) => void
}) {
  const [kind, setKind] = useState<Kind>('file')
  const [query, setQuery] = useState('')
  const [onlySubject, setOnlySubject] = useState(true)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [openedFor, setOpenedFor] = useState(false)

  // Reinicia la selección cada vez que se abre.
  if (open && !openedFor) {
    setOpenedFor(true)
    setChecked(new Set(selected.map(refKey)))
    setQuery('')
  } else if (!open && openedFor) setOpenedFor(false)

  const all = useLiveQuery(async () => {
    const [files, notes, resources] = await Promise.all([
      db.files.toArray(),
      db.notes.toArray(),
      db.resources.toArray(),
    ])
    return [
      ...alive(files).map((item) => ({ kind: 'file' as const, id: item.id, item })),
      ...alive(notes).map((item) => ({ kind: 'note' as const, id: item.id, item })),
      ...alive(resources).map((item) => ({ kind: 'resource' as const, id: item.id, item })),
    ] as Material[]
  }, [])

  const useSubject = !!subjectId && onlySubject
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (all ?? [])
      .filter((m) => m.kind === kind)
      .filter((m) => !useSubject || m.item.subjectId === subjectId)
      .filter((m) => !q || materialTitle(m).toLowerCase().includes(q))
      .sort((a, b) => b.item.updatedAt - a.item.updatedAt)
  }, [all, kind, query, useSubject, subjectId])

  const toggle = (k: string) =>
    setChecked((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const confirm = () => {
    const kept = selected.filter((r) => checked.has(refKey(r)))
    const keptKeys = new Set(kept.map(refKey))
    const added = [...checked]
      .filter((k) => !keptKeys.has(k))
      .map((k) => {
        const [kd, ...rest] = k.split(':')
        return { kind: kd as Kind, id: rest.join(':') }
      })
    onConfirm([...kept, ...added])
  }

  const countOf = (k: Kind) => [...checked].filter((x) => x.startsWith(`${k}:`)).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Vincular material"
      size="lg"
      footer={
        <>
          <span className="mr-auto font-mono text-xs text-ink-2 tnum">{checked.size} seleccionados</span>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={confirm}>
            Listo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SegmentedControl<Kind>
          label="Tipo de material"
          value={kind}
          onChange={setKind}
          options={KIND_OPTIONS.map((o) => ({
            value: o.value,
            label: (
              <>
                {o.label}
                {countOf(o.value) > 0 && <span className="ml-1 font-mono text-accent tnum">{countOf(o.value)}</span>}
              </>
            ),
          }))}
        />
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Buscar…" className="min-w-0 flex-1" />
          {subjectId && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={onlySubject}
                onChange={(e) => setOnlySubject(e.target.checked)}
                className="size-4 accent-[rgb(var(--accent))]"
              />
              Sólo de esta materia
            </label>
          )}
        </div>

        {list.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-2">
            {query
              ? 'No hay resultados para esa búsqueda.'
              : kind === 'file'
                ? 'No hay archivos guardados.'
                : kind === 'note'
                  ? 'No hay notas guardadas.'
                  : 'No hay enlaces guardados.'}
            {useSubject && !query && ' Prueba desmarcando «Sólo de esta materia».'}
          </p>
        ) : (
          <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
            {list.map((m) => {
              const k = refKey(m)
              return (
                <li key={k}>
                  <label
                    className={clsx(
                      'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
                      checked.has(k) ? 'border-accent bg-accent-soft/50' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(k)}
                      onChange={() => toggle(k)}
                      className="size-4 shrink-0 accent-[rgb(var(--accent))]"
                    />
                    <span className="shrink-0 text-ink-2" aria-hidden>
                      <MaterialIcon m={m} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{materialTitle(m)}</span>
                      <span className="block truncate text-xs text-ink-2">{materialMeta(m)}</span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/** Lista de material en la tarjeta del examen: abre la vista previa, la nota o el enlace. */
export function ExamMaterialsList({ refs }: { refs: ExamMaterialRef[] | undefined }) {
  const materials = useMaterials(refs)
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  if (!materials.length) return null

  const itemCls =
    'flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2'

  return (
    <div className="mt-3">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-2">
        <Paperclip className="size-3.5" aria-hidden />
        Material <span className="font-mono tnum">{materials.length}</span>
      </p>
      <ul className="-mx-1.5 flex flex-col">
        {materials.map((m) => (
          <li key={refKey(m)}>
            {m.kind === 'resource' ? (
              <a href={m.item.url} target="_blank" rel="noopener noreferrer" className={itemCls}>
                <span className="shrink-0 text-ink-3" aria-hidden>
                  <MaterialIcon m={m} />
                </span>
                <span className="min-w-0 flex-1 truncate">{materialTitle(m)}</span>
                <ExternalLink className="size-3.5 shrink-0 text-ink-3" aria-label="(se abre en otra pestaña)" />
              </a>
            ) : (
              <button
                type="button"
                className={itemCls}
                onClick={() => (m.kind === 'file' ? setPreview(m.item) : setNote(m.item))}
              >
                <span className="shrink-0 text-ink-3" aria-hidden>
                  <MaterialIcon m={m} />
                </span>
                <span className="min-w-0 flex-1 truncate">{materialTitle(m)}</span>
                <span className="shrink-0 text-xs text-ink-3">{m.kind === 'note' ? 'Nota' : categoryLabel(m.item.category)}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      <PreviewModal file={preview} onClose={() => setPreview(null)} />
      <NoteEditor open={!!note} note={note} onClose={() => setNote(null)} />
    </div>
  )
}

