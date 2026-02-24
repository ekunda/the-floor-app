/**
 * useSpeechRecognition — Web Speech API hook
 *
 * Wspiera wiele języków równolegle (pl-PL + en-US).
 * Każdy język = osobna instancja SpeechRecognition na tym samym mikrofonie.
 *
 * Zasady wydajności:
 * - Zero debounce — każda ms opóźnienia jest odczuwalna
 * - Interim: odpala na KAŻDĄ zmianę tekstu (nie tylko nowe słowo)
 * - Szybka ścieżka dla 1 języka — bez Map deduplikacji
 * - Multi-lang: deduplikacja przez 600ms zapobiega podwójnym trafieniom
 * - Restart po 100ms — minimalna przerwa w ciągłości nasłuchu
 */

import { useEffect, useRef, useState } from 'react'

type SpeechRecognitionInstance = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  start: () => void; stop: () => void; abort: () => void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror:  ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null; onstart: (() => void) | null
}
type SpeechRecognitionEvent = {
  resultIndex: number
  results: { [i: number]: { isFinal: boolean; length: number; [alt: number]: { transcript: string } }; length: number }
}
type SpeechRecognitionErrorEvent = { error: string; message: string }

function getSR(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSR() !== null
}

interface UseSpeechRecognitionOptions {
  onFinal:   (transcript: string) => void
  onInterim: (transcript: string) => void
  active: boolean
  /** Jeden język lub tablica — każdy uruchamia osobną instancję równolegle */
  lang?: string | string[]
}

export function useSpeechRecognition({ onFinal, onInterim, active, lang = 'pl-PL' }: UseSpeechRecognitionOptions) {
  const langs = Array.isArray(lang) ? [...new Set(lang)] : [lang]
  const multiLang = langs.length > 1

  // refs — zawsze świeże w callbackach
  const onFinalRef      = useRef(onFinal)
  const onInterimRef    = useRef(onInterim)
  const activeRef       = useRef(active)
  // mapa lang → { rec, restartTimer, lastInterim }
  const instancesRef    = useRef<Map<string, {
    rec: SpeechRecognitionInstance
    timer: ReturnType<typeof setTimeout> | null
    lastInterim: string
  }>>(new Map())
  // deduplikacja: tylko dla multi-lang (unika double-fire tego samego tekstu)
  const dedupeRef       = useRef<Map<string, number>>(new Map())

  const [listening, setListening] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  onFinalRef.current   = onFinal
  onInterimRef.current = onInterim
  activeRef.current    = active

  // ── Tworzy i startuje instancję dla jednego języka ──────────────────────
  function spawnInstance(SR: new () => SpeechRecognitionInstance, l: string) {
    const DEDUPE_MS = 600

    const existing = instancesRef.current.get(l)
    if (existing) { existing.rec.onend = null; existing.rec.abort(); if (existing.timer) clearTimeout(existing.timer) }

    const state = { rec: null as any, timer: null as ReturnType<typeof setTimeout> | null, lastInterim: '' }

    const rec = new SR()
    rec.lang            = l
    rec.continuous      = true
    rec.interimResults  = true
    rec.maxAlternatives = 3

    state.rec = rec

    rec.onstart = () => { setListening(true); setError(null); state.lastInterim = '' }

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const now = Date.now()
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]

        if (result.isFinal) {
          state.lastInterim = ''
          const alts = Math.min(result.length ?? 1, 3)
          for (let alt = 0; alt < alts; alt++) {
            const t = result[alt]?.transcript?.trim()
            if (!t) continue
            if (multiLang) {
              const key = t.toLowerCase()
              const seen = dedupeRef.current.get(key)
              if (seen && now - seen < DEDUPE_MS) continue
              dedupeRef.current.set(key, now)
            }
            onFinalRef.current(t)
          }
        } else {
          // Interim: odpala na każdą zmianę — zero throttle dla max responsywności
          const t = result[0]?.transcript?.trim()
          if (!t || t === state.lastInterim) continue
          state.lastInterim = t
          if (multiLang) {
            const key = t.toLowerCase()
            const seen = dedupeRef.current.get(key)
            if (seen && now - seen < DEDUPE_MS) continue
            dedupeRef.current.set(key, now)
          }
          onInterimRef.current(t)
        }
      }
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (e.error === 'not-allowed') { setError('Brak dostępu do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki.'); return }
      if (e.error === 'network')     { setError('Błąd sieci — rozpoznawanie wymaga połączenia z internetem.'); return }
    }

    rec.onend = () => {
      setListening(false)
      state.lastInterim = ''
      if (activeRef.current) {
        state.timer = setTimeout(() => {
          if (activeRef.current && instancesRef.current.has(l)) spawnInstance(SR, l)
        }, 100)
        // Aktualizuj timer w mapie
        const entry = instancesRef.current.get(l)
        if (entry) entry.timer = state.timer
      }
    }

    instancesRef.current.set(l, state)
    try { rec.start() } catch { /* already starting */ }
  }

  function stopAll() {
    instancesRef.current.forEach(({ rec, timer }) => {
      if (timer) clearTimeout(timer)
      rec.onend = null
      rec.abort()
    })
    instancesRef.current.clear()
    dedupeRef.current.clear()
    setListening(false)
  }

  function startAll(SR: new () => SpeechRecognitionInstance) {
    // Usuń instancje języków których już nie ma
    instancesRef.current.forEach((_, l) => {
      if (!langs.includes(l)) {
        const entry = instancesRef.current.get(l)!
        if (entry.timer) clearTimeout(entry.timer)
        entry.rec.onend = null; entry.rec.abort()
        instancesRef.current.delete(l)
      }
    })
    // Uruchom nowe — z małym przesunięciem tylko gdy jest >1 (unikamy race na mikrofon)
    langs.forEach((l, idx) => {
      if (instancesRef.current.has(l)) return
      if (idx === 0) { spawnInstance(SR, l) } else { setTimeout(() => { if (activeRef.current) spawnInstance(SR, l) }, idx * 60) }
    })
  }

  useEffect(() => {
    const SR = getSR()
    if (!SR) { setError('Twoja przeglądarka nie obsługuje rozpoznawania mowy. Użyj Chrome lub Edge.'); return }
    if (active) { startAll(SR) } else { stopAll() }
    return () => stopAll()
  }, [active, langs.join(',')])

  return { listening, error }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalization
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // ą→a, ę→e, ó→o itd.
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────────────────────

