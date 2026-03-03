// src/pages/MultiplayerGame.tsx
// Pełna gra planszowa online — synchronizacja przez Supabase Realtime

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'
import { GameState, MPQuestion, MPTile, useMultiplayerStore } from '../store/useMultiplayerStore'

// ── Stałe ────────────────────────────────────────────────────
const BOARD_PRESETS: Record<number, { cols: number; rows: number }> = {
  0: { cols: 4, rows: 3 },
  1: { cols: 6, rows: 2 },
  2: { cols: 3, rows: 4 },
  3: { cols: 4, rows: 4 },
  4: { cols: 5, rows: 3 },
  5: { cols: 6, rows: 4 },
}

// ── Tile component ────────────────────────────────────────────
function Tile({
  tile, isSelected, isMyTurn, canSelect, onSelect,
}: {
  tile: MPTile
  isSelected: boolean
  isMyTurn: boolean
  canSelect: boolean
  onSelect: () => void
}) {
  const ownerColor = tile.owner === 'host' ? '#D4AF37' : tile.owner === 'guest' ? '#C0C0C0' : 'transparent'
  const ownerBg = tile.owner === 'host'
    ? 'rgba(212,175,55,0.15)'
    : tile.owner === 'guest'
    ? 'rgba(192,192,192,0.12)'
    : 'rgba(255,255,255,0.03)'

  return (
    <div
      onClick={canSelect && !tile.owner ? onSelect : undefined}
      style={{
        borderRadius: 10, padding: '12px 8px',
        background: isSelected ? 'rgba(212,175,55,0.25)' : ownerBg,
        border: `2px solid ${isSelected ? '#D4AF37' : ownerColor || 'rgba(255,255,255,0.08)'}`,
        cursor: canSelect && !tile.owner ? 'pointer' : 'default',
        transition: 'all 0.2s',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, minHeight: 80, textAlign: 'center',
        boxShadow: isSelected ? '0 0 20px rgba(212,175,55,0.4)' : 'none',
        transform: isSelected ? 'scale(1.05)' : 'scale(1)',
        opacity: tile.owner ? 0.75 : 1,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Owned overlay */}
      {tile.owner && (
        <div style={{
          position: 'absolute', top: 4, right: 4,
          fontSize: '0.6rem', opacity: 0.7,
        }}>
          {tile.owner === 'host' ? '🥇' : '🥈'}
        </div>
      )}

      <div style={{ fontSize: '1.5rem' }}>{tile.emoji}</div>
      <div style={{
        fontSize: '0.62rem', color: 'rgba(255,255,255,0.6)',
        fontWeight: 600, letterSpacing: 0.5, lineHeight: 1.3,
        wordBreak: 'break-word',
      }}>
        {tile.categoryName.toUpperCase()}
      </div>

      {/* Hover glow for selectable tiles */}
      {canSelect && !tile.owner && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(212,175,55,0)', transition: 'background 0.2s', borderRadius: 8 }} className="tile-hover" />
      )}
    </div>
  )
}

