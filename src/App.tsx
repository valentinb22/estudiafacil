import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ExamsPage } from './features/exams/ExamsPage'
import { FocusMode } from './features/focus/FocusMode'
import { NotesPage } from './features/notes/NotesPage'
import { NotificationWatcher } from './features/notifications/NotificationWatcher'
import { StudyPage } from './features/study/StudyPage'
import { PlayerBar } from './features/study/PlayerBar'
import { SubjectsPage } from './features/subjects/SubjectsPage'
import { SyncProvider } from './features/sync/SyncProvider'
import { TasksPage } from './features/tasks/TasksPage'

export default function App() {
  return (
    <HashRouter>
      <SyncProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/materias" element={<SubjectsPage />} />
            <Route path="/tareas" element={<TasksPage />} />
            <Route path="/examenes" element={<ExamsPage />} />
            <Route path="/notas" element={<NotesPage />} />
            <Route path="/estudio" element={<StudyPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
        <PlayerBar />
        <FocusMode />
        <NotificationWatcher />
      </SyncProvider>
    </HashRouter>
  )
}
