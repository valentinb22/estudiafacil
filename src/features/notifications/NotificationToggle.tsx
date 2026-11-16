import { BellOff, BellRing, BellPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'

type PermState = NotificationPermission | 'unsupported'

const read = (): PermState => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

/** Botón para activar las notificaciones del navegador, mostrando el estado actual. */
export function NotificationToggle({ className }: { className?: string }) {
  const [perm, setPerm] = useState<PermState>(read)

  // El usuario puede cambiar el permiso desde el navegador: refrescamos al volver a la pestaña.
  useEffect(() => {
    const h = () => setPerm(read())
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [])

  const ask = async () => {
    if (typeof Notification === 'undefined') return
    try {
      const r = await Notification.requestPermission()
      setPerm(r)
      if (r === 'granted') {
        try {
          new Notification('Notificaciones activadas', {
            body: 'Te avisaremos antes de tus entregas y exámenes.',
            icon: `${import.meta.env.BASE_URL}favicon.svg`,
          })
        } catch {
          /* sin soporte directo */
        }
      }
    } catch {
      setPerm(read())
    }
  }

  if (perm === 'granted')
    return (
      <p role="status" className={`inline-flex h-10 items-center gap-2 text-[13px] text-ok ${className ?? ''}`}>
        <BellRing className="size-4" aria-hidden />
        Notificaciones activas
      </p>
    )
  if (perm === 'denied')
    return (
      <p role="status" className={`inline-flex min-h-10 items-center gap-2 text-[13px] text-ink-2 ${className ?? ''}`}>
        <BellOff className="size-4 shrink-0 text-danger" aria-hidden />
        Bloqueadas. Actívalas desde la configuración del navegador.
      </p>
    )
  if (perm === 'unsupported')
    return (
      <p role="status" className={`inline-flex min-h-10 items-center gap-2 text-[13px] text-ink-3 ${className ?? ''}`}>
        <BellOff className="size-4 shrink-0" aria-hidden />
        Tu navegador no admite notificaciones.
      </p>
    )
  return (
    <Button size="md" icon={<BellPlus />} onClick={ask} className={className}>
      Activar notificaciones
    </Button>
  )
}
