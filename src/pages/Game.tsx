import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Board from '../components/Board'
import DuelModal from '../components/DuelModal'
import { SoundEngine } from '../lib/SoundEngine'
import { useConfigStore } from '../store/useConfigStore'
import { useGameStore } from '../store/useGameStore'

export default function Game() {
  const navigate = useNavigate()
  const loadCategories = useGameStore(s => s.loadCategories)
  const newGame = useGameStore(s => s.newGame)
  const moveCursor = useGameStore(s => s.moveCursor)
  const startChallenge = useGameStore(s => s.startChallenge)
  const duel = useGameStore(s => s.duel)
  const toastText = useGameStore(s => s.toastText)
  const { fetch: fetchConfig } = useConfigStore()

  const [splash, setSplash] = useState(true)
  const [loading, setLoading] = useState(false)

  const handleStart = async () => {
    SoundEngine.startBg('bgMusic', 0.3)
    setSplash(false)
    setLoading(true)
    await fetchConfig()
    await loadCategories()
    setLoading(false)
  }

  useEffect(() => {
    if (splash || loading || duel) return
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); moveCursor('up');    break
        case 'ArrowDown':  e.preventDefault(); moveCursor('down');  break
        case 'ArrowLeft':  e.preventDefault(); moveCursor('left');  break
        case 'ArrowRight': e.preventDefault(); moveCursor('right'); break
        case 'Enter':      e.preventDefault(); startChallenge();    break
        case 'n': case 'N': if (!e.ctrlKey) newGame(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [splash, loading, duel])

  /* ── SPLASH ── */
  if (splash) {
    return (
      <div style={styles.fullscreen}>
        <style>{splashCSS}</style>
        <div style={styles.gridBg} />
        <div style={styles.vignette} />

        <div style={styles.splashContent}>
          <div style={styles.splashLogo}>THE FLOOR</div>
          <div style={styles.splashSub}>Gala Kierunku</div>

          <button
            className="splash-btn"
            onClick={handleStart}
            style={styles.splashBtn}>
            ▶&nbsp; ROZPOCZNIJ
          </button>

          <div style={styles.splashHint}>Kliknij aby wejść do gry</div>
        </div>
      </div>
    )
  }

  /* ── LOADING ── */
  if (loading) {
    return (
      <div style={{ ...styles.fullscreen, flexDirection: 'column', gap: 28 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.loadingLogo}>THE FLOOR</div>
        <div style={styles.spinner} />
      </div>
    )
  }

  /* ── MAIN GAME ── */
  return (
    <div style={styles.gameRoot}>
      <style>{gameCSS}</style>

      {/* Vignette */}
      <div style={styles.vignette} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLogo}>THE FLOOR</div>
        <div style={styles.headerSub}>Gala Kierunku</div>
      </header>

      {/* Board — fills all available space between header and footer */}
      <main style={styles.boardArea}>
        <Board />
      </main>

      {/* Footer controls — hidden during duel */}
      {!duel && <footer style={styles.footer}>
        <OpBtn onClick={newGame}>🎮 Nowa gra</OpBtn>
        <OpBtn onClick={startChallenge} gold>▶ Pojedynek</OpBtn>
        <OpBtn onClick={() => navigate('/admin')}>⚙ Admin</OpBtn>
      </footer>}

      {/* Key hint — hidden during duel */}
      {!duel && <div style={styles.keyHint}>
        ↑↓←→ poruszanie · ENTER pojedynek · N nowa gra
      </div>}

      {/* Toast */}
      {toastText && (
        <div style={styles.toast}>{toastText}</div>
      )}

      <DuelModal />
    </div>
  )
}

function OpBtn({
  children,
  onClick,
  gold,
}: {
  children: React.ReactNode
  onClick: () => void
  gold?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={gold ? 'op-btn op-btn-gold' : 'op-btn'}>
      {children}
    </button>
  )
}

/* ── Styles ── */
const styles: Record<string, React.CSSProperties> = {
  fullscreen: {
    minHeight: '100vh',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: "'Montserrat', sans-serif",
  },
  gridBg: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(rgba(212,175,55,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(212,175,55,.07) 1px,transparent 1px)',
    backgroundSize: '60px 60px',
    animation: 'gridSlide 8s linear infinite',
  },
  vignette: {
    pointerEvents: 'none',
    position: 'fixed',
    inset: 0,
    background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.75) 100%)',
    zIndex: 1,
  },
  splashContent: {
    position: 'relative',
    zIndex: 2,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    textAlign: 'center',
    padding: '0 24px',
  },
  splashLogo: {
    fontFamily: "'Bebas Neue', 'Montserrat', sans-serif",
    fontSize: 'clamp(4rem, 14vw, 9rem)',
    letterSpacing: 20,
    background: 'linear-gradient(135deg, #FFD700 0%, #C0C0C0 50%, #FFD700 100%)',
    backgroundSize: '200%',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    animation: 'shimmer 3s linear infinite',
    lineHeight: 1,
  },
  splashSub: {
    fontSize: '.85rem',
    letterSpacing: 10,
    color: '#6A6A6A',
    textTransform: 'uppercase',
    marginTop: -6,
  },
  splashBtn: {
    marginTop: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '18px 52px',
    fontFamily: "'Bebas Neue', 'Montserrat', sans-serif",
    fontSize: '1.6rem',
    letterSpacing: 8,
    background: 'transparent',
    border: '2px solid #D4AF37',
    color: '#D4AF37',
    borderRadius: 60,
    cursor: 'pointer',
    transition: 'all .25s ease',
    animation: 'btnPulse 2s ease-in-out infinite',
  },
  splashHint: {
    fontSize: '.72rem',
    letterSpacing: 3,
    color: 'rgba(255,255,255,.2)',
    textTransform: 'uppercase',
  },
  loadingLogo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '5rem',
    letterSpacing: 14,
    background: 'linear-gradient(135deg, #FFD700, #C0C0C0)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  },
  spinner: {
    width: 48,
    height: 48,
    border: '3px solid rgba(212,175,55,.2)',
    borderTopColor: '#FFD700',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  gameRoot: {
    height: '100vh',
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: "'Montserrat', sans-serif",
    backgroundImage:
      'linear-gradient(rgba(212,175,55,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(212,175,55,.03) 1px,transparent 1px)',
    backgroundSize: '60px 60px',
  },
  header: {
    flexShrink: 0,
    textAlign: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    zIndex: 20,
    width: '100%',
  },
  headerLogo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 'clamp(2rem, 5vw, 3.2rem)',
    letterSpacing: 16,
    background: 'linear-gradient(135deg, #FFD700, #C0C0C0)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    lineHeight: 1,
  },
  headerSub: {
    fontSize: '.68rem',
    letterSpacing: 8,
    color: '#4a4a4a',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  boardArea: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  footer: {
    flexShrink: 0,
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    padding: '8px 20px 12px',
    background: 'rgba(0,0,0,.8)',
    border: '1px solid rgba(192,192,192,.15)',
    borderRadius: 50,
    backdropFilter: 'blur(20px)',
    zIndex: 60,
    marginBottom: 36,
  },
  keyHint: {
    position: 'fixed',
    bottom: 10,
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'rgba(255,255,255,.15)',
    fontSize: '.68rem',
    letterSpacing: 2,
    zIndex: 10,
    whiteSpace: 'nowrap',
  },
  toast: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: '#FFD700',
    color: '#000',
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1.8rem',
    letterSpacing: 6,
    padding: '12px 36px',
    borderRadius: 50,
    boxShadow: '0 0 60px rgba(212,175,55,.5)',
    zIndex: 9999,
    pointerEvents: 'none',
  },
}

