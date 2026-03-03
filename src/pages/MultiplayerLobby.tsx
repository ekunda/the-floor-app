import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { useConfigStore } from '../store/useConfigStore'
import { useMultiplayerStore } from '../store/useMultiplayerStore'
import { useAuthStore } from '../store/useAuthStore'
import { supabase } from '../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface OnlinePlayer { id: string; username: string; avatar: string; xp: number; wins: number }

// ── Helper components ─────────────────────────────────────────────────────────
function SettingBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 8, fontSize: '0.82rem', cursor: 'pointer',
      fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2,
      background: active ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? '#D4AF37' : 'rgba(255,255,255,0.1)'}`,
      color: active ? '#D4AF37' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s',
    }}>{label}</button>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const base = {
  bg: { minHeight:'100vh', background:'#080808', display:'flex', alignItems:'flex-start', justifyContent:'center', fontFamily:"'Montserrat',sans-serif", padding:'24px 16px', position:'relative' } as React.CSSProperties,
  grid: { position:'fixed', inset:0, pointerEvents:'none', backgroundImage:'linear-gradient(rgba(255,215,0,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,215,0,0.025) 1px,transparent 1px)', backgroundSize:'40px 40px' } as React.CSSProperties,
  panel: (glow=false): React.CSSProperties => ({ background:'linear-gradient(160deg,#111,#0a0a0a)', border:`1px solid ${glow ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.07)'}`, borderRadius:14, padding:'24px 22px', boxShadow: glow ? '0 0 40px rgba(212,175,55,0.08)' : 'none' }),
  logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:'2rem', letterSpacing:8, color:'#D4AF37' } as React.CSSProperties,
  sub:  { color:'rgba(255,255,255,0.25)', fontSize:'0.68rem', letterSpacing:3, marginBottom:2 } as React.CSSProperties,
  lbl:  { display:'block', color:'rgba(255,255,255,0.35)', fontSize:'0.65rem', letterSpacing:2, marginBottom:6 } as React.CSSProperties,
  inp:  { width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#fff', fontFamily:"'Montserrat',sans-serif", fontSize:'0.9rem', padding:'10px 14px', outline:'none', boxSizing:'border-box' } as React.CSSProperties,
  err:  { padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, color:'#f87171', fontSize:'0.8rem', marginBottom:12 } as React.CSSProperties,
}

