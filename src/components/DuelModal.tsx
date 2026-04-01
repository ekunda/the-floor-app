// DuelModal.tsx — Modal pojedynku
// Logika wydzielona do src/hooks/useDuelLogic.ts
// Ten plik odpowiada za renderowanie JSX i obsługę klawiatury.

import { useEffect } from 'react'
import { useConfigStore } from '../store/useConfigStore'
import { useGameStore } from '../store/useGameStore'
import { useDuelLogic } from '../hooks/useDuelLogic'
import type { FeedbackType, WinnerNum } from '../hooks/useDuelLogic'

export default function DuelModal() {
  const duel      = useGameStore(s => s.duel)
  const blockInput = useGameStore(s => s.blockInput)
  const { config, players } = useConfigStore()

  const {
    feedback, winner, countdown, imageUrl, hintLetter,
    listening, speechError, speechEnabled, setSpeechEnabled, speechSupported,
    handleStartFight, handleCorrect, handlePass, handleClose,
  } = useDuelLogic()

  const voicePassEnabled = config.VOICE_PASS !== 0
  const maxPasses        = config.MAX_PASSES ?? 0

  // ── Klawiatura ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!duel) return
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      if (!duel.started) {
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
  // handleCorrect/handlePass/handleClose są stabilnymi useCallback refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duel, blockInput, countdown, speechSupported])

  if (!duel) return null

  const t1        = duel.timer1
  const t2        = duel.timer2
  const p1        = players[0]
  const p2        = players[1]
  const passCount = duel.passCount ?? 0
  const passLeft  = maxPasses > 0 ? maxPasses - passCount : null

  const timerColor = (t: number) => t <= 5 ? '#ef4444' : t <= 15 ? '#facc15' : '#ffffff'
  const timerGlow  = (t: number) =>
    t <= 5  ? '0 0 30px rgba(239,68,68,0.7)'  :
    t <= 15 ? '0 0 20px rgba(250,204,21,0.5)' : 'none'

  const fbBg = (type: FeedbackType) => !feedback.text ? 'rgba(255,255,255,0.04)'
    : type === 'correct' || type === 'voice' ? 'rgba(34,197,94,0.15)'
    : type === 'pass'    ? 'rgba(251,146,60,0.15)'
    : type === 'forfeit' ? 'rgba(239,68,68,0.15)' : 'rgba(248,113,113,0.12)'
  const fbBorder = (type: FeedbackType) => !feedback.text ? 'rgba(255,255,255,0.07)'
    : type === 'correct' || type === 'voice' ? 'rgba(34,197,94,0.4)'
    : type === 'pass'    ? 'rgba(251,146,60,0.4)'
    : type === 'forfeit' ? 'rgba(239,68,68,0.5)' : 'rgba(248,113,113,0.35)'
  const fbGlow = (type: FeedbackType) => !feedback.text ? 'none'
    : type === 'correct' ? '0 0 30px rgba(34,197,94,0.8)'
    : type === 'voice'   ? '0 0 30px rgba(34,197,94,0.8), 0 0 60px rgba(99,220,255,0.4)'
    : type === 'pass'    ? '0 0 30px rgba(251,146,60,0.8)'
    : type === 'forfeit' ? '0 0 40px rgba(239,68,68,1)'
    : '0 0 30px rgba(248,113,113,0.8)'
  const fbColor = (type: FeedbackType) =>
    type === 'pass' || type === 'forfeit' ? '#fb923c'
    : (type === 'correct' || type === 'voice') ? '#4ade80'
    : type === 'timeout' ? '#ef4444' : 'rgba(255,255,255,0.15)'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'stretch',
      background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)', padding: 10,
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
          gap: 10, padding: '10px 56px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)', flexShrink: 0, position: 'relative',
        }}>
          <span style={{ fontSize: '1.4rem' }}>{duel.emoji}</span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 6, color: '#D4AF37' }}>
            {duel.categoryName}
          </span>

          {passLeft !== null && (
            <span style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              fontSize: '0.7rem', letterSpacing: 1,
              color: passLeft <= 1 ? '#ef4444' : 'rgba(255,255,255,0.3)',
              padding: '2px 8px', borderRadius: 20,
              background: passLeft <= 1 ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${passLeft <= 1 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
            }}>
              PAS: {passLeft}
            </span>
          )}

          {duel.started && speechSupported && (
            <button onClick={() => setSpeechEnabled(s => !s)}
              title={speechEnabled ? 'Wyłącz mikrofon (M)' : 'Włącz mikrofon (M)'}
              style={{ position: 'absolute', right: 52, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: speechEnabled ? (listening ? '#4ade80' : '#818cf8') : 'rgba(255,255,255,0.2)',
                boxShadow: listening ? '0 0 8px #4ade80' : 'none',
                animation: listening ? 'micPulse 1.5s ease-in-out infinite' : 'none',
              }} />
            </button>
          )}

          <button onClick={handleClose} style={{
            position: 'absolute', top: '50%', right: 16, transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
            fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1,
          }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>✕</button>
        </div>

        {/* Pre-fight */}
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 30 }}>
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
                {!voicePassEnabled && speechEnabled && (
                  <div style={{ color: 'rgba(255,165,0,0.5)', fontSize: '0.7rem', letterSpacing: 1 }}>
                    🎤 odpowiedzi głosowe aktywne · pas tylko klawiszem P
                  </div>
                )}
              </div>
            )}

            <button onClick={handleStartFight} style={{
              marginTop: 8, padding: '14px 48px',
              fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 6,
              background: 'linear-gradient(135deg, #D4AF37, #FFD700)', color: '#000',
              border: 'none', borderRadius: 50, cursor: 'pointer',
              boxShadow: '0 0 30px rgba(212,175,55,0.35)',
            }}>▶ ROZPOCZNIJ</button>
          </div>
        )}

        {/* Fight */}
        {duel.started && (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'min(18vw, 200px) 1fr min(18vw, 200px)', minHeight: 0, overflow: 'hidden' }}>
            <PlayerPanel name={p1.name} shortcut="A" timer={t1} active={duel.active === 1} color={p1.color} borderSide="right" timerColor={timerColor(t1)} timerGlow={timerGlow(t1)} />

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 16px 10px', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                flex: 1, width: '100%', minHeight: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: '12px 12px 0 0', overflow: 'hidden',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none',
                position: 'relative',
              }}>
                {imageUrl
                  ? <img src={imageUrl} alt="question" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none' }} draggable={false} />
                  : <div style={{ fontSize: '4rem', opacity: 0.3 }}>{duel.emoji}</div>
                }
                {hintLetter && config.SHOW_ANSWER_HINT === 1 && (
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '4px 10px',
                    fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.2rem', letterSpacing: 4,
                    color: 'rgba(255,215,0,0.7)', border: '1px solid rgba(255,215,0,0.2)',
                  }}>
                    {hintLetter}…
                  </div>
                )}
              </div>

              <div style={{
                width: '100%', flexShrink: 0, minHeight: 56,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px 16px', textAlign: 'center',
                background: fbBg(feedback.type),
                border: `1px solid ${fbBorder(feedback.type)}`,
                borderTop: 'none', borderRadius: '0 0 12px 12px',
                boxShadow: fbGlow(feedback.type),
                transition: 'all 0.3s ease',
              }}>
                <span style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: 'clamp(1rem, 3vw, 1.6rem)', letterSpacing: 4,
                  color: fbColor(feedback.type),
                }}>{feedback.text || '…'}</span>
              </div>

              <div style={{
                flexShrink: 0, marginTop: 8,
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
                color: 'rgba(255,255,255,0.2)', fontSize: '0.68rem', letterSpacing: 1.5,
              }}>
                {speechSupported && voicePassEnabled && (
                  <>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20,
                      background: speechEnabled ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${speechEnabled ? 'rgba(129,140,248,0.6)' : 'rgba(255,255,255,0.18)'}`,
                    }}>
                      <kbd className="kbd">M</kbd> mikrofon {speechEnabled ? 'wł.' : 'wył.'}
                    </span>
                    <span>·</span>
                  </>
                )}
                <span><kbd className="kbd">P</kbd> pas</span>
                <span>·</span>
                <span><kbd className="kbd">ESC</kbd> zakończ</span>
              </div>

              {speechError && (
                <div style={{ marginTop: 4, padding: '3px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#f87171', fontSize: '0.72rem', textAlign: 'center' }}>
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
              userSelect: 'none',
            }}>{countdown}</div>
          </div>
        )}

        {winner && <WinnerOverlay winner={winner} players={players} />}
      </div>

      <style>{`
        @keyframes micPulse { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:.5; transform:scale(1.3) } }
        @keyframes winnerReveal { from { transform:scale(.8) translateY(20px); opacity:0 } to { transform:scale(1) translateY(0); opacity:1 } }
        @keyframes confettiDrop { 0% { transform:translateY(-20px) rotate(0deg); opacity:1 } 100% { transform:translateY(120px) rotate(720deg); opacity:0 } }
        .kbd { display:inline-block; padding:1px 6px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:4px; font-family:monospace; font-size:.85em }
      `}</style>
    </div>
  )
}

// ── Sub-komponenty ────────────────────────────────────────────────────────────

function PlayerPanel({ name, shortcut, timer, active, color, borderSide, timerColor, timerGlow }: {
  name: string; shortcut: string; timer: number; active: boolean
  color: string; borderSide: 'left' | 'right'; timerColor: string; timerGlow: string
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'clamp(6px,1.5vh,16px)', padding: 'clamp(12px,2.5vh,32px) 12px',
      borderLeft:  borderSide === 'left'  ? '1px solid rgba(255,255,255,0.08)' : 'none',
      borderRight: borderSide === 'right' ? '1px solid rgba(255,255,255,0.08)' : 'none',
      background: active ? `${color}14` : 'transparent',
      opacity: active ? 1 : 0.4, transition: 'all 0.4s ease', position: 'relative',
    }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: active ? color : 'rgba(255,255,255,0.1)',
        boxShadow: active ? `0 0 16px ${color}, 0 0 32px ${color}40` : 'none',
        transition: 'all 0.3s',
      }} />
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 'clamp(1.3rem, 3.5vw, 2rem)', letterSpacing: 4, color,
        textAlign: 'center', lineHeight: 1.1,
        textShadow: active ? `0 0 20px ${color}80` : 'none',
        transition: 'text-shadow 0.3s',
      }}>{name}</div>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif",
        fontSize: 'clamp(3.5rem, 9vh, 8rem)', lineHeight: 1,
        color: timerColor, textShadow: timerGlow, transition: 'color .5s, text-shadow .5s',
      }}>{timer}</div>
      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', letterSpacing: 2 }}>
        <kbd className="kbd">{shortcut}</kbd> poprawna
      </div>
      {active && (
        <div style={{
          position: 'absolute', top: '25%', bottom: '25%', [borderSide]: 0,
          width: 3, borderRadius: 4, background: color, boxShadow: `0 0 12px ${color}`,
        }} />
      )}
    </div>
  )
}

function WinnerOverlay({ winner, players }: {
  winner: WinnerNum
  players: [{ name: string; color: string }, { name: string; color: string }]
}) {
  if (!winner) return null
  const isDraw = winner === 'draw'
  const color  = isDraw ? '#C0C0C0' : winner === 1 ? players[0].color : players[1].color
  const label  = isDraw ? 'REMIS'   : winner === 1 ? `${players[0].name} ZWYCIĘŻA!` : `${players[1].name} ZWYCIĘŻA!`
  const icon   = isDraw ? '⚖️'     : winner === 1 ? '🥇' : '🥈'
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.93)', borderRadius: 14, zIndex: 20, gap: 16,
    }}>
      {!isDraw && Array.from({ length: 16 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: `${10 + Math.random() * 30}%`, left: `${5 + (i / 16) * 90}%`,
          width: 8, height: 8, borderRadius: i % 3 === 0 ? '50%' : 2,
          background: i % 2 === 0 ? color : '#fff',
          animation: `confettiDrop ${1.2 + Math.random() * 1.2}s ease-in ${Math.random() * 0.5}s both`,
        }} />
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, animation: 'winnerReveal .5s cubic-bezier(.34,1.56,.64,1) both' }}>
        <div style={{ fontSize: '6rem', lineHeight: 1 }}>{icon}</div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 'clamp(2rem, 6vw, 3.5rem)', letterSpacing: 8, color,
          textShadow: `0 0 40px ${color}80, 0 0 80px ${color}40`,
        }}>{label}</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', letterSpacing: 4 }}>
          {isDraw ? 'Pole bez zmian' : 'Pole przejęte!'}
        </div>
      </div>
    </div>
  )
}
