import type { Exam, ExamTopic, ExamType, TopicLevel } from '../../lib/types'
import { uid } from '../../lib/db'

export const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: 'parcial', label: 'Parcial' },
  { value: 'final', label: 'Final' },
  { value: 'quiz', label: 'Quiz / Control' },
  { value: 'tp', label: 'Entrega de TP' },
  { value: 'presentacion', label: 'Presentación' },
  { value: 'recuperatorio', label: 'Recuperatorio' },
]

export const examTypeLabel = (t: ExamType) => EXAM_TYPES.find((x) => x.value === t)?.label ?? t

export const LEVELS: { value: TopicLevel; label: string }[] = [
  { value: 'unseen', label: 'Sin ver' },
  { value: 'review', label: 'Repaso' },
  { value: 'mastered', label: 'Dominado' },
]

export const levelLabel = (l: TopicLevel) => LEVELS.find((x) => x.value === l)?.label ?? l

export const nextLevel = (l: TopicLevel): TopicLevel =>
  l === 'unseen' ? 'review' : l === 'review' ? 'mastered' : 'unseen'

/** (dominados + 0,5 · en repaso) / total. null si no hay temas. */
export function preparation(exam: Pick<Exam, 'topics'>): number | null {
  const total = exam.topics.length
  if (!total) return null
  const mastered = exam.topics.filter((t) => t.level === 'mastered').length
  const review = exam.topics.filter((t) => t.level === 'review').length
  return (mastered + 0.5 * review) / total
}

/** Convierte texto pegado (una línea por tema) en temas, quitando viñetas y numeración. */
export function parseTopics(text: string): ExamTopic[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·–]+|\d+[.)-]|[a-z][.)])\s*/i, '').trim())
    .filter(Boolean)
    .map((name) => ({ id: uid(), name, level: 'unseen' as TopicLevel }))
}
