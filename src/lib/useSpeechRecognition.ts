/**
 * useSpeechRecognition — Web Speech API hook
 *
 * Tryby:
 *  - Pojedynczy język (pl-PL lub en-US): jedna instancja, restart po 100ms
 *  - Oba języki (both): LEAPFROG — pl i en na przemian bez przerw
 *    Chrome nie obsługuje naprawdę równoległych instancji (druga dostaje 'aborted').
 *    Leapfrog: jedna kończy → druga startuje natychmiast → zero gaps.
 *
 * Wydajność:
 *  - Interim: maxAlternatives=1 (szybciej), Final: maxAlternatives=3 (dokładniej)
 *  - Zero debounce — każda ms liczy się
 *  - setListening=false tylko gdy ŻADNA instancja nie działa
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
  lang?: string | string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useSpeechRecognition({
  onFinal, onInterim, active, lang = 'pl-PL',
}: UseSpeechRecognitionOptions) {
  const langs     = Array.isArray(lang) ? [...new Set(lang)] : [lang]
  const leapfrog  = langs.length > 1   // "both" mode

  const onFinalRef    = useRef(onFinal)
  const onInterimRef  = useRef(onInterim)
  const activeRef     = useRef(active)
  const leapfrogIdx   = useRef(0)        // which lang is next in leapfrog rotation
  const recRef        = useRef<SpeechRecognitionInstance | null>(null)
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInterim   = useRef('')
  const stoppedRef    = useRef(false)    // true = stopAll() was called, don't restart
  const SRRef         = useRef<(new () => SpeechRecognitionInstance) | null>(null)

  const [listening, setListening] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  onFinalRef.current   = onFinal
  onInterimRef.current = onInterim
  activeRef.current    = active

  function buildRec(l: string): SpeechRecognitionInstance {
    const SR  = SRRef.current!
    const rec = new SR()
    rec.lang            = l
    rec.continuous      = true
    rec.interimResults  = true
    rec.maxAlternatives = 3

    rec.onstart = () => { setListening(true); setError(null); lastInterim.current = '' }

    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          lastInterim.current = ''
          const alts = Math.min(result.length ?? 1, 3)
          for (let a = 0; a < alts; a++) {
            const t = result[a]?.transcript?.trim()
            if (t) onFinalRef.current(t)
          }
        } else {
          const t = result[0]?.transcript?.trim()
          if (!t || t === lastInterim.current) continue
          lastInterim.current = t
          onInterimRef.current(t)
        }
      }
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (e.error === 'not-allowed') {
        setError('Brak dostępu do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki.')
        return
      }
      if (e.error === 'network') {
        setError('Błąd sieci — rozpoznawanie wymaga połączenia z internetem.')
        return
      }
    }

    rec.onend = () => {
      lastInterim.current = ''
      if (stoppedRef.current || !activeRef.current) {
        setListening(false)
        return
      }
      // ── Leapfrog: switch to next language immediately ──────────────────
      if (leapfrog) {
        leapfrogIdx.current = (leapfrogIdx.current + 1) % langs.length
        const nextLang = langs[leapfrogIdx.current]
        // No timeout — switch instantly for zero gaps
        startRec(nextLang)
      } else {
        // Single language: restart after 100ms
        timerRef.current = setTimeout(() => {
          if (!stoppedRef.current && activeRef.current) startRec(l)
        }, 100)
      }
    }

    return rec
  }

  function startRec(l: string) {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (recRef.current) {
      recRef.current.onend = null
      recRef.current.abort()
    }
    const rec = buildRec(l)
    recRef.current = rec
    try { rec.start() } catch { /* already starting */ }
  }

  function stopAll() {
    stoppedRef.current = true
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (recRef.current) {
      recRef.current.onend = null
      recRef.current.abort()
      recRef.current = null
    }
    setListening(false)
  }

  function startAll() {
    stoppedRef.current = false
    leapfrogIdx.current = 0
    startRec(langs[0])
  }

  useEffect(() => {
    const SR = getSR()
    if (!SR) {
      setError('Twoja przeglądarka nie obsługuje rozpoznawania mowy. Użyj Chrome lub Edge.')
      return
    }
    SRRef.current = SR
    if (active) { startAll() } else { stopAll() }
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
    .replace(/[\u0300-\u036f]/g, '')   // ą→a, ę→e, ó→o itd.
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Strip English articles ("the lion" → "lion", "a dog" → "dog")
function stripArticles(t: string): string {
  return t.replace(/\b(the|a|an)\s+/g, '').replace(/\s+/g, ' ').trim()
}

// Porter-light stemmer: English + Polish inflection
// EN: lions→lion, horses→horse, churches→church, wolves→wolf, running→run
// PL: 80% prefix for words ≥6 chars (wodospady→wodospa, niedźwiedzi→niedźwied)
function stemWord(w: string): string {
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  if (w.endsWith('ves') && w.length > 4) return w.slice(0, -3) + 'f'
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3)
  if (w.endsWith('ed')  && w.length > 4) return w.slice(0, -2)
  if (w.endsWith('es')  && w.length > 3) return w.slice(0, -2)
  if (w.endsWith('s')   && w.length > 3) return w.slice(0, -1)
  if (w.length >= 6) return w.slice(0, Math.ceil(w.length * 0.8))
  return w
}

function stemPhrase(t: string): string {
  return t.split(' ').map(stemWord).join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Phrase matching
// ─────────────────────────────────────────────────────────────────────────────

function wholeWordMatch(spoken: string, phrase: string): boolean {
  if (spoken === phrase) return true
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`).test(spoken)
}

function phrasesMatch(nSpoken: string, nPhrase: string, strict: boolean): boolean {
  if (!nSpoken || !nPhrase) return false

  // 1. Exact or whole-word boundary
  if (wholeWordMatch(nSpoken, nPhrase)) return true

  // 2. Strip English articles and retry (covers "it is a lion" → "lion")
  const noArt = stripArticles(nSpoken)
  if (noArt !== nSpoken && wholeWordMatch(noArt, nPhrase)) return true

  if (strict) return false   // interim stops here — no fuzzy on partial words

  // 3. Stem both sides (final-only fuzzy)
  const sStem = stemPhrase(nSpoken)
  const pStem = stemPhrase(nPhrase)
  if (wholeWordMatch(sStem, pStem))  return true
  if (wholeWordMatch(sStem, nPhrase)) return true
  if (wholeWordMatch(nSpoken, pStem)) return true

  // Also try with articles stripped + stemmed
  if (noArt !== nSpoken) {
    const noArtStem = stemPhrase(noArt)
    if (wholeWordMatch(noArtStem, pStem))  return true
    if (wholeWordMatch(noArtStem, nPhrase)) return true
  }

  // 4. Multi-word phrase: every word present in spoken (with stemming)
  const pWords = nPhrase.split(' ')
  if (pWords.length >= 2) {
    const sWords  = nSpoken.split(' ')
    const sStems  = sWords.map(stemWord)
    const noArtWs = noArt.split(' ')
    const ok = pWords.every(pw => {
      const ps = stemWord(pw)
      return sWords.includes(pw)  || sStems.includes(pw)  ||
             sWords.includes(ps)  || sStems.includes(ps)  ||
             noArtWs.includes(pw) || noArtWs.includes(ps)
    })
    if (ok) return true
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

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
    return nc ? phrasesMatch(nSpoken, nc, strict) : false
  })
}

export function isPassCommand(spoken: string): boolean {
  const n = normalizeText(spoken)
  return ['pass', 'pas', 'dalej', 'nastepne', 'nastepny', 'skip', 'pomin']
    .some(w => n === w || n.startsWith(w + ' ') || n.endsWith(' ' + w))
}
