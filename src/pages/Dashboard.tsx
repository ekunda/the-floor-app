// src/pages/Dashboard.tsx
// Panel użytkownika — statystyki, historia gier, rangi

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore, type Profile } from '../store/useAuthStore'

// ── Rank system ─────────────────────────────────────────────
const RANKS = [
  { min: 0,    max: 99,   name: 'Nowicjusz',  icon: '🥉', color: '#CD7F32' },
  { min: 100,  max: 299,  name: 'Challenger', icon: '⚔️',  color: '#9CA3AF' },
  { min: 300,  max: 599,  name: 'Weteran',    icon: '🛡️',  color: '#6B7280' },
  { min: 600,  max: 999,  name: 'Expert',     icon: '🥈', color: '#C0C0C0' },
  { min: 1000, max: 1999, name: 'Elite',      icon: '💎', color: '#60A5FA' },
  { min: 2000, max: 3999, name: 'Mistrz',     icon: '🥇', color: '#D4AF37' },
  { min: 4000, max: 9999, name: 'Grandmaster',icon: '👑', color: '#F59E0B' },
  { min: 10000,max: Infinity, name: 'Legenda',icon: '🔱', color: '#EF4444' },
]

function getRank(xp: number) {
  return RANKS.find(r => xp >= r.min && xp <= r.max) ?? RANKS[0]
}

function getNextRank(xp: number) {
  const idx = RANKS.findIndex(r => xp >= r.min && xp <= r.max)
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null
}

// ── Types ────────────────────────────────────────────────────
interface GameHistoryItem {
  id: string
  winner_id: string | null
  loser_id: string | null
  winner_score: number
  loser_score: number
  rounds_total: number
  duration_sec: number
  is_draw: boolean
  played_at: string
  opponent?: { username: string; avatar: string } | null
}

const AVATARS = ['🎮','🦁','🐯','🦊','🐺','🦝','🐻','🐼','🐧','🦄','🦋','🐉','⚡','🔥','💎','🌟','🏆','👑']

