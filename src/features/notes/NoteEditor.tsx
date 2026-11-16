import { Pin, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, IconButton } from '../../components/ui/Button'
import { Field, Input, Textarea } from '../../components/ui/Form'
import { Modal } from '../../components/ui/Modal'
import { SubjectSelect } from '../../components/ui/SubjectSelect'
import { create, update } from '../../lib/db'
import { useUI } from '../../lib/store'
import type { Note } from '../../lib/types'
import { parseTags } from './noteUtils'

export function NoteEditor({
  open,
  note,
  onClose,
  onDelete,
}: {
  open: boolean
  note: Note | null
  onClose: () => void
  onDelete?: (note: Note) => void
}) {
  const subjectFilter = useUI((s) => s.subjectFilter)
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState<string | undefined>()
  const [tags, setTags] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(note?.title ?? '')
    setSubjectId(note ? note.subjectId : (subjectFilter ?? undefined))
    setTags(note?.tags.map((t) => `#${t}`).join(' ') ?? '')
    setBody(note?.body ?? '')
    setPinned(note?.pinned ?? false)
    // Sólo al abrir o cambiar de nota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, note?.id])

  const parsed = parseTags(tags)
  const valid = title.trim() || body.trim()

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    const data = {
      title: title.trim() || body.trim().split('\n')[0].slice(0, 60),
      subjectId,
      tags: parsed,
      body,
      pinned,
    }
    try {
      if (note) await update('notes', note.id, data)
      else await create('notes', data)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={note ? 'Editar nota' : 'Nueva nota'}
      size="lg"
      footer={
        <>
          {note && onDelete && (
            <Button variant="danger" icon={<Trash2 />} className="mr-auto" onClick={() => onDelete(note)}>
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid || saving}>
            {note ? 'Guardar cambios' : 'Crear nota'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-2">
          <Field label="Título" className="min-w-0 flex-1">
            {(id) => (
              <Input
                id={id}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
                placeholder="Ej.: Fórmulas de cinemática"
              />
            )}
          </Field>
          <IconButton
            label={pinned ? 'Desfijar nota' : 'Fijar nota arriba'}
            aria-pressed={pinned}
            active={pinned}
            onClick={() => setPinned((p) => !p)}
            className={pinned ? '!bg-hl-soft !text-ink' : undefined}
          >
            <Pin className={pinned ? 'fill-current' : undefined} />
          </IconButton>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Materia">
            {(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}
          </Field>
          <Field label="Etiquetas" hint="Separa con comas o espacios.">
            {(id) => (
              <Input
                id={id}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="#formulas, repaso"
                className="font-mono text-[13px]"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            )}
          </Field>
        </div>
        {parsed.length > 0 && (
          <ul className="-mt-2 flex flex-wrap gap-1.5" aria-label="Etiquetas detectadas">
            {parsed.map((t) => (
              <li key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink-2">
                #{t}
              </li>
            ))}
          </ul>
        )}

        <Field label="Contenido">
          {(id) => (
            <Textarea
              id={id}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  save()
                }
              }}
              placeholder="Escribe tus apuntes, fórmulas o definiciones…"
              spellCheck
              className="min-h-[40dvh] resize-y font-mono text-[13px] leading-relaxed sm:min-h-80"
            />
          )}
        </Field>
        <p className="-mt-2 flex justify-between gap-2 text-xs text-ink-2">
          <span className="hidden sm:inline">Ctrl + Enter para guardar</span>
          <span className="ml-auto font-mono tnum">
            {body.length.toLocaleString('es')} {body.length === 1 ? 'carácter' : 'caracteres'}
          </span>
        </p>
      </div>
    </Modal>
  )
}
