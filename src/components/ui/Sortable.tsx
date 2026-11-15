import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from './Button'

/**
 * Grilla/lista reordenable con arrastrar-y-soltar (mouse, táctil y teclado) y animación.
 * `onReorder` recibe el nuevo arreglo de ids.
 */
export function SortableGrid<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  className,
}: {
  items: T[]
  onReorder: (ids: string[]) => void
  renderItem: (item: T, index: number, handle: ReactNode) => ReactNode
  className?: string
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = items.map((i) => i.id)
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((item, i) => (
            <SortableItem key={item.id} id={item.id}>
              {(handle) => renderItem(item, i, handle)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableItem({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, transition: { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' } })
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      aria-label="Arrastrar para reordenar"
      title="Arrastrar para reordenar"
      className="inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx('relative', isDragging && 'z-10 opacity-80 [&>*]:shadow-float')}
    >
      {children(handle)}
    </div>
  )
}

/** Botones rápidos de posición: principio / atrás / adelante / final. */
export function ReorderButtons({
  index,
  ids,
  onReorder,
}: {
  index: number
  ids: string[]
  onReorder: (ids: string[]) => void
}) {
  const last = ids.length - 1
  const move = (to: number) => onReorder(arrayMove(ids, index, to))
  return (
    <div className="flex items-center">
      <IconButton size="sm" label="Mover al principio" disabled={index === 0} onClick={() => move(0)}>
        <ChevronFirst />
      </IconButton>
      <IconButton size="sm" label="Mover atrás" disabled={index === 0} onClick={() => move(index - 1)}>
        <ChevronLeft />
      </IconButton>
      <IconButton size="sm" label="Mover adelante" disabled={index === last} onClick={() => move(index + 1)}>
        <ChevronRight />
      </IconButton>
      <IconButton size="sm" label="Mover al final" disabled={index === last} onClick={() => move(last)}>
        <ChevronLast />
      </IconButton>
    </div>
  )
}
