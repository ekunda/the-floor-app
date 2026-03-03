import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, AVATAR_OPTIONS } from '../store/useAuthStore'
import { supabase } from '../lib/supabase'

interface RecentGame { id: string; opponent: string; result: 'win'|'loss'|'draw'; host_score: number; guest_score: number; played_at: string }

export default function UserProfile() {
  const navigate = useNavigate()
  const { user, logout, updateUsername, updateAvatar, uploadAvatarImage, refreshProfile, error, clearError } = useAuthStore()

  const [tab, setTab]             = useState<'stats'|'settings'|'history'>('stats')
  const [editNick, setEditNick]   = useState(false)
  const [nickInput, setNickInput] = useState('')
  const [pickAvatar, setPickAvatar] = useState(false)
  const [busy, setBusy]           = useState(false)
  const [msg, setMsg]             = useState('')
  const [games, setGames]         = useState<RecentGame[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!user) navigate('/login') }, [user, navigate])
  useEffect(() => { if (user) { refreshProfile(); loadHistory() } }, [])

  const loadHistory = async () => {
    if (!user) return
    const { data } = await supabase
      .from('game_history')
      .select('id, winner_id, loser_id, winner_score, loser_score, is_draw, played_at')
      .or(`winner_id.eq.${user.id},loser_id.eq.${user.id}`)
      .order('played_at', { ascending: false })
      .limit(10)
    if (data) {
      const rows: RecentGame[] = data.map((g: any) => ({
        id: g.id,
        opponent: '???',
        result: g.is_draw ? 'draw' : g.winner_id === user!.id ? 'win' : 'loss',
        host_score: g.winner_score,
        guest_score: g.loser_score,
        played_at: g.played_at,
      }))
      setGames(rows)
    }
  }

  const handleNickSave = async () => {
    setBusy(true); clearError()
    const ok = await updateUsername(nickInput)
    setBusy(false)
    if (ok) { setEditNick(false); setMsg('Nick zmieniony!'); setTimeout(() => setMsg(''), 2500) }
  }

  const handleAvatarPick = async (emoji: string) => {
    await updateAvatar(emoji)
    setPickAvatar(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    await uploadAvatarImage(file)
    setBusy(false)
  }

  const handleLogout = async () => { await logout(); navigate('/') }

  if (!user) return null

  const winRate = user.wins + user.losses > 0 ? Math.round((user.wins / (user.wins + user.losses)) * 100) : 0
  const level   = Math.floor(user.xp / 100) + 1
  const xpPct   = (user.xp % 100)

  const S: Record<string, React.CSSProperties> = {
    page: { minHeight:'100vh', background:'#080808', fontFamily:"'Montserrat',sans-serif", color:'#fff', padding:'24px 20px' },
    inner: { maxWidth:640, margin:'0 auto' },
    back: { background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.78rem', letterSpacing:2, marginBottom:20 },
    card: { background:'linear-gradient(160deg,#111,#0a0a0a)', border:'1px solid rgba(212,175,55,0.2)', borderRadius:16, padding:'28px 24px', marginBottom:16, boxShadow:'0 4px 24px rgba(0,0,0,0.5)' },
    statBox: { background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'16px', textAlign:'center' as const, flex:'1' },
    statVal: { fontFamily:"'Bebas Neue',sans-serif", fontSize:'2.2rem', color:'#D4AF37', letterSpacing:2 },
    statLbl: { fontSize:'0.65rem', letterSpacing:2, color:'rgba(255,255,255,0.35)', marginTop:2 },
    tab: (active: boolean): React.CSSProperties => ({ flex:1, padding:'10px 0', fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.9rem', letterSpacing:2, background:active?'rgba(212,175,55,0.15)':'transparent', color:active?'#D4AF37':'rgba(255,255,255,0.3)', border:'none', cursor:'pointer', transition:'all 0.2s' }),
    btn: (accent = '#D4AF37'): React.CSSProperties => ({ padding:'10px 20px', borderRadius:8, background:`${accent}20`, border:`1px solid ${accent}66`, color:accent, fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.85rem', letterSpacing:3, cursor:'pointer' }),
    inp: { background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'#fff', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3, fontSize:'1rem', padding:'10px 14px', outline:'none', flex:1 } as React.CSSProperties,
  }

  const avatarSrc = user.avatar_url

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <button onClick={() => navigate('/')} style={S.back}>← POWRÓT DO MENU</button>

        {/* Hero card */}
        <div style={{ ...S.card, display:'flex', alignItems:'center', gap:20 }}>
          {/* Avatar */}
          <div style={{ position:'relative', flexShrink:0 }}>
            <div onClick={() => setPickAvatar(true)} style={{
              width:72, height:72, borderRadius:'50%', background:'rgba(212,175,55,0.1)',
              border:'2px solid rgba(212,175,55,0.4)', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'2.2rem', cursor:'pointer', overflow:'hidden', position:'relative',
            }}>
              {avatarSrc
                ? <img src={avatarSrc} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="avatar" />
                : user.avatar}
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', opacity:0, transition:'opacity 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity='1')} onMouseLeave={e => (e.currentTarget.style.opacity='0')}>
                <span style={{ fontSize:'1.2rem' }}>✏️</span>
              </div>
            </div>
            <div style={{ position:'absolute', bottom:-4, right:-4, width:14, height:14, borderRadius:'50%', background: user.status==='online'?'#4ade80':'#6b7280', border:'2px solid #111' }} />
          </div>

          {/* Info */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.8rem', letterSpacing:4, color:'#D4AF37', lineHeight:1 }}>{user.username}</div>
            <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.3)', letterSpacing:2, marginBottom:8 }}>POZIOM {level} · {user.xp} XP</div>
            <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${xpPct}%`, background:'linear-gradient(90deg,#D4AF37,#FFD700)', borderRadius:2, transition:'width 0.6s' }} />
            </div>
          </div>
          <button onClick={handleLogout} style={{ ...S.btn('rgba(255,255,255,0.4)'), fontSize:'0.75rem' }}>WYLOGUJ</button>
        </div>

        {msg    && <div style={{ padding:'10px 14px', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:8, color:'#4ade80', fontSize:'0.8rem', marginBottom:12 }}>✅ {msg}</div>}
        {error  && <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, color:'#f87171', fontSize:'0.8rem', marginBottom:12 }}>⚠️ {error}</div>}

        {/* Avatar picker modal */}
        {pickAvatar && (() => {
          const cats = [
            { label: '🐾 Zwierzęta', emojis: AVATAR_OPTIONS.slice(0, 15) },
            { label: '🎮 Gry / Sport', emojis: AVATAR_OPTIONS.slice(15, 30) },
            { label: '✨ Moc / Magia', emojis: AVATAR_OPTIONS.slice(30, 45) },
            { label: '🚀 Kosmos', emojis: AVATAR_OPTIONS.slice(45, 60) },
          ]
          return (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
              <div style={{ background:'#111', border:'1px solid rgba(212,175,55,0.3)', borderRadius:16, padding:'24px 22px', maxWidth:460, width:'100%', maxHeight:'85vh', overflowY:'auto' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.3rem', letterSpacing:4, color:'#D4AF37', marginBottom:16 }}>WYBIERZ AWATAR</div>
                {cats.map(cat => (
                  <div key={cat.label} style={{ marginBottom:14 }}>
                    <div style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.3)', letterSpacing:2, marginBottom:6 }}>{cat.label}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(44px,1fr))', gap:6 }}>
                      {cat.emojis.map(emoji => (
                        <button key={emoji} onClick={() => handleAvatarPick(emoji)} style={{
                          fontSize:'1.5rem', aspectRatio:'1', display:'flex', alignItems:'center', justifyContent:'center',
                          background: user.avatar===emoji ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${user.avatar===emoji ? '#D4AF37' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius:8, cursor:'pointer', transition:'all 0.15s',
                          transform: user.avatar===emoji ? 'scale(1.1)' : 'scale(1)',
                        }}>{emoji}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:14, marginBottom:14 }}>
                  <div style={{ fontSize:'0.72rem', letterSpacing:2, color:'rgba(255,255,255,0.3)', marginBottom:8 }}>LUB WŁASNE ZDJĘCIE</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFileUpload} />
                  <button onClick={() => fileRef.current?.click()} style={S.btn()}>📷 WGRAJ ZDJĘCIE</button>
                </div>
                <button onClick={() => setPickAvatar(false)} style={{ ...S.btn('rgba(255,255,255,0.4)'), fontSize:'0.75rem' }}>ZAMKNIJ</button>
              </div>
            </div>
          )
        })()}

        {/* Tabs */}
        <div style={{ display:'flex', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
          {(['stats','history','settings'] as const).map(t => (
            <button key={t} style={S.tab(tab===t)} onClick={() => setTab(t)}>
              {t==='stats'?'📊 STATYSTYKI':t==='history'?'📋 HISTORIA':'⚙️ USTAWIENIA'}
            </button>
          ))}
        </div>

        {/* Stats tab */}
        {tab === 'stats' && (
          <div style={S.card}>
            <div style={{ display:'flex', gap:10, marginBottom:16 }}>
              {[{v:user.wins,l:'WYGRANE'},{v:user.losses,l:'PRZEGRANE'},{v:`${winRate}%`,l:'WIN RATE'},{v:user.best_streak,l:'BEST STREAK'}].map(({v,l}) => (
                <div key={l} style={S.statBox}><div style={S.statVal}>{v}</div><div style={S.statLbl}>{l}</div></div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ ...S.statBox, flex:2, textAlign:'left' as const }}>
                <div style={{ fontSize:'0.68rem', letterSpacing:2, color:'rgba(255,255,255,0.35)', marginBottom:8 }}>SERIA WYGRANYCH</div>
                <div style={{ display:'flex', gap:4 }}>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} style={{ flex:1, height:8, borderRadius:4, background: i < user.win_streak ? '#D4AF37' : 'rgba(255,255,255,0.08)' }} />
                  ))}
                </div>
                <div style={{ fontSize:'0.72rem', color:'#D4AF37', marginTop:6 }}>{user.win_streak} z rzędu</div>
              </div>
              <div style={{ ...S.statBox, flex:1 }}>
                <div style={S.statVal}>{user.xp}</div>
                <div style={S.statLbl}>PUNKTY XP</div>
              </div>
            </div>
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div style={S.card}>
            {games.length === 0 ? (
              <div style={{ textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:'0.85rem', padding:'20px 0' }}>Brak rozegranych gier</div>
            ) : games.map(g => (
              <div key={g.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: g.result==='win'?'#4ade80':g.result==='loss'?'#f87171':'#a78bfa', flexShrink:0 }} />
                <div style={{ flex:1, fontSize:'0.82rem', color:'rgba(255,255,255,0.7)' }}>{g.result==='win'?'🏆 Wygrana':g.result==='loss'?'💀 Przegrana':'🤝 Remis'}</div>
                <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.3)' }}>{new Date(g.played_at).toLocaleDateString('pl')}</div>
              </div>
            ))}
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div style={S.card}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:'0.72rem', letterSpacing:2, color:'rgba(255,255,255,0.4)', marginBottom:10 }}>ZMIEŃ NICK</div>
              {user.last_username_change && (() => {
                const days = (Date.now() - new Date(user.last_username_change).getTime()) / (1000*60*60*24)
                if (days < 7) return <div style={{ fontSize:'0.75rem', color:'rgba(255,165,0,0.8)', marginBottom:8 }}>⏳ Kolejna zmiana za {Math.ceil(7-days)} dni</div>
                return null
              })()}
              {editNick ? (
                <div style={{ display:'flex', gap:8 }}>
                  <input style={S.inp} value={nickInput} maxLength={20} onChange={e => setNickInput(e.target.value.toUpperCase())} onKeyDown={e => e.key==='Enter' && handleNickSave()} autoFocus />
                  <button onClick={handleNickSave} disabled={busy} style={S.btn()}>{busy?'…':'ZAPISZ'}</button>
                  <button onClick={() => setEditNick(false)} style={S.btn('rgba(255,255,255,0.4)')}>✕</button>
                </div>
              ) : (
                <button onClick={() => { setEditNick(true); setNickInput(user.username); clearError() }} style={S.btn()}>✏️ ZMIEŃ NICK</button>
              )}
            </div>
            <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:20 }}>
              <div style={{ fontSize:'0.72rem', letterSpacing:2, color:'rgba(255,255,255,0.4)', marginBottom:10 }}>AWATAR</div>
              <button onClick={() => setPickAvatar(true)} style={S.btn()}>🎭 ZMIEŃ AWATAR</button>
            </div>
            <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:20, marginTop:20 }}>
              <button onClick={() => navigate('/ranking')} style={S.btn('#818cf8')}>🏆 RANKING GRACZY</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
