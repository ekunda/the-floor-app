import { styles } from '../../pages/Game.styles'

/** Full-screen logo + spinner. Shows an optional caption (e.g. while restoring). */
export default function LoadingScreen({ label }: { label?: string }) {
  return (
    <div style={{ ...styles.fullscreen, flexDirection: 'column', gap: label ? 24 : 28 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.loadingLogo}>THE FLOOR</div>
      <div style={styles.spinner} />
      {label && (
        <div style={{ fontSize: '0.75rem', letterSpacing: 4, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
          {label}
        </div>
      )}
    </div>
  )
}
