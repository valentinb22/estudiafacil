// Motor de sincronización local-first con Firestore.
// Se carga con import() dinámico: todo firebase vive en este chunk.
//
// Estructura remota:
//   users/{uid}/{tabla}/{id}                 registro completo (borrados = lápida con deleted: true)
//   users/{uid}/blobs/{blobId}               { mime, size, chunks, updatedAt }  (se escribe al final)
//   users/{uid}/blobs/{blobId}/chunks/{i}    { data: base64 }  (~500 KB de bytes por trozo)
//
// Reglas:
//   - Gana la última escritura (updatedAt) por registro, en ambos sentidos.
//   - Los cambios remotos se escriben directo en Dexie (no pasan por create/update) para no
//     volver a emitir onLocalChange y generar un eco.
//   - Los cambios locales llegan por onLocalChange y se suben en lotes con debounce.

import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider, getAuth, getRedirectResult, onAuthStateChanged, signInWithPopup,
  signInWithRedirect, signOut as fbSignOut, type Auth, type User,
} from 'firebase/auth'
import {
  collection, deleteDoc, doc, getDoc, getDocs, getDocsFromServer, getFirestore, initializeFirestore,
  onSnapshot, persistentLocalCache, persistentMultipleTabManager, setDoc, writeBatch,
  type DocumentData, type Firestore, type QuerySnapshot, type Unsubscribe,
} from 'firebase/firestore'
import type { Table } from 'dexie'
import { db, onLocalChange } from '../../lib/db'
import type { Base, SyncTable } from '../../lib/types'
import { firebaseConfig } from './config'
import { bump, loadLastSync, saveLastSync, setSync, useSync } from './syncStore'

export const SYNC_TABLES: SyncTable[] = ['subjects', 'tasks', 'exams', 'notes', 'audios', 'files', 'resources']
const BLOB_TABLES = new Set<SyncTable>(['audios', 'files'])
const PUSH_DEBOUNCE_MS = 800
const CHUNK_BYTES = 500 * 1024 // 500 KB → ~683 KB en base64 (< 1 MiB por documento)
const BLOB_CONCURRENCY = 2
const BATCH_LIMIT = 400

type Row = Base & { blobId?: string } & Record<string, unknown>
const table = (t: SyncTable) => db[t] as unknown as Table<Row, string>

// ───────────────────────── Inicialización de Firebase ─────────────────────────

let app: FirebaseApp | null = null
let auth: Auth | null = null
let fs: Firestore | null = null

function init() {
  if (app) return
  if (!firebaseConfig) throw new Error('La nube no está configurada')
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  auth.languageCode = 'es'
  try {
    // Caché persistente: las escrituras quedan en cola si no hay conexión.
    fs = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    fs = getFirestore(app)
  }
}

// ───────────────────────── Utilidades ─────────────────────────

const errorMessages: Record<string, string> = {
  'auth/network-request-failed': 'No hay conexión. Inténtalo de nuevo cuando estés en línea.',
  'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase (revisa docs/SYNC.md).',
  'auth/operation-not-allowed': 'El inicio de sesión con Google no está habilitado en Firebase.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
  'permission-denied': 'Permiso denegado por las reglas de Firestore.',
  'unavailable': 'El servicio no está disponible. Se reintentará al volver la conexión.',
  'resource-exhausted': 'Se alcanzó la cuota de Firebase.',
}

export function describeError(e: unknown): string {
  const code = (e as { code?: string })?.code
  if (code && errorMessages[code]) return errorMessages[code]
  if (code) return `Error de sincronización (${code}).`
  return e instanceof Error ? e.message : 'Error de sincronización desconocido.'
}

/** Copia profunda sin valores undefined (Firestore no los acepta). */
function strip<T>(v: T): T {
  if (Array.isArray(v)) return v.map(strip) as T
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) if (val !== undefined) out[k] = strip(val)
    return out as T
  }
  return v
}

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })
}

