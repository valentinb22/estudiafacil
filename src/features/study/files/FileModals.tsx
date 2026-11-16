import { Download, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, IconButton } from '../../../components/ui/Button'
import { Field, Input, Select } from '../../../components/ui/Form'
import { Modal } from '../../../components/ui/Modal'
import { SubjectSelect } from '../../../components/ui/SubjectSelect'
import { create, getBlob, putBlob, update } from '../../../lib/db'
import { useBlobUrl } from '../../../lib/hooks'
import { fmtBytes } from '../../../lib/time'
import type { FileCategory, FileItem } from '../../../lib/types'
import { CATEGORIES, CategoryIcon, guessCategory, isImage, isPdf } from './fileMeta'
import { nextOrder } from './reorderSubset'

/** Descarga un archivo guardado con su nombre original. */
export async function downloadFile(file: FileItem) {
  const rec = await getBlob(file.blobId)
  if (!rec) return
  const url = URL.createObjectURL(rec.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function CategorySelect({ id, value, onChange }: { id?: string; value: FileCategory; onChange: (c: FileCategory) => void }) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as FileCategory)}>
      {CATEGORIES.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </Select>
  )
}

interface Pending {
  key: string
  file: File
  name: string
  category: FileCategory
}

/** Paso de subida: materia común + nombre y categoría por archivo. */
export function UploadModal({
  files,
  defaultSubjectId,
  onClose,
}: {
  files: File[]
  defaultSubjectId?: string
  onClose: () => void
}) {
  const [items, setItems] = useState<Pending[]>([])
  const [subjectId, setSubjectId] = useState<string | undefined>(defaultSubjectId)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setItems(
      files.map((f, i) => ({ key: `${i}-${f.name}-${f.size}`, file: f, name: f.name, category: guessCategory(f) })),
    )
    setSubjectId(defaultSubjectId)
  }, [files, defaultSubjectId])

  const patch = (key: string, p: Partial<Pending>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)))

  const save = async () => {
    setSaving(true)
    try {
      let order = await nextOrder('files')
      for (const it of items) {
        const blobId = await putBlob(it.file)
        await create('files', {
          subjectId,
          name: it.name.trim() || it.file.name,
          category: it.category,
          blobId,
          mime: it.file.type || 'application/octet-stream',
          size: it.file.size,
          order: order++,
        })
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((s, x) => s + x.file.size, 0)

  return (
    <Modal
      open={files.length > 0}
      onClose={saving ? () => {} : onClose}
      title={items.length === 1 ? 'Subir archivo' : `Subir ${items.length} archivos`}
      size="lg"
      footer={
        <>
          <span className="mr-auto font-mono text-xs text-ink-3 tnum">{fmtBytes(total)}</span>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || items.length === 0}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Materia" hint="Se aplica a todos los archivos de esta subida.">
          {(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}
        </Field>
        <ul className="flex flex-col gap-3" aria-label="Archivos seleccionados">
          {items.map((it) => (
            <li key={it.key} className="rounded-xl border border-line p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-ink-3">
                  <CategoryIcon category={it.category} className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-2" title={it.file.name}>
                  {it.file.name}
                </span>
                <span className="font-mono text-xs text-ink-3 tnum">{fmtBytes(it.file.size)}</span>
                {items.length > 1 && (
                  <IconButton
                    size="sm"
                    label={`Quitar ${it.file.name}`}
                    onClick={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
                  >
                    <Trash2 />
                  </IconButton>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <Field label="Nombre">
                  {(id) => <Input id={id} value={it.name} onChange={(e) => patch(it.key, { name: e.target.value })} />}
                </Field>
                <Field label="Categoría">
                  {(id) => (
                    <CategorySelect id={id} value={it.category} onChange={(category) => patch(it.key, { category })} />
                  )}
                </Field>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

export function EditFileModal({ file, onClose }: { file: FileItem | null; onClose: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<FileCategory>('other')
  const [subjectId, setSubjectId] = useState<string | undefined>()

  useEffect(() => {
    if (!file) return
    setName(file.name)
    setCategory(file.category)
    setSubjectId(file.subjectId)
  }, [file])

  const save = async () => {
    if (!file) return
    await update('files', file.id, { name: name.trim() || file.name, category, subjectId })
    onClose()
  }

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      title="Editar archivo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="edit-file-form">
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="edit-file-form"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Field label="Nombre">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Categoría">{(id) => <CategorySelect id={id} value={category} onChange={setCategory} />}</Field>
        <Field label="Materia">{(id) => <SubjectSelect id={id} value={subjectId} onChange={setSubjectId} />}</Field>
      </form>
    </Modal>
  )
}

export function PreviewModal({ file, onClose }: { file: FileItem | null; onClose: () => void }) {
  const url = useBlobUrl(file?.blobId)
  const image = file && isImage(file.mime, file.name)
  const pdf = file && isPdf(file.mime, file.name)

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      title={file?.name ?? 'Vista previa'}
      size="xl"
      footer={
        file && (
          <>
            <span className="mr-auto font-mono text-xs text-ink-3 tnum">{fmtBytes(file.size)}</span>
            <Button variant="primary" icon={<Download />} onClick={() => downloadFile(file)}>
              Descargar
            </Button>
          </>
        )
      }
    >
      {!file ? null : !url ? (
        <p className="py-10 text-center text-sm text-ink-3">Cargando…</p>
      ) : image ? (
        <img src={url} alt={file.name} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-lg object-contain" />
      ) : pdf ? (
        <object
          data={url}
          type="application/pdf"
          aria-label={file.name}
          className="h-[70dvh] w-full rounded-lg border border-line bg-surface-2"
        >
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-ink-2">Tu navegador no puede mostrar el PDF aquí.</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-accent underline underline-offset-2"
            >
              Abrir en una pestaña nueva
            </a>
          </div>
        </object>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <span className="text-ink-3">
            <CategoryIcon category={file.category} className="size-8" />
          </span>
          <p className="font-medium">Vista previa no disponible</p>
          <p className="max-w-sm text-sm text-ink-2">Descarga el archivo para abrirlo con otra aplicación.</p>
        </div>
      )}
    </Modal>
  )
}
