import clsx from 'clsx'
import type { HTMLAttributes, ReactNode } from 'react'
import { useSubjectMap } from '../../lib/hooks'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('rounded-xl border border-line bg-surface', className)} {...rest} />
}

type Tone = 'neutral' | 'accent' | 'danger' | 'warn' | 'ok' | 'hl'
const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  accent: 'bg-accent-soft text-accent',
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  hl: 'bg-hl-soft text-ink',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium [&>svg]:size-3.5',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Chip con el color de la materia. Si no hay materia muestra "General". */
export function SubjectChip({ subjectId, className }: { subjectId?: string; className?: string }) {
  const map = useSubjectMap()
  const s = subjectId ? map.get(subjectId) : undefined
  return (
    <span
      className={clsx(
        'inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border border-line px-2 text-xs font-medium text-ink-2',
        className,
      )}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: s?.color ?? 'rgb(var(--ink-3))' }} />
      <span className="truncate">{s ? s.code || s.name : 'General'}</span>
    </span>
  )
}

export function ProgressBar({
  value,
  tone = 'accent',
  className,
  label,
}: {
  value: number // 0..1
  tone?: 'accent' | 'ok' | 'warn' | 'danger'
  className?: string
  label?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}
    >
      <div
        className={clsx('h-full rounded-full transition-[width] duration-300', {
          accent: 'bg-accent',
          ok: 'bg-ok',
          warn: 'bg-warn',
          danger: 'bg-danger',
        }[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-10 text-center',
        className,
      )}
    >
      {icon && <div className="mb-3 text-ink-3 [&>svg]:size-7">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Cabecera de página: título serif + descripción + acciones. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-4xl leading-none tracking-tight sm:text-5xl">{title}</h1>
        {description && <p className="mt-2 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Barra de filtros que envuelve en móvil. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mb-5 flex flex-wrap items-center gap-2', className)}>{children}</div>
}