function base64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Cola simple con límite de concurrencia y deduplicación por clave. */
function makeQueue(concurrency: number, counter: 'pendingUploads' | 'pendingDownloads', run: (id: string) => Promise<void>) {
  const queued: string[] = []
  const known = new Set<string>()
  let active = 0
  const next = () => {
    while (active < concurrency && queued.length) {
      const id = queued.shift()!
      active++
      run(id)
        .catch((e) => console.warn(`[sync] ${counter} ${id}`, e))
        .finally(() => {
          active--
          known.delete(id)
          bump(counter, -1)
          updateStatus()
          next()
        })
    }
  }
  return {
    add(id: string) {
      if (known.has(id)) return
      known.add(id)
      queued.push(id)
      bump(counter, 1)
      next()
    },
    clear() {
      bump(counter, -queued.length)
      for (const id of queued) known.delete(id)
      queued.length = 0
    },
  }
}

// ───────────────────────── Sesión ─────────────────────────

interface Session {
  uid: string
  unsubs: Array<() => void>
  merged: Set<SyncTable>
  /** updatedAt conocido en el servidor por `${tabla}/${id}` */
  remote: Map<string, number>
  pending: Map<SyncTable, Set<string>>
  timer: ReturnType<typeof setTimeout> | null
  chains: Map<SyncTable, Promise<void>>
  dlTimer: ReturnType<typeof setTimeout> | null
  /** blobs cuyo meta remoto no existe todavía (se reintenta cuando aparezca) */
  missingRemote: Set<string>
  alive: boolean
}

let session: Session | null = null
let started = false

const userCol = (uid: string, name: string) => collection(fs!, 'users', uid, name)
const recDoc = (uid: string, t: SyncTable, id: string) => doc(fs!, 'users', uid, t, id)
const blobMeta = (uid: string, id: string) => doc(fs!, 'users', uid, 'blobs', id)
const blobChunks = (uid: string, id: string) => collection(fs!, 'users', uid, 'blobs', id, 'chunks')

function updateStatus() {
  const s = useSync.getState()
  if (s.status === 'disabled') return
  if (!session) return setSync({ status: 'signed_out' })
  if (s.error) return setSync({ status: 'error' })
  if (!isOnline()) return setSync({ status: 'offline' })
  const busy =
    session.merged.size < SYNC_TABLES.length ||
    session.timer !== null ||
    s.pendingWrites > 0 ||
    s.pendingUploads > 0 ||
    s.pendingDownloads > 0
  setSync({ status: busy ? 'syncing' : 'synced' })
}

function fail(e: unknown) {
  console.error('[sync]', e)
  setSync({ error: describeError(e) })
  updateStatus()
}

/** Encadena tareas por tabla para que los snapshots se apliquen en orden. */
function serial(t: SyncTable, fn: () => Promise<void>) {
  if (!session) return Promise.resolve()
  const s = session
  const prev = s.chains.get(t) ?? Promise.resolve()
  const p = prev.then(fn).catch(fail)
  s.chains.set(t, p)
  return p
}

// ───────────────────────── Bajada (remoto → local) ─────────────────────────

/** Aplica registros remotos con "gana el más nuevo". Escribe directo en Dexie (sin emitir). */
async function applyRemote(t: SyncTable, items: Row[]) {
  if (!items.length) return
  const tb = table(t)
  const orphanBlobs: string[] = []
  await db.transaction('rw', tb, async () => {
    const locals = await tb.bulkGet(items.map((r) => r.id))
    const toPut: Row[] = []
    items.forEach((r, i) => {
      const local = locals[i]
      if (local && local.updatedAt >= r.updatedAt) return
      toPut.push(r)
      if (local?.blobId && local.blobId !== r.blobId) orphanBlobs.push(local.blobId)
      if (r.deleted && r.blobId) orphanBlobs.push(r.blobId)
    })
    if (toPut.length) await tb.bulkPut(toPut)
  })
  if (orphanBlobs.length) await db.blobs.bulkDelete(orphanBlobs)
  if (BLOB_TABLES.has(t)) scheduleDownloads()
}

