import { ExternalLink, Library, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Button, IconButton } from '../../../components/ui/Button'
import { Badge, Card, EmptyState, SubjectChip, Toolbar } from '../../../components/ui/Display'
import { SearchInput, SegmentedControl } from '../../../components/ui/Form'
import { ConfirmModal } from '../../../components/ui/Modal'
import { ReorderButtons, SortableGrid } from '../../../components/ui/Sortable'
import { remove } from '../../../lib/db'
import { useResources } from '../../../lib/hooks'
import { useUI } from '../../../lib/store'
import type { Resource, ResourceType } from '../../../lib/types'
import { reorderSubset } from '../files/reorderSubset'
import { hostname, RESOURCE_TYPES, ResourceModal, TypeIcon, typeLabel } from './ResourceModal'

type Filter = ResourceType | 'all'

export function ResourcesPanel() {
  const resources = useResources()
  const subjectFilter = useUI((s) => s.subjectFilter)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState<{ open: boolean; resource: Resource | null }>({ open: false, resource: null })
  const [deleting, setDeleting] = useState<Resource | null>(null)

  const counts = useMemo(() => {
    const m = new Map<Filter, number>([['all', resources.length]])
    for (const r of resources) m.set(r.type, (m.get(r.type) ?? 0) + 1)
    return m
  }, [resources])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return resources.filter(
      (r) =>
        (filter === 'all' || r.type === filter) &&
        (!q || `${r.title} ${r.description ?? ''} ${r.url}`.toLowerCase().includes(q)),
    )
  }, [resources, filter, query])
  const ids = visible.map((r) => r.id)
  const onReorder = (next: string[]) => void reorderSubset('resources', next)

  const openNew = () => setModal({ open: true, resource: null })

  return (
    <div>
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar recursos…" className="min-w-0 flex-1 basis-56" />
        <Button variant="primary" icon={<Plus />} onClick={openNew} className="max-sm:h-11">
          Nuevo recurso
        </Button>
      </Toolbar>

      {resources.length > 0 && (
        <div className="mb-5">
          <SegmentedControl<Filter>
            label="Filtrar por tipo"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: <>Todos <Count n={counts.get('all') ?? 0} /></> },
              ...RESOURCE_TYPES.map((t) => ({
                value: t.value,
                label: (
                  <>
                    {t.label} <Count n={counts.get(t.value) ?? 0} />
                  </>
                ),
              })),
            ]}
          />
        </div>
      )}

      {resources.length === 0 ? (
        <EmptyState
          icon={<Library />}
          title="Tu biblioteca de recursos está vacía"
          description="Guarda videos, artículos, simuladores y libros que te ayuden a estudiar, organizados por materia."
          action={
            <Button variant="primary" icon={<Plus />} onClick={openNew}>
              Agrega tu primer recurso
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="Ningún recurso coincide con el filtro o la búsqueda."
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
          renderItem={(r, i, handle) => (
            <ResourceCard
              resource={r}
              handle={handle}
              reorder={<ReorderButtons index={i} ids={ids} onReorder={onReorder} />}
              onEdit={() => setModal({ open: true, resource: r })}
              onDelete={() => setDeleting(r)}
            />
          )}
        />
      )}

      <ResourceModal
        open={modal.open}
        resource={modal.resource}
        defaultSubjectId={subjectFilter ?? undefined}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void remove('resources', deleting.id)}
        title="Eliminar recurso"
        message={
          <>
            Se eliminará <span className="font-medium text-ink">{deleting?.title}</span> de tu biblioteca.
          </>
        }
      />
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 font-mono text-[11px] text-ink-3 tnum">{n}</span>
}

function ResourceCard({
  resource: r,
  handle,
  reorder,
  onEdit,
  onDelete,
}: {
  resource: Resource
  handle: ReactNode
  reorder: ReactNode
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
          <TypeIcon type={r.type} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 break-words text-[15px] font-medium leading-snug hover:text-accent hover:underline hover:underline-offset-2"
          >
            {r.title}
            <span className="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
          <p className="mt-0.5 truncate font-mono text-xs text-ink-3" title={r.url}>
            {hostname(r.url)}
          </p>
        </div>
      </div>
      {r.description && <p className="mt-3 line-clamp-3 text-sm text-ink-2">{r.description}</p>}
      <div className="mb-4 mt-3 flex flex-wrap items-center gap-1.5">
        <Badge>{typeLabel(r.type)}</Badge>
        <SubjectChip subjectId={r.subjectId} />
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-1 border-t border-line pt-2">
        <div className="flex items-center">
          {handle}
          {reorder}
        </div>
        <div className="flex items-center">
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir ${r.title} en una pestaña nueva`}
            title="Abrir en una pestaña nueva"
            className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <ExternalLink className="size-4" />
          </a>
          <IconButton size="sm" label="Editar" onClick={onEdit}>
            <Pencil />
          </IconButton>
          <IconButton size="sm" label="Eliminar" onClick={onDelete} className="hover:!bg-danger-soft hover:!text-danger">
            <Trash2 />
          </IconButton>
        </div>
      </div>
    </Card>
  )
}
