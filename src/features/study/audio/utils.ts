import { alive, byOrder, db, getBlob } from '../../../lib/db'
import type { AudioItem } from '../../../lib/types'

/** Lee un token de color de `index.css` (formato "R G B") como `rgb(R G B / a)`. */
export function tokenColor(name: string, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  return raw ? `rgb(${raw} / ${alpha})` : `rgba(128, 128, 128, ${alpha})`
}

/** Duración de un blob de audio en segundos (maneja la duración "Infinity" de WebM). */
export function readDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const a = new Audio()
    let settled = false
    const done = (v?: number) => {
      if (settled) return
      settled = true
      a.removeAttribute('src')
      URL.revokeObjectURL(url)
      resolve(v !== undefined && isFinite(v) && v > 0 ? v : undefined)
    }
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      if (a.duration === Infinity) {
        a.ontimeupdate = () => {
          a.ontimeupdate = null
          done(a.duration)
        }
        a.currentTime = 1e101
      } else done(a.duration)
    }
    a.onerror = () => done(undefined)
    setTimeout(() => done(undefined), 8000)
    a.src = url
  })
}

const EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
}
export const extFromMime = (mime: string) => EXT[mime.split(';')[0].trim()] ?? 'audio'

/** Extensiones de audio comunes (incluye notas de voz de WhatsApp/Telegram y grabadoras de celular). */
const AUDIO_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  weba: 'audio/webm',
  webm: 'audio/webm',
  flac: 'audio/flac',
  amr: 'audio/amr',
  '3gp': 'audio/3gpp',
  caf: 'audio/x-caf',
}

/**
 * Valor para <input accept>. Listar extensiones además de `audio/*` hace que Android abra el
 * selector de archivos (con sólo `audio/*` algunos celulares abren la grabadora del sistema).
 */
export const AUDIO_ACCEPT = `audio/*,${Object.keys(AUDIO_EXT).map((e) => `.${e}`).join(',')}`

const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? ''

/** ¿Es un archivo de audio? Acepta tipo MIME vacío o genérico si la extensión es de audio. */
export const isAudioFile = (f: { name: string; type: string }) =>
  f.type.startsWith('audio/') || extOf(f.name) in AUDIO_EXT

/** Tipo MIME confiable: usa el del navegador si es de audio, si no lo deduce por extensión. */
export const audioMimeOf = (f: { name: string; type: string }) =>
  f.type.startsWith('audio/') ? f.type : (AUDIO_EXT[extOf(f.name)] ?? 'audio/mpeg')

/** Título legible a partir del nombre de archivo ("clase_03-repaso.mp3" → "clase 03 repaso"). */
export const titleFromFilename = (name: string) =>
  name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Audio'

export function audioFilename(item: Pick<AudioItem, 'title' | 'mime'>) {
  const base = item.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'audio'
  return `${base}.${extFromMime(item.mime)}`
}

/** Descarga el binario de un audio con un enlace temporal. */
export async function downloadAudio(item: Pick<AudioItem, 'title' | 'mime' | 'blobId'>) {
  const rec = await getBlob(item.blobId)
  if (!rec) return
  const url = URL.createObjectURL(rec.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = audioFilename(item)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** Siguiente valor de `order` (al final de la lista completa, sin filtro). */
export async function nextAudioOrder(): Promise<number> {
  const all = alive(await db.audios.toArray())
  return all.reduce((m, a) => Math.max(m, a.order + 1), 0)
}

/**
 * Inserta el nuevo orden de un subconjunto visible (filtrado) dentro del orden completo:
 * las posiciones que ocupaban esos ids se rellenan en el nuevo orden.
 */
export async function fullOrderFromSubset(subsetIds: string[]): Promise<string[]> {
  const all = alive(await db.audios.toArray()).sort(byOrder).map((a) => a.id)
  const inSubset = new Set(subsetIds)
  let k = 0
  return all.map((id) => (inSubset.has(id) ? subsetIds[k++] : id))
}

/** Tipo MIME de grabación soportado por el navegador. */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m))
}
