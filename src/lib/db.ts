import Dexie, { type Table } from 'dexie'
import type {
  AudioItem, Base, BlobRecord, Exam, FileItem, Note, Resource, Subject, SyncTable, Task,
} from './types'

class EstudiaDB extends Dexie {
  subjects!: Table<Subject, string>
  tasks!: Table<Task, string>
  exams!: Table<Exam, string>
  notes!: Table<Note, string>
  audios!: Table<AudioItem, string>
  files!: Table<FileItem, string>
  resources!: Table<Resource, string>
  blobs!: Table<BlobRecord, string>

  constructor() {
    super('estudiafacil')
    this.version(1).stores({
      subjects: 'id, updatedAt, order',
      tasks: 'id, updatedAt, subjectId, dueAt, status',
      exams: 'id, updatedAt, subjectId, at',
      notes: 'id, updatedAt, subjectId, pinned',
      audios: 'id, updatedAt, subjectId, order',
      files: 'id, updatedAt, subjectId, order',
      resources: 'id, updatedAt, subjectId, order',
      blobs: 'id, updatedAt',
    })
  }
}

export const db = new EstudiaDB()

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

// Listener que el módulo de sincronización usa para enterarse de cambios locales.
type ChangeListener = (table: SyncTable, id: string) => void
const listeners = new Set<ChangeListener>()
export const onLocalChange = (fn: ChangeListener) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = (table: SyncTable, id: string) => listeners.forEach((l) => l(table, id))

type Row<T extends SyncTable> = EstudiaDB[T] extends Table<infer R, string> ? R : never
type NewRow<T extends SyncTable> = Omit<Row<T>, keyof Base> & Partial<Pick<Base, 'id'>>

/** Crea un registro con id y marcas de tiempo. */
export async function create<T extends SyncTable>(table: T, data: NewRow<T>): Promise<string> {
  const now = Date.now()
  const id = data.id ?? uid()
  const row = { ...data, id, createdAt: now, updatedAt: now } as unknown as Row<T>
  await (db[table] as unknown as Table<Row<T>, string>).put(row)
  emit(table, id)
  return id
}

/** Actualiza campos de un registro y refresca updatedAt. */
export async function update<T extends SyncTable>(table: T, id: string, patch: Partial<Row<T>>) {
  await (db[table] as unknown as Table<Row<T>, string>).update(id, {
    ...patch,
    updatedAt: Date.now(),
  } as never)
  emit(table, id)
}

/** Borrado lógico (se propaga a la nube). Los binarios asociados se borran localmente. */
export async function remove(table: SyncTable, id: string) {
  const t = db[table] as unknown as Table<Base & { blobId?: string }, string>
  const row = await t.get(id)
  if (row?.blobId) await db.blobs.delete(row.blobId)
  await t.update(id, { deleted: true, updatedAt: Date.now() } as never)
  emit(table, id)
}

/** Reescribe el campo `order` según el arreglo de ids recibido. */
export async function reorder(table: 'subjects' | 'audios' | 'files' | 'resources', ids: string[]) {
  const now = Date.now()
  await db.transaction('rw', db[table], async () => {
    for (let i = 0; i < ids.length; i++) {
      await (db[table] as unknown as Table<Base & { order: number }, string>).update(ids[i], {
        order: i,
        updatedAt: now,
      } as never)
    }
  })
  ids.forEach((id) => emit(table, id))
}

export async function putBlob(blob: Blob, id = uid()): Promise<string> {
  await db.blobs.put({ id, blob, mime: blob.type, size: blob.size, updatedAt: Date.now() })
  return id
}

export const getBlob = (id: string) => db.blobs.get(id)

export const alive = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted)
export const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order
