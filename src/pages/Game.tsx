// ─────────────────────────────────────────────────────────────────────────────
// Game.tsx — Główny ekran gry (powiększone logo i napisy)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Board from '../components/Board'
import DuelModal from '../components/DuelModal'
import { SoundEngine } from '../lib/SoundEngine'
import { hasGameState } from '../lib/persistence'
import { useConfigStore } from '../store/useConfigStore'
import { computeStats, useGameStore } from '../store/useGameStore'

type AppState = 'splash' | 'restoring' | 'loading' | 'game'

export default function Game() {
  const navigate       = useNavigate()
  const loadCategories = useGameStore(s => s.loadCategories)
  const restoreSession = useGameStore(s => s.restoreSession)
  const newGame        = useGameStore(s => s.newGame)
  const moveCursor     = useGameStore(s => s.moveCursor)
  const startChallenge = useGameStore(s => s.startChallenge)
  const duel           = useGameStore(s => s.duel)
  const toastText      = useGameStore(s => s.toastText)
  const tiles          = useGameStore(s => s.tiles)
  const showStats      = useGameStore(s => s.showStats)
  const toggleStats    = useGameStore(s => s.toggleStats)
  const { fetch: fetchConfig, players } = useConfigStore()

  const [appState, setAppState] = useState<AppState>('splash')
  const stats = computeStats(tiles)

  // ── Sprawdź czy mamy zapisaną sesję ──────────────────────────────────────
  useEffect(() => {
    if (hasGameState()) {
      setAppState('restoring')
      SoundEngine.startBg('bgMusic', 0.3)
      restoreSession().then(ok => {
        setAppState(ok ? 'game' : 'loading')
        if (!ok) _startLoading()
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function _startLoading() {
    Promise.all([fetchConfig(), loadCategories()]).then(() => setAppState('game'))
  }

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    if (appState !== 'game') return
    const handler = (e: KeyboardEvent) => {
      if (duel) return
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); moveCursor('up');    break
        case 'ArrowDown':  e.preventDefault(); moveCursor('down');  break
        case 'ArrowLeft':  e.preventDefault(); moveCursor('left');  break
        case 'ArrowRight': e.preventDefault(); moveCursor('right'); break
        case 'Enter':      e.preventDefault(); startChallenge();    break
        case 's': case 'S': toggleStats(); break
        case 'n': case 'N': newGame(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [appState, duel, moveCursor, startChallenge, toggleStats, newGame])

  // ── SPLASH ────────────────────────────────────────────────────────────────
  if (appState === 'splash') {
    return (
      <div style={styles.fullscreen}>
        <style>{splashCSS}</style>
        <div style={styles.gridBg} />
        <div style={styles.splashContent}>
          <div style={styles.splashLogo}>THE REFLECTOR</div>
          <div style={styles.splashSub}>Gala Kierunku</div>
          <button
            className="splash-btn"
            style={styles.splashBtn}
            onClick={() => {
              SoundEngine.unlockAudio().catch(() => {})
              SoundEngine.startBg('bgMusic', 0.3)
              setAppState('loading')
              _startLoading()
            }}
          >
            ▶ ZAGRAJ
          </button>
          <div style={styles.splashHint}>Kliknij aby wejść do gry</div>
        </div>
      </div>
    )
  }

  // ── RESTORING ─────────────────────────────────────────────────────────────
  if (appState === 'restoring') {
    return (
      <div style={{ ...styles.fullscreen, flexDirection: 'column', gap: 24 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.loadingLogo}>THE REFLECTOR</div>
        <div style={styles.spinner} />
        <div style={{ fontSize: '0.75rem', letterSpacing: 4, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
          Wznawianie gry…
        </div>
      </div>
    )
  }

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (appState === 'loading') {
    return (
      <div style={{ ...styles.fullscreen, flexDirection: 'column', gap: 28 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.loadingLogo}>THE REFLECTOR</div>
        <div style={styles.spinner} />
      </div>
    )
  }

  // ── MAIN GAME ─────────────────────────────────────────────────────────────
  return (
    <div style={styles.gameRoot}>
      <style>{gameCSS}</style>
      <div style={styles.vignette} />

      {/* Header — POWIĘKSZONE LOGO */}
      <header style={styles.header}>
        <div style={styles.headerLogo}>THE REFLECTOR</div>
        <div style={styles.headerSub}>Gala Kierunku</div>
      </header>

      {/* Plansza */}
      <main style={styles.boardArea}>
        <Board />
      </main>

      {/* Statystyki */}
      {showStats && !duel && tiles.length > 0 && (
        <div style={styles.statsPanel}>
          <div style={styles.statPlayer}>
            <div style={{ ...styles.statDot, background: players[0].color, boxShadow: `0 0 8px ${players[0].color}` }} />
            <span style={{ ...styles.statName, color: players[0].color }}>{players[0].name}</span>
            <span style={styles.statCount}>{stats.goldTiles}</span>
            <span style={styles.statPct}>{stats.goldPct}%</span>
          </div>
          <div style={styles.progressTrack}>
            <div style={{
              height: '100%', width: `${stats.goldPct}%`,
              background: `linear-gradient(90deg, ${players[0].color}, ${players[0].color}cc)`,
              borderRadius: '4px 0 0 4px', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
            }} />
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: `${stats.silverPct}%`,
              background: `linear-gradient(90deg, ${players[1].color}cc, ${players[1].color})`,
              borderRadius: '0 4px 4px 0', transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
          <div style={{ ...styles.statPlayer, flexDirection: 'row-reverse' }}>
            <div style={{ ...styles.statDot, background: players[1].color, boxShadow: `0 0 8px ${players[1].color}` }} />
            <span style={{ ...styles.statName, color: players[1].color }}>{players[1].name}</span>
            <span style={styles.statCount}>{stats.silverTiles}</span>
            <span style={styles.statPct}>{stats.silverPct}%</span>
          </div>
        </div>
      )}

      {/* Footer */}
      {!duel && (
        <footer style={styles.footer}>
          <OpBtn onClick={newGame}>🎮 Nowa gra</OpBtn>
          <OpBtn onClick={startChallenge} gold>▶ Pojedynek</OpBtn>
          <OpBtn onClick={toggleStats}>{showStats ? '📊 Ukryj' : '📊 Statystyki'}</OpBtn>
          <OpBtn onClick={() => { SoundEngine.stopBg(500); navigate('/admin') }}>⚙ Admin</OpBtn>
        </footer>
      )}

      {/* Key hint */}
      {!duel && (
        <div style={styles.keyHint}>
          ↑↓←→ poruszanie · ENTER pojedynek · S statystyki · N nowa gra
        </div>
      )}

      {/* Toast */}
      {toastText && <div style={styles.toast}>{toastText}</div>}

      <DuelModal />
    </div>
  )
}

function OpBtn({ children, onClick, gold }: { children: React.ReactNode; onClick: () => void; gold?: boolean }) {
  return (
    <button onClick={onClick} className={gold ? 'op-btn op-btn-gold' : 'op-btn'}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Style
// ─────────────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  fullscreen: {
    minHeight: '100vh', background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden',
    fontFamily: "'Montserrat', sans-serif",
  },
  gridBg: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(rgba(212,175,55,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(212,175,55,.07) 1px,transparent 1px)',
    backgroundSize: '60px 60px', animation: 'gridSlide 8s linear infinite',
  },
  vignette: {
    pointerEvents: 'none', position: 'fixed', inset: 0,
    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.75) 100%)',
    zIndex: 1,
  },
  splashContent: {
    position: 'relative', zIndex: 2,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 14, textAlign: 'center', padding: '0 24px',
  },
  splashLogo: {
    fontFamily: "'Bebas Neue', 'Montserrat', sans-serif",
    fontSize: 'clamp(4rem, 14vw, 9rem)', letterSpacing: 20,
    background: 'linear-gradient(135deg, #FFD700 0%, #C0C0C0 50%, #FFD700 100%)',
    backgroundSize: '200%', WebkitBackgroundClip: 'text', backgroundClip: 'text',
    color: 'transparent', animation: 'shimmer 3s linear infinite', lineHeight: 1,
  },
  splashSub: { fontSize: '.85rem', letterSpacing: 10, color: '#6A6A6A', textTransform: 'uppercase', marginTop: -6 },
  splashBtn: {
    marginTop: 20, display: 'flex', alignItems: 'center', gap: 14,
    padding: '18px 52px', fontFamily: "'Bebas Neue', 'Montserrat', sans-serif",
    fontSize: '1.6rem', letterSpacing: 8, background: 'transparent',
    border: '2px solid #D4AF37', color: '#D4AF37', borderRadius: 60, cursor: 'pointer',
    transition: 'all .25s ease', animation: 'btnPulse 2s ease-in-out infinite',
  },
  splashHint: { fontSize: '.72rem', letterSpacing: 3, color: 'rgba(255,255,255,.2)', textTransform: 'uppercase' },
  loadingLogo: {
    fontFamily: "'Bebas Neue', sans-serif", fontSize: '5rem', letterSpacing: 14,
    background: 'linear-gradient(135deg, #FFD700, #C0C0C0)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  },
  spinner: {
    width: 48, height: 48, border: '3px solid rgba(212,175,55,.2)',
    borderTopColor: '#FFD700', borderRadius: '50%', animation: 'spin 1s linear infinite',
  },
  gameRoot: {
    height: '100vh', background: '#000',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    position: 'relative', overflow: 'hidden',
    fontFamily: "'Montserrat', sans-serif",
    backgroundImage: 'linear-gradient(rgba(212,175,55,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(212,175,55,.03) 1px,transparent 1px)',
    backgroundSize: '60px 60px',
  },

  // ── POWIĘKSZONE LOGO NAD PLANSZĄ ─────────────────────────────────────────
  header: {
    flexShrink: 0, textAlign: 'center',
    paddingTop: 12, paddingBottom: 4, zIndex: 20, width: '100%',
  },
  headerLogo: {
    fontFamily: "'Bebas Neue', sans-serif",
    // Zwiększone: było clamp(2rem, 5vw, 3.2rem) → teraz clamp(2.8rem, 6.5vw, 4.8rem)
    fontSize: 'clamp(2.8rem, 6.5vw, 4.8rem)',
    letterSpacing: 16,
    background: 'linear-gradient(135deg, #FFD700, #C0C0C0)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
    lineHeight: 1,
  },
  // Powiększony podtytuł
  headerSub: {
    fontSize: '.85rem', letterSpacing: 8,
    color: '#5a5a5a', textTransform: 'uppercase', marginTop: 2,
  },

  boardArea: {
    flex: 1, width: '100%', minHeight: 0, padding: '4px 16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  statsPanel: {
    flexShrink: 0, width: '100%', maxWidth: 640,
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '6px 20px 4px', zIndex: 20,
  },
  statPlayer:   { display: 'flex', alignItems: 'center', gap: 6, minWidth: 100, flexShrink: 0 },
  statDot:      { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  statName:     { fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.8rem', letterSpacing: 3, flexShrink: 0 },
  statCount:    { color: '#fff', fontSize: '0.85rem', fontWeight: 700, marginLeft: 2 },
  statPct:      { color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem', marginLeft: 2 },
  progressTrack: {
    flex: 1, height: 6, background: 'rgba(255,255,255,0.08)',
    borderRadius: 4, position: 'relative', overflow: 'hidden',
  },
  footer: {
    flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap',
    justifyContent: 'center', padding: '8px 20px 12px',
    background: 'rgba(0,0,0,.8)', border: '1px solid rgba(192,192,192,.15)',
    borderRadius: 50, backdropFilter: 'blur(20px)', zIndex: 60, marginBottom: 32,
  },
  keyHint: {
    position: 'fixed', bottom: 10, left: '50%', transform: 'translateX(-50%)',
    color: 'rgba(255,255,255,.15)', fontSize: '.68rem', letterSpacing: 2,
    zIndex: 10, whiteSpace: 'nowrap',
  },
  toast: {
    position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    background: '#FFD700', color: '#000',
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1.8rem', letterSpacing: 6,
    padding: '12px 36px', borderRadius: 50,
    boxShadow: '0 0 60px rgba(212,175,55,.5)',
    zIndex: 9999, pointerEvents: 'none',
  },
}

const splashCSS = `
  @keyframes gridSlide { from { background-position: 0 0; } to { background-position: 60px 60px; } }
  @keyframes shimmer { from { background-position: 200% center; } to { background-position: -200% center; } }
  @keyframes btnPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,215,0,0); } 50% { box-shadow: 0 0 30px 6px rgba(255,215,0,.22); } }
  .splash-btn:hover { background: #FFD700 !important; color: #000 !important; box-shadow: 0 0 50px rgba(255,215,0,.5) !important; transform: scale(1.04); animation: none !important; }
`

const gameCSS = `
  .op-btn { padding: 7px 16px; font-family: 'Montserrat', sans-serif; font-size: .75rem; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; background: transparent; border: 1.5px solid rgba(192,192,192,.25); color: #d0d0d0; border-radius: 30px; cursor: pointer; transition: all .2s; }
  .op-btn:hover { border-color: rgba(192,192,192,.55); color: #fff; background: rgba(255,255,255,.05); }
  .op-btn-gold { border-color: rgba(212,175,55,.45); color: #D4AF37; }
  .op-btn-gold:hover { border-color: #D4AF37; background: rgba(212,175,55,.08); color: #FFD700; }
`
