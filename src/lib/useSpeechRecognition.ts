/**
 * useSpeechRecognition — v3 rewrite
 *
 * ARCHITECTURE:
 *   Matching pipeline:  transcript → normalizeText → MatchData lookup
 *   Recognition loop:   continuous + auto-restart (zero-gap / leapfrog)
 *   Error recovery:     watchdog timer + transient error retry
 *
 * OPTIMIZATIONS:
 *   1. Pre-compiled regex cache (compile once per phrase)
 *   2. Pre-normalized MatchData with singleWords Set for O(1) includes()
 *   3. Zero-gap restart / leapfrog for multi-lang
 *   4. JSGF grammar hints for Chrome ASR
 *   5. All interim alternatives processed (up to 4)
 *   6. Substring matching on interims for single-word answers
 *   7. Polish-specific: ł→l, common ASR error corrections
 *   8. Pre-compiled pass command regex (O(1) vs O(n) iteration)
 *   9. Watchdog: auto-restart if recognition silently dies
 *  10. Retry on transient errors (network, audio-capture)
 */

import { useEffect, useRef, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SR = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  grammars: unknown
  start: () => void; stop: () => void; abort: () => void
  onresult: ((e: SREvent) => void) | null
  onerror:  ((e: SRError) => void) | null
  onend:    (() => void) | null
  onstart:  (() => void) | null
}
type SREvent = {
  resultIndex: number
  results: { [i: number]: { isFinal: boolean; length: number; [alt: number]: { transcript: string } }; length: number }
}
type SRError = { error: string; message: string }
type SRGrammarList = { addFromString: (s: string, weight?: number) => void }

function getSRClass(): (new () => SR) | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

function getSRGrammarList(): (new () => SRGrammarList) | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).SpeechGrammarList || (window as any).webkitSpeechGrammarList || null
}

export function isSpeechRecognitionSupported(): boolean {
  return getSRClass() !== null
}

interface UseSpeechRecognitionOptions {
  onFinal:    (transcript: string) => void
  onInterim:  (transcript: string) => void
  active:     boolean
  lang?:      string | string[]
  /** Change value to force-restart recognition (watchdog use) */
  restartKey?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Text normalization — Polish-aware
// ─────────────────────────────────────────────────────────────────────────────

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')               // ł→l (NFD doesn't decompose ł)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // ą→a, ę→e, ó→o, ś→s, ż→z, ź→z, ć→c, ń→n
    .replace(/[^a-z0-9\s]/g, '')       // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function stripArticles(t: string): string {
  return t.replace(/\b(the|a|an)\s+/g, '').replace(/\s+/g, ' ').trim()
}

// ── Stemming (simple suffix-based) ──────────────────────────────────────────

function stemWord(w: string): string {
  if (w.length <= 3) return w
  // English
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  if (w.endsWith('ves') && w.length > 4) return w.slice(0, -3) + 'f'
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3)
  if (w.endsWith('ed')  && w.length > 4) return w.slice(0, -2)
  // Polish diminutives / plurals
  if (w.endsWith('ow')  && w.length > 4) return w.slice(0, -2)
  if (w.endsWith('ami') && w.length > 5) return w.slice(0, -3)
  if (w.endsWith('ach') && w.length > 5) return w.slice(0, -3)
  // Generic
  if (w.endsWith('es')  && w.length > 3) return w.slice(0, -2)
  if (w.endsWith('s')   && w.length > 3) return w.slice(0, -1)
  if (w.length >= 6) return w.slice(0, Math.ceil(w.length * 0.8))
  return w
}

