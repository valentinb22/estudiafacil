import clsx from 'clsx'
import {
  BookOpen, CalendarClock, ClipboardCheck, Headphones, LayoutDashboard, Moon, NotebookPen, Sun, Timer,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Bell } from '../../features/notifications/Bell'
import { SyncButton } from '../../features/sync/SyncButton'
import { useUI } from '../../lib/store'
import { IconButton } from '../ui/Button'
import { GlobalSubjectFilter } from '../ui/SubjectSelect'

export const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/materias', label: 'Materias', icon: BookOpen },
  { to: '/tareas', label: 'Tareas', icon: ClipboardCheck },
  { to: '/examenes', label: 'Exámenes', icon: CalendarClock },
  { to: '/notas', label: 'Notas', icon: NotebookPen },
  { to: '/estudio', label: 'Estudio', icon: Headphones },
] as const

function Logo() {
  return (
    <NavLink to="/" className="flex shrink-0 items-center gap-2" aria-label="EstudiaFácil, inicio">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8" />
      <span className="hidden font-serif text-[22px] leading-none tracking-tight sm:inline">
        Estudia<span className="italic text-accent">Fácil</span>
      </span>
    </NavLink>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useUI((s) => s.theme)
  const toggleTheme = useUI((s) => s.toggleTheme)
  const openFocus = useUI((s) => s.openFocus)

  return (
    <div className="min-h-dvh pb-28">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Logo />
          <nav aria-label="Secciones" className="ml-4 hidden items-center gap-0.5 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={'end' in n}
                className={({ isActive }) =>
                  clsx(
                    'flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors',
                    isActive ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink',
                  )
                }
              >
                <n.icon className="size-4" />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <GlobalSubjectFilter className="hidden w-44 md:block" />
            <IconButton label="Modo Focus Pomodoro" onClick={() => openFocus()}>
              <Timer />
            </IconButton>
            <Bell />
            <IconButton
              label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </IconButton>
            <SyncButton />
          </div>
        </div>
        {/* Navegación móvil / tablet: barra desplazable */}
        <nav aria-label="Secciones" className="scrollbar-none overflow-x-auto border-t border-line lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-1.5 sm:px-5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={'end' in n}
                className={({ isActive }) =>
                  clsx(
                    'flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium',
                    isActive ? 'bg-surface text-ink ring-1 ring-line' : 'text-ink-2',
                  )
                }
              >
                <n.icon className="size-4" />
                {n.label}
              </NavLink>
            ))}
            <GlobalSubjectFilter className="ml-auto w-40 shrink-0 pl-2 md:hidden" />
          </div>
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        {children}
      </main>
    </div>
  )
}
