/**
 * ErrorFallback — domyślny fallback UI dla ErrorBoundary.
 *
 * Wydzielony do osobnego pliku, bo ErrorBoundary musi być komponentem klasowym,
 * a Fast Refresh nie współpracuje z plikiem mieszającym klasę i funkcyjny komponent.
 */
export function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24,
      fontFamily: "'Montserrat', sans-serif", color: '#fff',
    }}>
      <div style={{ fontSize: '3rem' }}>⚠️</div>
      <div style={{
        fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem',
        letterSpacing: 8, color: '#ef4444',
      }}>
        Coś poszło nie tak
      </div>
      {error && (
        <pre style={{
          maxWidth: 560, width: '100%', padding: '12px 16px',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, color: '#fca5a5', fontSize: '0.75rem',
          overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {error.message}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={onReset}
          style={{
            padding: '10px 28px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)',
            color: '#D4AF37', fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '1rem', letterSpacing: 4,
          }}
        >
          Spróbuj ponownie
        </button>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            padding: '10px 28px', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)', fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '1rem', letterSpacing: 4,
          }}
        >
          Strona główna
        </button>
      </div>
    </div>
  )
}