export default function Dashboard() {
  const navigate = useNavigate()
  const { profile, logout, updateProfile, refreshProfile } = useAuthStore()

  const [tab, setTab] = useState<'stats' | 'history' | 'profile'>('stats')
  const [history, setHistory] = useState<GameHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Profile edit
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState('')
  const [editError, setEditError] = useState('')
  const [editSaved, setEditSaved] = useState(false)

  useEffect(() => {
    if (!profile) { navigate('/login'); return }
    setEditName(profile.username)
    setEditAvatar(profile.avatar)
    if (tab === 'history') loadHistory()
  }, [profile, tab])

  const loadHistory = async () => {
    if (!profile) return
    setHistoryLoading(true)
    const { data } = await supabase
      .from('game_history')
      .select('*')
      .or(`winner_id.eq.${profile.id},loser_id.eq.${profile.id}`)
      .order('played_at', { ascending: false })
      .limit(20)

    if (!data) { setHistoryLoading(false); return }

    // Fetch opponent profiles
    const enriched = await Promise.all(data.map(async (g) => {
      const opponentId = g.winner_id === profile.id ? g.loser_id : g.winner_id
      if (!opponentId) return { ...g, opponent: null }
      const { data: opp } = await supabase
        .from('profiles')
        .select('username, avatar')
        .eq('id', opponentId)
        .single()
      return { ...g, opponent: opp }
    }))

    setHistory(enriched as GameHistoryItem[])
    setHistoryLoading(false)
  }

  const handleSaveProfile = async () => {
    setEditError('')
    const err = await updateProfile({ username: editName, avatar: editAvatar })
    if (err) setEditError(err)
    else { setEditSaved(true); setTimeout(() => setEditSaved(false), 2000) }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  if (!profile) return null

  const rank = getRank(profile.xp)
  const nextRank = getNextRank(profile.xp)
  const xpProgress = nextRank
    ? ((profile.xp - rank.min) / (nextRank.min - rank.min)) * 100
    : 100
  const winRate = profile.wins + profile.losses > 0
    ? Math.round(profile.wins / (profile.wins + profile.losses) * 100)
    : 0

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: '20px 24px',
  }

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '10px 14px',
    color: '#fff', fontSize: '0.9rem',
    fontFamily: "'Montserrat', sans-serif",
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        input:focus { border-color: rgba(212,175,55,0.6) !important; }
        .dash-tab { cursor:pointer; transition:all 0.2s; padding:10px 20px; border:none; background:none; font-family:'Montserrat',sans-serif; font-weight:700; font-size:0.78rem; letter-spacing:2px; text-transform:uppercase; }
        .dash-tab:hover { color:#D4AF37 !important; }
        .btn-gold { cursor:pointer; transition:all 0.2s; }
        .btn-gold:hover { opacity:0.85; transform:translateY(-1px); }
        .avatar-btn2 { cursor:pointer; border:2px solid transparent; border-radius:8px; padding:4px 6px; font-size:1.4rem; transition:all 0.15s; background:none; }
        .avatar-btn2:hover { border-color:rgba(212,175,55,0.4); }
        .avatar-btn2.sel { border-color:#D4AF37; background:rgba(212,175,55,0.12); }
      `}</style>

      {/* ── TOP BAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0a0a0a', position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1rem' }}>←</button>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 5, color: '#D4AF37' }}>THE REFLEKTOR</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{profile.avatar} {profile.username}</div>
            <div style={{ fontSize: '0.7rem', color: rank.color }}>{rank.icon} {rank.name}</div>
          </div>
          <button className="btn-gold" onClick={handleLogout} style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', cursor: 'pointer',
          }}>🚪 Wyloguj</button>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(16px, 4vw, 32px)' }}>

        {/* ── HERO CARD ── */}
        <div style={{
          ...card,
          background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(0,0,0,0))',
          borderColor: 'rgba(212,175,55,0.2)',
          marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '3.5rem' }}>{profile.avatar}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: 1 }}>{profile.username}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: '1.2rem' }}>{rank.icon}</span>
              <span style={{ color: rank.color, fontWeight: 700, fontSize: '0.9rem' }}>{rank.name}</span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>• {profile.xp} XP</span>
            </div>
            {/* XP Progress bar */}
            <div style={{ marginTop: 10, maxWidth: 300 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
                <span>{profile.xp} XP</span>
                <span>{nextRank ? `${nextRank.min} XP → ${nextRank.name} ${nextRank.icon}` : 'MAX RANK'}</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${xpProgress}%`, background: `linear-gradient(90deg, ${rank.color}, ${nextRank?.color ?? rank.color})`, borderRadius: 3, transition: 'width 1s ease' }} />
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn-gold" onClick={() => navigate('/lobby')} style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #D4AF37, #A0832A)',
              color: '#000', fontWeight: 800, fontSize: '0.8rem', letterSpacing: 2, cursor: 'pointer',
            }}>⚔️ GRA ONLINE</button>
            <button className="btn-gold" onClick={() => navigate('/')} style={{
              padding: '10px 20px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent', color: 'rgba(255,255,255,0.7)',
              fontWeight: 700, fontSize: '0.8rem', letterSpacing: 1, cursor: 'pointer',
            }}>🎮 Singleplayer</button>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 24 }}>
          {([
            ['stats', '📊 Statystyki'],
            ['history', '📜 Historia gier'],
            ['profile', '✏️ Profil'],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              className="dash-tab"
              onClick={() => setTab(t)}
              style={{ color: tab === t ? '#D4AF37' : 'rgba(255,255,255,0.35)', borderBottom: tab === t ? '2px solid #D4AF37' : '2px solid transparent', marginBottom: -1 }}
            >{label}</button>
          ))}
        </div>

        {/* ── STATS TAB ── */}
        {tab === 'stats' && (
          <div>
            {/* Main stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Wygrane', value: profile.wins, color: '#4ade80', icon: '🏆' },
                { label: 'Przegrane', value: profile.losses, color: '#f87171', icon: '💀' },
                { label: 'Win Rate', value: `${winRate}%`, color: '#60A5FA', icon: '📈' },
                { label: 'Seria', value: profile.win_streak, color: '#F59E0B', icon: '🔥' },
                { label: 'Rekord serii', value: profile.best_streak, color: '#A78BFA', icon: '⭐' },
                { label: 'XP', value: profile.xp, color: '#D4AF37', icon: '✨' },
              ].map(stat => (
                <div key={stat.label} style={{ ...card, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>{stat.icon}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginTop: 2 }}>{stat.label.toUpperCase()}</div>
                </div>
              ))}
            </div>

            {/* Rank progression */}
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>SYSTEM RANG</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {RANKS.map(r => {
                  const isCurrentRank = profile.xp >= r.min && profile.xp <= r.max
                  const isPastRank = profile.xp > r.max
                  return (
                    <div key={r.name} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '8px 12px', borderRadius: 8,
                      background: isCurrentRank ? 'rgba(212,175,55,0.08)' : 'transparent',
                      border: isCurrentRank ? '1px solid rgba(212,175,55,0.2)' : '1px solid transparent',
                      opacity: isPastRank ? 0.5 : 1,
                    }}>
                      <span style={{ fontSize: '1.2rem' }}>{r.icon}</span>
                      <span style={{ flex: 1, fontWeight: isCurrentRank ? 700 : 400, color: isCurrentRank ? r.color : 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>{r.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>{r.min === 0 ? '0' : r.min}+ XP</span>
                      {isCurrentRank && <span style={{ fontSize: '0.7rem', color: '#D4AF37', fontWeight: 700 }}>← TY</span>}
                      {isPastRank && <span style={{ color: '#4ade80' }}>✓</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === 'history' && (
          <div>
            {historyLoading ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '40px 0' }}>⏳ Ładowanie historii...</div>
            ) : history.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎮</div>
                <div style={{ color: 'rgba(255,255,255,0.4)' }}>Brak rozegranych gier. Zagraj swoją pierwszą grę online!</div>
                <button className="btn-gold" onClick={() => navigate('/lobby')} style={{
                  marginTop: 16, padding: '10px 24px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #D4AF37, #A0832A)',
                  color: '#000', fontWeight: 800, cursor: 'pointer',
                }}>⚔️ Znajdź przeciwnika</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map(game => {
                  const isWin = game.winner_id === profile.id
                  const isDraw = game.is_draw
                  const myScore = isWin ? game.winner_score : game.loser_score
                  const theirScore = isWin ? game.loser_score : game.winner_score
                  const date = new Date(game.played_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  const duration = `${Math.floor(game.duration_sec / 60)}m ${game.duration_sec % 60}s`

                  return (
                    <div key={game.id} style={{
                      ...card,
                      borderColor: isDraw ? 'rgba(255,255,255,0.1)' : isWin ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)',
                      display: 'flex', alignItems: 'center', gap: 16,
                    }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isDraw ? 'rgba(255,255,255,0.05)' : isWin ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                        fontSize: '1.5rem',
                      }}>
                        {isDraw ? '🤝' : isWin ? '🏆' : '💀'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, marginBottom: 3 }}>
                          vs {game.opponent ? `${game.opponent.avatar} ${game.opponent.username}` : '???'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>
                          {game.rounds_total} rund • {duration} • {date}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: isDraw ? '#fff' : isWin ? '#4ade80' : '#f87171' }}>
                          {myScore}:{theirScore}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: isDraw ? 'rgba(255,255,255,0.4)' : isWin ? '#4ade80' : '#f87171', letterSpacing: 1 }}>
                          {isDraw ? 'REMIS' : isWin ? 'WYGRANA' : 'PORAŻKA'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (
          <div style={{ ...card, maxWidth: 480 }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>EDYCJA PROFILU</div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>Nazwa gracza</label>
              <input
                style={inp} value={editName}
                onChange={e => setEditName(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20))}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.71rem', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>Avatar</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {AVATARS.map(a => (
                  <button
                    key={a}
                    className={`avatar-btn2${editAvatar === a ? ' sel' : ''}`}
                    onClick={() => setEditAvatar(a)}
                  >{a}</button>
                ))}
              </div>
            </div>

            {editError && <div style={{ color: '#f87171', fontSize: '0.82rem', marginBottom: 12 }}>⚠️ {editError}</div>}
            {editSaved && <div style={{ color: '#4ade80', fontSize: '0.82rem', marginBottom: 12 }}>✅ Zapisano!</div>}

            <button className="btn-gold" onClick={handleSaveProfile} style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #D4AF37, #A0832A)',
              color: '#000', fontWeight: 800, fontSize: '0.88rem', letterSpacing: 2, cursor: 'pointer',
            }}>💾 ZAPISZ ZMIANY</button>
          </div>
        )}
      </div>
    </div>
  )
}
