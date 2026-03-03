// src/pages/Auth.tsx

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

const AVATARS = ['🎮','🦁','🐯','🦊','🐺','🦝','🐻','🐼','🐧','🦄','🦋','🐉','⚡','🔥','💎','🌟','🏆','👑']

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState<'login' | 'register'>(
    location.pathname === '/register' ? 'register' : 'login'
  )

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPass, setLoginPass] = useState('')

  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPass2, setRegPass2] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regAvatar, setRegAvatar] = useState('🎮')

  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const { login, register, loading, profile, initialized } = useAuthStore()

  // Przekieruj jeśli już zalogowany
  useEffect(() => {
    if (initialized && profile) navigate('/dashboard', { replace: true })
  }, [initialized, profile])

  // ── Login ─────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!loginEmail.trim() || !loginPass) {
      setError('Wypełnij wszystkie pola.')
      return
    }

    const err = await login(loginEmail, loginPass)
    if (err) {
      setError(err)
    }
    // Jeśli sukces — useEffect powyżej obsłuży przekierowanie gdy profile się załaduje
  }

  // ── Register ──────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (regUsername.length < 3) return setError('Nazwa gracza musi mieć co najmniej 3 znaki.')
    if (!/^[a-zA-Z0-9_]+$/.test(regUsername)) return setError('Dozwolone znaki: litery, cyfry i _')
    if (regPass.length < 6) return setError('Hasło musi mieć co najmniej 6 znaków.')
    if (regPass !== regPass2) return setError('Hasła nie są takie same.')

    const result = await register(regEmail, regPass, regUsername, regAvatar)

    if (result.error) {
      setError(result.error)
      return
    }

    if (result.needsConfirmation) {
      // Email confirmation jest wymagany w Supabase — pokaż instrukcję
      setInfo('✅ Konto utworzone! Sprawdź skrzynkę email i potwierdź rejestrację, a następnie wróć i zaloguj się.')
      setTab('login')
      setLoginEmail(regEmail)
      return
    }

    // Rejestracja bez potwierdzenia email — useEffect obsłuży redirect gdy profile się załaduje
    setInfo('✅ Konto utworzone! Przekierowanie...')
  }

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '11px 14px',
    color: '#fff', fontSize: '0.9rem',
    fontFamily: "'Montserrat', sans-serif",
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Montserrat', sans-serif", padding: 16,
    }}>
      <style>{`
        input:focus { border-color: rgba(212,175,55,0.6) !important; }
        .auth-tab { cursor: pointer; transition: all 0.2s; }
        .auth-tab:hover { color: #D4AF37 !important; }
        .avatar-btn { cursor: pointer; border: 2px solid transparent; border-radius: 8px; padding: 4px; font-size: 1.5rem; transition: all 0.15s; background: none; }
        .avatar-btn:hover { border-color: rgba(212,175,55,0.4); transform: scale(1.1); }
        .avatar-btn.selected { border-color: #D4AF37; background: rgba(212,175,55,0.12); }
        .auth-submit { cursor: pointer; transition: all 0.2s; }
        .auth-submit:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .auth-submit:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(212,175,55,0.2)',
        borderRadius: 18, padding: 'clamp(24px, 5vw, 40px)',
      }}>
        {/* Logo + powrót */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', letterSpacing: 10,
            background: 'linear-gradient(135deg, #FFD700, #C0C0C0)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>THE REFLEKTOR</div>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ marginTop: 6, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.72rem', letterSpacing: 2 }}
          >← powrót do menu</button>
        </div>

        {/* Zakładki */}
        <div style={{ display: 'flex', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {(['login', 'register'] as const).map(t => (
            <button key={t} type="button" className="auth-tab"
              onClick={() => { setTab(t); setError(''); setInfo('') }}
              style={{
                flex: 1, padding: '10px 0', background: 'none', border: 'none',
                color: tab === t ? '#D4AF37' : 'rgba(255,255,255,0.35)',
                fontFamily: "'Montserrat', sans-serif", fontSize: '0.8rem',
                fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
                borderBottom: tab === t ? '2px solid #D4AF37' : '2px solid transparent',
                marginBottom: -1, cursor: 'pointer',
              }}
            >
              {t === 'login' ? '🔑 Logowanie' : '✨ Rejestracja'}
            </button>
          ))}
        </div>

        {/* Komunikaty */}
        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: '0.83rem', marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}
        {info && (
          <div style={{ padding: '10px 14px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, color: '#4ade80', fontSize: '0.83rem', marginBottom: 16, lineHeight: 1.6 }}>
            {info}
          </div>
        )}

        {/* ── FORMULARZ LOGOWANIA ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 7, textTransform: 'uppercase' }}>Email</label>
              <input style={inp} type="email" value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                placeholder="gracz@email.com" required autoComplete="email" />
            </div>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 7, textTransform: 'uppercase' }}>Hasło</label>
              <input style={inp} type="password" value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                placeholder="••••••••" required autoComplete="current-password" />
            </div>

            <button type="submit" className="auth-submit" disabled={loading} style={{
              padding: '13px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #D4AF37, #A0832A)',
              color: '#000', fontWeight: 800, fontSize: '0.9rem',
              fontFamily: "'Montserrat', sans-serif", letterSpacing: 2, marginTop: 6,
            }}>
              {loading ? '⏳ Logowanie...' : '🚀 ZALOGUJ SIĘ'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <button type="button" onClick={() => { setTab('register'); setError(''); setInfo('') }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '0.78rem' }}>
                Nie masz konta? <span style={{ color: '#D4AF37' }}>Zarejestruj się</span>
              </button>
            </div>
          </form>
        )}

        {/* ── FORMULARZ REJESTRACJI ── */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 7, textTransform: 'uppercase' }}>Nazwa gracza</label>
              <input style={inp} type="text" value={regUsername}
                onChange={e => setRegUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
                placeholder="np. CobraKing_99" required minLength={3} maxLength={20} />
              <div style={{ marginTop: 4, fontSize: '0.71rem', color: 'rgba(255,255,255,0.25)' }}>
                3–20 znaków, litery/cyfry/podkreślnik
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 7, textTransform: 'uppercase' }}>Avatar</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {AVATARS.map(a => (
                  <button key={a} type="button"
                    className={`avatar-btn${regAvatar === a ? ' selected' : ''}`}
                    onClick={() => setRegAvatar(a)}
                  >{a}</button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 7, textTransform: 'uppercase' }}>Email</label>
              <input style={inp} type="email" value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                placeholder="gracz@email.com" required autoComplete="email" />
            </div>

            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 7, textTransform: 'uppercase' }}>Hasło</label>
              <input style={inp} type="password" value={regPass}
                onChange={e => setRegPass(e.target.value)}
                placeholder="min. 6 znaków" required minLength={6} autoComplete="new-password" />
            </div>

            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 7, textTransform: 'uppercase' }}>Powtórz hasło</label>
              <input style={inp} type="password" value={regPass2}
                onChange={e => setRegPass2(e.target.value)}
                placeholder="••••••••" required autoComplete="new-password" />
            </div>

            <button type="submit" className="auth-submit" disabled={loading} style={{
              padding: '13px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #D4AF37, #A0832A)',
              color: '#000', fontWeight: 800, fontSize: '0.9rem',
              fontFamily: "'Montserrat', sans-serif", letterSpacing: 2, marginTop: 6,
            }}>
              {loading ? '⏳ Tworzenie konta...' : '✨ UTWÓRZ KONTO'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <button type="button" onClick={() => { setTab('login'); setError(''); setInfo('') }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '0.78rem' }}>
                Masz już konto? <span style={{ color: '#D4AF37' }}>Zaloguj się</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