// ── Duel overlay ──────────────────────────────────────────────
function DuelOverlay({
  question, imageUrl, gameState, myRole, onAnswer,
}: {
  question: MPQuestion
  imageUrl: string
  gameState: GameState
  myRole: 'host' | 'guest'
  onAnswer: (correct: boolean) => void
}) {
  const [input, setInput] = useState('')
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null)
  const [localTimer, setLocalTimer] = useState(gameState.duelTimer)
  const answered = myRole === 'host' ? gameState.hostAnswered : gameState.guestAnswered
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLocalTimer(gameState.duelTimer)
    setFeedback(null)
    setInput('')

    // Local countdown (visual only, real timer on server side)
    timerRef.current = setInterval(() => {
      setLocalTimer(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          if (!answered) onAnswer(false)  // timeout = wrong
          return 0
        }
        return t - 1
      })
    }, 1000)

    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [question.id])

  const checkAnswer = () => {
    if (answered || feedback) return
    const norm = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9ąćęłńóśźż\s]/g, '')
    const userAns = norm(input)
    const correct = [question.answer, ...question.synonyms].some(a => norm(a) === userAns)

    clearInterval(timerRef.current!)
    setFeedback(correct ? 'correct' : 'wrong')
    setTimeout(() => onAnswer(correct), 600)
  }

  const timerPct = (localTimer / gameState.duelTimer) * 100
  const timerColor = localTimer > 15 ? '#4ade80' : localTimer > 8 ? '#F59E0B' : '#ef4444'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#0f0f0f', border: '1px solid rgba(212,175,55,0.25)',
        borderRadius: 20, overflow: 'hidden',
      }}>
        {/* Timer bar */}
        <div style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ height: '100%', width: `${timerPct}%`, background: timerColor, transition: 'width 1s linear, background 0.3s' }} />
        </div>

        <div style={{ padding: '24px 28px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)' }}>
              {question.emoji} {question.categoryName.toUpperCase()}
            </div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: '1.8rem', color: timerColor, letterSpacing: 2,
              transition: 'color 0.3s',
            }}>{localTimer}</div>
          </div>

          {/* Image or text */}
          {imageUrl ? (
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img
                src={imageUrl}
                alt="Pytanie"
                style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 12, objectFit: 'contain' }}
              />
            </div>
          ) : (
            <div style={{ textAlign: 'center', fontSize: '5rem', marginBottom: 20 }}>🎯</div>
          )}

          {/* Status of both players */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <div style={{
              flex: 1, padding: '8px', borderRadius: 8, textAlign: 'center', fontSize: '0.72rem',
              background: gameState.hostAnswered ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${gameState.hostAnswered ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: gameState.hostAnswered ? '#4ade80' : 'rgba(255,255,255,0.4)',
            }}>
              {myRole === 'host' ? 'Ty (Host)' : 'Host'} {gameState.hostAnswered ? '✓' : '...'}
            </div>
            <div style={{
              flex: 1, padding: '8px', borderRadius: 8, textAlign: 'center', fontSize: '0.72rem',
              background: gameState.guestAnswered ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${gameState.guestAnswered ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: gameState.guestAnswered ? '#4ade80' : 'rgba(255,255,255,0.4)',
            }}>
              {myRole === 'guest' ? 'Ty (Gość)' : 'Gość'} {gameState.guestAnswered ? '✓' : '...'}
            </div>
          </div>

          {/* Answer input */}
          {!answered ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && checkAnswer()}
                placeholder="Wpisz odpowiedź..."
                autoFocus
                disabled={!!feedback}
                style={{
                  flex: 1, background: feedback === 'correct'
                    ? 'rgba(74,222,128,0.12)'
                    : feedback === 'wrong'
                    ? 'rgba(239,68,68,0.12)'
                    : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${feedback === 'correct' ? 'rgba(74,222,128,0.4)' : feedback === 'wrong' ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 10, padding: '12px 16px',
                  color: '#fff', fontSize: '1rem', outline: 'none',
                  fontFamily: "'Montserrat', sans-serif",
                }}
              />
              <button
                onClick={checkAnswer}
                disabled={!!feedback || !input.trim()}
                style={{
                  padding: '12px 20px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #D4AF37, #A0832A)',
                  color: '#000', fontWeight: 800, cursor: 'pointer',
                  opacity: !input.trim() ? 0.4 : 1,
                }}
              >✓</button>
            </div>
          ) : (
            <div style={{
              padding: '14px', borderRadius: 10, textAlign: 'center',
              background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)',
              color: '#4ade80', fontWeight: 700, letterSpacing: 1,
            }}>
              ✓ Odpowiedź wysłana — czekam na wynik...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Round End overlay ─────────────────────────────────────────
function RoundEndOverlay({
  gameState, myRole, onContinue,
}: {
  gameState: GameState
  myRole: 'host' | 'guest'
  onContinue: () => void
}) {
  const w = gameState.roundWinner
  const iWon = w === myRole
  const isDraw = w === 'draw' || w === null

  useEffect(() => {
    const t = setTimeout(onContinue, 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 90, flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: '4rem' }}>{isDraw ? '🤝' : iWon ? '🏆' : '💀'}</div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', letterSpacing: 6, color: isDraw ? '#fff' : iWon ? '#4ade80' : '#f87171' }}>
        {isDraw ? 'REMIS' : iWon ? 'WYGRAŁEŚ RUNDĘ!' : 'PRZEGRAŁEŚ RUNDĘ'}
      </div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>
        Wynik: {gameState.hostScore} — {gameState.guestScore}
      </div>
    </div>
  )
}

// ── Game Over overlay ─────────────────────────────────────────
function GameOverOverlay({
  gameState, myRole, me, opponent, onExit,
}: {
  gameState: GameState
  myRole: 'host' | 'guest'
  me: any
  opponent: any
  onExit: () => void
}) {
  const w = gameState.winner
  const iWon = w === myRole
  const isDraw = w === 'draw'
  const myTiles = gameState.tiles.filter(t => t.owner === myRole).length
  const oppTiles = gameState.tiles.filter(t => t.owner !== myRole && t.owner !== null).length

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 20, fontFamily: "'Montserrat', sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 480, textAlign: 'center',
        background: '#0f0f0f', border: `1px solid ${isDraw ? 'rgba(255,255,255,0.15)' : iWon ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
        borderRadius: 20, padding: '40px 32px',
      }}>
        <div style={{ fontSize: '4.5rem', marginBottom: 12 }}>
          {isDraw ? '🤝' : iWon ? '🥇' : '💀'}
        </div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '2.2rem', letterSpacing: 8, marginBottom: 6,
          color: isDraw ? '#fff' : iWon ? '#4ade80' : '#f87171',
        }}>
          {isDraw ? 'REMIS!' : iWon ? 'WYGRANA!' : 'PORAŻKA'}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 28, fontSize: '0.85rem' }}>
          {iWon ? '+50 XP' : isDraw ? '+20 XP' : '+10 XP'}
        </div>

        {/* Final score */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 4 }}>{me?.avatar}</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{me?.username}</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: iWon ? '#4ade80' : '#f87171' }}>
              {myTiles}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>kafelki</div>
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: 'rgba(255,255,255,0.2)' }}>:</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 4 }}>{opponent?.avatar}</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{opponent?.username}</div>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: !iWon && !isDraw ? '#4ade80' : '#f87171' }}>
              {oppTiles}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>kafelki</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
          {[
            ['Rundy', gameState.totalRounds],
            ['Kafelki zdobyte', myTiles],
          ].map(([label, val]) => (
            <div key={label as string} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 0' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{val}</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', letterSpacing: 1 }}>{label as string}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onExit} style={{
            flex: 1, padding: '13px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #D4AF37, #A0832A)',
            color: '#000', fontWeight: 800, cursor: 'pointer', fontSize: '0.88rem', letterSpacing: 2,
          }}>KOLEJNA GRA</button>
          <button onClick={() => window.location.href = '/dashboard'} style={{
            flex: 1, padding: '13px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent', color: 'rgba(255,255,255,0.6)',
            cursor: 'pointer', fontSize: '0.85rem',
          }}>Dashboard</button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function MultiplayerGame() {
  const { id: roomId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, refreshProfile } = useAuthStore()
  const {
    initGame, gameState, myRole, me, opponent, room,
    selectTile, submitAnswer, syncGameState, imageUrl, cleanup,
  } = useMultiplayerStore()

  const [inited, setInited] = useState(false)
  const [showCountdown, setShowCountdown] = useState(true)
  const [countdown, setCountdown] = useState(3)
  const gameSavedRef = useRef(false)

  useEffect(() => {
    if (!profile || !roomId) { navigate('/login'); return }
    initGame(roomId, profile).then(() => setInited(true))
    return () => cleanup()
  }, [])

  // Countdown 3-2-1-GO
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

  // Save game when over
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
    const loserId = w === 'host' ? room.guestId : w === 'guest' ? room.hostId : null
    const durationSec = Math.round((Date.now() - gameState.startedAt) / 1000)

    await supabase.rpc('finish_game', {
      p_room_id: room.id,
      p_winner_id: winnerId ?? room.hostId,
      p_loser_id: loserId ?? room.guestId,
      p_winner_score: gameState.hostScore,
      p_loser_score: gameState.guestScore,
      p_rounds_total: gameState.totalRounds,
      p_duration_sec: durationSec,
      p_is_draw: w === 'draw',
    })

    await refreshProfile()
  }

  const handleTileSelect = (tileIdx: number) => {
    if (!gameState || gameState.currentTurn !== myRole) return
    selectTile(tileIdx)
  }

  const handleAnswer = (correct: boolean) => {
    submitAnswer(correct)
  }

  const handleContinueAfterRound = async () => {
    if (!gameState) return
    const updated: GameState = { ...gameState, phase: 'select_tile', roundWinner: null }
    await syncGameState(updated)
  }

  if (!profile) return null

  if (!inited || !gameState) {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: "'Montserrat', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚙️</div>
          <div style={{ letterSpacing: 3, fontSize: '0.85rem' }}>ŁADOWANIE GRY...</div>
        </div>
      </div>
    )
  }

  const preset = BOARD_PRESETS[room?.config.board_shape ?? 0] ?? BOARD_PRESETS[0]
  const isMyTurn = gameState.currentTurn === myRole
  const myScore = myRole === 'host' ? gameState.hostScore : gameState.guestScore
  const oppScore = myRole === 'host' ? gameState.guestScore : gameState.hostScore

  return (
    <div style={{
      minHeight: '100vh', background: '#080808', color: '#fff',
      fontFamily: "'Montserrat', sans-serif", display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        .tile-hover:hover { background: rgba(212,175,55,0.06) !important; }
        @keyframes fade-in { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
        .fade-in { animation: fade-in 0.3s ease; }
      `}</style>

      {/* ── COUNTDOWN OVERLAY ── */}
      {showCountdown && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '8rem', color: '#D4AF37', letterSpacing: 10, lineHeight: 1 }}>
            {countdown > 0 ? countdown : 'GO!'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: 3, fontSize: '0.9rem' }}>
            {me?.avatar} {me?.username} vs {opponent?.avatar} {opponent?.username}
          </div>
        </div>
      )}

      {/* ── TOP BAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', background: '#0a0a0a',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* My side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isMyTurn ? '#4ade80' : 'rgba(255,255,255,0.2)',
            boxShadow: isMyTurn ? '0 0 8px #4ade80' : 'none',
          }} />
          <span style={{ fontSize: '1.1rem' }}>{me?.avatar}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{me?.username}</div>
            <div style={{ fontSize: '0.65rem', color: myRole === 'host' ? '#D4AF37' : '#C0C0C0' }}>
              {myRole === 'host' ? '🥇 Host' : '🥈 Gość'}
            </div>
          </div>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem',
            color: isMyTurn ? '#4ade80' : '#D4AF37', letterSpacing: 2, marginLeft: 6,
          }}>{myScore}</div>
        </div>

        {/* Round info */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.75rem', letterSpacing: 4, color: 'rgba(255,255,255,0.3)' }}>
            RUNDA
          </div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', color: '#D4AF37', letterSpacing: 2 }}>
            {gameState.round}/{gameState.totalRounds}
          </div>
          <div style={{ fontSize: '0.65rem', color: isMyTurn ? '#4ade80' : 'rgba(255,255,255,0.3)', letterSpacing: 1 }}>
            {isMyTurn ? 'TWÓJ RUCH' : `RUCH: ${opponent?.username}`}
          </div>
        </div>

        {/* Opponent side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexDirection: 'row-reverse' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: !isMyTurn ? '#4ade80' : 'rgba(255,255,255,0.2)',
            boxShadow: !isMyTurn ? '0 0 8px #4ade80' : 'none',
          }} />
          <span style={{ fontSize: '1.1rem' }}>{opponent?.avatar}</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{opponent?.username}</div>
            <div style={{ fontSize: '0.65rem', color: myRole === 'guest' ? '#D4AF37' : '#C0C0C0' }}>
              {myRole === 'host' ? '🥈 Gość' : '🥇 Host'}
            </div>
          </div>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem',
            color: !isMyTurn ? '#4ade80' : '#C0C0C0', letterSpacing: 2, marginRight: 6,
          }}>{oppScore}</div>
        </div>
      </div>

      {/* ── BOARD ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${preset.cols}, minmax(60px, 140px))`,
          gap: 10,
          width: '100%', maxWidth: preset.cols * 148,
        }}>
          {gameState.tiles.map((tile, i) => (
            <Tile
              key={i}
              tile={tile}
              isSelected={gameState.selectedTileIdx === i}
              isMyTurn={isMyTurn}
              canSelect={isMyTurn && gameState.phase === 'select_tile'}
              onSelect={() => handleTileSelect(i)}
            />
          ))}
        </div>
      </div>

      {/* ── STATUS BAR ── */}
      <div style={{
        padding: '10px 16px', background: '#0a0a0a',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        textAlign: 'center', fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)',
      }}>
        {gameState.phase === 'select_tile' && isMyTurn && '👆 Wybierz kafelek do ataku'}
        {gameState.phase === 'select_tile' && !isMyTurn && `⏳ Czekam na wybór gracza ${opponent?.username}...`}
        {gameState.phase === 'duel' && '⚔️ DUEL — odpowiedz na pytanie!'}
        {gameState.phase === 'countdown' && '⏳ Przygotowanie...'}
      </div>

      {/* ── OVERLAYS ── */}
      {gameState.phase === 'duel' && gameState.currentQuestion && (
        <DuelOverlay
          question={gameState.currentQuestion}
          imageUrl={imageUrl}
          gameState={gameState}
          myRole={myRole!}
          onAnswer={handleAnswer}
        />
      )}

      {gameState.phase === 'round_end' && (
        <RoundEndOverlay
          gameState={gameState}
          myRole={myRole!}
          onContinue={handleContinueAfterRound}
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
