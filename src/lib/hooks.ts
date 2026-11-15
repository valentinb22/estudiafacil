import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { alive, byOrder, db } from './db'
import { useUI } from './store'
import type { AudioItem, Exam, FileItem, Note, Resource, Subject, Task } from './types'

const EMPTY: never[] = []

/** Materias vivas ordenadas. */
export function useSubjects(): Subject[] {
  return useLiveQuery(async () => alive(await db.subjects.toArray()).sort(byOrder), []) ?? EMPTY
}

export function useSubjectMap(): Map<string, Subject> {
  const subjects = useSubjects()
  return new Map(subjects.map((s) => [s.id, s]))
}

/** Aplica el filtro global por materia (null = todas). */
function useFiltered<T extends { subjectId?: string }>(rows: T[] | undefined): T[] {
  const subjectFilter = useUI((s) => s.subjectFilter)
  if (!rows) return EMPTY
  return subjectFilter ? rows.filter((r) => r.subjectId === subjectFilter) : rows
}

export const useTasks = (): Task[] =>
  useFiltered(useLiveQuery(async () => alive(await db.tasks.toArray()), []))
export const useExams = (): Exam[] =>
  useFiltered(useLiveQuery(async () => alive(await db.exams.toArray()).sort((a, b) => a.at - b.at), []))
export const useNotes = (): Note[] =>
  useFiltered(useLiveQuery(async () => alive(await db.notes.toArray()), []))
export const useAudios = (): AudioItem[] =>
  useFiltered(useLiveQuery(async () => alive(await db.audios.toArray()).sort(byOrder), []))
export const useFiles = (): FileItem[] =>
  useFiltered(useLiveQuery(async () => alive(await db.files.toArray()).sort(byOrder), []))
export const useResources = (): Resource[] =>
  useFiltered(useLiveQuery(async () => alive(await db.resources.toArray()).sort(byOrder), []))

/** Hora actual que se refresca cada `ms` (para cuentas regresivas). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

/** URL de objeto para un blob guardado (se revoca al desmontar). */
export function useBlobUrl(blobId?: string): string | undefined {
  const rec = useLiveQuery(async () => (blobId ? db.blobs.get(blobId) : undefined), [blobId])
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!rec?.blob) {
      setUrl(undefined)
      return
    }
    const u = URL.createObjectURL(rec.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [rec])
  return url
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const h = () => setM(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [q])
  return m
}
