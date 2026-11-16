import { create } from 'zustand'

export type RepeatMode = 'off' | 'loop-one' | 'double-next'
export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const

/**
 * Estado del reproductor flotante. El elemento <audio> real vive en
 * features/study/PlayerBar.tsx; cualquier pantalla puede llamar a `play`.
 */
interface PlayerState {
  queue: string[] // ids de AudioItem en orden de repaso
  currentId: string | null
  playing: boolean
  speed: number
  repeat: RepeatMode
  pass: 1 | 2 // para "Secuencia 2x & Siguiente"
  play: (id: string, queue?: string[]) => void
  setQueue: (queue: string[]) => void
  setPlaying: (p: boolean) => void
  toggle: () => void
  setSpeed: (s: number) => void
  setRepeat: (r: RepeatMode) => void
  setPass: (p: 1 | 2) => void
  next: () => void
  prev: () => void
  stop: () => void
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  currentId: null,
  playing: false,
  speed: 1,
  repeat: 'off',
  pass: 1,
  play: (id, queue) => set({ currentId: id, playing: true, pass: 1, ...(queue ? { queue } : {}) }),
  setQueue: (queue) => set({ queue }),
  setPlaying: (playing) => set({ playing }),
  toggle: () => set({ playing: !get().playing }),
  setSpeed: (speed) => set({ speed }),
  setRepeat: (repeat) => set({ repeat, pass: 1 }),
  setPass: (pass) => set({ pass }),
  next: () => {
    const { queue, currentId } = get()
    if (!queue.length) return
    const i = currentId ? queue.indexOf(currentId) : -1
    set({ currentId: queue[(i + 1) % queue.length], pass: 1, playing: true })
  },
  prev: () => {
    const { queue, currentId } = get()
    if (!queue.length) return
    const i = currentId ? queue.indexOf(currentId) : -1
    // Si el actual no está en la cola (filtro cambiado), ir al primero en vez del penúltimo.
    const j = i === -1 ? 0 : (i - 1 + queue.length) % queue.length
    set({ currentId: queue[j], pass: 1, playing: true })
  },
  stop: () => set({ currentId: null, playing: false, pass: 1 }),
}))
