import type { Note } from '../../lib/types'

/** "#Física, fórmulas  repaso" → ["física", "fórmulas", "repaso"] */
export function parseTags(input: string): string[] {
  const out: string[] = []
  for (const raw of input.split(/[,\s]+/)) {
    const t = raw.replace(/^#+/, '').trim().toLowerCase()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

const fold = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '')

/** Separa la búsqueda en etiquetas (#tag) y texto libre. */
export function parseQuery(q: string) {
  const tags: string[] = []
  const words: string[] = []
  for (const tok of q.trim().split(/\s+/)) {
    if (!tok) continue
    if (tok.startsWith('#')) {
      const t = tok.replace(/^#+/, '').toLowerCase()
      if (t) tags.push(t)
    } else words.push(fold(tok))
  }
  return { tags, words }
}

export function matches(note: Note, q: ReturnType<typeof parseQuery>): boolean {
  if (q.tags.length && !q.tags.every((t) => note.tags.some((nt) => fold(nt) === fold(t)))) return false
  if (!q.words.length) return true
  const hay = fold(`${note.title}\n${note.body}\n${note.tags.join(' ')}`)
  return q.words.every((w) => hay.includes(w))
}

/** Alterna una etiqueta dentro del texto de búsqueda. */
export function toggleTagInQuery(q: string, tag: string): string {
  const tokens = q.trim().split(/\s+/).filter(Boolean)
  const key = `#${tag.toLowerCase()}`
  const has = tokens.some((t) => t.toLowerCase() === key)
  return (has ? tokens.filter((t) => t.toLowerCase() !== key) : [...tokens, key]).join(' ')
}

export const sortNotes = (a: Note, b: Note) =>
  Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt
