// src/pages/Leaderboard.tsx

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

interface LeaderboardEntry {
  id: string
  username: string
  avatar: string
  xp: number
  wins: number
  losses: number
  win_streak: number
  best_streak: number
  win_rate: number
  rank: number
}

const RANKS = [
  { min: 0,    max: 99,    icon: '🥉' },
  { min: 100,  max: 299,   icon: '⚔️'  },
  { min: 300,  max: 599,   icon: '🛡️'  },
  { min: 600,  max: 999,   icon: '🥈' },
  { min: 1000, max: 1999,  icon: '💎' },
  { min: 2000, max: 3999,  icon: '🥇' },
  { min: 4000, max: 9999,  icon: '👑' },
  { min: 10000,max: Infinity, icon: '🔱' },
]
function getRankIcon(xp: number) {
  return RANKS.find(r => xp >= r.min && xp <= r.max)?.icon ?? '🥉'
}

export default function Leaderboard() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()

  const [tab, setTab] = useState<'global' | 'weekly'>('global')
  const [data, setData] = useState<LeaderboardEntry[]>([])
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [tab])

  const load = async () => {
    setLoading(true)
    if (tab === 'global') {
      const { data: rows } = await supabase
        .from('leaderboard')
        .select('*')
        .limit(50)
      setData((rows ?? []) as LeaderboardEntry[])

      // Find own position
      if (profile) {
        const own = rows?.find(r => r.id === profile.id)
        if (own) {
          setMyEntry(own as LeaderboardEntry)
        } else {
          // Fetch own rank if not in top 50
          const { data: ownData } = await supabase
            .from('leaderboard')
            .select('*')
            .eq('id', profile.id)
            .single()
          setMyEntry(ownData as LeaderboardEntry ?? null)
        }
      }
    } else {
      // Weekly
      const { data: rows } = await supabase
        .from('leaderboard_weekly')
        .select('*')
        .limit(50)
      setData((rows ?? []) as any)
    }
    setLoading(false)
  }

  const medal = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return null
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        .lb-row { transition: background 0.15s; }
        .lb-row:hover { background: rgba(255,255,255,0.03) !important; }
        .lb-tab { cursor:pointer; transition:all 0.2s; padding:10px 20px; border:none; background:none; font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.78rem; letter-spacing:2px; text-transform:uppercase; }
        .lb-tab:hover { color:#D4AF37 !important; }
      `}</style>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0a0a0a', position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1rem' }}>←</button>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 5, color: '#D4AF37' }}>TABELA LIDERÓW</span>
        </div>
        {profile && (
          <button onClick={() => navigate('/dashboard')} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.78rem',
          }}>{profile.avatar} {profile.username}</button>
        )}
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: 'clamp(16px, 4vw, 32px)' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: 2 }}>Najlepsi gracze</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', marginTop: 4 }}>Wspinaj się po rankingu zdobywając XP</div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 20 }}>
          {([['global', '🌍 Globalnie'], ['weekly', '📅 Ten tydzień']] as const).map(([t, label]) => (
            <button
              key={t}
              className="lb-tab"
              onClick={() => setTab(t)}
              style={{ color: tab === t ? '#D4AF37' : 'rgba(255,255,255,0.35)', borderBottom: tab === t ? '2px solid #D4AF37' : '2px solid transparent', marginBottom: -1 }}
            >{label}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '60px 0' }}>⏳ Ładowanie...</div>
        ) : (
          <>
            {/* Top 3 podium */}
            {data.length >= 3 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 12, marginBottom: 28 }}>
                {/* 2nd */}
                <div style={{ textAlign: 'center', marginBottom: 0 }}>
                  <div style={{ fontSize: '2rem', marginBottom: 4 }}>{data[1]?.avatar}</div>
                  <div style={{ padding: '20px 16px 12px', background: 'rgba(192,192,192,0.1)', border: '1px solid rgba(192,192,192,0.3)', borderRadius: '12px 12px 4px 4px', minWidth: 90 }}>
                    <div style={{ fontSize: '1.8rem' }}>🥈</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: 4 }}>{data[1]?.username}</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{data[1]?.xp} XP</div>
                  </div>
                </div>
                {/* 1st */}
                <div style={{ textAlign: 'center', marginBottom: 0 }}>
                  <div style={{ fontSize: '2.4rem', marginBottom: 4 }}>{data[0]?.avatar}</div>
                  <div style={{ padding: '28px 20px 12px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: '12px 12px 4px 4px', minWidth: 110 }}>
                    <div style={{ fontSize: '2.2rem' }}>🥇</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, marginTop: 4, color: '#D4AF37' }}>{data[0]?.username}</div>
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>{data[0]?.xp} XP</div>
                  </div>
                </div>
                {/* 3rd */}
                <div style={{ textAlign: 'center', marginBottom: 0 }}>
                  <div style={{ fontSize: '2rem', marginBottom: 4 }}>{data[2]?.avatar}</div>
                  <div style={{ padding: '14px 16px 12px', background: 'rgba(205,127,50,0.1)', border: '1px solid rgba(205,127,50,0.3)', borderRadius: '12px 12px 4px 4px', minWidth: 90 }}>
                    <div style={{ fontSize: '1.8rem' }}>🥉</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, marginTop: 4 }}>{data[2]?.username}</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{data[2]?.xp} XP</div>
                  </div>
                </div>
              </div>
            )}

            {/* Full list */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 80px 60px 60px 70px', gap: 8, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                <span>#</span><span>Gracz</span><span style={{ textAlign: 'right' }}>XP</span><span style={{ textAlign: 'center' }}>W</span><span style={{ textAlign: 'center' }}>L</span><span style={{ textAlign: 'right' }}>Win%</span>
              </div>

              {data.map((entry, i) => {
                const isMe = entry.id === profile?.id
                const m = medal(i + 1)
                return (
                  <div
                    key={entry.id}
                    className="lb-row"
                    style={{
                      display: 'grid', gridTemplateColumns: '50px 1fr 80px 60px 60px 70px',
                      gap: 8, padding: '12px 16px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isMe ? 'rgba(212,175,55,0.06)' : 'transparent',
                      borderLeft: isMe ? '3px solid #D4AF37' : '3px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: m ? '#D4AF37' : 'rgba(255,255,255,0.3)' }}>
                      {m ?? (i + 1)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>{entry.avatar}</span>
                      <span style={{ fontWeight: isMe ? 700 : 400, color: isMe ? '#D4AF37' : '#fff' }}>
                        {entry.username}
                        {isMe && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#D4AF37' }}>(ty)</span>}
                      </span>
                      <span style={{ fontSize: '0.9rem' }}>{getRankIcon(entry.xp)}</span>
                    </span>
                    <span style={{ textAlign: 'right', fontWeight: 700, color: '#D4AF37' }}>{entry.xp}</span>
                    <span style={{ textAlign: 'center', color: '#4ade80' }}>{entry.wins}</span>
                    <span style={{ textAlign: 'center', color: '#f87171' }}>{entry.losses}</span>
                    <span style={{ textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>{entry.win_rate}%</span>
                  </div>
                )
              })}
            </div>

            {/* My entry if not in top 50 */}
            {myEntry && !data.find(d => d.id === profile?.id) && (
              <div style={{
                marginTop: 8, display: 'grid', gridTemplateColumns: '50px 1fr 80px 60px 60px 70px',
                gap: 8, padding: '12px 16px',
                background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)',
                borderRadius: 10, borderLeft: '3px solid #D4AF37',
              }}>
                <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>{myEntry.rank}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{myEntry.avatar}</span>
                  <span style={{ fontWeight: 700, color: '#D4AF37' }}>{myEntry.username} (ty)</span>
                </span>
                <span style={{ textAlign: 'right', fontWeight: 700, color: '#D4AF37' }}>{myEntry.xp}</span>
                <span style={{ textAlign: 'center', color: '#4ade80' }}>{myEntry.wins}</span>
                <span style={{ textAlign: 'center', color: '#f87171' }}>{myEntry.losses}</span>
                <span style={{ textAlign: 'right' }}>{myEntry.win_rate}%</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
