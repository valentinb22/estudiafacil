// Sintetizador de sonidos ambientales (Web Audio, todo generado; sin archivos).
// Un solo sonido a la vez. Los ruidos usan AudioBuffers en bucle.
import { audioCtx } from '../../lib/sound'

export type AmbientKind = 'rain' | 'brown' | 'alpha' | 'white'

export const AMBIENTS: { kind: AmbientKind; label: string; hint?: string }[] = [
  { kind: 'rain', label: 'Lluvia suave' },
  { kind: 'brown', label: 'Ruido marrón' },
  { kind: 'alpha', label: 'Ondas alfa 10 Hz', hint: 'Usa auriculares para notar el efecto binaural.' },
  { kind: 'white', label: 'Ruido blanco' },
]

/** Nivel base de cada sonido (se multiplica por el volumen del usuario). */
const LEVEL: Record<AmbientKind, number> = { rain: 0.55, brown: 0.6, alpha: 0.18, white: 0.12 }

const BUFFER_SEC = 6
const bufferCache = new Map<AmbientKind, AudioBuffer>()

function whiteBuffer(c: BaseAudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * BUFFER_SEC)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  return buf
}

function brownBuffer(c: BaseAudioContext): AudioBuffer {
  const len = Math.floor(c.sampleRate * BUFFER_SEC)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let last = 0
    for (let i = 0; i < len; i++) {
      // Integración de ruido blanco con fuga (evita deriva DC).
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      d[i] = last * 3.5
    }
    fadeLoopEdges(d, c.sampleRate)
  }
  return buf
}

function rainBuffer(c: BaseAudioContext): AudioBuffer {
  const sr = c.sampleRate
  const len = Math.floor(sr * BUFFER_SEC)
  const buf = c.createBuffer(2, len, sr)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    // Base: ruido rosado aproximado (filtro de Paul Kellet, versión económica).
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11
    }
    // Gotas: pequeños impulsos de ruido con decaimiento exponencial, al azar.
    const drops = Math.floor(BUFFER_SEC * 38)
    for (let k = 0; k < drops; k++) {
      const start = Math.floor(Math.random() * len)
      const amp = 0.04 + Math.random() * 0.12
      const decay = sr * (0.004 + Math.random() * 0.018)
      const dur = Math.floor(decay * 5)
      for (let j = 0; j < dur; j++) {
        const idx = (start + j) % len
        d[idx] += (Math.random() * 2 - 1) * amp * Math.exp(-j / decay)
      }
    }
    fadeLoopEdges(d, sr)
  }
  return buf
}

/** Suaviza el empalme del bucle para que no haga clic. */
function fadeLoopEdges(d: Float32Array, sr: number) {
  const n = Math.floor(sr * 0.05)
  const len = d.length
  for (let i = 0; i < n; i++) {
    const t = i / n
    // Mezcla el final con el principio (crossfade simple).
    d[len - n + i] = d[len - n + i] * (1 - t) + d[i] * t
  }
}

function getBuffer(c: BaseAudioContext, kind: AmbientKind): AudioBuffer {
  let b = bufferCache.get(kind)
  if (!b) {
    b = kind === 'rain' ? rainBuffer(c) : kind === 'brown' ? brownBuffer(c) : whiteBuffer(c)
    bufferCache.set(kind, b)
  }
  return b
}

interface Voice {
  kind: AmbientKind
  out: GainNode
  sources: AudioScheduledSourceNode[]
  nodes: AudioNode[]
}

let current: Voice | null = null
let volume = 0.6

const RAMP = 0.08 // constante de tiempo (s) para setTargetAtTime

function build(c: AudioContext, kind: AmbientKind): Voice {
  const out = c.createGain()
  out.gain.value = 0
  out.connect(c.destination)
  const sources: AudioScheduledSourceNode[] = []
  const nodes: AudioNode[] = [out]

  if (kind === 'alpha') {
    // Binaural: 200 Hz izquierda / 210 Hz derecha → batido de 10 Hz.
    const merger = c.createChannelMerger(2)
    nodes.push(merger)
    ;[200, 210].forEach((f, ch) => {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      o.connect(merger, 0, ch)
      sources.push(o)
    })
    merger.connect(out)
  } else {
    const src = c.createBufferSource()
    src.buffer = getBuffer(c, kind)
    src.loop = true
    sources.push(src)
    if (kind === 'rain') {
      const hp = c.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 350
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 4200
      // Modulación lenta del volumen: la lluvia "respira".
      const swell = c.createGain()
      swell.gain.value = 0.85
      const lfo = c.createOscillator()
      lfo.frequency.value = 0.07
      const lfoDepth = c.createGain()
      lfoDepth.gain.value = 0.15
      lfo.connect(lfoDepth).connect(swell.gain)
      sources.push(lfo)
      nodes.push(hp, lp, swell, lfoDepth)
      src.connect(hp).connect(lp).connect(swell).connect(out)
    } else if (kind === 'brown') {
      const lp = c.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      nodes.push(lp)
      src.connect(lp).connect(out)
    } else {
      src.connect(out)
    }
  }
  sources.forEach((s) => s.start())
  return { kind, out, sources, nodes }
}

function release(v: Voice) {
  try {
    const c = audioCtx()
    v.out.gain.cancelScheduledValues(c.currentTime)
    v.out.gain.setTargetAtTime(0, c.currentTime, RAMP)
    const stopAt = c.currentTime + RAMP * 6
    v.sources.forEach((s) => {
      try {
        s.stop(stopAt)
      } catch {
        /* ya detenido */
      }
    })
    setTimeout(() => {
      v.sources.forEach((s) => s.disconnect())
      v.nodes.forEach((n) => n.disconnect())
    }, RAMP * 6 * 1000 + 100)
  } catch {
    /* sin audio */
  }
}

/** Reproduce un sonido (detiene el anterior). */
export function playAmbient(kind: AmbientKind) {
  try {
    const c = audioCtx()
    if (c.state === 'suspended') void c.resume()
    if (current) release(current)
    current = build(c, kind)
    current.out.gain.setTargetAtTime(LEVEL[kind] * volume, c.currentTime, RAMP * 3)
  } catch {
    current = null
  }
}

export function stopAmbient() {
  if (current) release(current)
  current = null
}

export function setAmbientVolume(v: number) {
  volume = Math.min(1, Math.max(0, v))
  if (!current) return
  try {
    const c = audioCtx()
    current.out.gain.cancelScheduledValues(c.currentTime)
    current.out.gain.setTargetAtTime(LEVEL[current.kind] * volume, c.currentTime, RAMP)
  } catch {
    /* sin audio */
  }
}

export const currentAmbient = () => current?.kind ?? null