function containsWholePhrase(spoken: string, phrase: string): boolean {
  if (spoken === phrase) return true
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(spoken)
}

function matchesPhrase(nSpoken: string, nPhrase: string, strict: boolean): boolean {
  if (!nSpoken || !nPhrase) return false
  if (containsWholePhrase(nSpoken, nPhrase)) return true
  if (strict) return false

  // Stem: "wodospad" ↔ "wodospady" — tylko słowa ≥6 znaków
  if (nPhrase.length >= 6 && nSpoken.length >= 5) {
    const stem  = nPhrase.slice(0, Math.ceil(nPhrase.length * 0.8))
    if (nSpoken.split(' ').some(w => w.startsWith(stem))) return true
  }

  // Multi-word: każde słowo frazy musi pasować do spoken
  const pWords = nPhrase.split(' ')
  if (pWords.length >= 2) {
    const sWords = nSpoken.split(' ')
    const ok = pWords.every(pw => {
      if (pw.length < 4) return sWords.includes(pw)
      if (sWords.includes(pw)) return true
      const pStem = pw.slice(0, Math.ceil(pw.length * 0.8))
      return sWords.some(sw => sw.length >= 4 && sw.startsWith(pStem))
    })
    if (ok) return true
  }

  return false
}

export function isAnswerMatch(
  spoken:   string,
  answer:   string,
  synonyms: string[] = [],
  strict    = false,
): boolean {
  if (!spoken) return false
  const nSpoken = normalizeText(spoken)
  if (!nSpoken) return false
  return [answer, ...synonyms].filter(Boolean).some(c => {
    const nc = normalizeText(c)
    return nc ? matchesPhrase(nSpoken, nc, strict) : false
  })
}

export function isPassCommand(spoken: string): boolean {
  const n = normalizeText(spoken)
  return ['pass', 'pas', 'dalej', 'nastepne', 'nastepny', 'skip', 'pomin']
    .some(w => n === w || n.startsWith(w + ' ') || n.endsWith(' ' + w))
}
