import type { Base } from '../../../lib/types'
import { alive, byOrder, db, reorder } from '../../../lib/db'

type OrderedTable = 'files' | 'resources'

/**
 * Reordena un subconjunto visible (filtrado por materia, categoría o búsqueda)
 * sin desordenar los elementos ocultos: los ids reordenados ocupan las mismas
 * posiciones globales que tenían antes.
 */
export async function reorderSubset(table: OrderedTable, subsetIds: string[]) {
  const rows = alive<Base & { order: number }>(await db[table].toArray()).sort(byOrder)
  const all = rows.map((r) => r.id)
  const subset = new Set(subsetIds)
  const queue = [...subsetIds]
  const next = all.map((id) => (subset.has(id) ? queue.shift()! : id))
  await reorder(table, next)
}

/** Siguiente valor de `order` (al final de la lista global). */
export async function nextOrder(table: OrderedTable): Promise<number> {
  const rows = alive<Base & { order: number }>(await db[table].toArray())
  return rows.reduce((m, r) => Math.max(m, r.order), -1) + 1
}
