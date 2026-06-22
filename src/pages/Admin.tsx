// ─────────────────────────────────────────────────────────────────────────────
// Admin — login do panelu administracyjnego
//
// Fast & reliable:
//  - useAsyncAction dla login — guard double-submit
//  - Toast notifications zamiast inline error
//  - AdminUI components (AdminButton, AdminInput)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { clearSession, recordLogin, supabase } from '../lib/supabase'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useToast } from '../hooks/useToast'
import { AdminButton, AdminInput, T, ToastContainer } from '../components/admin/AdminUI'

export default function Admin() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const toast = useToast()

  useEffect(() => { SoundEngine.stopBg(0) }, [])

  const { run: login, loading } = useAsyncAction(async () => {
    clearSession()
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    if (authErr || !data.user) {
      throw new Error(authErr?.message ?? 'Błąd logowania')
    }

    // Ensure admin has a player profile
    const rawNick = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 20) || 'ADMIN'
    const { data: existing } = await supabase
      .from('profiles').select('id, username').eq('id', data.user.id).maybeSingle()

    if (!existing) {
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
      await supabase.from('profiles')
        .update({ status: 'online', last_seen: new Date().toISOString() })
        .eq('id', data.user.id)
    }

    // Weryfikacja uprawnień: konto musi mieć profiles.is_admin = true.
    // Bez tego ProtectedRoute i tak odbije z /admin/config → pętla przekierowań.
    const { data: prof } = await supabase
      .from('profiles').select('is_admin').eq('id', data.user.id).maybeSingle()
    if (!prof?.is_admin) {
      await supabase.auth.signOut()
      throw new Error('To konto nie ma uprawnień administratora.')
    }

    recordLogin()
    navigate('/admin/config')
  }, { onError: e => toast.error(e.message) })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login()
  }

  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Montserrat', sans-serif", padding: 16,
    }}>
      <ToastContainer />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600&display=swap" rel="stylesheet" />

      <form onSubmit={handleSubmit} style={{
        width: '100%', maxWidth: 360,
        background: T.surface, border: `1px solid ${T.gold}40`,
        borderRadius: 16, padding: 'clamp(24px, 5vw, 40px)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.4rem', letterSpacing: 12,
            background: 'linear-gradient(135deg, #FFD700, #C0C0C0)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>THE FLOOR</div>
          <div style={{
            marginTop: 6, fontSize: '0.72rem', letterSpacing: 4,
            color: T.textDim2, textTransform: 'uppercase',
          }}>Panel administratora</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: '0.72rem', letterSpacing: 1, color: T.textDim2 }}>EMAIL</label>
          <AdminInput
            type="email" placeholder="admin@example.com"
            value={email} onChange={e => setEmail(e.target.value)}
            required size="lg"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: '0.72rem', letterSpacing: 1, color: T.textDim2 }}>HASŁO</label>
          <AdminInput
            type="password"
            value={password} onChange={e => setPassword(e.target.value)}
            required size="lg"
          />
        </div>

        <AdminButton
          type="submit" onClick={() => undefined}
          loading={loading} disabled={!email || !password}
          variant="primary" size="lg" fullWidth
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '1.1rem', letterSpacing: 4,
          }}
        >{loading ? 'LOGOWANIE…' : 'ZALOGUJ'}</AdminButton>

        <div style={{
          textAlign: 'center', fontSize: '0.68rem',
          color: T.textDim3, lineHeight: 1.6,
        }}>
          Konto admina jest równocześnie kontem gracza.<br />
          Statystyki widoczne w rankingu.
        </div>
      </form>
    </div>
  )
}
