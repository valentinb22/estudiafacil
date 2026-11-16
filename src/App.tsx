import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { FocusMode } from './features/focus/FocusMode'
import { NotificationWatcher } from './features/notifications/NotificationWatcher'
import { PlayerBar } from './features/study/PlayerBar'
import { SyncProvider } from './features/sync/SyncProvider'

// Secciones cargadas bajo demanda: el panel inicial queda liviano.
const SubjectsPage = lazy(() => import('./features/subjects/SubjectsPage').then((m) => ({ default: m.SubjectsPage })))
const TasksPage = lazy(() => import('./features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })))
const ExamsPage = lazy(() => import('./features/exams/ExamsPage').then((m) => ({ default: m.ExamsPage })))
const NotesPage = lazy(() => import('./features/notes/NotesPage').then((m) => ({ default: m.NotesPage })))
const SchedulePage = lazy(() => import('./features/schedule/SchedulePage').then((m) => ({ default: m.SchedulePage })))
const StudyPage = lazy(() => import('./features/study/StudyPage').then((m) => ({ default: m.StudyPage })))

export default function App() {
  return (
    <HashRouter>
      <SyncProvider>
        <AppShell>
          <Suspense fallback={<div className="h-64" aria-busy="true" />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/materias" element={<SubjectsPage />} />
              <Route path="/horarios" element={<SchedulePage />} />
              <Route path="/tareas" element={<TasksPage />} />
              <Route path="/examenes" element={<ExamsPage />} />
              <Route path="/notas" element={<NotesPage />} />
              <Route path="/estudio" element={<StudyPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppShell>
        <PlayerBar />
        <FocusMode />
        <NotificationWatcher />
      </SyncProvider>
    </HashRouter>
  )
}
