import type { Subject } from './types'

/** Lista de docentes de una materia (incluye el campo único de versiones anteriores). */
export function professorsOf(s: Pick<Subject, 'professors' | 'professor'>): string[] {
  if (s.professors?.length) return s.professors
  return s.professor ? [s.professor] : []
}
