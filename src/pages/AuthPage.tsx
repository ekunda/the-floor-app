import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

type Tab = 'login' | 'register'

export default function AuthPage() {
  const navigate = useNavigate()
  const { login, register, loading, error, clearError } = useAuthStore()

  const [tab, setTab]           = useState<Tab>('login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [busy, setBusy]         = useState(false)
  const [success, setSuccess]   = useState('')

  const handleLogin = async () => {
    if (!email || !password) return
    setBusy(true); clearError()
    const ok = await login(email, password)
    setBusy(false)
    if (ok) navigate('/multiplayer')
  }

  const handleRegister = async () => {
    if (!email || !password || !username) return
    if (password !== confirm) { return }
    if (password.length < 6) return
    setBusy(true); clearError()
    const ok = await register(email, password, username)
    setBusy(false)
    if (ok) {
      setSuccess('Konto utworzone! Sprawdź email aby potwierdzić rejestrację.')
      setTimeout(() => navigate('/multiplayer'), 2000)
    }
  }

  const S = {
    page: { minHeight:'100vh', background:'#080808', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Montserrat',sans-serif", padding:'20px', position:'relative' } as React.CSSProperties,
    grid: { position:'fixed', inset:0, pointerEvents:'none', backgroundImage:'linear-gradient(rgba(255,215,0,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,215,0,0.03) 1px,transparent 1px)', backgroundSize:'40px 40px' } as React.CSSProperties,
    card: { position:'relative', zIndex:1, width:'100%', maxWidth:420, background:'linear-gradient(160deg,#111,#0a0a0a)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:16, padding:'40px 36px', boxShadow:'0 0 60px rgba(212,175,55,0.1)' } as React.CSSProperties,
    logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:'2.2rem', letterSpacing:8, color:'#D4AF37', textAlign:'center', marginBottom:4 } as React.CSSProperties,
    sub: { textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:'0.75rem', letterSpacing:3, marginBottom:28 } as React.CSSProperties,
    tabs: { display:'flex', marginBottom:24, borderRadius:8, overflow:'hidden', border:'1px solid rgba(255,255,255,0.08)' } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({ flex:1, padding:'10px 0', fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.95rem', letterSpacing:3, background:active?'rgba(212,175,55,0.15)':'transparent', color:active?'#D4AF37':'rgba(255,255,255,0.3)', border:'none', cursor:'pointer', transition:'all 0.2s' }),
    lbl: { display:'block', color:'rgba(255,255,255,0.35)', fontSize:'0.68rem', letterSpacing:2, marginBottom:5 } as React.CSSProperties,
    inp: { width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#fff', fontFamily:"'Montserrat',sans-serif", fontSize:'0.9rem', padding:'10px 14px', outline:'none', boxSizing:'border-box', marginBottom:14, transition:'border-color 0.2s' } as React.CSSProperties,
    btn: (active: boolean): React.CSSProperties => ({ width:'100%', padding:'14px', borderRadius:10, background:active?'rgba(212,175,55,0.2)':'rgba(255,255,255,0.03)', border:`1px solid ${active?'#D4AF37':'rgba(255,255,255,0.08)'}`, color:active?'#D4AF37':'rgba(255,255,255,0.2)', fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.1rem', letterSpacing:4, cursor:active?'pointer':'not-allowed', transition:'all 0.2s' }),
    err: { padding:'10px 14px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, color:'#f87171', fontSize:'0.8rem', marginBottom:14 } as React.CSSProperties,
    ok: { padding:'10px 14px', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:8, color:'#4ade80', fontSize:'0.8rem', marginBottom:14 } as React.CSSProperties,
  }

  return (
    <div style={S.page}>
      <div style={S.grid} />
      <div style={S.card}>
        <div style={S.logo}>THE FLOOR</div>
        <div style={S.sub}>🌐 TRYB ONLINE</div>

        {/* Tabs */}
        <div style={S.tabs}>
          <button style={S.tab(tab==='login')}    onClick={() => { setTab('login');    clearError(); setSuccess('') }}>ZALOGUJ</button>
          <button style={S.tab(tab==='register')} onClick={() => { setTab('register'); clearError(); setSuccess('') }}>REJESTRACJA</button>
        </div>

        {error  && <div style={S.err}>⚠️ {error}</div>}
        {success && <div style={S.ok}>✅ {success}</div>}

        {tab === 'login' ? (
          <div>
            <label style={S.lbl}>EMAIL</label>
            <input style={S.inp} type="email" value={email} placeholder="twoj@email.com" autoFocus
              onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==='Enter' && handleLogin()} />
            <label style={S.lbl}>HASŁO</label>
            <input style={S.inp} type="password" value={password} placeholder="••••••••"
              onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key==='Enter' && handleLogin()} />
            <button onClick={handleLogin} disabled={busy || !email || !password} style={S.btn(!busy && !!email && !!password)}>
              {busy ? 'LOGOWANIE…' : 'ZALOGUJ SIĘ'}
            </button>
          </div>
        ) : (
          <div>
            <label style={S.lbl}>NICK (wyświetlany w grze)</label>
            <input style={{ ...S.inp, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3, fontSize:'1.1rem' }}
              value={username} maxLength={20} placeholder="TWÓJ NICK"
              onChange={e => setUsername(e.target.value.toUpperCase())}
              onKeyDown={e => e.key==='Enter' && handleRegister()} autoFocus />
            <label style={S.lbl}>EMAIL</label>
            <input style={S.inp} type="email" value={email} placeholder="twoj@email.com"
              onChange={e => setEmail(e.target.value)} />
            <label style={S.lbl}>HASŁO (min. 6 znaków)</label>
            <input style={S.inp} type="password" value={password} placeholder="••••••••"
              onChange={e => setPassword(e.target.value)} />
            <label style={S.lbl}>POTWIERDŹ HASŁO</label>
            <input style={{ ...S.inp, borderColor: confirm && confirm !== password ? 'rgba(239,68,68,0.5)' : undefined }}
              type="password" value={confirm} placeholder="••••••••"
              onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key==='Enter' && handleRegister()} />
            {confirm && confirm !== password && <div style={{ color:'#f87171', fontSize:'0.75rem', marginTop:-10, marginBottom:12 }}>Hasła nie są identyczne</div>}
            <button onClick={handleRegister} disabled={busy || !email || !password || !username || password !== confirm || password.length < 6}
              style={S.btn(!busy && !!email && !!password && !!username && password === confirm && password.length >= 6)}>
              {busy ? 'TWORZENIE KONTA…' : 'ZAREJESTRUJ SIĘ'}
            </button>
          </div>
        )}

        <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:24, paddingTop:18, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={() => navigate('/')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.75rem', letterSpacing:2, fontFamily:"'Montserrat',sans-serif" }}>
            ← POWRÓT
          </button>
          <button onClick={() => navigate('/multiplayer')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.25)', cursor:'pointer', fontSize:'0.72rem', letterSpacing:1, fontFamily:"'Montserrat',sans-serif" }}>
            Graj anonimowo →
          </button>
        </div>
      </div>
    </div>
  )
}
