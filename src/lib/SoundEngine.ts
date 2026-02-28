// ─────────────────────────────────────────────────────────────────────────────
// SoundEngine.ts — System dźwięku z oddzielnymi głośnościami muzyki i efektów
//
// API publiczne:
//   SoundEngine.play(key, relVolume)        — efekt dźwiękowy (SFX)
//   SoundEngine.startBg(key, relVolume)     — muzyka tła (Music)
//   SoundEngine.stopBg(fadeMs)              — stop muzyki z fade
//   SoundEngine.timerBeep(second, vol)      — beepy odliczania (Web Audio)
//   SoundEngine.setMusicVolume(0–100)       — zmień głośność muzyki natychmiast
//   SoundEngine.setSfxVolume(0–100)         — zmień głośność SFX
//   SoundEngine.unlockAudio()               — odblokuj AudioContext (user gesture)
//
// Głośność:
//   relVolume = 0.0–1.0 (relatywna do danej kategorii)
//   finalna = relVolume × (categoryVolume / 100)
//   setMusicVolume/setSfxVolume przyjmują 0–100 (z suwaka admina)
// ─────────────────────────────────────────────────────────────────────────────

const SOUNDS = {
  bgMusic:   '/sounds/bg-music.mp3',
  duelMusic: '/sounds/duel-music.mp3',
  countdown: '/sounds/countdown.mp3',
  buzzer:    '/sounds/buzzer.mp3',
  applause:  '/sounds/applause.mp3',
  correct:   '/sounds/correct.mp3',
} as const

type SoundKey = keyof typeof SOUNDS

// ── Aktualnie odtwarzana muzyka tła ──────────────────────────────────────────
let _bgTrack:      HTMLAudioElement | null = null
let _bgBaseVolume: number = 0.3   // relatywna głośność przekazana do startBg

// ── Aktualne głośności (zakres 0–100) ────────────────────────────────────────
let _musicVol: number = 80
let _sfxVol:   number = 80

// ── Web Audio API (do timerBeep) ─────────────────────────────────────────────
let _audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return _audioCtx
}

function make(src: string, volume = 1, loop = false): HTMLAudioElement {
  const el  = new Audio(src)
  el.volume = Math.min(1, Math.max(0, volume))
  el.loop   = loop
  return el
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, v))
}

// ── Oblicz głośność finalną ───────────────────────────────────────────────────
function sfxFinal(rel: number): number {
  return clamp(rel * (_sfxVol / 100))
}
function musicFinal(rel: number): number {
  return clamp(rel * (_musicVol / 100))
}

export const SoundEngine = {
  // ── Efekty dźwiękowe ───────────────────────────────────────────────────────
  play(key: SoundKey, relVolume = 1): void {
    try {
      make(SOUNDS[key], sfxFinal(relVolume)).play().catch(() => {})
    } catch {}
  },

  // ── Muzyka tła ─────────────────────────────────────────────────────────────
  startBg(key: SoundKey, relVolume = 0.3): void {
    this.stopBg(0)
    try {
      _bgBaseVolume = relVolume
      _bgTrack      = make(SOUNDS[key], musicFinal(relVolume), true)
      _bgTrack.play().catch(() => {})
    } catch {}
  },

  stopBg(fadeMs = 400): void {
    if (!_bgTrack) return
    const track = _bgTrack
    _bgTrack = null
    if (fadeMs <= 0) { track.pause(); return }
    const step = track.volume / (fadeMs / 20)
    const iv   = setInterval(() => {
      if (track.volume <= step) {
        track.pause()
        clearInterval(iv)
      } else {
        track.volume = Math.max(0, track.volume - step)
      }
    }, 20)
  },

  // ── Zmiana głośności w locie ────────────────────────────────────────────────
  setMusicVolume(vol0to100: number): void {
    _musicVol = clamp(vol0to100, 0, 100)
    if (_bgTrack) {
      _bgTrack.volume = musicFinal(_bgBaseVolume)
    }
  },

  setSfxVolume(vol0to100: number): void {
    _sfxVol = clamp(vol0to100, 0, 100)
  },

  // ── Init z zapisanych wartości (wywołaj po załadowaniu config) ─────────────
  init(musicVol: number, sfxVol: number): void {
    _musicVol = clamp(musicVol, 0, 100)
    _sfxVol   = clamp(sfxVol,   0, 100)
    if (_bgTrack) {
      _bgTrack.volume = musicFinal(_bgBaseVolume)
    }
  },

  // ── Beepy odliczania (Web Audio API, bez pliku MP3) ────────────────────────
  timerBeep(second: 1 | 2 | 3, relVolume = 1): void {
    try {
      const ctx  = getAudioCtx()
      const gain = ctx.createGain()
      gain.connect(ctx.destination)

      const vol = sfxFinal(relVolume)

      if (second === 3) {
        // 3s: 440 Hz, krótki, cichy
        this._beep(ctx, gain, 440, 0, 0.12, vol * 0.5)
      } else if (second === 2) {
        // 2s: 550 Hz, nieco głośniejszy
        this._beep(ctx, gain, 550, 0, 0.14, vol * 0.6)
      } else {
        // 1s: 880 + 1320 Hz overlay, głośny
        this._beep(ctx, gain, 880,  0,    0.18, vol * 0.8)
        this._beep(ctx, gain, 1320, 0.02, 0.16, vol * 0.6)
      }
    } catch {}
  },

  _beep(
    ctx:    AudioContext,
    gain:   GainNode,
    freq:   number,
    delay:  number,
    dur:    number,
    vol:    number,
  ): void {
    const osc = ctx.createOscillator()
    osc.connect(gain)
    osc.type      = 'sine'
    osc.frequency.value = freq

    const t  = ctx.currentTime + delay
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(vol, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)

    osc.start(t)
    osc.stop(t + dur + 0.05)
  },

  // ── Odblokuj AudioContext (musi być wywołane z user gesture) ───────────────
  async unlockAudio(): Promise<void> {
    try {
      const ctx = getAudioCtx()
      if (ctx.state === 'suspended') await ctx.resume()
    } catch {}
  },

  SOUNDS,
}
