import { styles, splashCSS } from '../../pages/Game.styles'

interface SplashScreenProps {
  onStart: () => void
  onMultiplayer: () => void
}

/** Single-player entry screen: logo + start / multiplayer buttons. */
export default function SplashScreen({ onStart, onMultiplayer }: SplashScreenProps) {
  return (
    <div style={styles.fullscreen}>
      <style>{splashCSS}</style>
      <div style={styles.gridBg} />
      <div style={styles.vignette} />
      <div style={styles.splashContent}>
        <div style={styles.splashLogo}>THE FLOOR</div>

        <button className="splash-btn" onClick={onStart} style={styles.splashBtn}>
          ▶&nbsp; ROZPOCZNIJ
        </button>
        <button
          onClick={onMultiplayer}
          style={{
            marginTop: 4,
            padding: '12px 36px',
            fontFamily: "'Bebas Neue', 'Montserrat', sans-serif",
            fontSize: '1.1rem',
            letterSpacing: 6,
            background: 'transparent',
            border: '1px solid rgba(99,102,241,0.5)',
            color: 'rgba(99,102,241,0.9)',
            borderRadius: 60,
            cursor: 'pointer',
            transition: 'all .25s ease',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget
            el.style.background = 'rgba(99,102,241,0.15)'
            el.style.borderColor = 'rgba(99,102,241,0.9)'
            el.style.color = '#818cf8'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            el.style.background = 'transparent'
            el.style.borderColor = 'rgba(99,102,241,0.5)'
            el.style.color = 'rgba(99,102,241,0.9)'
          }}
        >
          🌐&nbsp; MULTIPLAYER
        </button>
        <div style={styles.splashHint}>Kliknij aby wejść do gry</div>
      </div>
    </div>
  )
}
