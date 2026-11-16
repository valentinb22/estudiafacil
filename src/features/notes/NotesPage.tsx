import clsx from 'clsx'
import { NotebookPen, Pin, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '../../components/ui/Button'
import { Card, EmptyState, PageHeader, SubjectChip, Toolbar } from '../../components/ui/Display'
import { SearchInput } from '../../components/ui/Form'
import { ConfirmModal } from '../../components/ui/Modal'
import { remove, update } from '../../lib/db'
import { useNotes, useSubjectMap } from '../../lib/hooks'
import { fmtDate } from '../../lib/time'
import type { Note } from '../../lib/types'
import { NoteEditor } from './NoteEditor'
import { matches, parseQuery, sortNotes, toggleTagInQuery } from './noteUtils'

export function NotesPage() {
  const notes = useNotes()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Note | null>(null)
  const [toDelete, setToDelete] = useState<Note | null>(null)

  const openNew = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (n: Note) => {
    setEditing(n)
    setEditorOpen(true)
  }
  const closeEditor = useCallback(() => setEditorOpen(false), [])
  const closeConfirm = useCallback(() => setToDelete(null), [])

  useEffect(() => {
    if (params.get('new') === '1') {
      openNew()
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const q = useMemo(() => parseQuery(query), [query])
  const list = useMemo(() => notes.filter((n) => matches(n, q)).sort(sortNotes), [notes, q])
  const allTags = useMemo(() => {
    const count = new Map<string, number>()
    notes.forEach((n) => n.tags.forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)))
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [notes])

  const onTag = (tag: string) => setQuery((cur) => toggleTagInQuery(cur, tag))
  const editingLive = editing ? (notes.find((n) => n.id === editing.id) ?? editing) : null

  return (
    <div className="pb-12">
      <PageHeader
        title="Notas"
        description="Apuntes rápidos, fórmulas y definiciones."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={openNew}>
            Nueva nota
          </Button>
        }
      />

      <Toolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Buscar notas o #etiqueta…"
          className="w-full sm:max-w-sm"
        />
        {query && (
          <Button variant="ghost" size="sm" icon={<X />} onClick={() => setQuery('')}>
            Limpiar
          </Button>
        )}
      </Toolbar>

      {allTags.length > 0 && (
        <div className="-mt-2 mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por etiqueta">
          {allTags.slice(0, 24).map((t) => (
            <TagChip key={t} tag={t} active={q.tags.includes(t)} onClick={() => onTag(t)} />
          ))}
        </div>
      )}

      {list.length === 0 ? (
        notes.length === 0 ? (
          <EmptyState
            icon={<NotebookPen />}
            title="Todavía no tienes notas"
            description="Guarda apuntes, fórmulas y definiciones. Usa #etiquetas para encontrarlas rápido."
            action={
              <Button variant="primary" icon={<Plus />} onClick={openNew}>
                Crear nota
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<NotebookPen />}
            title="Sin resultados"
            description="Ninguna nota coincide con tu búsqueda."
            action={<Button onClick={() => setQuery('')}>Limpiar búsqueda</Button>}
          />
        )
      ) : (
        <div className="gap-4 sm:columns-2 lg:columns-3">
          {list.map((n) => (
            <NoteCard key={n.id} note={n} activeTags={q.tags} onOpen={openEdit} onTag={onTag} />
          ))}
        </div>
      )}

      <NoteEditor open={editorOpen} note={editingLive} onClose={closeEditor} onDelete={setToDelete} />

      <ConfirmModal
        open={!!toDelete}
        onClose={closeConfirm}
        title="Eliminar nota"
        message={
          <>
            Se eliminará <strong className="text-ink">«{toDelete?.title || 'Sin título'}»</strong>.
          </>
        }
        onConfirm={() => {
          if (!toDelete) return
          remove('notes', toDelete.id)
          setEditorOpen(false)
        }}
      />
    </div>
  )
}

function TagChip({ tag, active, onClick }: { tag: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={clsx(
        'relative z-10 inline-flex h-6 items-center rounded-md px-1.5 font-mono text-xs transition-colors duration-150',
        active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2 hover:text-ink',
      )}
    >
      #{tag}
    </button>
  )
}

function NoteCard({
  note,
  activeTags,
  onOpen,
  onTag,
}: {
  note: Note
  activeTags: string[]
  onOpen: (n: Note) => void
  onTag: (t: string) => void
}) {
  const subject = useSubjectMap().get(note.subjectId ?? '')
  return (
    <Card
      role="article"
      aria-label={note.title || 'Sin título'}
      className={clsx(
        'group relative mb-4 flex break-inside-avoid flex-col p-4 transition-colors duration-150 hover:border-ink-3 sm:p-5',
        note.pinned && 'border-hl/60',
      )}
    >
      {subject && (
        <span aria-hidden className="absolute left-0 top-4 h-6 w-[3px] rounded-r" style={{ background: subject.color }} />
      )}
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold leading-snug [overflow-wrap:anywhere]">
          <button
            type="button"
            onClick={() => onOpen(note)}
            className="text-left after:absolute after:inset-0 after:rounded-xl focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent"
          >
            {note.pinned ? (
              <mark className="box-decoration-clone bg-hl-soft px-0.5 text-ink">{note.title || 'Sin título'}</mark>
            ) : (
              note.title || <span className="text-ink-2">Sin título</span>
            )}
          </button>
        </h2>
        <IconButton
          size="sm"
          label={note.pinned ? 'Desfijar nota' : 'Fijar nota arriba'}
          aria-pressed={note.pinned}
          onClick={() => update('notes', note.id, { pinned: !note.pinned })}
          className={clsx(
            'relative z-10 -mr-1.5 -mt-1',
            note.pinned ? 'text-ink' : 'opacity-60 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Pin className={note.pinned ? 'fill-hl text-ink' : undefined} />
        </IconButton>
      </div>

      {note.body && (
        <p className="mt-2 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-ink-2 line-clamp-[12]">
          {note.body}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <SubjectChip subjectId={note.subjectId} />
        {note.tags.map((t) => (
          <TagChip key={t} tag={t} active={activeTags.includes(t)} onClick={() => onTag(t)} />
        ))}
        <span className="ml-auto font-mono text-[11px] text-ink-2 tnum">{fmtDate(note.updatedAt)}</span>
      </div>
    </Card>
  )
}
