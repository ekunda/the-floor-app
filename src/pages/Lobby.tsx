// src/pages/Lobby.tsx — naprawiony
// Kluczowe zmiany:
//   - joinRoom sprawdza RLS errors i wyświetla czytelny błąd
//   - Nawigacja do /room/:code tylko po UDANYM update
//   - createPrivateRoom obsługuje błąd bez crash

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Lobby() {
  const navigate    = useNavigate()
  const { profile } = useAuthStore()

  const [joinCode, setJoinCode]   = useState('')
  const [creating, setCreating]   = useState(false)
  const [joining, setJoining]     = useState(false)
  const [error, setError]         = useState('')
  const [onlineCount, setOnlineCount] = useState<number | null>(null)

  useEffect(() => {
    if (!profile) { navigate('/login'); return }
    fetchOnlineCount()
  }, [profile])

  const fetchOnlineCount = async () => {
    const { count } = await supabase
      .from('matchmaking_queue')
      .select('*', { count: 'exact', head: true })
    setOnlineCount(count ?? 0)
  }

  // ── Utwórz prywatny pokój ────────────────────────────────────
  const createPrivateRoom = async () => {
    if (!profile) return
    setCreating(true)
    setError('')

    try {
      // Wygeneruj unikalny kod
      let code = generateCode()
      for (let i = 0; i < 10; i++) {
        const { data: existing } = await supabase
          .from('game_rooms').select('id').eq('code', code).maybeSingle()
        if (!existing) break
        code = generateCode()
      }

      const { data, error: err } = await supabase
        .from('game_rooms')
        .insert({
          host_id: profile.id,
          code,
          status: 'waiting',
          config: { rounds: 5, duel_time: 45, board_shape: 0 },
        })
        .select('id, code')
        .single()

      if (err) {
        setError('Nie udało się stworzyć pokoju: ' + err.message)
        return
      }

      navigate(`/room/${data.code}`)
    } catch (e: any) {
      setError('Błąd: ' + e.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Dołącz do pokoju kodem ───────────────────────────────────
  const joinRoom = async () => {
    if (!profile || !joinCode.trim()) return
    setJoining(true)
    setError('')

    const code = joinCode.trim().toUpperCase()

    // Pobierz pokój
    const { data: room, error: fetchErr } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (fetchErr || !room) {
      setError('Pokój o tym kodzie nie istnieje.')
      setJoining(false)
      return
    }

    if (room.status !== 'waiting') {
      setError('Gra w tym pokoju już się rozpoczęła.')
      setJoining(false)
      return
    }

    if (room.host_id === profile.id) {
      // Ty jesteś hostem — wejdź do pokoju bez dołączania
      navigate(`/room/${code}`)
      return
    }

    if (room.guest_id && room.guest_id !== profile.id) {
      setError('Pokój jest już pełny.')
      setJoining(false)
      return
    }

    if (room.guest_id === profile.id) {
      // Już dołączyłeś wcześniej
      navigate(`/room/${code}`)
      return
    }

    // Dołącz jako gość — UPDATE z guest_id
    const { error: updateErr } = await supabase
      .from('game_rooms')
      .update({ guest_id: profile.id })
      .eq('id', room.id)
      .eq('status', 'waiting')  // dodatkowe zabezpieczenie

    if (updateErr) {
      setError('Nie udało się dołączyć do pokoju. Sprawdź czy pokój jest nadal otwarty.')
      setJoining(false)
      return
    }

    navigate(`/room/${code}`)
    setJoining(false)
  }

  if (!profile) return null

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        input:focus { border-color: rgba(212,175,55,0.6) !important; outline: none; }
        .btn { cursor: pointer; transition: all 0.2s; }
        .btn:hover:not(:disabled) { transform: translateY(-2px); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        @keyframes glow { 0%,100%{box-shadow:0 0 10px rgba(74,222,128,0.2)} 50%{box-shadow:0 0 22px rgba(74,222,128,0.5)} }
        .glow-btn { animation: glow 2s ease-in-out infinite; }
      `}</style>

      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0a0a0a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1.1rem' }}>←</button>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 5, color: '#D4AF37' }}>MULTIPLAYER</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onlineCount !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
              {onlineCount} w kolejce
            </div>
          )}
          <div style={{ fontSize: '0.83rem' }}>{profile.avatar} <strong>{profile.username}</strong></div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 460 }}>

          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>⚔️</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.8rem', letterSpacing: 8, color: '#D4AF37' }}>GRA ONLINE</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', marginTop: 4 }}>Zagraj z innymi graczami 1 vs 1</div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: '0.83rem', marginBottom: 20, textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Matchmaking — główna opcja */}
          <div style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', letterSpacing: 2, color: 'rgba(74,222,128,0.7)', marginBottom: 10 }}>⚡ SZYBKA GRA — ZALECANE</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', marginBottom: 16, lineHeight: 1.7 }}>
              System automatycznie dobierze Ci przeciwnika.
            </div>
            <button className="btn glow-btn" onClick={() => navigate('/matchmaking')}
              style={{ width: '100%', padding: '15px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #4ade80, #16a34a)', color: '#000', fontWeight: 800, fontSize: '0.95rem', letterSpacing: 2, fontFamily: "'Montserrat', sans-serif" }}>
              🔍 SZUKAJ PRZECIWNIKA
            </button>
          </div>

          {/* Separator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', letterSpacing: 2 }}>LUB</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Prywatny pokój */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: '0.68rem', letterSpacing: 1.5, color: 'rgba(212,175,55,0.6)', marginBottom: 10 }}>PRYWATNY POKÓJ</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', marginBottom: 14, lineHeight: 1.6 }}>
                Zagraj ze znajomym przez kod.
              </div>
              <button className="btn" onClick={createPrivateRoom} disabled={creating}
                style={{ width: '100%', padding: '11px 0', borderRadius: 9, border: 'none', background: 'rgba(212,175,55,0.15)', color: '#D4AF37', fontWeight: 700, fontSize: '0.78rem', letterSpacing: 1, fontFamily: "'Montserrat', sans-serif" }}>
                {creating ? '⏳ Tworzę...' : '🏠 Utwórz pokój'}
              </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: '0.68rem', letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>DOŁĄCZ KODEM</div>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && joinRoom()}
                placeholder="XXXXXX"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', fontSize: '1rem', fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 8, textAlign: 'center', color: '#fff' }}
              />
              <button className="btn" onClick={joinRoom} disabled={joining || joinCode.length < 6}
                style={{ width: '100%', padding: '11px 0', borderRadius: 9, border: 'none', background: joinCode.length < 6 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.1)', color: joinCode.length < 6 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: '0.78rem', fontFamily: "'Montserrat', sans-serif" }}>
                {joining ? '⏳ Dołączam...' : '🔗 Dołącz'}
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button onClick={() => navigate('/leaderboard')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: "'Montserrat', sans-serif" }}>
              🏆 Tabela Liderów
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
