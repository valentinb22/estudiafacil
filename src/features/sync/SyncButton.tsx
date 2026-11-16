import clsx from 'clsx'
import {
  AlertTriangle, CloudCog, CloudDownload, CloudOff, CloudUpload, HardDrive, LogOut, RefreshCw, Smartphone,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { signInWithGoogle, signOutCloud, syncNow } from './api'
import type { SyncStatus } from './syncStore'
import { useSync } from './syncStore'

const STATUS: Record<SyncStatus, { label: string; dot: string }> = {
  disabled: { label: 'Nube no configurada', dot: 'bg-ink-3' },
  signed_out: { label: 'Sin sesión', dot: 'bg-ink-3' },
  syncing: { label: 'Sincronizando…', dot: 'bg-accent animate-pulse motion-reduce:animate-none' },
  synced: { label: 'Sincronizado', dot: 'bg-ok' },
  offline: { label: 'Sin conexión: los cambios se guardan y se subirán luego', dot: 'bg-warn' },
  error: { label: 'Error de sincronización', dot: 'bg-danger' },
}

const fmtTime = (t: number | null) => {
  if (!t) return 'Nunca'
  const d = new Date(t)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? `Hoy, ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  )
}

function Avatar({ name, email, photoURL, className }: { name: string | null; email: string | null; photoURL: string | null; className?: string }) {
  const [broken, setBroken] = useState(false)
  const initial = (name || email || '?').trim().charAt(0).toUpperCase()
  return photoURL && !broken ? (
    <img
      src={photoURL}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={clsx('rounded-full object-cover', className)}
    />
  ) : (
    <span className={clsx('flex items-center justify-center rounded-full bg-accent-soft font-semibold text-accent', className)}>
      {initial}
    </span>
  )
}

export function SyncButton() {
  const status = useSync((s) => s.status)
  const user = useSync((s) => s.user)
  const initializing = useSync((s) => s.initializing)
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  if (user) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Cuenta y sincronización: ${STATUS[status].label}`}
          title={STATUS[status].label}
          className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2"
        >
          <Avatar {...user} className="size-7 text-[13px]" />
          <span
            aria-hidden
            className={clsx('absolute bottom-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-bg', STATUS[status].dot)}
          />
        </button>
        <AccountModal open={open} onClose={close} />
      </>
    )
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Sincronizar con la nube"
        title={status === 'disabled' ? 'Nube no configurada' : 'Sincronizar con la nube'}
        disabled={initializing && status !== 'disabled'}
        className="size-10 px-0 sm:h-9 sm:w-auto sm:px-3"
        icon={status === 'disabled' ? <CloudOff /> : <CloudUpload />}
      >
        <span className="hidden sm:inline">Sincronizar</span>
      </Button>
      <SignInModal open={open} onClose={close} />
    </>
  )
}

function SignInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useSync((s) => s.status)
  const storeError = useSync((s) => s.error)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const disabled = status === 'disabled'
  const error = err ?? storeError

  const go = async () => {
    setBusy(true)
    setErr(null)
    try {
      await signInWithGoogle()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sincroniza tus apuntes"
      size="sm"
      footer={
        disabled ? (
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Entendido
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Ahora no
            </Button>
            <Button variant="primary" onClick={go} disabled={busy} icon={<GoogleMark />} data-autofocus>
              {busy ? 'Conectando…' : 'Continuar con Google'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm text-ink-2">
        <div className="flex gap-3">
          <HardDrive className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
          <p>
            <strong className="font-medium text-ink">Ahora todo se guarda en este dispositivo.</strong> Funciona sin
            conexión y nadie más ve tus datos.
          </p>
        </div>
        <div className="flex gap-3">
          <Smartphone className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
          <p>
            <strong className="font-medium text-ink">Con la nube</strong> tus materias, tareas, exámenes, notas,
            audios y archivos se copian a tu cuenta y se mantienen al día en todos tus dispositivos.
          </p>
        </div>
        {disabled && (
          <div className="flex gap-3 rounded-lg bg-surface-2 p-3">
            <CloudCog className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
            <p>
              La nube no está configurada en esta instalación. La app sigue funcionando completa en modo local.
              Para activarla, quien administra la app debe configurar Firebase (ver <code className="font-mono text-xs">docs/SYNC.md</code>).
            </p>
          </div>
        )}
        {error && !disabled && (
          <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft p-3 text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

function AccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSync()
  const [busy, setBusy] = useState<'sync' | 'out' | null>(null)
  if (!s.user) return null

  const run = async (kind: 'sync' | 'out') => {
    setBusy(kind)
    try {
      if (kind === 'sync') await syncNow()
      else {
        await signOutCloud()
        onClose()
      }
    } finally {
      setBusy(null)
    }
  }

  const transfers = s.pendingUploads + s.pendingDownloads

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cuenta y sincronización"
      size="sm"
      footer={
        <>
          <Button variant="ghost" icon={<LogOut />} onClick={() => run('out')} disabled={busy !== null}>
            Cerrar sesión
          </Button>
          <Button
            variant="primary"
            data-autofocus
            icon={<RefreshCw className={clsx(busy === 'sync' && 'animate-spin motion-reduce:animate-none')} />}
            onClick={() => run('sync')}
            disabled={busy !== null || s.status === 'offline'}
          >
            Sincronizar ahora
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <Avatar {...s.user} className="size-10 text-base" />
          <div className="min-w-0">
            {s.user.name && <p className="truncate font-medium">{s.user.name}</p>}
            <p className="truncate text-ink-2">{s.user.email}</p>
          </div>
        </div>
        <dl className="divide-y divide-line rounded-xl border border-line">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-ink-2">Estado</dt>
            <dd className="flex min-w-0 items-center gap-2 text-right font-medium" aria-live="polite">
              <span aria-hidden className={clsx('size-2 shrink-0 rounded-full', STATUS[s.status].dot)} />
              <span className="truncate">{s.status === 'offline' ? 'Sin conexión' : STATUS[s.status].label}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-ink-2">Última sincronización</dt>
            <dd className="font-mono text-[13px] tabular-nums">{fmtTime(s.lastSyncAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="text-ink-2">Transferencias pendientes</dt>
            <dd className="flex items-center gap-3 font-mono text-[13px] tabular-nums">
              {transfers === 0 && s.pendingWrites === 0 ? (
                'Ninguna'
              ) : (
                <>
                  <span className="flex items-center gap-1" title="Subidas">
                    <CloudUpload className="size-4 text-ink-3" aria-hidden />
                    <span className="sr-only">Subidas:</span>
                    {s.pendingUploads + s.pendingWrites}
                  </span>
                  <span className="flex items-center gap-1" title="Descargas">
                    <CloudDownload className="size-4 text-ink-3" aria-hidden />
                    <span className="sr-only">Descargas:</span>
                    {s.pendingDownloads}
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>
        {s.status === 'offline' && (
          <p className="text-ink-2">Sin conexión. Tus cambios se guardan aquí y se subirán al volver a estar en línea.</p>
        )}
        {s.error && (
          <p role="alert" className="flex gap-2 rounded-lg bg-danger-soft p-3 text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {s.error}
          </p>
        )}
        <p className="text-xs text-ink-2">Al cerrar sesión tus datos siguen en este dispositivo.</p>
      </div>
    </Modal>
  )
}
