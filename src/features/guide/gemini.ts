// Generación de guías de estudio con Gemini (API de Google AI Studio).
// La clave la pega el usuario y queda sólo en este navegador (localStorage); no se sincroniza.

import { alive, db, uid } from '../../lib/db'
import { dayLong, isValidSlot, toMin } from '../../lib/schedule'
import type { Exam, GuideDay, StudyGuide, Subject, Weekday } from '../../lib/types'
import { examTypeLabel, levelLabel } from '../exams/examUtils'

const KEY_STORAGE = 'ef-gemini-key'

/** Modelos a probar en orden (si uno no existe para la clave, se pasa al siguiente). */
const MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

/** Tope de bytes de archivos enviados (la API admite 20 MB por pedido, base64 incluido). */
const MAX_TOTAL_BYTES = 13 * 1024 * 1024
const MAX_FILE_BYTES = 7 * 1024 * 1024
const MAX_NOTE_CHARS = 60_000

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function setApiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* almacenamiento no disponible */
  }
}

export const isoDate = (t: number | Date) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const parseIsoDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "45 min", "3 h 30 min". */
const fmtSpan = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`
}

const hhmm = (t: number) => {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ───────────────────────── Armado del pedido ─────────────────────────

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

const INLINE_MIME = /^(application\/pdf|image\/(png|jpeg|webp|heic|heif)|text\/.+)$/

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })
}

export interface GuideInput {
  exams: Exam[]
  /** Primer día del plan ("AAAA-MM-DD"). */
  startDate: string
  extra: string
}

interface Built {
  parts: Part[]
  skipped: string[]
  /** Código corto ("E1") → id del examen. */
  codes: Map<string, string>
  days: string[]
}

async function buildRequest(input: GuideInput, now = Date.now()): Promise<Built> {
  const exams = input.exams.slice().sort((a, b) => a.at - b.at)
  const subjects = new Map<string, Subject>(alive(await db.subjects.toArray()).map((s) => [s.id, s]))
  const parts: Part[] = []
  const skipped: string[] = []
  const codes = new Map<string, string>()
  let budget = MAX_TOTAL_BYTES

  // Calendario: desde el día de inicio hasta el día del último examen.
  const start = parseIsoDate(input.startDate)
  const lastExam = new Date(exams[exams.length - 1].at)
  lastExam.setHours(0, 0, 0, 0)
  const days: string[] = []
  const calendar: string[] = []
  const subjectList = [...subjects.values()]
  for (let d = new Date(start); d <= lastExam && days.length < 120; d.setDate(d.getDate() + 1)) {
    const iso = isoDate(d)
    const wd = d.getDay() as Weekday
    days.push(iso)
    const classes = subjectList
      .flatMap((s) =>
        (s.slots ?? [])
          .filter((sl) => isValidSlot(sl) && sl.day === wd)
          .map((sl) => ({ start: sl.start, text: `${sl.start}–${sl.end} ${s.name}`, min: toMin(sl.end) - toMin(sl.start) })),
      )
      .sort((x, y) => x.start.localeCompare(y.start))
    const examsToday = exams.filter((e) => isoDate(e.at) === iso)
    let line = `- ${iso} (${dayLong(wd).toLowerCase()})`
    if (iso === isoDate(now)) line += ` (es hoy; ya son las ${hhmm(now)}, planifica sólo desde ahora)`
    line += classes.length
      ? `: cursa ${classes.map((c) => c.text).join(', ')} (${fmtSpan(classes.reduce((t, c) => t + c.min, 0))} de clases)`
      : ': no tiene clases'
    if (examsToday.length)
      line += `; ese día rinde ${examsToday.map((e) => `${e.title} a las ${hhmm(e.at)}`).join(' y ')}`
    calendar.push(line)
  }

  parts.push({
    text: [
      `Hoy es ${isoDate(now)} y son las ${hhmm(now)}.`,
      `Arma un plan de estudio día por día desde ${input.startDate} hasta el día del último examen.`,
      '',
      'Calendario con sus horarios de cursada (decide tú cuánto estudiar cada día y en qué horario):',
      ...calendar,
      ...(input.extra.trim() ? ['', `Indicaciones del estudiante: ${input.extra.trim()}`] : []),
      '',
      'Exámenes y entregas a preparar:',
    ].join('\n'),
  })

  for (const [i, exam] of exams.entries()) {
    const code = `E${i + 1}`
    codes.set(code, exam.id)
    const subject = exam.subjectId ? subjects.get(exam.subjectId) : undefined
    const lines = [
      `\n## ${code}: ${exam.title}`,
      `Tipo: ${examTypeLabel(exam.type)}`,
      subject ? `Materia: ${subject.name}` : '',
      `Fecha: ${isoDate(exam.at)} a las ${hhmm(exam.at)}`,
      exam.weight != null ? `Peso en la nota final: ${exam.weight}%` : '',
      exam.targetGrade != null ? `Nota objetivo: ${exam.targetGrade}` : '',
      exam.notes ? `Notas del estudiante: ${exam.notes}` : '',
      exam.topics.length
        ? `Temas (con el nivel que el estudiante marcó):\n${exam.topics.map((t) => `- ${t.name} [${levelLabel(t.level)}]`).join('\n')}`
        : 'Temas: no cargó temas; dedúcelos del material si lo hay.',
    ]
    parts.push({ text: lines.filter(Boolean).join('\n') })

    // Material vinculado al examen.
    for (const ref of exam.materials ?? []) {
      if (ref.kind === 'note') {
        const n = await db.notes.get(ref.id)
        if (!n || n.deleted) continue
        const body = n.body.length > MAX_NOTE_CHARS ? `${n.body.slice(0, MAX_NOTE_CHARS)}\n[…recortado]` : n.body
        parts.push({ text: `\n[${code}] Apunte «${n.title || 'Sin título'}»:\n${body}` })
      } else if (ref.kind === 'resource') {
        const r = await db.resources.get(ref.id)
        if (!r || r.deleted) continue
        parts.push({ text: `\n[${code}] Enlace «${r.title}»: ${r.url}${r.description ? ` — ${r.description}` : ''}` })
      } else {
        const f = await db.files.get(ref.id)
        if (!f || f.deleted) continue
        const rec = await db.blobs.get(f.blobId)
        const mime = rec?.mime || f.mime
        if (!rec?.blob) {
          skipped.push(`${f.name} (no está descargado en este dispositivo)`)
        } else if (!INLINE_MIME.test(mime)) {
          skipped.push(`${f.name} (formato que la IA no puede leer)`)
          parts.push({ text: `\n[${code}] Archivo «${f.name}» (no adjunto; sólo considera el nombre).` })
        } else if (rec.size > MAX_FILE_BYTES || rec.size > budget) {
          skipped.push(`${f.name} (demasiado grande)`)
          parts.push({ text: `\n[${code}] Archivo «${f.name}» (no adjunto por tamaño; sólo considera el nombre).` })
        } else {
          budget -= rec.size
          parts.push({ text: `\n[${code}] Archivo adjunto «${f.name}»:` })
          parts.push({ inlineData: { mimeType: mime, data: await blobToBase64(rec.blob) } })
        }
      }
    }
  }

  return { parts, skipped, codes, days }
}