const btnPrimary = (active: boolean, color='#D4AF37'): React.CSSProperties => ({
  width:'100%', padding:'12px 20px', borderRadius:10,
  background: active ? `${color}22` : 'rgba(255,255,255,0.03)',
  border:`1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
  color: active ? color : 'rgba(255,255,255,0.2)',
  fontFamily:"'Bebas Neue',sans-serif", fontSize:'1rem', letterSpacing:4,
  cursor: active ? 'pointer' : 'not-allowed', transition:'all 0.2s',
})

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MultiplayerLobby() {
  const navigate = useNavigate()
  const { fetch: fetchConfig } = useConfigStore()
  const { user } = useAuthStore()

  const {
    playerName, setPlayerName, status, roomCode, error,
    createRoom, joinRoom, leaveRoom, role,
    chatMessages, sendChatMessage,
    gameSettings, updateGameSettings,
  } = useMultiplayerStore()

  const [nameInput,     setNameInput]     = useState(user?.username || playerName || '')
  const [codeInput,     setCodeInput]     = useState('')
  const [nameSet,       setNameSet]       = useState(!!(user?.username || (playerName && playerName !== 'GRACZ')))
  const [loadingCreate, setLoadingCreate] = useState(false)
  const [loadingJoin,   setLoadingJoin]   = useState(false)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([])
  const [chatInput,     setChatInput]     = useState('')
  const [codeCopied,    setCodeCopied]    = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { SoundEngine.startBg('bgMusic', 0.25); return () => SoundEngine.stopBg(400) }, [])
  useEffect(() => { fetchConfig() }, [])

  useEffect(() => {
    if (user?.username) { setPlayerName(user.username); setNameInput(user.username); setNameSet(true) }
  }, [user])

  useEffect(() => {
    if (status === 'playing' && roomCode) { SoundEngine.stopBg(300); navigate('/multiplayer/room/' + roomCode) }
  }, [status, roomCode, navigate])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const searchPlayers = async (q: string) => {
    const query = supabase.from('profiles').select('id,username,avatar,xp,wins').eq('status','online').order('xp',{ascending:false}).limit(15)
    if (q.trim()) query.ilike('username', `%${q.trim()}%`)
    const { data } = await query
    setOnlinePlayers((data ?? []) as OnlinePlayer[])
  }

  useEffect(() => { searchPlayers(''); const iv = setInterval(() => searchPlayers(searchQuery), 15000); return () => clearInterval(iv) }, [])
  useEffect(() => { const t = setTimeout(() => searchPlayers(searchQuery), 300); return () => clearTimeout(t) }, [searchQuery])

  const handleSetName = () => {
    const n = nameInput.trim().toUpperCase().slice(0, 16)
    if (!n) return
    setPlayerName(n)
    setNameSet(true)
  }

  const handleCreate = async () => {
    if (!nameSet || loadingCreate) return
    setLoadingCreate(true)
    try { await createRoom() } finally { setLoadingCreate(false) }
  }

  const handleJoin = async () => {
    if (!nameSet || codeInput.trim().length < 4 || loadingJoin) return
    setLoadingJoin(true)
    try { await joinRoom(codeInput.trim()) } finally { setLoadingJoin(false) }
  }

  const handleLeave = async () => { await leaveRoom(); navigate('/') }

  const handleSendChat = () => {
    const t = chatInput.trim()
    if (!t) return
    sendChatMessage(t)
    setChatInput('')
  }

  const copyCode = () => {
    if (!roomCode) return
    navigator.clipboard.writeText(roomCode)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 1800)
  }

  const GLOBAL_CSS = `
    @keyframes wp{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes onlinePulse{0%,100%{opacity:.5}50%{opacity:1}}
    input::placeholder{color:rgba(255,255,255,0.2)}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
    @media(max-width:660px){.mp-main-grid{grid-template-columns:1fr!important}.mp-waiting-grid{grid-template-columns:1fr!important}}
  `

  // ── WAITING ROOM ────────────────────────────────────────────────────────────
  if ((status === 'waiting' || status === 'playing') && roomCode) {
    const isHost = role === 'host'
    return (
      <div style={base.bg}>
        <div style={base.grid} />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet" />
        <style>{GLOBAL_CSS}</style>

        <div className="mp-waiting-grid" style={{ position:'relative', zIndex:1, width:'100%', maxWidth:900, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>

          {/* LEFT — Room + settings */}
          <div style={base.panel(true)}>
            <div style={{ marginBottom:18 }}>
              <div style={base.logo}>THE FLOOR</div>
              <div style={base.sub}>🌐 MULTIPLAYER · POCZEKALNIA</div>
            </div>

            {/* Code card */}
            <div style={{ textAlign:'center', padding:'18px 0', background:'rgba(212,175,55,0.04)', borderRadius:12, border:'1px solid rgba(212,175,55,0.12)', marginBottom:14 }}>
              <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.62rem', letterSpacing:3, marginBottom:2 }}>KOD POKOJU</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'3.5rem', letterSpacing:14, color:'#D4AF37', textShadow:'0 0 30px rgba(212,175,55,0.4)', lineHeight:1.1 }}>{roomCode}</div>
              <button onClick={copyCode} style={{ marginTop:8, background:'rgba(212,175,55,0.08)', border:'1px solid rgba(212,175,55,0.2)', borderRadius:6, color: codeCopied ? '#4ade80' : 'rgba(212,175,55,0.7)', fontSize:'0.72rem', padding:'4px 14px', cursor:'pointer', fontFamily:"'Montserrat',sans-serif", transition:'color 0.2s' }}>
                {codeCopied ? '✓ Skopiowano!' : '📋 Kopiuj kod'}
              </button>
            </div>

            {/* Waiting status */}
            {status === 'waiting' && (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'rgba(255,255,255,0.03)', borderRadius:8, marginBottom:14 }}>
                <div style={{ display:'flex', gap:4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#D4AF37', animation:`wp 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
                </div>
                <span style={{ fontSize:'0.76rem', color:'rgba(255,255,255,0.35)', letterSpacing:1 }}>Oczekiwanie na gracza…</span>
              </div>
            )}

            {/* Settings (host edits, guest views) */}
            {isHost ? (
              <div style={{ marginBottom:14 }}>
                <div style={{ ...base.lbl, marginBottom:10 }}>⚙️ USTAWIENIA GRY</div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ ...base.lbl, fontSize:'0.58rem' }}>CZAS ODPOWIEDZI</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {[15,30,45,60].map(t => <SettingBtn key={t} label={`${t}s`} active={gameSettings.duelTime===t} onClick={() => updateGameSettings({duelTime:t})} />)}
                  </div>
                </div>
                <div>
                  <div style={{ ...base.lbl, fontSize:'0.58rem' }}>KATEGORII NA PLANSZY</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {[6,9,12,16].map(n => <SettingBtn key={n} label={`${n}`} active={gameSettings.categoriesCount===n} onClick={() => updateGameSettings({categoriesCount:n})} />)}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ marginBottom:14, padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:8, fontSize:'0.78rem', color:'rgba(255,255,255,0.4)' }}>
                <div style={{ marginBottom:4 }}>⏱ Czas: <span style={{ color:'#D4AF37' }}>{gameSettings.duelTime}s</span></div>
                <div>📦 Kategorie: <span style={{ color:'#D4AF37' }}>{gameSettings.categoriesCount}</span></div>
              </div>
            )}

            <button onClick={handleLeave} style={btnPrimary(true,'rgba(255,80,80,0.8)')}>✕ ANULUJ I WRÓĆ</button>
          </div>

          {/* RIGHT — Live chat */}
          <div style={base.panel()}>
            <div style={{ ...base.lbl, marginBottom:10 }}>💬 CZAT POCZEKALNI</div>

            <div style={{ height:300, overflowY:'auto', marginBottom:10, display:'flex', flexDirection:'column', gap:5, padding:'2px 0' }}>
              {chatMessages.length === 0 && (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.18)', fontSize:'0.8rem', flexDirection:'column', gap:6 }}>
                  <span style={{ fontSize:'1.5rem' }}>💬</span>
                  <span>Napisz pierwszą wiadomość…</span>
                </div>
              )}
              {chatMessages.map((m, i) => {
                const isMe = m.from === playerName
                return (
                  <div key={i} style={{ animation:'fadeIn 0.2s ease', display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start', flexShrink:0 }}>
                    <div style={{ fontSize:'0.58rem', color:'rgba(255,255,255,0.22)', marginBottom:2, letterSpacing:1, padding:'0 4px' }}>{m.from}</div>
                    <div style={{ padding:'7px 12px', borderRadius: isMe ? '10px 10px 2px 10px' : '10px 10px 10px 2px', background: isMe ? 'rgba(212,175,55,0.14)' : 'rgba(255,255,255,0.06)', border:`1px solid ${isMe ? 'rgba(212,175,55,0.22)' : 'rgba(255,255,255,0.08)'}`, color: isMe ? '#e8d080' : 'rgba(255,255,255,0.75)', fontSize:'0.85rem', maxWidth:'85%', wordBreak:'break-word' }}>
                      {m.text}
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>

            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input style={{ ...base.inp, flex:1, padding:'9px 12px' }} value={chatInput} maxLength={200} placeholder="Napisz wiadomość…"
                onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key==='Enter') handleSendChat() }} />
              <button onClick={handleSendChat} disabled={!chatInput.trim()} style={{ padding:'9px 14px', borderRadius:8, cursor: chatInput.trim() ? 'pointer' : 'not-allowed', background: chatInput.trim() ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border:`1px solid ${chatInput.trim() ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'}`, color: chatInput.trim() ? '#D4AF37' : 'rgba(255,255,255,0.2)', fontSize:'1rem', lineHeight:1 }}>➤</button>
            </div>

            {/* Online strip */}
            <div style={{ paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ ...base.lbl, marginBottom:8 }}>🟢 GRACZE ONLINE ({onlinePlayers.length})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                {onlinePlayers.slice(0,5).map(p => (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', background:'rgba(255,255,255,0.03)', borderRadius:6 }}>
                    <span style={{ fontSize:'1rem' }}>{p.avatar}</span>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, fontSize:'0.85rem', color:'#D4AF37', flex:1 }}>{p.username}</span>
                    <span style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.25)' }}>{p.xp}XP</span>
                  </div>
                ))}
                {onlinePlayers.length===0 && <div style={{ fontSize:'0.74rem', color:'rgba(255,255,255,0.2)' }}>Brak graczy online</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN LOBBY ─────────────────────────────────────────────────────────────
  return (
    <div style={base.bg}>
      <div style={base.grid} />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet" />
      <style>{GLOBAL_CSS}</style>

      <div className="mp-main-grid" style={{ position:'relative', zIndex:1, width:'100%', maxWidth:900, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>

        {/* LEFT — Actions */}
        <div style={base.panel(true)}>
          <div style={{ marginBottom:18 }}>
            <div style={base.logo}>THE FLOOR</div>
            <div style={base.sub}>🌐 MULTIPLAYER ONLINE</div>
          </div>

          {user && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'rgba(212,175,55,0.06)', border:'1px solid rgba(212,175,55,0.15)', borderRadius:10, marginBottom:16 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'rgba(212,175,55,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem', overflow:'hidden', flexShrink:0 }}>
                {user.avatar_url ? <img src={user.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : user.avatar}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.95rem', letterSpacing:3, color:'#D4AF37' }}>{user.username}</div>
                <div style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.3)' }}>{user.wins}W · {user.losses}L · {user.xp}XP</div>
              </div>
              <button onClick={() => navigate('/profile')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.8rem' }}>⚙️</button>
            </div>
          )}

          {error && <div style={base.err}>⚠️ {error}</div>}

          {!nameSet ? (
            <>
              <label style={base.lbl}>TWÓJ NICK W GRZE</label>
              <input style={{ ...base.inp, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3, fontSize:'1.1rem', marginBottom:12 }}
                value={nameInput} maxLength={16} placeholder="WPISZ NICK…" autoFocus
                onChange={e => setNameInput(e.target.value.toUpperCase())} onKeyDown={e => e.key==='Enter' && handleSetName()} />
              <button onClick={handleSetName} disabled={!nameInput.trim()} style={btnPrimary(!!nameInput.trim())}>DALEJ →</button>
            </>
          ) : (
            <>
              {!user && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, padding:'8px 12px', background:'rgba(255,255,255,0.03)', borderRadius:8 }}>
                  <span style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.3)', letterSpacing:2 }}>GRASZ JAKO</span>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1rem', letterSpacing:3, color:'#D4AF37' }}>{playerName}</span>
                    <button onClick={() => setNameSet(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer' }}>✏️</button>
                  </div>
                </div>
              )}

              <button onClick={handleCreate} disabled={loadingCreate} style={{ ...btnPrimary(!loadingCreate), marginBottom:12 }}>
                {loadingCreate ? '⏳ TWORZENIE POKOJU…' : '🏠 UTWÓRZ POKÓJ'}
              </button>

              <div style={{ display:'flex', alignItems:'center', gap:10, margin:'12px 0', color:'rgba(255,255,255,0.18)', fontSize:'0.68rem', letterSpacing:2 }}>
                <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }} />LUB<div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }} />
              </div>

              <label style={base.lbl}>KOD POKOJU</label>
              <input style={{ ...base.inp, textAlign:'center', fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.6rem', letterSpacing:12, marginBottom:10 }}
                value={codeInput} maxLength={4} placeholder="XXXX"
                onChange={e => setCodeInput(e.target.value.toUpperCase())} onKeyDown={e => e.key==='Enter' && handleJoin()} />
              <button onClick={handleJoin} disabled={loadingJoin || codeInput.trim().length < 4} style={btnPrimary(!loadingJoin && codeInput.trim().length===4,'#818cf8')}>
                {loadingJoin ? '⏳ DOŁĄCZANIE…' : '🚪 DOŁĄCZ DO POKOJU'}
              </button>
            </>
          )}

          <div style={{ borderTop:'1px solid rgba(255,255,255,0.05)', marginTop:18, paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button onClick={() => navigate('/')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.72rem', letterSpacing:2, fontFamily:"'Montserrat',sans-serif" }}>← MENU</button>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => navigate('/ranking')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.72rem', fontFamily:"'Montserrat',sans-serif" }}>🏆 Ranking</button>
              {user
                ? <button onClick={() => navigate('/profile')} style={{ background:'none', border:'none', color:'rgba(212,175,55,0.6)', cursor:'pointer', fontSize:'0.72rem', fontFamily:"'Montserrat',sans-serif" }}>👤 Profil</button>
                : <button onClick={() => navigate('/login')} style={{ background:'none', border:'none', color:'rgba(99,102,241,0.7)', cursor:'pointer', fontSize:'0.72rem', fontFamily:"'Montserrat',sans-serif" }}>🔑 Zaloguj</button>
              }
            </div>
          </div>
        </div>

        {/* RIGHT — Online players */}
        <div style={base.panel()}>
          <div style={{ ...base.lbl, marginBottom:10 }}>🔍 GRACZE ONLINE</div>
          <input style={{ ...base.inp, marginBottom:12 }} value={searchQuery} placeholder="Szukaj po nicku…" onChange={e => setSearchQuery(e.target.value)} />

          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {onlinePlayers.length===0 && (
              <div style={{ padding:'28px 0', textAlign:'center', color:'rgba(255,255,255,0.2)', fontSize:'0.82rem' }}>
                <div style={{ fontSize:'1.8rem', marginBottom:6 }}>🌙</div>
                Brak graczy online
              </div>
            )}
            {onlinePlayers.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0, position:'relative' }}>
                  {p.avatar}
                  <div style={{ position:'absolute', bottom:0, right:0, width:8, height:8, borderRadius:'50%', background:'#4ade80', border:'1.5px solid #080808', animation:'onlinePulse 2s ease-in-out infinite' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.9rem', letterSpacing:2, color:'#D4AF37', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.username}</div>
                  <div style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.25)' }}>{p.wins} wygranych · {p.xp} XP</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop:16, padding:'12px 14px', background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.12)', borderRadius:8 }}>
            <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.35)', lineHeight:1.65 }}>
              💡 <strong style={{ color:'rgba(99,102,241,0.8)' }}>Jak grać?</strong><br />
              Utwórz pokój → podaj 4-literowy kod znajomemu → gość wpisuje kod i dołącza. Gra 1v1 na planszy kategorii — odpowiadaj głosem lub klawiaturą!
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
