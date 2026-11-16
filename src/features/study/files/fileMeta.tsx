import { AudioLines, File, FileText, Image, ListChecks, NotebookText, Presentation, ScrollText } from 'lucide-react'
import { AUDIO_ACCEPT, isAudioFile } from '../audio/utils'
import type { ReactNode } from 'react'
import type { FileCategory } from '../../../lib/types'

export const CATEGORIES: { value: FileCategory; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'slides', label: 'Diapositivas' },
  { value: 'exercises', label: 'Guía de ejercicios' },
  { value: 'past_exam', label: 'Examen anterior' },
  { value: 'summary', label: 'Resumen' },
  { value: 'photo', label: 'Foto de apuntes' },
  { value: 'audio', label: 'Audio' },
  { value: 'other', label: 'Otro' },
]

export const categoryLabel = (c: FileCategory) => CATEGORIES.find((x) => x.value === c)?.label ?? 'Otro'

export function CategoryIcon({ category, className }: { category: FileCategory; className?: string }) {
  const icons: Record<FileCategory, ReactNode> = {
    pdf: <FileText className={className} />,
    slides: <Presentation className={className} />,
    exercises: <ListChecks className={className} />,
    past_exam: <ScrollText className={className} />,
    summary: <NotebookText className={className} />,
    photo: <Image className={className} />,
    audio: <AudioLines className={className} />,
    other: <File className={className} />,
  }
  return <>{icons[category]}</>
}

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? ''

export const isImage = (mime: string, name = '') =>
  mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg', 'heic'].includes(ext(name))

export const isAudio = (mime: string, name = '') => isAudioFile({ type: mime, name })

export const isPdf = (mime: string, name = '') => mime === 'application/pdf' || ext(name) === 'pdf'

/** Adivina la categoría por nombre, tipo MIME y extensión. */
export function guessCategory(file: { name: string; type: string }): FileCategory {
  const n = file.name.toLowerCase()
  const e = ext(n)
  if (/examen|parcial|final|recuperatorio|exam/.test(n)) return 'past_exam'
  if (/gu[ií]a|ejercicio|practica|práctica|tp\d|problemas/.test(n)) return 'exercises'
  if (/resumen|summary|apunte/.test(n) && !isImage(file.type, n)) return 'summary'
  if (isAudioFile(file)) return 'audio'
  if (isImage(file.type, n)) return 'photo'
  if (['ppt', 'pptx', 'odp', 'key'].includes(e) || file.type.includes('presentation')) return 'slides'
  if (isPdf(file.type, n)) return 'pdf'
  return 'other'
}

/** Tipos aceptados por el selector de archivos (el arrastre acepta cualquiera). */
export const ACCEPT =
  '.pdf,.ppt,.pptx,.odp,.key,.doc,.docx,.odt,.rtf,.txt,.md,.xls,.xlsx,.ods,.csv,image/*,application/pdf,' + AUDIO_ACCEPT
