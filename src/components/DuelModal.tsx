import { useCallback, useEffect, useRef, useState } from 'react'
import { SoundEngine } from '../lib/SoundEngine'
import { isAnswerMatch, isPassCommand, isSpeechRecognitionSupported, useSpeechRecognition } from '../lib/useSpeechRecognition'
import { supabase } from '../lib/supabase'
import { useConfigStore } from '../store/useConfigStore'
import { useGameStore } from '../store/useGameStore'

type FeedbackType = 'correct' | 'pass' | 'timeout' | 'voice' | ''
type WinnerNum = 1 | 2 | 'draw' | null

export default function DuelModal() {
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

  const [countdown, setCountdown]         = useState<string | null>(null)
  const [imageUrl, setImageUrl]           = useState<string>('')
  const [feedback, setFeedback]           = useState<{ text: string; type: FeedbackType }>({ text: '', type: '' })
  const [winner, setWinner]               = useState<WinnerNum>(null)
  const [intervalId, setIntervalId]       = useState<ReturnType<typeof setInterval> | null>(null)
  const [speechEnabled, setSpeechEnabled] = useState(false)
  // lang comes from duel.lang (set per-category in admin panel)


  const speechSupported = isSpeechRecognitionSupported()

  // ── Stable refs for use inside callbacks ─────────────────────────────────
  const feedbackTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winnerTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const winnerHandled     = useRef(false)
  const countdownTimeouts = useRef<ReturnType<typeof setTimeout>[]>([])
  const duelRef           = useRef(duel)
  const blockRef          = useRef(blockInput)
  const countdownRef      = useRef(countdown)

  // ── Current question data — dedicated refs updated on question change ─────
  // This guarantees speech callbacks always have fresh answer + synonyms
  // regardless of Zustand spread/copy behavior
  const currentAnswerRef   = useRef<string>('')
  const currentSynonymsRef = useRef<string[]>([])
  const activePlayerRef    = useRef<1 | 2>(1)

  // ── Action refs — updated every render, called from speech callbacks ──────
  const handlePassRef    = useRef<() => void>(() => {})
  const handleCorrectRef = useRef<(playerNum: 1 | 2, fromVoice?: boolean) => void>(() => {})

  // ── Per-question anti-double-fire: track ID, not time ───────────────────
  // Resets automatically when question changes — no blocking on next question
  const matchedQuestionIdRef = useRef<string | null>(null)

  // Keep refs fresh on every render
  duelRef.current       = duel
  blockRef.current      = blockInput
  countdownRef.current  = countdown
  activePlayerRef.current = duel?.active ?? 1

  // ── Update answer/synonyms whenever question changes ─────────────────────
  useEffect(() => {
    const q = duel?.currentQuestion
    currentAnswerRef.current   = q?.answer ?? ''
    currentSynonymsRef.current = Array.isArray(q?.synonyms) ? q!.synonyms : []
    matchedQuestionIdRef.current = null  // allow matching on new question
  }, [duel?.currentQuestion?.id])

  const isOpen = !!duel

  /* ── Stop bgMusic when modal opens ── */
  useEffect(() => {
    if (isOpen) SoundEngine.stopBg(600)
  }, [isOpen])

  const volumeFactor = (base: number) => base * (config.SOUND_VOLUME / 100)

  /* ── Resolve image URL ── */
  const resolveImageUrl = useCallback((path: string | null | undefined): string => {
    if (!path) return ''
    return supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl
  }, [])

  /* ── Update image when question changes ── */
  useEffect(() => {
    if (!duel?.currentQuestion) { setImageUrl(''); return }
    setImageUrl(resolveImageUrl(duel.currentQuestion.image_path))
  }, [duel?.currentQuestion?.id, resolveImageUrl])

  /* ── Ticker ── */
  useEffect(() => {
    const shouldRun = duel?.started && !duel.paused
    if (!shouldRun) {
      if (intervalId) { clearInterval(intervalId); setIntervalId(null) }
      return
    }
    if (intervalId) return
    const tick = useGameStore.getState().tick
    const id = setInterval(tick, 1000)
    setIntervalId(id)
    return () => { clearInterval(id); setIntervalId(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.started, duel?.paused])

  /* ── Timer expiry ── */
  useEffect(() => {
    const d = duel
    if (!d?.started || !d.paused || winnerHandled.current) return
    if (d.timer1 > 0 && d.timer2 > 0) return
    if (intervalId) { clearInterval(intervalId); setIntervalId(null) }
    winnerHandled.current = true
    showFeedback('⏰ Czas minął!', 'timeout')
    winnerTimer.current = setTimeout(() => {
      const p1Lost = d.timer1 <= 0
      const p2Lost = d.timer2 <= 0
      if (p1Lost && p2Lost) {
        setWinner('draw'); endDuelDraw()
        SoundEngine.play('applause', volumeFactor(0.6))
        winnerTimer.current = setTimeout(handleClose, config.WIN_CLOSE_MS)
      } else {
        const w: 1 | 2 = p1Lost ? 2 : 1
        setWinner(w); endDuelWithWinner(w)
        SoundEngine.play('applause', volumeFactor(0.9))
        winnerTimer.current = setTimeout(handleClose, config.WIN_CLOSE_MS)
      }
    }, 1200)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel?.timer1, duel?.timer2, duel?.paused])

  /* ── Cleanup on close ── */
  useEffect(() => {
    if (!duel) {
      if (intervalId) { clearInterval(intervalId); setIntervalId(null) }
      setCountdown(null); setFeedback({ text: '', type: '' })
      setWinner(null); setImageUrl('')
      winnerHandled.current    = false
      matchedQuestionIdRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel])

  /* ── Cancel countdown ── */
  const cancelCountdown = useCallback(() => {
    countdownTimeouts.current.forEach(id => clearTimeout(id))
    countdownTimeouts.current = []
    setCountdown(null)
  }, [])

  /* ── Countdown animation ── */
  const runCountdown = useCallback(() => {
    SoundEngine.play('countdown', volumeFactor(0.85))
    const steps = [
      { label: '3', delay: 0 }, { label: '2', delay: 1000 },
      { label: '1', delay: 2000 }, { label: 'START!', delay: 3000 },
    ]
    steps.forEach(({ label, delay }) => {
      const id = setTimeout(() => setCountdown(label), delay)
      countdownTimeouts.current.push(id)
    })
    const finalId = setTimeout(() => {
      setCountdown(null)
      countdownTimeouts.current = []
      const q = nextQuestion()
      useGameStore.setState(s => ({
        duel: s.duel ? { ...s.duel, paused: false, currentQuestion: q } : null,
      }))
      SoundEngine.startBg('duelMusic', volumeFactor(0.22))
    }, 4300)
    countdownTimeouts.current.push(finalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextQuestion, config.SOUND_VOLUME])

  /* ── Feedback banner ── */
  const showFeedback = (text: string, type: FeedbackType) => {
    setFeedback({ text, type })
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(
      () => setFeedback({ text: '', type: '' }),
      config.FEEDBACK_MS + 300
    )
  }

  const handleStartFight = () => {
    startFight()
    setTimeout(runCountdown, 50)
  }

  const handleCorrect = (playerNum: 1 | 2, fromVoice = false) => {
    if (!duelRef.current?.started || blockRef.current || countdownRef.current) return
    if (duelRef.current.active !== playerNum) return
    const ans = duelRef.current.currentQuestion?.answer ?? '???'
    SoundEngine.play('correct', volumeFactor(0.75))
    showFeedback(fromVoice ? `🎤 ${ans}` : `✓  ${ans}`, fromVoice ? 'voice' : 'correct')
    markCorrect(playerNum)
  }

  const handlePass = () => {
    if (!duelRef.current?.started || blockRef.current || countdownRef.current) return
    const ans = duelRef.current.currentQuestion?.answer ?? '???'
    SoundEngine.play('buzzer', volumeFactor(0.4))
    showFeedback(`⏱ PAS  ·  ${ans}`, 'pass')
    pass()
  }

  // Keep action refs fresh every render
  handlePassRef.current    = handlePass
  handleCorrectRef.current = handleCorrect

  const handleClose = () => {
    cancelCountdown()
    if (intervalId) { clearInterval(intervalId); setIntervalId(null) }
    if (winnerTimer.current)  clearTimeout(winnerTimer.current)
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    SoundEngine.stopBg(500)
    setTimeout(() => SoundEngine.startBg('bgMusic', volumeFactor(0.3)), 600)
    closeDuel()
  }

  // ── Shared voice match logic ──────────────────────────────────────────────
  const tryVoiceMatch = useCallback((transcript: string, strict: boolean) => {
    const d = duelRef.current
    if (!d?.started || blockRef.current || countdownRef.current) return

    const questionId = d.currentQuestion?.id ?? null

    // Pass command — nie blokujemy ID, pass zawsze może odpalić
    if (isPassCommand(transcript)) {
      handlePassRef.current()
      return
    }

    // Odpowiedź/synonim — blokujemy tylko to KONKRETNE pytanie (nie czas)
    // Gdy pytanie się zmieni, matchedQuestionIdRef jest resetowany w useEffect
    if (matchedQuestionIdRef.current === questionId) return

    const answer   = currentAnswerRef.current
    const synonyms = currentSynonymsRef.current
    if (!answer) return

    if (isAnswerMatch(transcript, answer, synonyms, strict)) {
      matchedQuestionIdRef.current = questionId  // zablokuj tylko to pytanie
      handleCorrectRef.current(activePlayerRef.current, true)
    }
  }, [])

  /* ── Speech: interim — word-boundary strict matching ── */
  const handleInterimResult = useCallback((transcript: string) => {
    tryVoiceMatch(transcript, true /* strict */)
  }, [tryVoiceMatch])

  /* ── Speech: final — fuzzy matching with all alternatives ── */
  const handleFinalResult = useCallback((transcript: string) => {
    tryVoiceMatch(transcript, false /* fuzzy */)
  }, [tryVoiceMatch])

  /* ── Speech hook ── */
  // Mikrofon pozostaje aktywny przez całą grę — NIE zatrzymujemy go przy odliczaniu/pauzie.
  // tryVoiceMatch() sam sprawdza countdownRef/blockRef przed zaliczeniem odpowiedzi.
  // Zatrzymywanie i restartowanie recognition przy każdej zmianie stanu = zacięcie ~500ms.
  const speechActive = speechEnabled && !!duel?.started

  const { listening, error: speechError } = useSpeechRecognition({
    onFinal:   handleFinalResult,
    onInterim: handleInterimResult,
    active:    speechActive,
    lang:      duel?.lang === 'both' ? ['pl-PL', 'en-US'] : (duel?.lang ?? 'pl-PL'),
  })

  /* ── Keyboard handler ── */
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      if (!duel?.started) {
        if (e.key === 'Enter')  { e.preventDefault(); handleStartFight() }
        if (e.key === 'Escape') { e.preventDefault(); handleClose() }
        return
      }
      switch (e.key) {
        case 'a': case 'A': e.preventDefault(); handleCorrect(1); break
        case 'd': case 'D': e.preventDefault(); handleCorrect(2); break
        case 'p': case 'P': case ' ': e.preventDefault(); handlePass(); break
        case 'm': case 'M': if (speechSupported) setSpeechEnabled(s => !s); break
        case 'Escape': e.preventDefault(); handleClose(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, duel?.started, blockInput, countdown, speechSupported])

  if (!duel) return null

  const t1 = duel.timer1
  const t2 = duel.timer2
  const p1 = players[0]
  const p2 = players[1]

  const timerColor = (t: number) => t <= 5 ? '#ef4444' : t <= 15 ? '#facc15' : '#ffffff'
  const timerGlow  = (t: number) =>
    t <= 5 ? '0 0 30px rgba(239,68,68,0.7)' : t <= 15 ? '0 0 20px rgba(250,204,21,0.5)' : 'none'

  const answerBg = (type: FeedbackType) => {
    if (!feedback.text) return 'rgba(255,255,255,0.04)'
    if (type === 'correct' || type === 'voice') return 'rgba(34,197,94,0.15)'
    if (type === 'pass')    return 'rgba(251,146,60,0.15)'
    return 'rgba(248,113,113,0.12)'
  }
  const answerBorder = (type: FeedbackType) => {
    if (!feedback.text) return 'rgba(255,255,255,0.07)'
    if (type === 'correct' || type === 'voice') return 'rgba(34,197,94,0.4)'
    if (type === 'pass')    return 'rgba(251,146,60,0.4)'
    return 'rgba(248,113,113,0.35)'
  }
  const answerGlow = (type: FeedbackType) => {
    if (!feedback.text) return 'none'
    if (type === 'correct') return '0 0 30px rgba(34,197,94,0.8), 0 2px 4px rgba(0,0,0,0.8)'
    if (type === 'voice')   return '0 0 30px rgba(34,197,94,0.8), 0 0 60px rgba(99,220,255,0.4)'
    if (type === 'pass')    return '0 0 30px rgba(251,146,60,0.8), 0 2px 4px rgba(0,0,0,0.8)'
    return '0 0 30px rgba(248,113,113,0.8), 0 2px 4px rgba(0,0,0,0.8)'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'stretch',
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)', padding: '10px',
    }}>
      <div style={{
        position: 'relative',
        background: 'linear-gradient(160deg, #111 0%, #0a0a0a 100%)',
        border: '1px solid rgba(212,175,55,0.35)', borderRadius: 14, height: '100%',
        boxShadow: '0 0 80px rgba(212,175,55,0.15)',
        width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: '12px 48px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)', flexShrink: 0, position: 'relative',
        }}>
          <span style={{ fontSize: '1.4rem' }}>{duel.emoji}</span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem', letterSpacing: 6, color: '#D4AF37' }}>
            {duel.categoryName}
          </span>

          {duel.started && speechSupported && (
            <button
              onClick={() => setSpeechEnabled(s => !s)}
              title={speechEnabled ? `Wyłącz mikrofon (M) — ${duel?.lang === 'both' ? 'PL+EN' : duel?.lang ?? 'pl-PL'}` : `Włącz mikrofon (M) — ${duel?.lang === 'both' ? 'PL+EN' : duel?.lang ?? 'pl-PL'}`}
              style={{ position: 'absolute', right: 52, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
            >
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: speechEnabled ? (listening ? '#4ade80' : 'rgba(129,140,248,0.6)') : 'rgba(255,255,255,0.15)',
                boxShadow: listening ? '0 0 10px #4ade80, 0 0 20px rgba(74,222,128,0.4)' : 'none',
                animation: listening ? 'micPulse 1s ease-in-out infinite' : 'none',
                transition: 'all 0.3s',
              }} />
            </button>
          )}
        </div>

        {/* START SCREEN */}
        {!duel.started && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '40px 24px' }}>
            <div style={{ fontSize: '6rem', lineHeight: 1 }}>{duel.emoji}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.5rem', letterSpacing: 8, color: '#fff' }}>
              {duel.categoryName}
            </div>
            <div style={{ display: 'flex', gap: 32, color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', letterSpacing: 2 }}>
              <span><kbd className="kbd">ENTER</kbd> Rozpocznij</span>
              <span><kbd className="kbd">ESC</kbd> Anuluj</span>
            </div>

            {speechSupported && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                {/* Mic on/off toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 30 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>🎤 Rozpoznawanie mowy</span>
                  <button onClick={() => setSpeechEnabled(s => !s)} style={{
                    width: 44, height: 24, borderRadius: 12, position: 'relative', cursor: 'pointer',
                    background: speechEnabled ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
                    border: `1px solid ${speechEnabled ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.15)'}`,
                    transition: 'all 0.25s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 3, left: speechEnabled ? 22 : 3,
                      width: 16, height: 16, borderRadius: '50%', transition: 'all 0.25s',
                      background: speechEnabled ? '#818cf8' : 'rgba(255,255,255,0.4)',
                    }} />
                  </button>
                </div>

                {/* Lang badge — shows language set for this category */}
                {speechEnabled && (
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', letterSpacing: 1 }}>
                    {duel?.lang === 'both' ? '🌐 pl + en' : duel?.lang === 'en-US' ? '🇺🇸 English' : '🇵🇱 Polski'}
                  </div>
                )}
              </div>
            )}

            <button onClick={handleStartFight} style={{
              marginTop: 12, padding: '14px 48px',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 6,
              background: 'linear-gradient(135deg, #D4AF37, #FFD700)', color: '#000',
              border: 'none', borderRadius: 50, cursor: 'pointer',
              boxShadow: '0 0 30px rgba(212,175,55,0.35)',
            }}>▶ ROZPOCZNIJ</button>
          </div>
        )}

        {/* FIGHT SCREEN */}
        {duel.started && (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'min(18vw, 200px) 1fr min(18vw, 200px)', minHeight: 0, overflow: 'hidden' }}>
            <PlayerPanel name={p1.name} shortcut="A" timer={t1} active={duel.active === 1} color={p1.color} borderSide="right" timerColor={timerColor(t1)} timerGlow={timerGlow(t1)} />

            {/* Center */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 20px 12px', position: 'relative', overflow: 'hidden' }}>
              {/* Image */}
              <div style={{
                flex: 1, width: '100%', minHeight: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '12px 12px 0 0', overflow: 'hidden',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none',
              }}>
                {imageUrl ? (
                  <img src={imageUrl} alt="Pytanie" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '12px 12px 0 0' }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40 }}>
                    <span style={{ fontSize: '5rem' }}>{duel.emoji}</span>
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', letterSpacing: 2 }}>WCZYTYWANIE PYTANIA</span>
                  </div>
                )}
              </div>

              {/* Answer bar */}
              <div style={{
                width: '100%', minHeight: 64,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: answerBg(feedback.type),
                border: `1px solid ${answerBorder(feedback.type)}`,
                borderRadius: '0 0 12px 12px', padding: '10px 20px',
                transition: 'background 0.25s, border-color 0.25s',
              }}>
                <span style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 'clamp(1.4rem, 3.5vh, 2.2rem)',
                  letterSpacing: 5, fontWeight: 700, color: '#ffffff',
                  textShadow: answerGlow(feedback.type),
                  opacity: feedback.text ? 1 : 0.2,
                  transition: 'all 0.2s', textAlign: 'center',
                }}>
                  {feedback.text || '— — —'}
                </span>
              </div>

              {/* Controls hint */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: 'rgba(255,255,255,0.18)', fontSize: '0.67rem', letterSpacing: 1.2, textAlign: 'center', marginTop: 8, flexShrink: 0, justifyContent: 'center' }}>
                <span><kbd className="kbd">P</kbd>/<kbd className="kbd">SPACJA</kbd> pas (−{config.PASS_PENALTY}s)</span>
                <span>·</span>
                {speechSupported && (
                  <>
                    <span style={{ color: speechEnabled ? 'rgba(129,140,248,0.6)' : 'rgba(255,255,255,0.18)' }}>
                      <kbd className="kbd">M</kbd> mikrofon {speechEnabled ? 'wł.' : 'wył.'}
                    </span>
                    <span>·</span>
                  </>
                )}
                <span><kbd className="kbd">ESC</kbd> zakończ</span>
              </div>

              {speechError && (
                <div style={{ marginTop: 6, padding: '4px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', fontSize: '0.72rem', textAlign: 'center' }}>
                  ⚠️ {speechError}
                </div>
              )}
            </div>

            <PlayerPanel name={p2.name} shortcut="D" timer={t2} active={duel.active === 2} color={p2.color} borderSide="left" timerColor={timerColor(t2)} timerGlow={timerGlow(t2)} />
          </div>
        )}

        {/* Countdown overlay */}
        {countdown && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.92)', borderRadius: 14, zIndex: 10 }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: countdown === 'START!' ? '6rem' : '10rem', lineHeight: 1,
              color: countdown === 'START!' ? '#4ade80' : countdown === '1' ? '#f97316' : '#FFD700',
              textShadow: '0 0 100px currentColor, 0 0 40px currentColor',
              userSelect: 'none', animation: 'countPop 0.3s ease-out',
            }}>{countdown}</div>
          </div>
        )}

        {winner && <WinnerOverlay winner={winner} players={players} />}

        <button onClick={handleClose} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>✕</button>
      </div>

      <style>{`
        @keyframes countPop {
          from { transform: scale(1.4); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes winnerReveal {
          from { transform: scale(0.8) translateY(20px); opacity: 0; }
          to   { transform: scale(1)   translateY(0);    opacity: 1; }
        }
        @keyframes confettiDrop {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
        }
        @keyframes micPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(1.3); }
        }
        .kbd {
          display: inline-block; padding: 1px 6px;
          background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
          border-radius: 4px; font-family: monospace; font-size: 0.85em;
        }
      `}</style>
    </div>
  )
}

