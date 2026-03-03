// src/pages/Lobby.tsx — ZAKTUALIZOWANE (Matchmaking jako główna opcja)

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Lobby() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
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

  const createPrivateRoom = async () => {
    if (!profile) return
    setCreating(true); setError('')
    try {
      let code = generateCode()
      let attempts = 0
      while (attempts < 10) {
        const { data: existing } = await supabase.from('game_rooms').select('id').eq('code', code).single()
        if (!existing) break
        code = generateCode()
        attempts++
      }
      const { data, error: err } = await supabase
        .from('game_rooms')
        .insert({ host_id: profile.id, code, status: 'waiting' })
        .select()
        .single()
      if (err) throw new Error(err.message)
      navigate(`/room/${data.code}`)
    } catch (e: any) { setError(e.message) }
    setCreating(false)
  }

  const joinRoom = async () => {
    if (!profile || !joinCode.trim()) return
    setJoining(true); setError('')
    try {
      const code = joinCode.trim().toUpperCase()
      const { data: room, error: err } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('code', code)
        .eq('status', 'waiting')
        .single()
      if (err || !room) throw new Error('Pokój nie istnieje lub gra już się rozpoczęła.')
      if (room.host_id === profile.id) throw new Error('Nie możesz dołączyć do własnego pokoju.')
      if (room.guest_id) throw new Error('Pokój jest już pełny.')
      await supabase.from('game_rooms').update({ guest_id: profile.id }).eq('id', room.id)
      navigate(`/room/${code}`)
    } catch (e: any) { setError(e.message) }
    setJoining(false)
  }

  if (!profile) return null

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        input:focus { border-color: rgba(212,175,55,0.6) !important; }
        .btn { cursor:pointer; transition:all 0.2s; }
        .btn:hover:not(:disabled) { transform:translateY(-2px); }
        .btn:disabled { opacity:0.4; cursor:not-allowed; }
        @keyframes glow { 0%,100%{box-shadow:0 0 10px rgba(74,222,128,0.2)} 50%{box-shadow:0 0 20px rgba(74,222,128,0.5)} }
        .glow-btn { animation: glow 2s ease-in-out infinite; }
      `}</style>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0a0a0a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1rem' }}>←</button>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 5, color: '#D4AF37' }}>MULTIPLAYER</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: '0.83rem', marginBottom: 20, textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}

          {/* MATCHMAKING — główna opcja */}
          <div style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(74,222,128,0.7)', marginBottom: 10 }}>⚡ SZYBKA GRA — ZALECANE</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', marginBottom: 16, lineHeight: 1.7 }}>
              System automatycznie dobierze Ci przeciwnika.<br />
              Pełna gra planszowa — oba graczy na tej samej planszy.
            </div>
            <button className="btn glow-btn" onClick={() => navigate('/matchmaking')} style={{
              width: '100%', padding: '15px', borderRadius: 11, border: 'none',
              background: 'linear-gradient(135deg, #4ade80, #16a34a)',
              color: '#000', fontWeight: 800, fontSize: '0.95rem', letterSpacing: 2,
            }}>🔍 SZUKAJ PRZECIWNIKA</button>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', letterSpacing: 2 }}>LUB</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Private room */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: '0.7rem', letterSpacing: 1.5, color: 'rgba(212,175,55,0.6)', marginBottom: 10 }}>PRYWATNY POKÓJ</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: 14, lineHeight: 1.6 }}>Graj ze znajomym kodem.</div>
              <button className="btn" onClick={createPrivateRoom} disabled={creating} style={{
                width: '100%', padding: '11px 0', borderRadius: 9, border: 'none',
                background: 'rgba(212,175,55,0.15)', color: '#D4AF37',
                fontWeight: 700, fontSize: '0.78rem', letterSpacing: 1,
              }}>{creating ? '...' : '🏠 Utwórz'}</button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: '0.7rem', letterSpacing: 1.5, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>DOŁĄCZ KODEM</div>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && joinRoom()}
                placeholder="XXXXXX"
                style={{
                  width: '100%', boxSizing: 'border-box', marginBottom: 10,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '9px 12px',
                  color: '#fff', fontSize: '0.95rem', fontWeight: 700,
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 6,
                  textAlign: 'center', outline: 'none', textTransform: 'uppercase',
                }}
              />
              <button className="btn" onClick={joinRoom} disabled={joining || joinCode.length < 6} style={{
                width: '100%', padding: '11px 0', borderRadius: 9, border: 'none',
                background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
                fontWeight: 700, fontSize: '0.78rem',
                cursor: joinCode.length < 6 ? 'not-allowed' : 'pointer',
              }}>{joining ? '...' : '🔗 Dołącz'}</button>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button onClick={() => navigate('/leaderboard')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: '0.75rem' }}>
              🏆 Tabela Liderów
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