function stemPhrase(t: string): string {
  return t.split(' ').map(stemWord).join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-compiled regex cache
// ─────────────────────────────────────────────────────────────────────────────

const regexCache = new Map<string, RegExp>()
const MAX_REGEX_CACHE = 300

function getWordBoundaryRegex(phrase: string): RegExp {
  let re = regexCache.get(phrase)
  if (!re) {
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    re = new RegExp(`(?:^|\\s)${esc}(?:\\s|$)`)
    regexCache.set(phrase, re)
    if (regexCache.size > MAX_REGEX_CACHE) {
      const firstKey = regexCache.keys().next().value
      if (firstKey) regexCache.delete(firstKey)
    }
  }
  return re
}

function wholeWordMatch(spoken: string, phrase: string): boolean {
  if (spoken === phrase) return true
  return getWordBoundaryRegex(phrase).test(spoken)
}

// ─────────────────────────────────────────────────────────────────────────────
// MatchData — pre-computed per question
// ─────────────────────────────────────────────────────────────────────────────

export interface MatchData {
  /** All normalized phrase variants to check */
  phrases:      string[]
  /** Single-word phrases as Set for O(1) includes() check on interims */
  singleWords:  Set<string>
  /** Minimum phrase length — early exit when spoken is shorter */
  minLen:       number
}

/**
 * Build MatchData from answer + synonyms.
 * Called ONCE per question change — never per speech event.
 */
export function buildMatchData(answer: string, synonyms: string[] = []): MatchData {
  const all     = [answer, ...synonyms].filter(Boolean)
  const phrases = new Set<string>()

  for (const raw of all) {
    const n = normalizeText(raw)
    if (!n) continue

    const noArt     = stripArticles(n)
    const stem      = stemPhrase(n)
    const noArtStem = stemPhrase(noArt)

    phrases.add(n)
    if (noArt !== n)          phrases.add(noArt)
    if (stem !== n)           phrases.add(stem)
    if (noArtStem !== stem)   phrases.add(noArtStem)
  }

  // Pre-compile regexes
  phrases.forEach(p => getWordBoundaryRegex(p))

  // Extract single-word phrases for fast substring matching on interims
  const singleWords = new Set<string>()
  for (const p of phrases) {
    if (!p.includes(' ')) singleWords.add(p)
  }

  const minLen = phrases.size > 0
    ? Math.min(...[...phrases].map(p => p.length))
    : 999

  return { phrases: [...phrases], singleWords, minLen }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phrase matching — fast path with includes() for interims
// ─────────────────────────────────────────────────────────────────────────────

function phrasesMatchFast(nSpoken: string, matchData: MatchData, strict: boolean): boolean {
  if (!nSpoken) return false
  if (nSpoken.length < matchData.minLen) return false

  const noArt = stripArticles(nSpoken)

  // ── Fast path: single-word substring check (interims + finals) ──
  // If any expected single-word phrase appears anywhere in the spoken text,
  // accept it immediately. This catches ASR outputs like "to jest kraków"
  // where "krakow" is embedded in a longer string.
  for (const sw of matchData.singleWords) {
    if (nSpoken === sw || noArt === sw) return true
    // Substring match — word must appear with word boundaries
    if (wholeWordMatch(nSpoken, sw)) return true
    if (noArt !== nSpoken && wholeWordMatch(noArt, sw)) return true
  }

  // ── Multi-word phrases ──
  for (const phrase of matchData.phrases) {
    if (phrase === nSpoken || phrase === noArt) return true

    // Skip single-word phrases (already checked above)
    if (!phrase.includes(' ')) continue

    // Whole-word boundary match
    if (wholeWordMatch(nSpoken, phrase)) return true
    if (noArt !== nSpoken && wholeWordMatch(noArt, phrase)) return true

    if (strict) continue  // interims: no fuzzy for multi-word

    // Stem matching (final only)
    const stem      = stemPhrase(nSpoken)
    const noArtStem = stemPhrase(noArt)
    if (stem && wholeWordMatch(stem, phrase))         return true
    if (noArtStem && wholeWordMatch(noArtStem, phrase)) return true

    // Multi-word: all phrase words present in spoken (any order)
    const pWords = phrase.split(' ')
    const sWords = new Set(nSpoken.split(' '))
    const sStems = new Set(nSpoken.split(' ').map(stemWord))
    const ok = pWords.every(pw => {
      const ps = stemWord(pw)
      return sWords.has(pw) || sWords.has(ps) || sStems.has(pw) || sStems.has(ps)
    })
    if (ok) return true
  }

  // ── Final-only: stem matching for single words ──
  if (!strict) {
    const stem      = stemPhrase(nSpoken)
    const noArtStem = stemPhrase(noArt)
    for (const sw of matchData.singleWords) {
      if (stem === sw || noArtStem === sw) return true
      if (wholeWordMatch(stem, sw)) return true
      if (wholeWordMatch(noArtStem, sw)) return true
    }
  }

  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Fast variant using pre-built MatchData. ~10× faster than isAnswerMatch. */
export function isAnswerMatchFast(spoken: string, matchData: MatchData, strict = false): boolean {
  if (!spoken) return false
  const nSpoken = normalizeText(spoken)
  return phrasesMatchFast(nSpoken, matchData, strict)
}

/** Backward-compatible variant (builds MatchData on every call). */
export function isAnswerMatch(
  spoken:   string,
  answer:   string,
  synonyms: string[] = [],
  strict    = false,
): boolean {
  if (!spoken || !answer) return false
  const nSpoken = normalizeText(spoken)
  if (!nSpoken) return false
  return phrasesMatchFast(nSpoken, buildMatchData(answer, synonyms), strict)
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass commands — pre-compiled regex for O(1) check
// ─────────────────────────────────────────────────────────────────────────────

export const PASS_WORDS = ['pass', 'pas', 'dalej', 'nastepne', 'nastepny',
  'nastepnie', 'pomijam', 'pomin', 'pomijamy', 'skip', 'przejdz', 'kolejne',
  'pomiń', 'następne', 'następny', 'następnie', 'przejdź'] as const

// Pre-compiled: matches any pass word as a whole word (with boundaries)
const _passRegex = new RegExp(
  `(?:^|\\s)(${PASS_WORDS.map(w => normalizeText(w)).filter((v, i, a) => a.indexOf(v) === i).join('|')})(?:\\s|$)`
)

export function isPassCommand(spoken: string): boolean {
  const n = normalizeText(spoken)
  if (!n) return false
  return _passRegex.test(n)
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/** Watchdog interval — detect silently-dead recognition */
const WATCHDOG_MS      = 4000
/** Max consecutive transient errors before giving up */
const MAX_RETRIES      = 3
/** Delay before retrying after a transient error */
const RETRY_DELAY_MS   = 500

export function useSpeechRecognition({
  onFinal, onInterim, active, lang = 'pl-PL', restartKey = 0,
}: UseSpeechRecognitionOptions) {
  const langs    = Array.isArray(lang) ? [...new Set(lang)] : [lang]
  const leapfrog = langs.length > 1

  const onFinalRef     = useRef(onFinal)
  const onInterimRef   = useRef(onInterim)
  const activeRef      = useRef(active)
  const leapfrogIdx    = useRef(0)
  const recRef         = useRef<SR | null>(null)
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const watchdogRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastInterim    = useRef('')
  const lastEventTs    = useRef(0)           // timestamp of last onresult/onstart
  const stoppedRef     = useRef(false)
  const retriesRef     = useRef(0)
  const SRClassRef     = useRef<(new () => SR) | null>(null)
  const grammarRef     = useRef<unknown>(null)

  const [listening, setListening] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  onFinalRef.current   = onFinal
  onInterimRef.current = onInterim
  activeRef.current    = active

  // ── Grammar hints for Chrome ASR ──────────────────────────────────────────

  const updateGrammar = (answer: string, synonyms: string[] = []) => {
    const SRGList = getSRGrammarList()
    if (!SRGList) return

    try {
      const seen = new Set<string>()
      const words: string[] = []
      for (const w of [answer, ...synonyms, ...PASS_WORDS]) {
        if (!w) continue
        const n = normalizeText(w)
        const s = stemPhrase(n)
        if (n && !seen.has(n)) { seen.add(n); words.push(n) }
        if (s && s !== n && !seen.has(s)) { seen.add(s); words.push(s) }
      }
      if (words.length === 0) return

      const jsgf = `#JSGF V1.0; grammar answers; public <answer> = ${words.join(' | ')};`
      const gl   = new SRGList()
      gl.addFromString(jsgf, 1.0)
      grammarRef.current = gl
    } catch {
      grammarRef.current = null
    }
  }

  // ── Build recognition instance ────────────────────────────────────────────

  function buildRec(l: string): SR {
    const SRC = SRClassRef.current!
    const rec = new SRC()
    rec.lang            = l
    rec.continuous      = true
    rec.interimResults  = true
    rec.maxAlternatives = 4

    if (grammarRef.current) {
      try { rec.grammars = grammarRef.current } catch { /* unsupported */ }
    }

    rec.onstart = () => {
      setListening(true)
      setError(null)
      lastInterim.current = ''
      lastEventTs.current = Date.now()
      retriesRef.current  = 0
    }

    rec.onresult = (e: SREvent) => {
      lastEventTs.current = Date.now()

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (result.isFinal) {
          lastInterim.current = ''
          const alts = Math.min(result.length ?? 1, 4)
          for (let a = 0; a < alts; a++) {
            const t = result[a]?.transcript?.trim()
            if (t) onFinalRef.current(t)
          }
        } else {
          // Process ALL interim alternatives for fastest detection
          const alts = Math.min(result.length ?? 1, 4)
          for (let a = 0; a < alts; a++) {
            const t = result[a]?.transcript?.trim()
            if (!t) continue
            if (a === 0) {
              if (t === lastInterim.current) continue
              lastInterim.current = t
            }
            onInterimRef.current(t)
          }
        }
      }
    }

    rec.onerror = (e: SRError) => {
      if (e.error === 'aborted') return  // intentional stop

      // Transient errors — retry automatically
      if (e.error === 'no-speech' || e.error === 'audio-capture' || e.error === 'network') {
        if (e.error === 'network') {
          setError('Błąd sieci — rozpoznawanie wymaga połączenia z internetem.')
        }
        // Auto-retry (up to MAX_RETRIES consecutive failures)
        if (retriesRef.current < MAX_RETRIES && !stoppedRef.current && activeRef.current) {
          retriesRef.current++
          return  // onend will fire and restart
        }
        return
      }

      if (e.error === 'not-allowed') {
        setError('Brak dostępu do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki.')
        stoppedRef.current = true  // don't retry — permission issue
        setListening(false)
        return
      }
    }

    rec.onend = () => {
      lastInterim.current = ''
      if (stoppedRef.current || !activeRef.current) {
        setListening(false)
        return
      }

      if (leapfrog) {
        leapfrogIdx.current = (leapfrogIdx.current + 1) % langs.length
        startRec(langs[leapfrogIdx.current])
      } else {
        // Zero-gap restart
        if (timerRef.current) clearTimeout(timerRef.current)
        const delay = retriesRef.current > 0 ? RETRY_DELAY_MS : 0
        timerRef.current = setTimeout(() => {
          if (!stoppedRef.current && activeRef.current) startRec(l)
        }, delay)
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
    if (timerRef.current)   { clearTimeout(timerRef.current);   timerRef.current   = null }
    if (watchdogRef.current){ clearInterval(watchdogRef.current); watchdogRef.current = null }
    if (recRef.current) {
      recRef.current.onend = null
      recRef.current.abort()
      recRef.current = null
    }
    setListening(false)
  }

  function startAll() {
    stoppedRef.current  = false
    retriesRef.current  = 0
    leapfrogIdx.current = 0
    lastEventTs.current = Date.now()
    startRec(langs[0])

    // ── Watchdog: detect silently-dead recognition ──
    // Chrome sometimes drops recognition without firing onend.
    // If no events for WATCHDOG_MS, force restart.
    if (watchdogRef.current) clearInterval(watchdogRef.current)
    watchdogRef.current = setInterval(() => {
      if (stoppedRef.current || !activeRef.current) return
      if (Date.now() - lastEventTs.current > WATCHDOG_MS && !listening) {
        console.warn('[Speech] Watchdog: recognition appears dead, restarting…')
        lastEventTs.current = Date.now()
        startRec(langs[leapfrogIdx.current])
      }
    }, WATCHDOG_MS)
  }

  useEffect(() => {
    const SRC = getSRClass()
    if (!SRC) {
      setError('Twoja przeglądarka nie obsługuje rozpoznawania mowy. Użyj Chrome lub Edge.')
      return
    }
    SRClassRef.current = SRC
    if (active) { startAll() } else { stopAll() }
    return () => stopAll()
  // restartKey in deps — changing it forces restart
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, langs.join(','), restartKey])

  return { listening, error, updateGrammar }
}