const SYSTEM = `Eres un tutor que arma planes de estudio para estudiantes universitarios y secundarios.
Escribe en español rioplatense neutro, claro y breve.
Reglas:
- Usa el material adjunto (apuntes, resúmenes, PDFs, fotos) para decidir qué temas estudiar y cuánto pesa cada uno.
- Prioriza lo que está marcado como "Sin ver" o "Repasar" y los exámenes más cercanos o con más peso.
- No hay un tiempo disponible fijo: decide cuánto estudiar cada día según la cantidad de temas y material, lo que falta para cada examen y sus horarios de cursada.
- Días con muchas horas de clase: poco estudio (o nada). Días sin clases o fines de semana: más tiempo. Sé realista: en general no más de 4 h por día, salvo justo antes de un examen difícil con mucho material.
- Si hay poco para estudiar, no llenes todos los días: deja días libres.
- A cada bloque ponle un "horario" sugerido (HH:MM–HH:MM) que no se superponga con las clases ni con el examen, dejando un margen para traslados y comidas, entre las 08:00 y las 23:00.
- Bloques de 20 a 90 minutos. Incluye repasos espaciados, ejercicios o práctica activa, y un repaso corto el día anterior a cada examen.
- El día del examen sólo un repaso liviano antes de la hora del examen, o nada.
- Para una presentación o trabajo práctico, incluye preparar el contenido y ensayarla.
- "examen" debe ser el código del examen (E1, E2…). "material" nombra el apunte o archivo a usar, si corresponde.
- "resumen": 2 o 3 oraciones con la estrategia general. "consejos": 3 a 5 consejos concretos para este caso.`

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    resumen: { type: 'STRING' },
    dias: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          fecha: { type: 'STRING', description: 'AAAA-MM-DD' },
          bloques: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                examen: { type: 'STRING' },
                tema: { type: 'STRING' },
                actividad: { type: 'STRING' },
                minutos: { type: 'INTEGER' },
                horario: { type: 'STRING', description: 'HH:MM–HH:MM' },
                material: { type: 'STRING' },
              },
              required: ['examen', 'tema', 'actividad', 'minutos'],
            },
          },
        },
        required: ['fecha', 'bloques'],
      },
    },
    consejos: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['resumen', 'dias', 'consejos'],
}

