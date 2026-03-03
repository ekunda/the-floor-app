// src/pages/MultiplayerGame.tsx
// Gameplay identyczny jak singleplayer — mikrofon + pass + fuzzy matching

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isAnswerMatch, isPassCommand, isSpeechRecognitionSupported, useSpeechRecognition } from '../lib/useSpeechRecognition'
import { useAuthStore } from '../store/useAuthStore'
import { MPGameState, MPQuestion, MPTile, resolveRound, useMultiplayerStore } from '../store/useMultiplayerStore'

// ── Stałe ─────────────────────────────────────────────────────
const BOARD_PRESETS: Record<number, { cols: number; rows: number }> = {
  0: { cols: 4, rows: 3 }, 1: { cols: 6, rows: 2 }, 2: { cols: 3, rows: 4 },
  3: { cols: 4, rows: 4 }, 4: { cols: 5, rows: 3 }, 5: { cols: 6, rows: 4 },
}

// ── Tile ──────────────────────────────────────────────────────
function Tile({ tile, isSelected, canSelect, onSelect }: {
  tile: MPTile; isSelected: boolean; canSelect: boolean; onSelect: () => void
}) {
  const ownerColor = tile.owner === 'host' ? '#D4AF37' : tile.owner === 'guest' ? '#C0C0C0' : 'rgba(255,255,255,0.08)'
  const ownerBg    = tile.owner === 'host' ? 'rgba(212,175,55,0.14)' : tile.owner === 'guest' ? 'rgba(192,192,192,0.1)' : 'rgba(255,255,255,0.03)'

  return (
    <div
      onClick={canSelect && !tile.owner ? onSelect : undefined}
      style={{
        borderRadius: 10, padding: '10px 6px',
        background: isSelected ? 'rgba(212,175,55,0.28)' : ownerBg,
        border: `2px solid ${isSelected ? '#D4AF37' : ownerColor}`,
        cursor: canSelect && !tile.owner ? 'pointer' : 'default',
        transition: 'all 0.18s', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
        minHeight: 72, textAlign: 'center', position: 'relative',
        boxShadow: isSelected ? '0 0 18px rgba(212,175,55,0.4)' : 'none',
        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
        opacity: tile.owner ? 0.72 : 1,
      }}
    >
      {tile.owner && (
        <div style={{ position: 'absolute', top: 3, right: 4, fontSize: '0.6rem' }}>
          {tile.owner === 'host' ? '🥇' : '🥈'}
        </div>
      )}
      <div style={{ fontSize: '1.4rem' }}>{tile.emoji}</div>
      <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, letterSpacing: 0.5, lineHeight: 1.3, wordBreak: 'break-word' }}>
        {tile.categoryName.toUpperCase()}
      </div>
    </div>
  )
}

