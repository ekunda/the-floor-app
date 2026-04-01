/**
 * useDuelLogic — wydzielona logika z DuelModal.tsx
 *
 * Odpowiada za:
 *  - timer (setInterval + tick)
 *  - countdown (timeouty 3-2-1-START)
 *  - wykrywanie końca duel (timer → 0 → winner)
 *  - ładowanie URL obrazka
 *  - feedback state + showFeedback()
 *  - speech recognition (useSpeechRecognition + tryVoiceMatch)
 *  - hint litera (SHOW_ANSWER_HINT po 10s)
 *
 * DuelModal.tsx jest odpowiedzialny wyłącznie za:
 *  - renderowanie JSX
 *  - keyboard event listener (wywołuje handleCorrect/handlePass/handleClose)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { SoundEngine } from '../lib/SoundEngine'
import { supabase } from '../lib/supabase'
import {
  buildMatchData, isAnswerMatchFast, isPassCommand,
  isSpeechRecognitionSupported, useSpeechRecognition,
} from '../lib/useSpeechRecognition'
import type { MatchData } from '../lib/useSpeechRecognition'
import { useConfigStore } from '../store/useConfigStore'
import { useGameStore } from '../store/useGameStore'

export type FeedbackType = 'correct' | 'pass' | 'timeout' | 'voice' | 'forfeit' | ''
export type WinnerNum    = 1 | 2 | 'draw' | null

export interface DuelLogicResult {
  feedback:         { text: string; type: FeedbackType }
  winner:           WinnerNum
  countdown:        string | null
  imageUrl:         string
  hintLetter:       string | null
  listening:        boolean
  speechError:      string | null
  speechEnabled:    boolean
  speechSupported:  boolean
  setSpeechEnabled: React.Dispatch<React.SetStateAction<boolean>>
  handleStartFight: () => void
  handleCorrect:    (playerNum: 1 | 2, fromVoice?: boolean) => void
  handlePass:       () => void
  handleClose:      () => void
}

export function useDuelLogic(): DuelLogicResult {
  const duel              = useGameStore(s => s.duel)
  const markCorrect       = useGameStore(s => s.markCorrect)
  const pass              = useGameStore(s => s.pass)
  const closeDuel         = useGameStore(s => s.closeDuel)
  const startFight        = useGameStore(s => s.startFight)
  const blockInput        = useGameStore(s => s.blockInput)
  const nextQuestion      = useGameStore(s => s.nextQuestion)
  const endDuelWithWinner = useGameStore(s => s.endDuelWithWinner)
  const endDuelDraw       = useGameStore(s => s.endDuelDraw)
  const { config, players } = useConfigStore()

  const speechSupported  = isSpeechRecognitionSupported()
  const voicePassEnabled = config.VOICE_PASS !== 0
  const maxPasses        = config.MAX_PASSES ?? 0

  // ── State ─────────────────────────────────────────────────────────────────
  const [countdown,     setCountdown]     = useState<string | null>(null)
  const [imageUrl,      setImageUrl]      = useState('')
  const [feedback,      setFeedback]      = useState<{ text: string; type: FeedbackType }>({ text: '', type: '' })
  const [winner,        setWinner]        = useState<WinnerNum>(null)
  const [speechEnabled, setSpeechEnabled] = useState(false)
  const [hintLetter,    setHintLetter]    = useState<string | null>(null)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const intervalIdRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const feedbackTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winnerTimer         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer           = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winnerHandled       = useRef(false)
  const countdownTimeouts   = useRef<ReturnType<typeof setTimeout>[]>([])
  const duelRef             = useRef(duel)
  const blockRef            = useRef(blockInput)
  const countdownRef        = useRef(countdown)
  const activePlayerRef     = useRef<1 | 2>(1)
  const voicePassRef        = useRef(voicePassEnabled)
  const matchDataRef        = useRef<MatchData | null>(null)
  const updateGrammarRef    = useRef<((a: string, s?: string[]) => void) | null>(null)
  const handlePassRef       = useRef<(fromVoice?: boolean) => void>(() => {})
  const handleCorrectRef    = useRef<(p: 1 | 2, fromVoice?: boolean) => void>(() => {})
  const handleCloseRef      = useRef<() => void>(() => {})
  const matchedQIdRef       = useRef<string | null>(null)
  const passedQIdRef        = useRef<string | null>(null)
  const prevActiveTimerRef  = useRef<number | null>(null)
  const pasDebounceTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Aktualizuj refs co render
  duelRef.current         = duel
  blockRef.current        = blockInput
  countdownRef.current    = countdown
  activePlayerRef.current = duel?.active ?? 1
  voicePassRef.current    = voicePassEnabled

  const isOpen = !!duel

  // ── Zmiana pytania: pre-oblicz matchData + gramatykę + hint ──────────────
  useEffect(() => {
    const q        = duel?.currentQuestion
    const answer   = q?.answer ?? ''
    const synonyms = Array.isArray(q?.synonyms) ? q!.synonyms : []

    matchDataRef.current      = answer ? buildMatchData(answer, synonyms) : null
    matchedQIdRef.current     = null
    passedQIdRef.current      = null
    setHintLetter(null)

    if (answer && updateGrammarRef.current) updateGrammarRef.current(answer, synonyms)

    if (hintTimer.current) clearTimeout(hintTimer.current)
    if (config.SHOW_ANSWER_HINT === 1 && q?.answer) {
      hintTimer.current = setTimeout(() => setHintLetter(q.answer[0]?.toUpperCase() ?? null), 10_000)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.currentQuestion?.id])

  // ── Stop muzyki gdy modal otwarty ────────────────────────────────────────
  useEffect(() => {
    if (isOpen) SoundEngine.stopBg(600)
  }, [isOpen])

  // ── Beep timera (3·2·1) ──────────────────────────────────────────────────
  useEffect(() => {
    if (!duel?.started || duel.paused || countdown) { prevActiveTimerRef.current = null; return }
    const activeTimer = duel.active === 1 ? duel.timer1 : duel.timer2
    const prev        = prevActiveTimerRef.current
    prevActiveTimerRef.current = activeTimer
    if (prev !== null && activeTimer < prev && activeTimer >= 1 && activeTimer <= 3) {
      SoundEngine.timerBeep(activeTimer as 1 | 2 | 3, 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.timer1, duel?.timer2, duel?.active, duel?.started, duel?.paused, countdown])

  // ── Image URL ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!duel?.currentQuestion?.image_path) { setImageUrl(''); return }
    const { data } = supabase.storage.from('question-images').getPublicUrl(duel.currentQuestion.image_path)
    setImageUrl(data.publicUrl)
  }, [duel?.currentQuestion?.id])

  // ── Ticker (setInterval → useGameStore.tick) ──────────────────────────────
  useEffect(() => {
    const shouldRun = duel?.started && !duel.paused
    if (!shouldRun) {
      if (intervalIdRef.current) { clearInterval(intervalIdRef.current); intervalIdRef.current = null }
      return
    }
    if (intervalIdRef.current) return
    intervalIdRef.current = setInterval(useGameStore.getState().tick, 1000)
    return () => {
      if (intervalIdRef.current) { clearInterval(intervalIdRef.current); intervalIdRef.current = null }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.started, duel?.paused])

  // ── Koniec timera → winner ────────────────────────────────────────────────
  useEffect(() => {
    const d = duel
    if (!d?.started || !d.paused || winnerHandled.current) return
    if (d.timer1 > 0 && d.timer2 > 0) return
    if (intervalIdRef.current) { clearInterval(intervalIdRef.current); intervalIdRef.current = null }

    winnerHandled.current = true
    showFeedback('⏰ Czas minął!', 'timeout')

    winnerTimer.current = setTimeout(() => {
      const p1Lost = d.timer1 <= 0
      const p2Lost = d.timer2 <= 0
      if (p1Lost && p2Lost) {
        setWinner('draw'); endDuelDraw(); SoundEngine.play('applause', 0.6)
      } else {
        const w: 1 | 2 = p1Lost ? 2 : 1
        setWinner(w); endDuelWithWinner(w); SoundEngine.play('applause', 0.9)
      }
      winnerTimer.current = setTimeout(() => handleCloseRef.current(), config.WIN_CLOSE_MS)
    }, 1200)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.timer1, duel?.timer2, duel?.paused])

  // ── Reset gdy modal zamknięty ─────────────────────────────────────────────
  useEffect(() => {
    if (!duel) {
      if (intervalIdRef.current)   { clearInterval(intervalIdRef.current); intervalIdRef.current = null }
      if (hintTimer.current)       { clearTimeout(hintTimer.current); hintTimer.current = null }
      if (pasDebounceTimer.current){ clearTimeout(pasDebounceTimer.current); pasDebounceTimer.current = null }
      setCountdown(null); setFeedback({ text: '', type: '' }); setWinner(null)
      setImageUrl(''); setHintLetter(null)
      winnerHandled.current       = false
      matchedQIdRef.current       = null
      passedQIdRef.current        = null
      prevActiveTimerRef.current  = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showFeedback(text: string, type: FeedbackType) {
    if (hintTimer.current) clearTimeout(hintTimer.current)
    setHintLetter(null)
    setFeedback({ text, type })
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setFeedback({ text: '', type: '' }), config.FEEDBACK_MS + 300)
  }

  const cancelCountdown = useCallback(() => {
    countdownTimeouts.current.forEach(clearTimeout)
    countdownTimeouts.current = []
    setCountdown(null)
  }, [])

  const runCountdown = useCallback(() => {
    SoundEngine.play('countdown', 0.85)
    ;[
      { label: '3', delay: 0    },
      { label: '2', delay: 1000 },
      { label: '1', delay: 2000 },
      { label: 'START!', delay: 3000 },
    ].forEach(({ label, delay }) => {
      const id = setTimeout(() => setCountdown(label), delay)
      countdownTimeouts.current.push(id)
    })
    const finalId = setTimeout(() => {
      setCountdown(null)
      countdownTimeouts.current = []
      prevActiveTimerRef.current = null
      const q = nextQuestion()
      useGameStore.setState(s => ({ duel: s.duel ? { ...s.duel, paused: false, currentQuestion: q } : null }))
      SoundEngine.startBg('duelMusic', 0.22)
    }, 4300)
    countdownTimeouts.current.push(finalId)
  }, [nextQuestion])

  // ── Akcje ─────────────────────────────────────────────────────────────────
  const handleStartFight = useCallback(() => {
    startFight()
    SoundEngine.unlockAudio().catch(() => {})
    setTimeout(runCountdown, 50)
  }, [startFight, runCountdown])

  const handleCorrect = useCallback((playerNum: 1 | 2, fromVoice = false) => {
    if (!duelRef.current?.started || blockRef.current || countdownRef.current) return
    if (duelRef.current.active !== playerNum) return
    const ans = duelRef.current.currentQuestion?.answer ?? '???'
    SoundEngine.play('correct', 0.75)
    showFeedback(fromVoice ? `🎤 ${ans}` : `✓  ${ans}`, fromVoice ? 'voice' : 'correct')
    markCorrect(playerNum)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markCorrect])

  const handlePass = useCallback((fromVoice = false) => {
    if (!duelRef.current?.started || blockRef.current || countdownRef.current) return
    const d   = duelRef.current
    const ans = d.currentQuestion?.answer ?? '???'

    if (maxPasses > 0 && (d.passCount ?? 0) >= maxPasses) {
      SoundEngine.play('buzzer', 0.6)
      showFeedback('🚫 Przekroczono limit pasów!', 'forfeit')
      const loser   = d.active
      const winner2 = (loser === 1 ? 2 : 1) as 1 | 2
      setTimeout(() => {
        setWinner(winner2)
        endDuelWithWinner(winner2)
        SoundEngine.play('applause', 0.9)
        winnerTimer.current = setTimeout(() => handleCloseRef.current(), config.WIN_CLOSE_MS)
      }, 1200)
      return
    }

    SoundEngine.play('buzzer', 0.4)
    showFeedback(fromVoice ? `🎤 PAS  ·  ${ans}` : `⏱ PAS  ·  ${ans}`, 'pass')
    pass()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass, endDuelWithWinner, maxPasses])

  const handleClose = useCallback(() => {
    cancelCountdown()
    if (intervalIdRef.current) { clearInterval(intervalIdRef.current); intervalIdRef.current = null }
    if (winnerTimer.current)   clearTimeout(winnerTimer.current)
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    if (hintTimer.current)     clearTimeout(hintTimer.current)
    SoundEngine.stopBg(500)
    setTimeout(() => SoundEngine.startBg('bgMusic', 0.3), 600)
    closeDuel()
  }, [cancelCountdown, closeDuel])

  // Stabilne refs dla callbacków (unikają stale closures w voice/keyboard)
  handleCloseRef.current   = handleClose
  handlePassRef.current    = handlePass
  handleCorrectRef.current = handleCorrect

  // ── Voice: firePas z debounce ─────────────────────────────────────────────
  const firePas = useCallback((questionId: string | null) => {
    if (passedQIdRef.current === questionId) return
    passedQIdRef.current = questionId
    handlePassRef.current(true)  // fromVoice=true → pokazuje 🎤 PAS
  }, [])

  const tryVoiceMatch = useCallback((transcript: string, isFinal: boolean) => {
    const d = duelRef.current
    if (!d?.started || blockRef.current || countdownRef.current) return
    const questionId = d.currentQuestion?.id ?? null

    // PAS — tylko na final (interim "pas" powoduje podwójny pas)
    if (voicePassRef.current && isPassCommand(transcript)) {
      if (passedQIdRef.current === questionId) {
        if (pasDebounceTimer.current) { clearTimeout(pasDebounceTimer.current); pasDebounceTimer.current = null }
        return
      }
      if (isFinal) {
        if (pasDebounceTimer.current) { clearTimeout(pasDebounceTimer.current); pasDebounceTimer.current = null }
        firePas(questionId)
      } else {
        if (pasDebounceTimer.current) return
        pasDebounceTimer.current = setTimeout(() => {
          pasDebounceTimer.current = null
          const cur = duelRef.current
          if (!cur?.started || blockRef.current) return
          firePas(cur.currentQuestion?.id ?? null)
        }, 180)
      }
      return
    }

    // Transcript rozwinął się poza "pas" → anuluj debounce
    if (pasDebounceTimer.current) { clearTimeout(pasDebounceTimer.current); pasDebounceTimer.current = null }

    // Odpowiedź: interim (strict) i final (fuzzy)
    if (matchedQIdRef.current === questionId) return
    const matchData = matchDataRef.current
    if (!matchData) return
    if (isAnswerMatchFast(transcript, matchData, !isFinal)) {
      matchedQIdRef.current = questionId
      handleCorrectRef.current(activePlayerRef.current, true)
    }
  }, [firePas])

  const handleInterim = useCallback((t: string) => tryVoiceMatch(t, false), [tryVoiceMatch])
  const handleFinal   = useCallback((t: string) => tryVoiceMatch(t, true),  [tryVoiceMatch])

  const { listening, error: speechError, updateGrammar } = useSpeechRecognition({
    onFinal:   handleFinal,
    onInterim: handleInterim,
    active:    speechEnabled && !!duel?.started,
    lang:      duel?.lang === 'both' ? ['pl-PL', 'en-US'] : (duel?.lang ?? 'pl-PL'),
  })
  updateGrammarRef.current = updateGrammar

  // ── Eksponuj publiczne API ────────────────────────────────────────────────
  // players eksponujemy tylko pośrednio przez DuelModal (ma dostęp do configStore)
  void players

  return {
    feedback, winner, countdown, imageUrl, hintLetter,
    listening, speechError: speechError ?? null,
    speechEnabled, setSpeechEnabled, speechSupported,
    handleStartFight, handleCorrect, handlePass, handleClose,
  }
}
