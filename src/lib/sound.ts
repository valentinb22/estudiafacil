let ctx: AudioContext | null = null
export const audioCtx = () => (ctx ??= new AudioContext())

/** Sonido sutil de confirmación (dos notas suaves). */
export function playChime() {
  try {
    const c = audioCtx()
    const t = c.currentTime
    ;[660, 990].forEach((f, i) => {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0, t + i * 0.09)
      g.gain.linearRampToValueAtTime(0.08, t + i * 0.09 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.35)
      o.connect(g).connect(c.destination)
      o.start(t + i * 0.09)
      o.stop(t + i * 0.09 + 0.4)
    })
  } catch {
    /* sin audio */
  }
}

/** Alarma de fin de Pomodoro (tres pulsos). */
export function playAlarm() {
  try {
    const c = audioCtx()
    const t = c.currentTime
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'triangle'
      o.frequency.value = 880
      const s = t + i * 0.45
      g.gain.setValueAtTime(0, s)
      g.gain.linearRampToValueAtTime(0.2, s + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.38)
      o.connect(g).connect(c.destination)
      o.start(s)
      o.stop(s + 0.4)
    }
  } catch {
    /* sin audio */
  }
}