function readSnapshot(t: SyncTable, snap: QuerySnapshot<DocumentData>): Row[] {
  const s = session!
  const out: Row[] = []
  for (const ch of snap.docChanges()) {
    if (ch.type === 'removed') continue // usamos lápidas; un borrado duro no elimina datos locales
    const data = ch.doc.data() as Row
    const row = { ...data, id: ch.doc.id, updatedAt: Number(data.updatedAt) || 0 } as Row
    s.remote.set(`${t}/${row.id}`, row.updatedAt)
    if (ch.doc.metadata.hasPendingWrites) continue // eco de una escritura propia
    out.push(row)
  }
  return out
}

function onTableSnapshot(t: SyncTable, snap: QuerySnapshot<DocumentData>) {
  const s = session
  if (!s?.alive) return
  const rows = readSnapshot(t, snap)
  void serial(t, async () => {
    await applyRemote(t, rows)
    // Primer snapshot confirmado por el servidor: subir lo local que sea más nuevo.
    if (!s.merged.has(t) && !snap.metadata.fromCache) {
      await pushLocalNewer(t)
      s.merged.add(t)
      if (s.merged.size === SYNC_TABLES.length) {
        saveLastSync(Date.now())
        void scanBlobs()
      }
    } else if (s.merged.has(t) && !snap.metadata.fromCache && !snap.metadata.hasPendingWrites && rows.length) {
      saveLastSync(Date.now())
    }
    updateStatus()
  })
}

async function pushLocalNewer(t: SyncTable) {
  const s = session
  if (!s) return
  const rows = await table(t).toArray()
  for (const r of rows) {
    const known = s.remote.get(`${t}/${r.id}`)
    if (known === undefined || r.updatedAt > known) queuePush(t, r.id)
  }
}

// ───────────────────────── Subida (local → remoto) ─────────────────────────

function queuePush(t: SyncTable, id: string) {
  const s = session
  if (!s) return
  let set = s.pending.get(t)
  if (!set) s.pending.set(t, (set = new Set()))
  set.add(id)
  if (s.timer) clearTimeout(s.timer)
  s.timer = setTimeout(() => void flush(), PUSH_DEBOUNCE_MS)
  updateStatus()
}

async function flush() {
  const s = session
  if (!s) return
  if (s.timer) clearTimeout(s.timer)
  s.timer = null
  const pending = s.pending
  s.pending = new Map()

  type Op = { t: SyncTable; row: Row }
  const ops: Op[] = []
  for (const [t, ids] of pending) {
    const rows = await table(t).bulkGet([...ids])
    for (const row of rows) {
      if (!row) continue
      const known = s.remote.get(`${t}/${row.id}`)
      if (known !== undefined && known >= row.updatedAt) continue // el servidor ya tiene algo igual o más nuevo
      ops.push({ t, row })
    }
  }
  if (!ops.length) return updateStatus()

  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const slice = ops.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(fs!)
    for (const { t, row } of slice) {
      batch.set(recDoc(s.uid, t, row.id), strip(row))
      s.remote.set(`${t}/${row.id}`, row.updatedAt)
    }
    bump('pendingWrites', 1)
    // Con caché persistente, commit() se resuelve al confirmar el servidor; sin conexión queda en cola.
    batch
      .commit()
      .then(() => {
        if (session !== s) return
        saveLastSync(Date.now())
        for (const { t, row } of slice) {
          if (!BLOB_TABLES.has(t) || !row.blobId) continue
          if (row.deleted) void deleteRemoteBlob(s.uid, row.blobId).catch((e) => console.warn('[sync] borrar blob', e))
          else uploads.add(row.blobId)
        }
      })
      .catch((e) => {
        // Reencolar para reintentar más tarde.
        for (const { t, row } of slice) s.remote.delete(`${t}/${row.id}`)
        fail(e)
      })
      .finally(() => {
        bump('pendingWrites', -1)
        updateStatus()
      })
  }
  updateStatus()
}

// ───────────────────────── Binarios ─────────────────────────

const uploads = makeQueue(BLOB_CONCURRENCY, 'pendingUploads', uploadBlob)
const downloads = makeQueue(BLOB_CONCURRENCY, 'pendingDownloads', downloadBlob)