// ── DuelOverlay (identyczny gameplay jak singleplayer) ────────
function DuelOverlay({
  question, imageUrl, gameState, myRole, onAnswer, onPass, speechEnabled, setSpeechEnabled, interim,
}: {
  question: MPQuestion
  imageUrl: string
  gameState: MPGameState
  myRole: 'host' | 'guest'
  onAnswer: (correct: boolean) => void
  onPass: () => void
  speechEnabled: boolean
  setSpeechEnabled: (v: boolean) => void
  interim: string
}) {
  const [input, setInput]       = useState('')
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'pass' | null>(null)
  const [localTimer, setLocalTimer] = useState(gameState.duelTimer)
  const answered  = myRole === 'host' ? gameState.hostAnswered : gameState.guestAnswered
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const answeredRef = useRef(answered)
  answeredRef.current = answered
  const speechSupported = isSpeechRecognitionSupported()

  // Reset przy nowym pytaniu
  useEffect(() => {
    setLocalTimer(gameState.duelTimer)
    setFeedback(null)
    setInput('')
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(() => {
      setLocalTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          if (!answeredRef.current) {
            setFeedback('pass')
            setTimeout(() => onAnswer(false), 500)
          }
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [question.id])

  const doAnswer = (correct: boolean) => {
    if (answered || feedback) return
    if (timerRef.current) clearInterval(timerRef.current)
    setFeedback(correct ? 'correct' : 'wrong')
    setTimeout(() => onAnswer(correct), 500)
  }

  const doPass = () => {
    if (answered || feedback) return
    if (timerRef.current) clearInterval(timerRef.current)
    setFeedback('pass')
    setTimeout(() => onPass(), 500)
  }

  const checkTextAnswer = () => {
    if (!input.trim() || answered || feedback) return
    const correct = isAnswerMatch(input.trim(), question.answer, question.synonyms, false)
    doAnswer(correct)
  }

  const timerPct   = (localTimer / gameState.duelTimer) * 100
  const timerColor = localTimer > 15 ? '#4ade80' : localTimer > 8 ? '#F59E0B' : '#ef4444'

  const feedbackBg = feedback === 'correct' ? 'rgba(74,222,128,0.15)' :
                     feedback === 'wrong'   ? 'rgba(239,68,68,0.15)'  :
                     feedback === 'pass'    ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)'
  const feedbackBorder = feedback === 'correct' ? 'rgba(74,222,128,0.4)' :
                         feedback === 'wrong'   ? 'rgba(239,68,68,0.4)'  :
                         feedback === 'pass'    ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.12)'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 540, background: '#0f0f0f', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 20, overflow: 'hidden' }}>

        {/* Timer bar */}
        <div style={{ height: 5, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ height: '100%', width: `${timerPct}%`, background: timerColor, transition: 'width 1s linear, background 0.3s' }} />
        </div>

        <div style={{ padding: '22px 26px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)' }}>
              {question.emoji} {question.categoryName.toUpperCase()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {speechSupported && (
                <button onClick={() => setSpeechEnabled(!speechEnabled)} style={{
                  background: speechEnabled ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${speechEnabled ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
                  fontSize: '0.78rem', color: speechEnabled ? '#4ade80' : 'rgba(255,255,255,0.4)',
                }}>
                  {speechEnabled ? '🎤 ON' : '🎤 OFF'}
                </button>
              )}
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: timerColor, letterSpacing: 2 }}>
                {localTimer}
              </div>
            </div>
          </div>

          {/* Interim transcript */}
          {speechEnabled && interim && (
            <div style={{ padding: '6px 12px', background: 'rgba(212,175,55,0.08)', borderRadius: 8, marginBottom: 12, fontSize: '0.78rem', color: 'rgba(212,175,55,0.7)', fontStyle: 'italic', minHeight: 28 }}>
              🎙 {interim}
            </div>
          )}

          {/* Obrazek */}
          {imageUrl ? (
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <img src={imageUrl} alt="Pytanie" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 12, objectFit: 'contain' }} />
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: '4.5rem', marginBottom: 18 }}>🎯</div>
          )}

          {/* Status graczy */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['host', 'guest'] as const).map(role => {
              const answered = role === 'host' ? gameState.hostAnswered : gameState.guestAnswered
              const isMe = role === myRole
              return (
                <div key={role} style={{
                  flex: 1, padding: '7px', borderRadius: 8, textAlign: 'center', fontSize: '0.72rem',
                  background: answered ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${answered ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: answered ? '#4ade80' : 'rgba(255,255,255,0.4)',
                }}>
                  {isMe ? '👤 Ty' : '🎮 Przeciwnik'} {answered ? '✓' : '⏳'}
                </div>
              )
            })}
          </div>

          {/* Input odpowiedzi */}
          {!answered ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && checkTextAnswer()}
                  placeholder="Wpisz odpowiedź..."
                  autoFocus
                  disabled={!!feedback}
                  style={{
                    flex: 1, background: feedbackBg, border: `1px solid ${feedbackBorder}`,
                    borderRadius: 10, padding: '12px 16px', color: '#fff',
                    fontSize: '1rem', outline: 'none', fontFamily: "'Montserrat', sans-serif",
                    transition: 'all 0.2s',
                  }}
                />
                <button
                  onClick={checkTextAnswer}
                  disabled={!!feedback || !input.trim()}
                  style={{
                    padding: '12px 18px', borderRadius: 10, border: 'none',
                    background: !input.trim() ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #D4AF37, #A0832A)',
                    color: !input.trim() ? 'rgba(255,255,255,0.3)' : '#000',
                    fontWeight: 800, cursor: input.trim() ? 'pointer' : 'not-allowed', fontSize: '1.1rem',
                  }}
                >✓</button>
              </div>

              {/* Pass button — identyczny jak singleplayer */}
              <button
                onClick={doPass}
                disabled={!!feedback}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10,
                  border: '1px solid rgba(245,158,11,0.3)',
                  background: 'rgba(245,158,11,0.08)',
                  color: 'rgba(245,158,11,0.8)',
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 600, fontSize: '0.82rem', letterSpacing: 1,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >
                ⏩ PAS (poddaj tę rundę)
              </button>
            </div>
          ) : (
            <div style={{
              padding: '14px', borderRadius: 10, textAlign: 'center',
              background: feedback === 'correct' ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${feedback === 'correct' ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
              color: feedback === 'correct' ? '#4ade80' : 'rgba(255,255,255,0.5)',
              fontWeight: 700, letterSpacing: 1, fontSize: '0.85rem',
            }}>
              {feedback === 'correct' ? '✅ Poprawna odpowiedź!' : feedback === 'pass' ? '⏩ Pas — czekam na wynik...' : '❌ Błędna odpowiedź — czekam...'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Round End ─────────────────────────────────────────────────
function RoundEndOverlay({ gameState, myRole, onContinue }: {
  gameState: MPGameState; myRole: 'host' | 'guest'; onContinue: () => void
}) {
  const w = gameState.roundWinner
  const iWon = w === myRole
  const isDraw = w === 'draw' || w === null

  useEffect(() => {
    const t = setTimeout(onContinue, 2800)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: '4rem' }}>{isDraw ? '🤝' : iWon ? '🏆' : '💀'}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.2rem', letterSpacing: 6, color: isDraw ? '#fff' : iWon ? '#4ade80' : '#f87171' }}>
        {isDraw ? 'REMIS' : iWon ? 'WYGRAŁEŚ RUNDĘ!' : 'PRZEGRAŁEŚ RUNDĘ'}
      </div>
      {gameState.currentQuestion && (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
          Odpowiedź: <strong style={{ color: '#D4AF37' }}>{gameState.currentQuestion.answer}</strong>
        </div>
      )}
      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem' }}>
        Wynik: {gameState.hostScore} — {gameState.guestScore}
      </div>
    </div>
  )
}

// ── Game Over ─────────────────────────────────────────────────
function GameOverOverlay({ gameState, myRole, me, opponent, onExit }: {
  gameState: MPGameState; myRole: 'host' | 'guest'; me: any; opponent: any; onExit: () => void
}) {
  const navigate = useNavigate()
  const w = gameState.winner
  const iWon  = w === myRole
  const isDraw = w === 'draw'
  const myTiles  = gameState.tiles.filter(t => t.owner === myRole).length
  const oppTiles = gameState.tiles.filter(t => t.owner !== myRole && t.owner !== null).length

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20, fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: 460, textAlign: 'center', background: '#0f0f0f', border: `1px solid ${isDraw ? 'rgba(255,255,255,0.15)' : iWon ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, borderRadius: 20, padding: '36px 28px' }}>
        <div style={{ fontSize: '4.5rem', marginBottom: 12 }}>{isDraw ? '🤝' : iWon ? '🥇' : '💀'}</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.2rem', letterSpacing: 8, marginBottom: 6, color: isDraw ? '#fff' : iWon ? '#4ade80' : '#f87171' }}>
          {isDraw ? 'REMIS!' : iWon ? 'WYGRANA!' : 'PORAŻKA'}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 24, fontSize: '0.85rem' }}>
          {iWon ? '+50 XP' : isDraw ? '+20 XP' : '+10 XP'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>{me?.avatar}</div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{me?.username}</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: iWon ? '#4ade80' : '#f87171' }}>{myTiles}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>kafelki</div>
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: 'rgba(255,255,255,0.2)' }}>:</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>{opponent?.avatar}</div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{opponent?.username}</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: !iWon && !isDraw ? '#4ade80' : '#f87171' }}>{oppTiles}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)' }}>kafelki</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {[['Rundy', gameState.totalRounds], ['Kafelki', myTiles]].map(([label, val]) => (
            <div key={label as string} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 0' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{val}</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>{label as string}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onExit} style={{ flex: 1, padding: '13px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #D4AF37, #A0832A)', color: '#000', fontWeight: 800, cursor: 'pointer', fontSize: '0.88rem', letterSpacing: 2, fontFamily: "'Montserrat', sans-serif" }}>
            KOLEJNA GRA
          </button>
          <button onClick={() => navigate('/dashboard')} style={{ flex: 1, padding: '13px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.85rem', fontFamily: "'Montserrat', sans-serif" }}>
            Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

// ── GŁÓWNY KOMPONENT ──────────────────────────────────────────
export default function MultiplayerGame() {
  const { id: roomId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuthStore()
  const {
    initGame, gameState, myRole, me, opponent, room,
    selectTile, submitAnswer, pass, continueAfterRound, imageUrl, cleanup, connected,
  } = useMultiplayerStore()

  const [inited, setInited]             = useState(false)
  const [countdown, setCountdown]       = useState(3)
  const [showCountdown, setShowCountdown] = useState(true)
  const [speechEnabled, setSpeechEnabled] = useState(false)
  const [interimText, setInterimText]   = useState('')
  const gameSavedRef = useRef(false)

  const speechSupported = isSpeechRecognitionSupported()

  // ── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile || !roomId) { navigate('/login'); return }
    initGame(roomId, profile).then(() => setInited(true))
    return () => cleanup()
  }, [roomId])

  // ── Odliczanie startowe ──────────────────────────────────────
  useEffect(() => {
    if (!inited) return
    let c = 3
    const iv = setInterval(() => {
      c--
      setCountdown(c)
      if (c <= 0) { clearInterval(iv); setShowCountdown(false) }
    }, 1000)
    return () => clearInterval(iv)
  }, [inited])

  // ── Zapisz wynik po zakończeniu gry (host) ────────────────────
  useEffect(() => {
    if (gameState?.phase === 'game_over' && !gameSavedRef.current && room && myRole === 'host') {
      gameSavedRef.current = true
      saveGameResult()
    }
  }, [gameState?.phase])

  const saveGameResult = async () => {
    if (!gameState || !room || !me || !opponent) return
    const w = gameState.winner
    const winnerId = w === 'host' ? room.hostId : w === 'guest' ? room.guestId : null
    const loserId  = w === 'host' ? room.guestId : w === 'guest' ? room.hostId : null
    const durationSec = Math.round((Date.now() - gameState.startedAt) / 1000)
    await supabase.rpc('finish_game', {
      p_room_id: room.id,
      p_winner_id: winnerId ?? room.hostId,
      p_loser_id:  loserId  ?? room.guestId,
      p_winner_score: gameState.hostScore,
      p_loser_score:  gameState.guestScore,
      p_rounds_total: gameState.totalRounds,
      p_duration_sec: durationSec,
      p_is_draw: w === 'draw',
    })
    await refreshProfile()
  }

  // ── Memoizowane callbacki speech (stabilne referencje) ───────
  const handleFinal = useCallback((transcript: string) => {
    const gs = useMultiplayerStore.getState().gameState
    const role = useMultiplayerStore.getState().myRole
    if (!gs || gs.phase !== 'duel' || !role) return
    const alreadyAnswered = role === 'host' ? gs.hostAnswered : gs.guestAnswered
    if (alreadyAnswered) return

    if (isPassCommand(transcript)) {
      useMultiplayerStore.getState().pass()
      return
    }
    if (gs.currentQuestion) {
      const correct = isAnswerMatch(transcript, gs.currentQuestion.answer, gs.currentQuestion.synonyms, false)
      if (correct) useMultiplayerStore.getState().submitAnswer(true)
    }
  }, [])

  const handleInterim = useCallback((transcript: string) => {
    setInterimText(transcript)
    const gs = useMultiplayerStore.getState().gameState
    const role = useMultiplayerStore.getState().myRole
    if (!gs || gs.phase !== 'duel' || !role) return
    const alreadyAnswered = role === 'host' ? gs.hostAnswered : gs.guestAnswered
    if (alreadyAnswered) return

    if (gs.currentQuestion) {
      const correct = isAnswerMatch(transcript, gs.currentQuestion.answer, gs.currentQuestion.synonyms, true)
      if (correct) useMultiplayerStore.getState().submitAnswer(true)
    }
  }, [])

  // Czyść interim gdy pytanie się zmienia
  useEffect(() => { setInterimText('') }, [gameState?.currentQuestion?.id])

  // ── Speech hook — identyczny jak singleplayer ─────────────────
  const speechActive = speechEnabled && !!gameState && gameState.phase === 'duel'
  useSpeechRecognition({
    onFinal: handleFinal,
    onInterim: handleInterim,
    active: speechActive,
    lang: gameState?.currentQuestion?.lang === 'both' ? ['pl-PL', 'en-US']
         : (gameState?.currentQuestion?.lang ?? 'pl-PL'),
  })

  if (!profile) return null

  // ── Ładowanie ─────────────────────────────────────────────────
  if (!inited || !gameState) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: "'Montserrat', sans-serif" }}>
        <div style={{ fontSize: '2.5rem' }}>⚙️</div>
        <div style={{ letterSpacing: 3, fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>ŁADOWANIE GRY...</div>
        <div style={{ fontSize: '0.72rem', color: connected ? '#4ade80' : 'rgba(255,255,255,0.2)' }}>
          {connected ? '✅ Połączono' : '⏳ Łączenie...'}
        </div>
      </div>
    )
  }

  const preset   = BOARD_PRESETS[room?.config.board_shape ?? 0] ?? BOARD_PRESETS[0]
  const isMyTurn = gameState.currentTurn === myRole
  const myScore  = myRole === 'host' ? gameState.hostScore : gameState.guestScore
  const oppScore = myRole === 'host' ? gameState.guestScore : gameState.hostScore

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes cd-pop { from{transform:scale(1.4);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes fade-in { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
        .tile-hover:hover { background: rgba(212,175,55,0.06) !important; }
      `}</style>

      {/* ── COUNTDOWN ── */}
      {showCountdown && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 200, gap: 16 }}>
          <div key={countdown} style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '9rem', color: '#D4AF37', letterSpacing: 10, lineHeight: 1, animation: 'cd-pop 0.3s ease-out' }}>
            {countdown > 0 ? countdown : 'GO!'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: 3, fontSize: '0.88rem' }}>
            {me?.avatar} {me?.username} vs {opponent?.avatar} {opponent?.username}
          </div>
        </div>
      )}

      {/* ── TOPBAR ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Ja */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: isMyTurn ? '#4ade80' : 'rgba(255,255,255,0.2)', boxShadow: isMyTurn ? '0 0 8px #4ade80' : 'none' }} />
          <span style={{ fontSize: '1.1rem' }}>{me?.avatar}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{me?.username}</div>
            <div style={{ fontSize: '0.62rem', color: myRole === 'host' ? '#D4AF37' : '#C0C0C0' }}>
              {myRole === 'host' ? '🥇 Host' : '🥈 Gość'}
            </div>
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: isMyTurn ? '#4ade80' : '#D4AF37', marginLeft: 4 }}>{myScore}</div>
        </div>

        {/* Centrum */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.72rem', letterSpacing: 4, color: 'rgba(255,255,255,0.25)' }}>RUNDA</div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.3rem', color: '#D4AF37', letterSpacing: 2 }}>
            {gameState.round}/{gameState.totalRounds}
          </div>
          <div style={{ fontSize: '0.6rem', color: isMyTurn ? '#4ade80' : 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
            {isMyTurn ? 'TWÓJ RUCH' : `${opponent?.username}`}
          </div>
        </div>

        {/* Przeciwnik */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row-reverse' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: !isMyTurn ? '#4ade80' : 'rgba(255,255,255,0.2)', boxShadow: !isMyTurn ? '0 0 8px #4ade80' : 'none' }} />
          <span style={{ fontSize: '1.1rem' }}>{opponent?.avatar}</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{opponent?.username}</div>
            <div style={{ fontSize: '0.62rem', color: myRole === 'guest' ? '#D4AF37' : '#C0C0C0' }}>
              {myRole === 'host' ? '🥈 Gość' : '🥇 Host'}
            </div>
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: !isMyTurn ? '#4ade80' : '#C0C0C0', marginRight: 4 }}>{oppScore}</div>
        </div>
      </div>

      {/* ── PLANSZA ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${preset.cols}, minmax(55px, 130px))`,
          gap: 8, width: '100%', maxWidth: preset.cols * 138,
        }}>
          {gameState.tiles.map((tile, i) => (
            <Tile
              key={i} tile={tile}
              isSelected={gameState.selectedTileIdx === i}
              canSelect={isMyTurn && gameState.phase === 'select_tile'}
              onSelect={() => selectTile(i)}
            />
          ))}
        </div>
      </div>

      {/* ── STATUS BAR ── */}
      <div style={{ padding: '8px 16px', background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
        {gameState.phase === 'select_tile' && isMyTurn && '👆 Wybierz kafelek do ataku'}
        {gameState.phase === 'select_tile' && !isMyTurn && `⏳ Czekam na ${opponent?.username}...`}
        {gameState.phase === 'duel'        && '⚔️ DUEL — odpowiedz na pytanie!'}
        {gameState.phase === 'round_end'   && '⏳ Ładowanie następnej rundy...'}
        <span style={{ marginLeft: 12, color: connected ? 'rgba(74,222,128,0.4)' : 'rgba(255,100,100,0.4)' }}>
          {connected ? '● live' : '● reconnecting...'}
        </span>
      </div>

      {/* ── OVERLAYS ── */}
      {gameState.phase === 'duel' && gameState.currentQuestion && (
        <DuelOverlay
          question={gameState.currentQuestion}
          imageUrl={imageUrl}
          gameState={gameState}
          myRole={myRole!}
          onAnswer={(correct) => submitAnswer(correct)}
          onPass={() => pass()}
          speechEnabled={speechEnabled}
          setSpeechEnabled={setSpeechEnabled}
          interim={interimText}
        />
      )}

      {gameState.phase === 'round_end' && (
        <RoundEndOverlay
          gameState={gameState}
          myRole={myRole!}
          onContinue={continueAfterRound}
        />
      )}

      {gameState.phase === 'game_over' && (
        <GameOverOverlay
          gameState={gameState}
          myRole={myRole!}
          me={me}
          opponent={opponent}
          onExit={() => navigate('/matchmaking')}
        />
      )}
    </div>
  )
}
