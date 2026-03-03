import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { clearSession, recordLogin, supabase } from '../lib/supabase'

export default function Admin() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const navigate = useNavigate()

  useEffect(() => { SoundEngine.stopBg(0) }, [])

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    clearSession()

    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr || !data.user) {
      setLoading(false)
      return setError(authErr?.message ?? 'Blad logowania')
    }

    // ── Ensure admin has a player profile ──
    const rawNick = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20) || 'ADMIN'

    const { data: existing } = await supabase
      .from('profiles').select('id, username').eq('id', data.user.id).maybeSingle()

    if (!existing) {
      // First login — create profile
      await supabase.from('profiles').insert({
        id:          data.user.id,
        email:       data.user.email,
        username:    rawNick,
        avatar:      '⚙️',
        xp:          0,
        wins:        0,
        losses:      0,
        win_streak:  0,
        best_streak: 0,
        status:      'online',
        last_seen:   new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      })
    } else {
      // Subsequent login — only update status
      await supabase.from('profiles')
        .update({ status: 'online', last_seen: new Date().toISOString() })
        .eq('id', data.user.id)
    }

    setLoading(false)
    recordLogin()
    navigate('/admin/config')
  }

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '10px 14px',
    color: '#fff', fontSize: '0.9rem',
    fontFamily: "'Montserrat', sans-serif",
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", padding: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600&display=swap" rel="stylesheet" />
      <form onSubmit={login} style={{ width: '100%', maxWidth: 360, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 16, padding: 'clamp(24px, 5vw, 40px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.4rem', letterSpacing: 12, background: 'linear-gradient(135deg, #FFD700, #C0C0C0)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>THE FLOOR</div>
          <div style={{ marginTop: 6, fontSize: '0.72rem', letterSpacing: 4, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>Panel administratora</div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: '0.82rem' }}>ERROR: {error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: '0.72rem', letterSpacing: 1, color: 'rgba(255,255,255,0.35)' }}>EMAIL</label>
          <input type="email" placeholder="admin@example.com" value={email} onChange={e => setEmail(e.target.value)} required style={inp} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: '0.72rem', letterSpacing: 1, color: 'rgba(255,255,255,0.35)' }}>HASLO</label>
          <input type="password" placeholder="" value={password} onChange={e => setPassword(e.target.value)} required style={inp} />
        </div>

        <button type="submit" disabled={loading} style={{ marginTop: 4, padding: '12px', background: loading ? 'rgba(212,175,55,0.3)' : 'linear-gradient(135deg, #D4AF37, #FFD700)', color: '#000', fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: 4, border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
          {loading ? 'LOGOWANIE...' : 'ZALOGUJ'}
        </button>

        <div style={{ textAlign: 'center', fontSize: '0.68rem', color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
          Konto admina jest rownoczesnie kontem gracza.<br/>Statystyki widoczne w rankingu.
        </div>
      </form>
    </div>
  )
}