function PlayerPanel({ name, shortcut, timer, active, color, borderSide, timerColor, timerGlow }: {
  name: string; shortcut: string; timer: number; active: boolean
  color: string; borderSide: 'left' | 'right'; timerColor: string; timerGlow: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'clamp(8px, 2vh, 20px)', padding: 'clamp(16px, 3vh, 40px) 12px',
      borderLeft:  borderSide === 'left'  ? '1px solid rgba(255,255,255,0.08)' : 'none',
      borderRight: borderSide === 'right' ? '1px solid rgba(255,255,255,0.08)' : 'none',
      background: active ? `${color}14` : 'transparent',
      opacity: active ? 1 : 0.4, transition: 'all 0.4s ease', position: 'relative',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? color : 'rgba(255,255,255,0.1)', boxShadow: active ? `0 0 16px ${color}, 0 0 32px ${color}40` : 'none', transition: 'all 0.3s' }} />
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.95rem', letterSpacing: 5, color }}>{name}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(3.5rem, 9vh, 8rem)', lineHeight: 1, color: timerColor, textShadow: timerGlow, transition: 'color 0.5s, text-shadow 0.5s' }}>{timer}</div>
      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', letterSpacing: 2 }}>
        <kbd className="kbd">{shortcut}</kbd> poprawna
      </div>
      {active && (
        <div style={{ position: 'absolute', top: '25%', bottom: '25%', [borderSide]: 0, width: 3, borderRadius: 4, background: color, boxShadow: `0 0 12px ${color}` }} />
      )}
    </div>
  )
}