interface RawPlan {
  resumen?: string
  dias?: { fecha?: string; bloques?: { examen?: string; tema?: string; actividad?: string; minutos?: number; horario?: string; material?: string }[] }[]
  consejos?: string[]
}

export class GuideError extends Error {}

/** Espera `ms` o corta antes si se cancela. */
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Cancelado', 'AbortError'))
    }, { once: true })
  })

/** Errores pasajeros del servidor (saturación, caída momentánea): se reintenta. */
const TRANSIENT = new Set([500, 502, 503, 504])
/** Esperas entre intentos con el mismo modelo antes de pasar al siguiente. */
const RETRY_DELAYS = [2_000, 5_000]

async function callGemini(
  key: string,
  parts: Part[],
  signal?: AbortSignal,
  onStatus?: (msg: string) => void,
): Promise<{ text: string; model: string }> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.4 },
  })
  let busy = false // algún modelo respondió saturado
  let limited = false // algún modelo respondió con límite de uso
  let missing = 0

  for (const [mi, model] of MODELS.entries()) {
    for (let attempt = 0; ; attempt++) {
      let res: Response
      try {
        res = await fetch(ENDPOINT(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body,
          signal,
        })
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e
        throw new GuideError('No hay conexión con Gemini. Revisa tu internet e inténtalo de nuevo.')
      }
      const data = await res.json().catch(() => null)
      if (res.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
        if (!text) throw new GuideError('Gemini no devolvió un plan (puede que el contenido haya sido bloqueado). Inténtalo de nuevo.')
        return { text, model }
      }
      const msg: string = data?.error?.message ?? ''
      const next = MODELS[mi + 1]

      if (TRANSIENT.has(res.status)) {
        busy = true
        if (attempt < RETRY_DELAYS.length) {
          onStatus?.('Gemini está con mucha demanda. Reintentando…')
          await wait(RETRY_DELAYS[attempt], signal)
          continue
        }
        if (next) onStatus?.('Gemini está saturado. Probando con otro modelo…')
        break
      }
      if (res.status === 429) {
        limited = true
        if (next) onStatus?.('Se llenó el cupo gratuito de este modelo. Probando con otro…')
        break
      }
      if (res.status === 404) {
        missing++
        break
      }
      if (res.status === 400 && /api key/i.test(msg)) throw new GuideError('La clave de Gemini no es válida. Revísala en la configuración.')
      if (res.status === 403) throw new GuideError('La clave de Gemini no tiene permiso para usar el modelo. Revisa la clave en Google AI Studio.')
      if (res.status === 413 || /too large|payload/i.test(msg))
        throw new GuideError('El material es demasiado grande para enviarlo junto. Prueba con menos exámenes o archivos más livianos.')
      throw new GuideError(`Gemini respondió con un error (${res.status}). ${msg}`.trim())
    }
  }

  if (busy) throw new GuideError('Gemini está con mucha demanda en este momento. Espera unos minutos y vuelve a intentar.')
  if (limited) throw new GuideError('Se alcanzó el límite gratuito de Gemini por ahora. Espera un rato (o hasta mañana) y vuelve a intentar.')
  if (missing) throw new GuideError('Ningún modelo de Gemini está disponible para tu clave. Revisa la clave en Google AI Studio.')
  throw new GuideError('No se pudo usar Gemini.')
}