async function uploadBlob(id: string) {
  const s = session
  if (!s || !isOnline()) return // se reintenta en scanBlobs al volver la conexión
  const rec = await db.blobs.get(id)
  if (!rec || rec.synced) return
  const meta = await getDoc(blobMeta(s.uid, id))
  if (!meta.exists()) {
    const chunks = Math.max(1, Math.ceil(rec.size / CHUNK_BYTES))
    for (let i = 0; i < chunks; i++) {
      if (session !== s) return
      const data = await blobToBase64(rec.blob.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES))
      await setDoc(doc(blobChunks(s.uid, id), String(i)), { data })
    }
    // El meta se escribe al final: su existencia indica que el binario está completo.
    await setDoc(blobMeta(s.uid, id), { mime: rec.mime, size: rec.size, chunks, updatedAt: rec.updatedAt })
  }
  await db.blobs.update(id, { synced: true })
}

async function deleteRemoteBlob(uid: string, id: string) {
  if (!fs) return
  const snap = await getDocs(blobChunks(uid, id))
  const refs = snap.docs.map((d) => d.ref)
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const b = writeBatch(fs)
    refs.slice(i, i + BATCH_LIMIT).forEach((r) => b.delete(r))
    await b.commit()
  }
  await deleteDoc(blobMeta(uid, id))
}

async function downloadBlob(id: string) {
  const s = session
  if (!s || !isOnline()) return
  if (await db.blobs.get(id)) return
  const meta = await getDoc(blobMeta(s.uid, id))
  if (!meta.exists()) {
    s.missingRemote.add(id) // aún no subido desde el otro dispositivo
    return
  }
  const m = meta.data() as { mime?: string; size?: number; chunks?: number; updatedAt?: number }
  const snap = await getDocs(blobChunks(s.uid, id))
  const parts = snap.docs
    .map((d) => ({ i: Number(d.id), data: String(d.get('data') ?? '') }))
    .sort((a, b) => a.i - b.i)
  if (m.chunks !== undefined && parts.length < m.chunks) {
    s.missingRemote.add(id)
    return
  }
  const blob = new Blob(parts.map((p) => base64ToBytes(p.data)), { type: m.mime ?? '' })
  if (session !== s) return
  s.missingRemote.delete(id)
  await db.blobs.put({
    id,
    blob,
    mime: m.mime ?? blob.type,
    size: m.size ?? blob.size,
    updatedAt: m.updatedAt ?? Date.now(),
    synced: true,
  })
}

/** Programa (con debounce) la descarga de binarios referenciados que faltan localmente. */
function scheduleDownloads() {
  const s = session
  if (!s) return
  if (s.dlTimer) clearTimeout(s.dlTimer)
  s.dlTimer = setTimeout(() => {
    s.dlTimer = null
    void findMissingBlobs().catch((e) => console.warn('[sync] descargas', e))
  }, 1500)
}

async function findMissingBlobs() {
  if (!session) return
  const ids = new Set<string>()
  for (const t of BLOB_TABLES) {
    const rows = await table(t).toArray()
    for (const r of rows) if (!r.deleted && r.blobId) ids.add(r.blobId)
  }
  const list = [...ids]
  const have = await db.blobs.bulkGet(list)
  list.forEach((id, i) => !have[i] && downloads.add(id))
}

/** Revisa subidas pendientes (synced !== true) y descargas faltantes. */
async function scanBlobs() {
  const s = session
  if (!s) return
  for (const t of BLOB_TABLES) {
    const rows = await table(t).toArray()
    const alive = rows.filter((r) => !r.deleted && r.blobId)
    const blobs = await db.blobs.bulkGet(alive.map((r) => r.blobId!))
    alive.forEach((r, i) => {
      const b = blobs[i]
      // Sólo subir si el registro dueño ya está en el servidor.
      if (b && !b.synced && s.remote.has(`${t}/${r.id}`)) uploads.add(b.id)
    })
  }
  await findMissingBlobs()
}

// ───────────────────────── Ciclo de vida ─────────────────────────

const onConnectivity = () => {
  updateStatus()
  if (isOnline() && session) void scanBlobs()
}

