// Fachada liviana: carga el motor (y con él firebase) sólo cuando hace falta.
import { isCloudConfigured } from './config'

type Engine = typeof import('./engine')

let enginePromise: Promise<Engine> | null = null

export function loadEngine(): Promise<Engine> {
  if (!isCloudConfigured) return Promise.reject(new Error('La nube no está configurada'))
  enginePromise ??= import('./engine')
  return enginePromise
}

export const startSync = () => loadEngine().then((e) => e.start())
export const signInWithGoogle = () => loadEngine().then((e) => e.signIn())
export const signOutCloud = () => loadEngine().then((e) => e.signOut())
export const syncNow = () => loadEngine().then((e) => e.syncNow())
