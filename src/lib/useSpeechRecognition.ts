/**
 * useSpeechRecognition — Web Speech API hook
 *
 * Architektura:
 * - onInterim: odpala z debouncingiem 200ms, strict matching (word-boundary only)
 * - onFinal:   odpala natychmiast dla wszystkich 3 alternatyw, fuzzy matching
 * - Callbacks w refs — nigdy stale closure
 */

import { useCallback, useEffect, useRef, useState } from 'react'

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

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null
}

interface UseSpeechRecognitionOptions {
  onFinal:   (transcript: string) => void
  onInterim: (transcript: string) => void
  active: boolean
  lang?: string
}

export function useSpeechRecognition({ onFinal, onInterim, active, lang = 'pl-PL' }: UseSpeechRecognitionOptions) {
  const recognitionRef     = useRef<SpeechRecognitionInstance | null>(null)
  const activeRef          = useRef(active)
  const restartTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interimDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onFinalRef         = useRef(onFinal)
  const onInterimRef       = useRef(onInterim)
  const [listening, setListening] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Keep callbacks always fresh
  activeRef.current    = active
  onFinalRef.current   = onFinal
  onInterimRef.current = onInterim

  const stop = useCallback(() => {
    if (restartTimerRef.current)    { clearTimeout(restartTimerRef.current);    restartTimerRef.current = null }
    if (interimDebounceRef.current) { clearTimeout(interimDebounceRef.current); interimDebounceRef.current = null }
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.abort()
      recognitionRef.current = null
    }
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) { setError('Twoja przeglądarka nie obsługuje rozpoznawania mowy. Użyj Chrome lub Edge.'); return }
    if (recognitionRef.current) { recognitionRef.current.onend = null; recognitionRef.current.abort() }

    const rec = new SR()
    rec.lang            = lang
    rec.continuous      = true
    rec.interimResults  = true
    rec.maxAlternatives = 3

    rec.onstart = () => { setListening(true); setError(null) }

    rec.onresult = (e: SpeechRecognitionEvent) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          // Cancel pending interim — final supersedes it
          if (interimDebounceRef.current) { clearTimeout(interimDebounceRef.current); interimDebounceRef.current = null }
          // Send all alternatives (Chrome gives up to 3 — helps with synonym matching)
          const alts = Math.min(result.length ?? 1, 3)
          for (let alt = 0; alt < alts; alt++) {
            const t = result[alt]?.transcript?.trim()
            if (t) onFinalRef.current(t)
          }
        } else {
          // Debounce interim by 200ms — avoids firing on every character
          const t = result[0]?.transcript?.trim()
          if (t) {
            if (interimDebounceRef.current) clearTimeout(interimDebounceRef.current)
            interimDebounceRef.current = setTimeout(() => {
              interimDebounceRef.current = null
              onInterimRef.current(t)
            }, 200)
          }
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
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => { if (activeRef.current) start() }, 300)
      }
    }

    recognitionRef.current = rec
    try { rec.start() } catch { /* ignore */ }
  }, [lang])

  useEffect(() => {
    if (active) { start() } else { stop() }
    return () => stop()
  }, [active])

  return { listening, error }
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalization
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // ą→a, ę→e, ó→o etc.
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Word-boundary match
// Prevents "las" from matching inside "klasyczny" via containment check
// ─────────────────────────────────────────────────────────────────────────────

function containsWholePhrase(spokenNorm: string, phraseNorm: string): boolean {
  if (spokenNorm === phraseNorm) return true
  const escaped = phraseNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(spokenNorm)
}

// ─────────────────────────────────────────────────────────────────────────────
// Phrase matching
// strict=true  → word-boundary only (safe for interim/partial text)
// strict=false → + stem matching and word-level fuzzy (for final/inflections)
// ─────────────────────────────────────────────────────────────────────────────

function matchesPhrase(nSpoken: string, nPhrase: string, strict: boolean): boolean {
  if (!nSpoken || !nPhrase) return false

  // Word-boundary match (both modes)
  if (containsWholePhrase(nSpoken, nPhrase)) return true

  if (strict) return false

  // ── Final-only fuzzy matching ──────────────────────────────────────────

  // Stem match: "wodospad" ↔ "wodospady", "niedźwiedź" ↔ "niedźwiedzia"
  // Only for words >= 6 chars to avoid short-word false positives
  if (nPhrase.length >= 6 && nSpoken.length >= 5) {
    const stemLen    = Math.ceil(nPhrase.length * 0.8)
    const phraseSTEM = nPhrase.slice(0, stemLen)
    const spokenWords = nSpoken.split(' ')
    if (spokenWords.some(w => w.startsWith(phraseSTEM))) return true
  }

  // Multi-word phrase: every word of the phrase must appear in spoken
  const phraseWords = nPhrase.split(' ')
  if (phraseWords.length >= 2) {
    const spokenWords = nSpoken.split(' ')
    const allPresent  = phraseWords.every(pw => {
      // Short words (< 4 chars): exact match required
      if (pw.length < 4) return spokenWords.includes(pw)
      if (spokenWords.includes(pw)) return true
      // Longer words: allow stem match within spoken words
      const pStem = pw.slice(0, Math.ceil(pw.length * 0.8))
      return spokenWords.some(sw => sw.length >= 4 && sw.startsWith(pStem))
    })
    if (allPresent) return true
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if spoken text matches the answer or any synonym.
 * @param strict true = word-boundary only (interim), false = fuzzy (final)
 */
export function isAnswerMatch(
  spoken:   string,
  answer:   string,
  synonyms: string[] = [],
  strict    = false,
): boolean {
  if (!spoken) return false
  const nSpoken = normalizeText(spoken)
  if (!nSpoken) return false

  const candidates = [answer, ...synonyms].filter(Boolean)
  return candidates.some(c => {
    const nc = normalizeText(c)
    return nc ? matchesPhrase(nSpoken, nc, strict) : false
  })
}

export function isPassCommand(spoken: string): boolean {
  const n    = normalizeText(spoken)
  const cmds = ['pass', 'pas', 'dalej', 'nastepne', 'nastepny', 'skip', 'pomin']
  return cmds.some(w => n === w || n.startsWith(w + ' ') || n.endsWith(' ' + w))
}
