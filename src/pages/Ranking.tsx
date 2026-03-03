import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

interface Player { id: string; username: string; avatar: string; avatar_url?: string; xp: number; wins: number; losses: number; win_streak: number; best_streak: number; status: string }
type SortKey = 'xp' | 'wins' | 'win_streak'

export default function Ranking() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [players, setPlayers] = useState<Player[]>([])
  const [search,  setSearch]  = useState('')
  const [sort,    setSort]    = useState<SortKey>('xp')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [sort])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles').select('id,username,avatar,avatar_url,xp,wins,losses,win_streak,best_streak,status')
      .order(sort, { ascending: false }).limit(100)
    setPlayers((data ?? []) as Player[])
    setLoading(false)
  }

  const filtered = players.filter(p => !search || p.username.toLowerCase().includes(search.toLowerCase()))
  const winRate  = (p: Player) => p.wins + p.losses > 0 ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0
  const medal    = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`

  return (
    <div style={{ minHeight: '100vh', background: '#080808', fontFamily: "'Montserrat',sans-serif", color: '#fff', padding: '24px 20px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '2.4rem', letterSpacing: 8, color: '#D4AF37' }}>RANKING</div>
            <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)' }}>TOP GRACZE ONLINE</div>
          </div>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: 2 }}>
            WRÓĆ
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontFamily: "'Montserrat',sans-serif", fontSize: '0.85rem', padding: '9px 14px', outline: 'none', minWidth: 180 }}
            value={search} placeholder="Szukaj gracza..." onChange={e => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            {([['xp','XP'],['wins','WYGRANE'],['win_streak','SERIA']] as [SortKey,string][]).map(([k,l]) => (
              <button key={k} onClick={() => setSort(k)} style={{ padding: '8px 14px', borderRadius: 8, background: sort===k ? 'rgba(212,175,55,0.15)' : 'transparent', border: `1px solid ${sort===k ? '#D4AF37' : 'rgba(255,255,255,0.1)'}`, color: sort===k ? '#D4AF37' : 'rgba(255,255,255,0.4)', fontFamily: "'Bebas Neue',sans-serif", fontSize: '0.8rem', letterSpacing: 2, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, padding: '8px 16px', fontSize: '0.65rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>
          <span style={{ width: 32, flexShrink: 0 }}>#</span>
          <span style={{ flex: 1 }}>GRACZ</span>
          <span style={{ width: 55, textAlign: 'right' }}>XP</span>
          <span style={{ width: 55, textAlign: 'right' }}>W/L</span>
          <span style={{ width: 55, textAlign: 'right' }}>WIN%</span>
          <span style={{ width: 50, textAlign: 'right' }}>SERIA</span>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>Ladowanie...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>Brak wynikow</div>
          ) : filtered.map((p, i) => {
            const isMe = p.id === user?.id
            const rank = players.indexOf(p)
            return (
              <div key={p.id} onClick={() => isMe && navigate('/profile')}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: isMe ? 'rgba(212,175,55,0.06)' : i%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: isMe ? 'pointer' : 'default', transition: 'background 0.15s' }}>
                <div style={{ width: 32, flexShrink: 0, fontFamily: "'Bebas Neue',sans-serif", fontSize: rank < 3 ? '1.2rem' : '0.9rem', color: rank < 3 ? undefined : 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  {medal(rank)}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0, overflow: 'hidden' }}>
                    {p.avatar_url ? <img src={p.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : p.avatar || '🎮'}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '0.95rem', letterSpacing: 2, color: isMe ? '#D4AF37' : '#fff' }}>
                      {p.username}{isMe ? ' (TY)' : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.status==='online' ? '#4ade80' : p.status==='in_game' ? '#facc15' : 'rgba(255,255,255,0.2)' }} />
                      <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>{p.status==='online' ? 'online' : p.status==='in_game' ? 'w grze' : 'offline'}</span>
                    </div>
                  </div>
                </div>
                <div style={{ width: 55, textAlign: 'right', fontFamily: "'Bebas Neue',sans-serif", fontSize: '0.95rem', color: '#D4AF37' }}>{p.xp}</div>
                <div style={{ width: 55, textAlign: 'right', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>{p.wins}/{p.losses}</div>
                <div style={{ width: 55, textAlign: 'right', fontSize: '0.8rem', color: winRate(p) >= 60 ? '#4ade80' : winRate(p) >= 40 ? '#facc15' : '#f87171' }}>{winRate(p)}%</div>
                <div style={{ width: 50, textAlign: 'right', fontFamily: "'Bebas Neue',sans-serif", fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>x{p.win_streak}</div>
              </div>
            )
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: '0.72rem', color: 'rgba(255,255,255,0.2)' }}>
          {filtered.length} graczy
        </div>
      </div>
    </div>
  )
}
