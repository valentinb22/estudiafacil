// Generación de guías de estudio con Gemini (API de Google AI Studio).
// La clave la pega el usuario y queda sólo en este navegador (localStorage); no se sincroniza.

import { alive, db, uid } from '../../lib/db'
import { dayLong, fromMin, isValidSlot, toMin } from '../../lib/schedule'
import type { Exam, GuideBlock, GuideBlockKind, GuideDay, StudyGuide, Subject, Weekday } from '../../lib/types'
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
  /** Clases y exámenes de cada día, que se agregan al plan tal cual. */
  fixed: Map<string, GuideBlock[]>
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
  const fixed = new Map<string, GuideBlock[]>()
  const subjectList = [...subjects.values()]
  for (let d = new Date(start); d <= lastExam && days.length < 120; d.setDate(d.getDate() + 1)) {
    const iso = isoDate(d)
    const wd = d.getDay() as Weekday
    days.push(iso)
    const classes = subjectList
      .flatMap((s) =>
        (s.slots ?? [])
          .filter((sl) => isValidSlot(sl) && sl.day === wd)
          .map((sl) => ({
            start: sl.start,
            end: sl.end,
            subject: s,
            room: sl.room || s.room,
            text: `${sl.start}–${sl.end} ${s.name}`,
            min: toMin(sl.end) - toMin(sl.start),
          })),
      )
      .sort((x, y) => x.start.localeCompare(y.start))
    const examsToday = exams.filter((e) => isoDate(e.at) === iso)
    fixed.set(iso, [
      ...classes.map((c) => ({
        id: uid(),
        kind: 'class' as const,
        topic: `Clase de ${c.subject.name}`,
        activity: c.room ? `Aula ${c.room}` : '',
        minutes: c.min,
        time: `${c.start}–${c.end}`,
        color: c.subject.color,
        done: false,
      })),
      ...examsToday.map((e) => ({
        id: uid(),
        kind: 'exam' as const,
        examId: e.id,
        topic: `${examTypeLabel(e.type)}: ${e.title}`,
        activity: e.location ? `Lugar: ${e.location}` : '',
        minutes: 0,
        time: hhmm(e.at),
        done: false,
      })),
    ])
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
      'Calendario con sus horarios de cursada. Las clases y los exámenes se agregan solos al plan: no los incluyas como bloques; arma el estudio sólo en los huecos libres.',
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

  return { parts, skipped, codes, days, fixed }
}

const SYSTEM = `Eres un tutor experto que arma cronogramas de estudio muy concretos, hora por hora, para estudiantes universitarios y secundarios.
Escribe en español rioplatense (vos), claro y directo.

Cómo leer el material:
- Lee de verdad los apuntes, resúmenes, PDFs y fotos adjuntos. Divide el contenido en partes concretas: por unidad, resultado de aprendizaje, capítulo o rango de páginas (por ejemplo "RA1 — Páginas 1 a 4").
- En cada bloque de estudio lista en "puntos" los subtemas exactos que aparecen en el material (3 a 7 viñetas cortas), no generalidades.
- Si no hay material, usa los temas cargados del examen y divídelos igual.

Cómo armar cada día:
- Decide cuánto estudiar según la cantidad de material, lo que falta para cada examen y las clases de ese día. Con mucho material y pocos días, días completos (por ejemplo 08:00 a 22:00); con poco, menos horas y algún día libre.
- Respeta las clases: no pongas nada que se superponga con una clase ni con el examen, y deja 30 a 60 minutos de margen antes y después para traslados.
- Bloques de estudio de 45 a 105 minutos, con descansos de 10 a 15 minutos entre ellos y comidas en horarios normales (desayuno, almuerzo 12:00–13:30, merienda, cena 19:00–20:30) si el día los abarca.
- Empieza cada día con un bloque corto de preparación (material listo, agua, celular en silencio).
- Progresión: primero días de aprendizaje (contenido nuevo), luego de consolidación (repasos espaciados y puntos débiles), después simulacros con preguntas mezcladas sin mirar los apuntes y un bloque para corregir errores.
- Termina cada día con un repaso liviano. La noche anterior al examen, nada de temas nuevos.
- El día del examen: sólo un repaso breve de lo clave antes de la hora, con margen para llegar.
- Para presentaciones: preparar el contenido, revisar las diapositivas, ensayar en voz alta midiendo el tiempo y preparar respuestas a preguntas posibles.
- Si hoy forma parte del plan, empieza después de la hora actual.

Formato:
- "titulo" de cada día: un nombre corto como "Día de aprendizaje", "Día de consolidación", "Día de simulacro" o "Repaso final".
- Cada bloque lleva "inicio" y "fin" (HH:MM), "tipo", un "titulo" corto (para descansos y comidas: "Descanso", "Almuerzo y descanso", etc.), "detalle" en una oración, "puntos" (sólo en estudio y repaso), "cierre" con una consigna concreta de autoevaluación (por ejemplo "Al terminar: explicá estos conceptos sin mirar"), "examen" con el código (E1, E2…) y "material" con el nombre del archivo o apunte a usar, si corresponde.
- Los bloques de un día van en orden y sin superponerse.
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
          titulo: { type: 'STRING' },
          bloques: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                inicio: { type: 'STRING', description: 'HH:MM' },
                fin: { type: 'STRING', description: 'HH:MM' },
                tipo: { type: 'STRING', enum: ['estudio', 'repaso', 'simulacro', 'preparacion', 'descanso', 'comida'] },
                titulo: { type: 'STRING' },
                detalle: { type: 'STRING' },
                puntos: { type: 'ARRAY', items: { type: 'STRING' } },
                cierre: { type: 'STRING' },
                examen: { type: 'STRING' },
                material: { type: 'STRING' },
              },
              required: ['inicio', 'fin', 'tipo', 'titulo'],
            },
          },
        },
        required: ['fecha', 'titulo', 'bloques'],
      },
    },
    consejos: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['resumen', 'dias', 'consejos'],
}

interface RawBlock {
  inicio?: string
  fin?: string
  tipo?: string
  titulo?: string
  detalle?: string
  puntos?: string[]
  cierre?: string
  examen?: string
  material?: string
}

interface RawPlan {
  resumen?: string
  dias?: { fecha?: string; titulo?: string; bloques?: RawBlock[] }[]
  consejos?: string[]
}

const KINDS: Record<string, GuideBlockKind> = {
  estudio: 'study',
  repaso: 'review',
  simulacro: 'practice',
  preparacion: 'prep',
  descanso: 'break',
  comida: 'meal',
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
/** Tiempo máximo de espera por intento. */
const ATTEMPT_TIMEOUT_MS = 120_000

async function callGemini(
  key: string,
  parts: Part[],
  signal?: AbortSignal,
  onStatus?: (msg: string) => void,
): Promise<{ text: string; model: string }> {
  // Pensamiento "bajo": el plan no necesita razonamiento largo y responde mucho más rápido.
  // Si un modelo no acepta el parámetro, se reintenta sin él.
  let thinking = true
  const makeBody = () =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        temperature: 0.4,
        ...(thinking ? { thinkingConfig: { thinkingLevel: 'LOW' } } : {}),
      },
    })
  let busy = false // algún modelo respondió saturado
  let limited = false // algún modelo respondió con límite de uso
  let missing = 0
  let slow = false // algún modelo no respondió a tiempo

  for (const [mi, model] of MODELS.entries()) {
    for (let attempt = 0; ; attempt++) {
      let res: Response
      let data: { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } } | null
      // Cada intento tiene un tiempo límite; si se cuelga se corta y se pasa al siguiente modelo.
      const ctrl = new AbortController()
      const onAbort = () => ctrl.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        ctrl.abort()
      }, ATTEMPT_TIMEOUT_MS)
      try {
        res = await fetch(ENDPOINT(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: makeBody(),
          signal: ctrl.signal,
        })
        data = await res.json().catch(() => null)
      } catch (e) {
        if (signal?.aborted) throw e
        if (timedOut) {
          slow = true
          if (MODELS[mi + 1]) onStatus?.('Gemini está tardando demasiado. Probando con otro modelo…')
          break
        }
        throw new GuideError('No hay conexión con Gemini. Revisa tu internet e inténtalo de nuevo.')
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
      }
      if (res.ok) {
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
        if (!text) throw new GuideError('Gemini no devolvió un plan (puede que el contenido haya sido bloqueado). Inténtalo de nuevo.')
        return { text, model }
      }
      const msg: string = data?.error?.message ?? ''
      const next = MODELS[mi + 1]

      if (res.status === 400 && thinking && /thinking/i.test(msg)) {
        thinking = false
        continue
      }

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

  if (slow && !busy && !limited)
    throw new GuideError('Gemini no respondió a tiempo. Prueba de nuevo, o con menos exámenes o material.')
  if (busy || slow) throw new GuideError('Gemini está con mucha demanda en este momento. Espera unos minutos y vuelve a intentar.')
  if (limited) throw new GuideError('Se alcanzó el límite gratuito de Gemini por ahora. Espera un rato (o hasta mañana) y vuelve a intentar.')
  if (missing) throw new GuideError('Ningún modelo de Gemini está disponible para tu clave. Revisa la clave en Google AI Studio.')
  throw new GuideError('No se pudo usar Gemini.')
}

/** "8:30" → 510 minutos; null si no es una hora válida. */
function parseTime(v: unknown): number | null {
  const m = String(v ?? '').match(/(\d{1,2})[:.](\d{2})/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : null
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
    const day = byDate.get(d.fecha) ?? { date: d.fecha, title: d.titulo?.trim() || undefined, blocks: [] }
    for (const b of d.bloques ?? []) {
      const start = parseTime(b?.inicio)
      const end = parseTime(b?.fin)
      if (!b?.titulo || start == null || end == null || end <= start) continue
      const kind = KINDS[String(b.tipo ?? '').toLowerCase()] ?? 'study'
      const points = (b.puntos ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
      day.blocks.push({
        id: uid(),
        kind,
        examId: built.codes.get(String(b.examen ?? '').trim().toUpperCase()),
        topic: b.titulo.trim(),
        activity: (b.detalle ?? '').trim(),
        minutes: Math.min(end - start, 8 * 60),
        points: points.length ? points : undefined,
        check: b.cierre?.trim() || undefined,
        material: b.material?.trim() || undefined,
        time: `${fromMin(start)}–${fromMin(end)}`,
        done: false,
      })
    }
    if (day.blocks.length) byDate.set(d.fecha, day)
  }
  // Clases y exámenes de cada día con estudio, para ver el día completo.
  for (const day of byDate.values()) {
    day.blocks.push(...(built.fixed.get(day.date) ?? []))
    day.blocks.sort((x, y) => (x.time ?? '99').localeCompare(y.time ?? '99'))
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
