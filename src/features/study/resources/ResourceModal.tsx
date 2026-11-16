import { BookOpen, FileText, FlaskConical, Newspaper, Video } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../../components/ui/Form'
import { Modal } from '../../../components/ui/Modal'
import { SubjectSelect } from '../../../components/ui/SubjectSelect'
import { create, update } from '../../../lib/db'
import type { Resource, ResourceType } from '../../../lib/types'
import { nextOrder } from '../files/reorderSubset'

export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'article', label: 'Artículo' },
  { value: 'simulator', label: 'Simulador' },
  { value: 'book', label: 'Libro' },
  { value: 'document', label: 'Documento' },
]

export const typeLabel = (t: ResourceType) => RESOURCE_TYPES.find((x) => x.value === t)?.label ?? t

export function TypeIcon({ type, className }: { type: ResourceType; className?: string }) {
  const icons: Record<ResourceType, ReactNode> = {
    video: <Video className={className} />,
    article: <Newspaper className={className} />,
    simulator: <FlaskConical className={className} />,
    book: <BookOpen className={className} />,
    document: <FileText className={className} />,
  }
  return <>{icons[type]}</>
}

/** Normaliza una URL (antepone https:// si falta). Devuelve null si no es válida. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const withProto = /^[a-z][a-z\d+.-]*:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withProto)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null
    return u.toString()
  } catch {
    return null
  }
}

export const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Sugiere el tipo a partir del dominio. */
function guessType(url: string): ResourceType | null {
  const h = hostname(url)
  if (/youtube\.com|youtu\.be|vimeo\.com|twitch\.tv/.test(h)) return 'video'
  if (/phet\.colorado|geogebra|desmos|falstad/.test(h)) return 'simulator'
  if (/books\.google|openlibrary|gutenberg/.test(h)) return 'book'
  if (/docs\.google|drive\.google|\.pdf$/.test(h + new URL(url).pathname)) return 'document'
  return null
}

export function ResourceModal({
  open,
  resource,
  defaultSubjectId,
  onClose,
}: {
  open: boolean
  resource: Resource | null
  defaultSubjectId?: string
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [type, setType] = useState<ResourceType>('article')
  const [typeTouched, setTypeTouched] = useState(false)
  const [subjectId, setSubjectId] = useState<string | undefined>()
  const [description, setDescription] = useState('')
  const [error, setError] = useState<{ title?: string; url?: string }>({})

  useEffect(() => {
    if (!open) return
    setTitle(resource?.title ?? '')
    setUrl(resource?.url ?? '')
    setType(resource?.type ?? 'article')
    setTypeTouched(!!resource)
    setSubjectId(resource ? resource.subjectId : defaultSubjectId)
    setDescription(resource?.description ?? '')
    setError({})
  }, [open, resource, defaultSubjectId])

  const onUrlBlur = () => {
    const n = normalizeUrl(url)
    if (!n) return
    setUrl(n)
    if (!typeTouched) {
      const g = guessType(n)
      if (g) setType(g)
    }
  }

  const save = async () => {
    const n = normalizeUrl(url)
    const err: typeof error = {}
    if (!title.trim()) err.title = 'Escribe un título.'
    if (!n) err.url = 'Ingresa un enlace válido, por ejemplo: es.khanacademy.org'
    setError(err)
    if (err.title || err.url || !n) return
    const data = { title: title.trim(), url: n, type, subjectId, description: description.trim() || undefined }
    if (resource) await update('resources', resource.id, data)
    else await create('resources', { ...data, order: await nextOrder('resources') })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={resource ? 'Editar recurso' : 'Nuevo recurso'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="resource-form">
            {resource ? 'Guardar' : 'Agregar'}
          </Button>
        </>
      }
    >
      <form
        id="resource-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Título">
          {(id) => (
            <>
            <Input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej.: Derivadas paso a paso"
              aria-invalid={!!error.title}
              aria-describedby={error.title ? `${id}-err` : undefined}
              className={error.title ? 'border-danger' : undefined}
            />
            <FieldError id={`${id}-err`} msg={error.title} />
            </>
          )}
        </Field>
        <Field label="Enlace">
          {(id) => (
            <>
            <Input
              id={id}
              type="url"
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={onUrlBlur}
              placeholder="https://"
              aria-invalid={!!error.url}
              aria-describedby={error.url ? `${id}-err` : undefined}
              className={error.url ? 'border-danger font-mono text-sm' : 'font-mono text-sm'}
            />
            <FieldError id={`${id}-err`} msg={error.url} />
            </>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            {(id) => (
              <Select
                id={id}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as ResourceType)
                  setTypeTouched(true)
                }}
              >
                {RESOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Materia">{(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}</Field>
        </div>
        <Field label="Descripción (opcional)">
          {(id) => (
            <Textarea
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Para qué te sirve este recurso?"
              rows={3}
            />
          )}
        </Field>
      </form>
    </Modal>
  )
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null
  return (
    <p id={id} role="alert" className="text-xs text-danger">
      {msg}
    </p>
  )
}
