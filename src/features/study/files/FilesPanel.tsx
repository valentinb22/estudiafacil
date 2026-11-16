import clsx from 'clsx'
import { CloudUpload, Download, Eye, FolderOpen, Pencil, Trash2, Upload } from 'lucide-react'
import type { DragEvent, ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import { Button, IconButton } from '../../../components/ui/Button'
import { Badge, Card, EmptyState, SubjectChip, Toolbar } from '../../../components/ui/Display'
import { SearchInput, SegmentedControl } from '../../../components/ui/Form'
import { ConfirmModal } from '../../../components/ui/Modal'
import { ReorderButtons, SortableGrid } from '../../../components/ui/Sortable'
import { remove } from '../../../lib/db'
import { useBlobUrl, useFiles } from '../../../lib/hooks'
import { useUI } from '../../../lib/store'
import { fmtBytes } from '../../../lib/time'
import type { FileCategory, FileItem } from '../../../lib/types'
import { ACCEPT, CATEGORIES, CategoryIcon, categoryLabel, isImage } from './fileMeta'
import { downloadFile, EditFileModal, PreviewModal, UploadModal } from './FileModals'
import { reorderSubset } from './reorderSubset'

type Filter = FileCategory | 'all'

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')

export function FilesPanel() {
  const files = useFiles()
  const subjectFilter = useUI((s) => s.subjectFilter)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState<File[]>([])
  const [preview, setPreview] = useState<FileItem | null>(null)
  const [editing, setEditing] = useState<FileItem | null>(null)
  const [deleting, setDeleting] = useState<FileItem | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const counts = useMemo(() => {
    const m = new Map<Filter, number>([['all', files.length]])
    for (const f of files) m.set(f.category, (m.get(f.category) ?? 0) + 1)
    return m
  }, [files])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter((f) => (filter === 'all' || f.category === filter) && (!q || f.name.toLowerCase().includes(q)))
  }, [files, filter, query])
  const ids = visible.map((f) => f.id)
  const onReorder = (next: string[]) => void reorderSubset('files', next)

  const pick = () => inputRef.current?.click()
  const accept = (list: FileList | null) => {
    if (list && list.length) setPending(Array.from(list))
  }

  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current++
      setDragOver(true)
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragOver(false)
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragOver(false)
      accept(e.dataTransfer.files)
    },
  }

  return (
    <div {...dropHandlers} className="relative">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          accept(e.target.files)
          e.target.value = ''
        }}
      />

      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar archivos…" className="min-w-0 flex-1 basis-56" />
        <Button variant="primary" icon={<Upload />} onClick={pick} className="max-sm:h-11">
          Subir archivos
        </Button>
      </Toolbar>

      {files.length > 0 && (
        <div className="mb-5">
          <SegmentedControl<Filter>
            label="Filtrar por categoría"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: <>Todos <Count n={counts.get('all') ?? 0} /></> },
              ...CATEGORIES.map((c) => ({
                value: c.value,
                label: (
                  <>
                    {c.label} <Count n={counts.get(c.value) ?? 0} />
                  </>
                ),
              })),
            ]}
          />
        </div>
      )}

      <button
        type="button"
        onClick={pick}
        className={clsx(
          'mb-5 flex w-full items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-5 text-sm transition-colors duration-150',
          dragOver ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink',
        )}
      >
        <CloudUpload className="size-5 shrink-0" />
        <span>
          <span className="font-medium">Arrastra archivos aquí</span>
          <span className="hidden xs:inline"> o haz clic para elegirlos</span>
          <span className="block text-xs text-ink-3">PDF, diapositivas, imágenes y documentos</span>
        </span>
      </button>

      {files.length === 0 ? (
        <EmptyState
          icon={<FolderOpen />}
          title="Todavía no hay archivos"
          description="Sube tus PDFs, diapositivas, guías o fotos de apuntes para tenerlos a mano, incluso sin conexión."
          action={
            <Button variant="primary" icon={<Upload />} onClick={pick}>
              Subir el primero
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="Ningún archivo coincide con el filtro o la búsqueda."
          action={
            <Button
              onClick={() => {
                setFilter('all')
                setQuery('')
              }}
            >
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <SortableGrid
          items={visible}
          onReorder={onReorder}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
          renderItem={(f, i, handle) => (
            <FileCard
              file={f}
              handle={handle}
              reorder={<ReorderButtons index={i} ids={ids} onReorder={onReorder} />}
              onPreview={() => setPreview(f)}
              onEdit={() => setEditing(f)}
              onDelete={() => setDeleting(f)}
            />
          )}
        />
      )}

      <UploadModal files={pending} defaultSubjectId={subjectFilter ?? undefined} onClose={() => setPending([])} />
      <PreviewModal file={preview} onClose={() => setPreview(null)} />
      <EditFileModal file={editing} onClose={() => setEditing(null)} />
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void remove('files', deleting.id)}
        title="Eliminar archivo"
        message={
          <>
            Se eliminará <span className="font-medium text-ink">{deleting?.name}</span> de este dispositivo. Esta acción
            no se puede deshacer.
          </>
        }
      />
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 font-mono text-[11px] text-ink-3 tnum">{n}</span>
}

function FileCard({
  file,
  handle,
  reorder,
  onPreview,
  onEdit,
  onDelete,
}: {
  file: FileItem
  handle: ReactNode
  reorder: ReactNode
  onPreview: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const image = isImage(file.mime, file.name)
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <button
        type="button"
        onClick={onPreview}
        aria-label={`Vista previa de ${file.name}`}
        className="group relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden border-b border-line bg-surface-2/60 text-ink-3"
      >
        {image ? (
          <Thumb blobId={file.blobId} />
        ) : (
          <CategoryIcon category={file.category} className="size-9 transition-transform duration-200 group-hover:scale-105" />
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 break-words text-[15px] font-medium leading-snug" title={file.name}>
          {file.name}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{categoryLabel(file.category)}</Badge>
          <SubjectChip subjectId={file.subjectId} />
          <span className="ml-auto font-mono text-xs text-ink-3 tnum">{fmtBytes(file.size)}</span>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-1 border-t border-line pt-2">
          <div className="flex items-center">
            {handle}
            {reorder}
          </div>
          <div className="flex items-center">
            <IconButton size="sm" label="Vista previa" onClick={onPreview}>
              <Eye />
            </IconButton>
            <IconButton size="sm" label="Descargar" onClick={() => void downloadFile(file)}>
              <Download />
            </IconButton>
            <IconButton size="sm" label="Editar" onClick={onEdit}>
              <Pencil />
            </IconButton>
            <IconButton size="sm" label="Eliminar" onClick={onDelete} className="hover:!bg-danger-soft hover:!text-danger">
              <Trash2 />
            </IconButton>
          </div>
        </div>
      </div>
    </Card>
  )
}

function Thumb({ blobId }: { blobId: string }) {
  const url = useBlobUrl(blobId)
  if (!url) return <span className="size-full animate-pulse bg-surface-2" />
  return <img src={url} alt="" loading="lazy" className="size-full object-cover" />
}
