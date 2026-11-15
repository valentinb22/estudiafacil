import { create } from 'zustand'

type Theme = 'light' | 'dark'

const readTheme = (): Theme => {
  try {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

interface UIState {
  theme: Theme
  toggleTheme: () => void
  /** Filtro global por materia; null = todas */
  subjectFilter: string | null
  setSubjectFilter: (id: string | null) => void
  /** Modo Focus Pomodoro: abierto y examen asociado opcional */
  focusOpen: boolean
  focusExamId: string | null
  openFocus: (examId?: string | null) => void
  closeFocus: () => void
}

export const useUI = create<UIState>((set, get) => ({
  theme: readTheme(),
  toggleTheme: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#12151A' : '#F7F5F0')
    try {
      localStorage.setItem('ef-theme', theme)
    } catch {
      /* almacenamiento no disponible */
    }
    set({ theme })
  },
  subjectFilter: null,
  setSubjectFilter: (subjectFilter) => set({ subjectFilter }),
  focusOpen: false,
  focusExamId: null,
  openFocus: (examId = null) => set({ focusOpen: true, focusExamId: examId }),
  closeFocus: () => set({ focusOpen: false }),
}))
