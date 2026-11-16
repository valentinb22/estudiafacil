import { create } from 'zustand'

/**
 * Archivos de audio elegidos fuera del panel de Audios (p. ej. desde el Panel General).
 * El selector de archivos se abre en el mismo gesto del usuario —los celulares no permiten
 * abrirlo después de navegar— y AudiosPanel recoge los archivos al montarse.
 */
export const usePendingAudioUpload = create<{ files: File[] | null; set: (f: File[] | null) => void }>((set) => ({
  files: null,
  set: (files) => set({ files }),
}))
