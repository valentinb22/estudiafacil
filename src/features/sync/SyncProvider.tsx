import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { startSync } from './api'
import { isCloudConfigured } from './config'
import { setSync } from './syncStore'

/**
 * Arranca la sincronización en la nube si Firebase está configurado.
 * Firebase se carga con import() dinámico, así que sin configuración nunca se descarga.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isCloudConfigured) {
      setSync({ status: 'disabled', initializing: false })
      return
    }
    startSync().catch((e: unknown) => {
      console.error('[sync] no se pudo iniciar', e)
      setSync({
        status: 'error',
        initializing: false,
        error: 'No se pudo cargar el módulo de sincronización. Revisa tu conexión.',
      })
    })
  }, [])
  return <>{children}</>
}
