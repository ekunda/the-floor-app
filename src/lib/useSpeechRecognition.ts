/**
 * useSpeechRecognition
 *
 * Nasłuchuje głosu gracza i zwraca wykryty tekst przez callback.
 * Używa Web Speech API (Chrome/Edge) — bez zewnętrznych usług, bez klucza API.
 *
 * Obsługuje:
 *  - język polski (pl-PL)
 *  - ciągłe nasłuchiwanie (interim + final results)
 *  - automatyczny restart po zakończeniu sesji (przeglądarka zatrzymuje po ~60s ciszy)
 *  - bezpieczne zatrzymanie i czyszczenie
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// Typ dla Web Speech API (nie w standardowych TypeScript typach)
type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

type SpeechRecognitionEvent = {
  resultIndex: number
  results: {
    [index: number]: {
      isFinal: boolean
      [index: number]: { transcript: string; confidence: number }
    }
    length: number
  }
}

type SpeechRecognitionErrorEvent = { error: string; message: string }

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  )
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null
}

interface UseSpeechRecognitionOptions {
  /** Callback wywoływany gdy zostanie rozpoznane słowo/zdanie (final result) */
  onResult: (transcript: string) => void
  /** Callback wywoływany gdy trwa rozpoznawanie (interim — podgląd w locie) */
  onInterim?: (transcript: string) => void
  /** Czy nasłuchiwanie jest aktywne */
  active: boolean
  /** Język rozpoznawania (domyślnie pl-PL) */
  lang?: string
}

export function useSpeechRecognition({
  onResult,
  onInterim,
  active,
  lang = 'pl-PL',
}: UseSpeechRecognitionOptions) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const activeRef = useRef(active)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  activeRef.current = active

  const stop = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    if (recognitionRef.current) {
      recognitionRef.current.onend = null  // prevent auto-restart
      recognitionRef.current.abort()
      recognitionRef.current = null
    }
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) {
      setError('Twoja przeglądarka nie obsługuje rozpoznawania mowy. Użyj Chrome lub Edge.')
      return
    }

    // Cleanup previous instance
    if (recognitionRef.current) {
      recognitionRef.current.onend = null
      recognitionRef.current.abort()
    }

    const recognition = new SR()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    recognition.onstart = () => {
      setListening(true)
      setError(null)
    }

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      // Fire on interim immediately for fast response — caller decides if it matches
      if (interimTranscript.trim()) {
        onResult(interimTranscript.trim())
        if (onInterim) onInterim(interimTranscript.trim())
      }

      // Also fire on final (may differ from interim)
      if (finalTranscript.trim()) {
        onResult(finalTranscript.trim())
      }
    }

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      // 'no-speech' i 'aborted' są normalne — nie pokazuj jako błąd
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (e.error === 'not-allowed') {
        setError('Brak dostępu do mikrofonu. Zezwól na dostęp w ustawieniach przeglądarki.')
        return
      }
      if (e.error === 'network') {
        setError('Błąd sieci. Rozpoznawanie mowy wymaga połączenia z internetem.')
        return
      }
      console.warn('[Speech] error:', e.error, e.message)
    }

    recognition.onend = () => {
      setListening(false)
      // Auto-restart if still active (przeglądarka zatrzymuje po ~60s ciszy)
      if (activeRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (activeRef.current) start()
        }, 300)
      }
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch (e) {
      console.warn('[Speech] Failed to start:', e)
    }
  }, [lang, onResult, onInterim])

  // Start/stop based on active prop
  useEffect(() => {
    if (active) {
      start()
    } else {
      stop()
    }
    return () => stop()
  }, [active])

  return { listening, error }
}

// ── Normalizacja tekstu do porównania ────────────────────────────────────────

/**
 * Normalizuje tekst: małe litery, usuwa interpunkcję, normalizuje spacje,
 * zamienia polskie znaki diakrytyczne na ASCII.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    // Usuń znaki diakrytyczne (ą→a, ę→e, ó→o itd.)
    .replace(/[\u0300-\u036f]/g, '')
    // Usuń interpunkcję
    .replace(/[^a-z0-9\s]/g, '')
    // Normalizuj spacje
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sprawdza czy mówiony tekst zawiera poprawną odpowiedź.
 * Toleruje różnice diakrytyczne i dopasowuje częściowo.
 *
 * Przykłady:
 *   spoken: "to jest wodospad"  answer: "wodospad"  → true
 *   spoken: "wodospad"           answer: "wodospad"  → true
 *   spoken: "wodospady"          answer: "wodospad"  → true (stem match)
 */
/** Single-phrase match logic */
function matchesPhrase(nSpoken: string, nPhrase: string): boolean {
  if (!nSpoken || !nPhrase) return false

  // Exact match
  if (nSpoken === nPhrase) return true

  // Phrase contained in spoken (np. "to jest wodospad karkonoski")
  if (nSpoken.includes(nPhrase)) return true

  // Spoken contained in phrase (np. odpowiedź "złoty baran", powiedziano "baran")
  if (nPhrase.includes(nSpoken) && nSpoken.length >= 3) return true

  // Stem match — pierwsze 75% liter (np. wodospad/wodospady)
  if (nPhrase.length >= 5 && nSpoken.length >= 5) {
    const stemLen = Math.min(Math.ceil(nPhrase.length * 0.75), nPhrase.length - 1)
    if (nPhrase.slice(0, stemLen) === nSpoken.slice(0, stemLen)) return true
  }

  // Word-level: każde słowo frazy musi być w mówionym tekście
  const phraseWords = nPhrase.split(' ')
  if (phraseWords.length > 1) {
    const spokenWords = nSpoken.split(' ')
    const allMatch = phraseWords.every(pw =>
      spokenWords.some(sw => sw.startsWith(pw.slice(0, Math.max(3, pw.length - 2))))
    )
    if (allMatch) return true
  }

  return false
}

/**
 * Sprawdza czy mówiony tekst zawiera poprawną odpowiedź lub któryś z synonimów.
 */
export function isAnswerMatch(spoken: string, answer: string, synonyms: string[] = []): boolean {
  if (!spoken) return false

  const nSpoken = normalizeText(spoken)
  if (!nSpoken) return false

  // Check main answer
  const nAnswer = normalizeText(answer)
  if (nAnswer && matchesPhrase(nSpoken, nAnswer)) return true

  // Check synonyms
  for (const syn of synonyms) {
    const nSyn = normalizeText(syn)
    if (nSyn && matchesPhrase(nSpoken, nSyn)) return true
  }

  return false
}

/**
 * Sprawdza czy wypowiedziano komendę "pass".
 */
export function isPassCommand(spoken: string): boolean {
  const n = normalizeText(spoken)
  const passWords = ['pass', 'pas', 'dalej', 'nastepne', 'nastepny', 'skip', 'pomiń', 'pomin']
  return passWords.some(w => n === w || n.startsWith(w + ' ') || n.endsWith(' ' + w))
}