const splashCSS = `
  @keyframes gridSlide {
    from { background-position: 0 0; }
    to   { background-position: 60px 60px; }
  }
  @keyframes shimmer {
    from { background-position: 200% center; }
    to   { background-position: -200% center; }
  }
  @keyframes btnPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,215,0,0); }
    50%       { box-shadow: 0 0 30px 6px rgba(255,215,0,.22); }
  }
  .splash-btn:hover {
    background: #FFD700 !important;
    color: #000 !important;
    box-shadow: 0 0 50px rgba(255,215,0,.5) !important;
    transform: scale(1.04);
    animation: none !important;
  }
`

const gameCSS = `
  .op-btn {
    padding: 7px 16px;
    font-family: 'Montserrat', sans-serif;
    font-size: .75rem;
    font-weight: 600;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    background: transparent;
    border: 1.5px solid rgba(192,192,192,.25);
    color: #d0d0d0;
    border-radius: 30px;
    cursor: pointer;
    transition: all .2s;
  }
  .op-btn:hover {
    border-color: rgba(192,192,192,.55);
    color: #fff;
    background: rgba(255,255,255,.05);
  }
  .op-btn-gold {
    border-color: rgba(212,175,55,.45);
    color: #D4AF37;
  }
  .op-btn-gold:hover {
    border-color: #D4AF37;
    background: rgba(212,175,55,.08);
    color: #FFD700;
  }
`
