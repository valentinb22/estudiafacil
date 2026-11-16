import { create } from 'zustand'

export type SyncStatus = 'disabled' | 'signed_out' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncUser {
  uid: string
  email: string | null
  name: string | null
  photoURL: string | null
}

interface SyncState {
  status: SyncStatus
  /** true mientras se resuelve la sesión guardada al arrancar */
  initializing: boolean
  user: SyncUser | null
  lastSyncAt: number | null
  error: string | null
  pendingUploads: number
  pendingDownloads: number
  /** escrituras de registros aún no confirmadas por el servidor */
  pendingWrites: number
}

export const useSync = create<SyncState>(() => ({
  status: 'signed_out',
  initializing: true,
  user: null,
  lastSyncAt: null,
  error: null,
  pendingUploads: 0,
  pendingDownloads: 0,
  pendingWrites: 0,
}))

export const setSync = (patch: Partial<SyncState>) => useSync.setState(patch)

export const bump = (key: 'pendingUploads' | 'pendingDownloads' | 'pendingWrites', delta: number) =>
  useSync.setState((s) => ({ [key]: Math.max(0, s[key] + delta) }) as Partial<SyncState>)

const LAST_KEY = 'ef-last-sync'
export const loadLastSync = (): number | null => {
  try {
    const v = Number(localStorage.getItem(LAST_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}
export const saveLastSync = (t: number) => {
  setSync({ lastSyncAt: t })
  try {
    localStorage.setItem(LAST_KEY, String(t))
  } catch {
    /* sin almacenamiento */
  }
}
