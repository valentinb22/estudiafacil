// Modelo de datos. Todo registro sincronizable extiende Base.
// `deleted` = borrado lógico (para propagar borrados en la sincronización).
// `order` = posición manual en listas reordenables.

export interface Base {
  id: string
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

/** 0 = domingo … 6 = sábado (igual que Date.getDay()) */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Una franja de cursada: un día de la semana con hora de inicio y fin. */
export interface ScheduleSlot {
  id: string
  day: Weekday
  start: string // "HH:MM"
  end: string // "HH:MM"
  room?: string // aula específica de esa franja (si difiere del aula de la materia)
}

export interface Subject extends Base {
  name: string
  code: string
  color: string // hex
  /** Docentes de la materia (titular, adjunto, ayudantes…). */
  professors?: string[]
  /** @deprecated un solo docente, de versiones anteriores; usar `professorsOf()`. */
  professor?: string
  room?: string
  /** Horarios estructurados por día. */
  slots?: ScheduleSlot[]
  /** @deprecated texto libre de versiones anteriores; sólo se muestra si no hay `slots`. */
  schedule?: string
  /** @deprecated ya no se pide; se conserva para datos antiguos. */
  credits?: number
  order: number
}

export type TaskStatus = 'pending' | 'in_progress' | 'done'
export type Priority = 'high' | 'medium' | 'low'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Task extends Base {
  subjectId?: string
  title: string
  description?: string
  dueAt: number // epoch ms (fecha + hora)
  status: TaskStatus
  priority: Priority
  remindBeforeMin: number // minutos antes del vencimiento
  checklist: ChecklistItem[]
  completedAt?: number
}

export type ExamType = 'parcial' | 'final' | 'quiz' | 'tp' | 'recuperatorio'
export type TopicLevel = 'unseen' | 'review' | 'mastered'

export interface ExamTopic {
  id: string
  name: string
  level: TopicLevel
}

export interface Exam extends Base {
  subjectId?: string
  title: string
  type: ExamType
  at: number // epoch ms
  location?: string
  weight?: number // % sobre la nota final
  targetGrade?: number
  notes?: string
  topics: ExamTopic[]
}

export interface Note extends Base {
  subjectId?: string
  title: string
  body: string
  tags: string[]
  pinned: boolean
}

export interface AudioItem extends Base {
  subjectId?: string
  title: string
  blobId: string
  mime: string
  size: number
  durationSec?: number
  script?: string // texto/guion asociado
  order: number
}

export type FileCategory = 'pdf' | 'slides' | 'exercises' | 'past_exam' | 'summary' | 'photo' | 'audio' | 'other'

export interface FileItem extends Base {
  subjectId?: string
  name: string
  category: FileCategory
  blobId: string
  mime: string
  size: number
  order: number
}

export type ResourceType = 'video' | 'article' | 'simulator' | 'book' | 'document'

export interface Resource extends Base {
  subjectId?: string
  title: string
  url: string
  type: ResourceType
  description?: string
  order: number
}

// Binarios (audios y archivos). Se guardan aparte de sus metadatos.
export interface BlobRecord {
  id: string
  blob: Blob
  mime: string
  size: number
  updatedAt: number
  synced?: boolean
}

export type SyncTable = 'subjects' | 'tasks' | 'exams' | 'notes' | 'audios' | 'files' | 'resources'