function WinnerOverlay({ winner, players }: {
  winner: 1 | 2 | 'draw'
  players: [{ name: string; color: string }, { name: string; color: string }]
}) {
  const isDraw = winner === 'draw'
  const color  = isDraw ? '#C0C0C0' : winner === 1 ? players[0].color : players[1].color
  const label  = isDraw ? 'REMIS' : winner === 1 ? `${players[0].name} ZWYCIĘŻA!` : `${players[1].name} ZWYCIĘŻA!`
  const icon   = isDraw ? '⚖️' : winner === 1 ? '🥇' : '🥈'
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.93)', borderRadius: 14, zIndex: 20, gap: 16 }}>
      {!isDraw && Array.from({ length: 16 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: `${10 + Math.random() * 30}%`, left: `${5 + (i / 16) * 90}%`,
          width: 8, height: 8, borderRadius: i % 3 === 0 ? '50%' : 2,
          background: i % 2 === 0 ? color : i % 3 === 0 ? '#fff' : 'rgba(255,255,255,0.4)',
          animation: `confettiDrop ${1.2 + Math.random() * 1.2}s ease-in ${Math.random() * 0.5}s both`,
        }} />
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, animation: 'winnerReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>
        <div style={{ fontSize: '6rem', lineHeight: 1 }}>{icon}</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(2rem, 6vw, 3.5rem)', letterSpacing: 8, color, textShadow: `0 0 40px ${color}80, 0 0 80px ${color}40` }}>{label}</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', letterSpacing: 4, textTransform: 'uppercase' }}>
          {isDraw ? 'Pole bez zmian' : 'Pole przejęte!'}
        </div>
        <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', letterSpacing: 2 }}>Automatyczne zamknięcie…</div>
      </div>
    </div>
  )
}