/** Normaliza "18:00 - 19:30" → "18:00–19:30"; undefined si no tiene forma de horario. */
function parseRange(v: unknown): string | undefined {
  const m = String(v ?? '').match(/(\d{1,2}):(\d{2})\s*[-–—a]+\s*(\d{1,2}):(\d{2})/)
  if (!m) return undefined
  const p = (h: string, mm: string) => `${h.padStart(2, '0')}:${mm}`
  return `${p(m[1], m[2])}–${p(m[3], m[4])}`
}

/** Genera la guía y la devuelve lista para guardar. */
export async function generateGuide(
  input: GuideInput,
  signal?: AbortSignal,
  onStatus?: (msg: string) => void,
): Promise<Omit<StudyGuide, 'id' | 'createdAt' | 'updatedAt'>> {
  const key = getApiKey()
  if (!key) throw new GuideError('Falta la clave de Gemini.')
  if (!input.exams.length) throw new GuideError('Elige al menos un examen.')

  const built = await buildRequest(input)
  const { text, model } = await callGemini(key, built.parts, signal, onStatus)

  let raw: RawPlan
  try {
    raw = JSON.parse(text)
  } catch {
    throw new GuideError('La respuesta de Gemini no se pudo leer. Inténtalo de nuevo.')
  }

  const valid = new Set(built.days)
  const byDate = new Map<string, GuideDay>()
  for (const d of raw.dias ?? []) {
    if (!d?.fecha || !valid.has(d.fecha)) continue
    const day = byDate.get(d.fecha) ?? { date: d.fecha, blocks: [] }
    for (const b of d.bloques ?? []) {
      const minutes = Math.round(Number(b?.minutos))
      if (!b?.tema || !Number.isFinite(minutes) || minutes <= 0) continue
      day.blocks.push({
        id: uid(),
        examId: built.codes.get(String(b.examen ?? '').trim().toUpperCase()),
        topic: b.tema.trim(),
        activity: (b.actividad ?? '').trim(),
        minutes: Math.min(minutes, 8 * 60),
        material: b.material?.trim() || undefined,
        time: parseRange(b.horario),
        done: false,
      })
    }
    day.blocks.sort((x, y) => (x.time ?? '99').localeCompare(y.time ?? '99'))
    if (day.blocks.length) byDate.set(d.fecha, day)
  }
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  if (!days.length) throw new GuideError('Gemini no armó ningún día de estudio. Revisa el tiempo disponible e inténtalo de nuevo.')

  const exams = input.exams.slice().sort((a, b) => a.at - b.at)
  return {
    title: exams.map((e) => e.title).join(' · '),
    examIds: exams.map((e) => e.id),
    summary: (raw.resumen ?? '').trim(),
    days,
    tips: (raw.consejos ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8),
    model,
    skipped: built.skipped.length ? built.skipped : undefined,
  }
}