function stopSession() {
  const s = session
  if (!s) return
  s.alive = false
  s.unsubs.forEach((u) => u())
  if (s.timer) clearTimeout(s.timer)
  if (s.dlTimer) clearTimeout(s.dlTimer)
  uploads.clear()
  downloads.clear()
  session = null
}

async function startSession(user: User) {
  stopSession()
  // Si cambió la cuenta en este dispositivo, los binarios deben volver a subirse.
  try {
    const last = localStorage.getItem('ef-sync-uid')
    if (last && last !== user.uid) await db.blobs.toCollection().modify({ synced: false })
    localStorage.setItem('ef-sync-uid', user.uid)
  } catch {
    /* sin almacenamiento */
  }

  const s: Session = {
    uid: user.uid,
    unsubs: [],
    merged: new Set(),
    remote: new Map(),
    pending: new Map(),
    timer: null,
    chains: new Map(),
    dlTimer: null,
    missingRemote: new Set(),
    alive: true,
  }
  session = s
  setSync({
    user: { uid: user.uid, email: user.email, name: user.displayName, photoURL: user.photoURL },
    error: null,
    lastSyncAt: loadLastSync(),
  })
  updateStatus()

  for (const t of SYNC_TABLES) {
    s.unsubs.push(
      onSnapshot(userCol(s.uid, t), { includeMetadataChanges: true }, (snap) => onTableSnapshot(t, snap), fail) as Unsubscribe,
    )
  }
  // Cuando aparece/cambia el meta de un binario, reintentar descargas pendientes.
  s.unsubs.push(
    onSnapshot(userCol(s.uid, 'blobs'), (snap) => {
      if (snap.docChanges().some((c) => c.type !== 'removed' && s.missingRemote.has(c.doc.id))) {
        s.missingRemote.clear()
        scheduleDownloads()
      }
    }, (e) => console.warn('[sync] blobs', e)),
  )
  s.unsubs.push(onLocalChange((t, id) => queuePush(t, id)) as unknown as () => void)
}

/** Arranca la escucha de sesión. Idempotente. */
export async function start() {
  if (started) return
  started = true
  try {
    init()
  } catch (e) {
    setSync({ status: 'error', error: describeError(e), initializing: false })
    return
  }
  window.addEventListener('online', onConnectivity)
  window.addEventListener('offline', onConnectivity)
  getRedirectResult(auth!).catch((e) => setSync({ error: describeError(e) }))
  onAuthStateChanged(auth!, (user) => {
    setSync({ initializing: false })
    if (user) void startSession(user).catch(fail)
    else {
      stopSession()
      setSync({ user: null, error: null })
      updateStatus()
    }
  })
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true)

export async function signIn() {
  await start()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  setSync({ error: null })
  // En la PWA instalada los popups no son confiables: usar redirección.
  if (isStandalone()) return signInWithRedirect(auth!, provider)
  try {
    await signInWithPopup(auth!, provider)
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      return signInWithRedirect(auth!, provider)
    }
    throw new Error(describeError(e))
  }
}

export async function signOut() {
  if (!auth) return
  if (session?.timer) await flush()
  stopSession()
  await fbSignOut(auth)
  setSync({ user: null, error: null, pendingWrites: 0 })
  updateStatus()
}

/** Fuerza una reconciliación completa contra el servidor. */
export async function syncNow() {
  const s = session
  if (!s) return
  setSync({ error: null, status: 'syncing' })
  try {
    await flush()
    for (const t of SYNC_TABLES) {
      const snap = await getDocsFromServer(userCol(s.uid, t))
      if (session !== s) return
      const rows: Row[] = snap.docs.map((d) => {
        const data = d.data() as Row
        const row = { ...data, id: d.id, updatedAt: Number(data.updatedAt) || 0 } as Row
        s.remote.set(`${t}/${row.id}`, row.updatedAt)
        return row
      })
      await serial(t, async () => {
        await applyRemote(t, rows)
        await pushLocalNewer(t)
        s.merged.add(t)
      })
    }
    s.missingRemote.clear()
    await scanBlobs()
    saveLastSync(Date.now())
  } catch (e) {
    fail(e)
  }
  updateStatus()
}
