/**
 * MultiplayerLobby — waiting room + lobby before game start
 *
 * Flow:
 *  1. Main screen: create room (requires auth) or join by code
 *  2. After create/join: LOBBY screen (chat, settings, player info)
 *     - status='waiting' → host only, waiting for guest
 *     - status='lobby'   → both joined, host can START
 *  3. status='playing' → navigate to game room
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { useConfigStore } from '../store/useConfigStore'
import { useMultiplayerStore } from '../store/useMultiplayerStore'
import { useAuthStore } from '../store/useAuthStore'
import { supabase } from '../lib/supabase'

interface OnlinePlayer { id: string; username: string; avatar: string; xp: number; wins: number }

// ── Shared styles ─────────────────────────────────────────────────────────────
const G = {
  bg:    { minHeight:'100vh', background:'#080808', display:'flex', alignItems:'flex-start', justifyContent:'center', fontFamily:"'Montserrat',sans-serif", padding:'20px 14px', position:'relative' } as React.CSSProperties,
  grid:  { position:'fixed', inset:0, pointerEvents:'none', backgroundImage:'linear-gradient(rgba(255,215,0,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,215,0,0.025) 1px,transparent 1px)', backgroundSize:'40px 40px' } as React.CSSProperties,
  card:  (glow=false): React.CSSProperties => ({ background:'linear-gradient(160deg,#111,#0a0a0a)', border:`1px solid ${glow ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.07)'}`, borderRadius:14, padding:'22px 20px', boxShadow: glow ? '0 0 40px rgba(212,175,55,0.08)' : 'none' }),
  logo:  { fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.9rem', letterSpacing:8, color:'#D4AF37' } as React.CSSProperties,
  sub:   { color:'rgba(255,255,255,0.25)', fontSize:'0.66rem', letterSpacing:3 } as React.CSSProperties,
  label: { display:'block', color:'rgba(255,255,255,0.35)', fontSize:'0.63rem', letterSpacing:2, marginBottom:5 } as React.CSSProperties,
  inp:   { width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#fff', fontFamily:"'Montserrat',sans-serif", fontSize:'0.9rem', padding:'9px 12px', outline:'none', boxSizing:'border-box', transition:'border-color 0.2s' } as React.CSSProperties,
  err:   { padding:'9px 12px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, color:'#f87171', fontSize:'0.78rem', marginBottom:12 } as React.CSSProperties,
}

const btn = (active: boolean, color='#D4AF37'): React.CSSProperties => ({
  width:'100%', padding:'11px 18px', borderRadius:10,
  background: active ? `${color}22` : 'rgba(255,255,255,0.03)',
  border:`1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
  color: active ? color : 'rgba(255,255,255,0.2)',
  fontFamily:"'Bebas Neue',sans-serif", fontSize:'1rem', letterSpacing:4,
  cursor: active ? 'pointer' : 'not-allowed', transition:'all 0.2s',
})

function SettingBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding:'5px 12px', borderRadius:7, fontSize:'0.8rem', cursor:'pointer', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, background: active ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)', border:`1px solid ${active ? '#D4AF37' : 'rgba(255,255,255,0.1)'}`, color: active ? '#D4AF37' : 'rgba(255,255,255,0.35)', transition:'all 0.15s' }}>
      {label}
    </button>
  )
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600;700&display=swap');
  @keyframes wp{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
  @keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
  input::placeholder{color:rgba(255,255,255,0.18)}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
  @media(max-width:660px){.mpgrid{grid-template-columns:1fr!important}}
`

export default function MultiplayerLobby() {
  const navigate = useNavigate()
  const { fetch: fetchConfig } = useConfigStore()
  const { user } = useAuthStore()

  const {
    playerName, setPlayerName, status, roomCode, error,
    createRoom, joinRoom, startGame, leaveRoom, role,
    chatMessages, sendChatMessage, gameSettings, updateGameSettings,
    opponentName, opponentAvatar, guestReady,
  } = useMultiplayerStore()

  const [nameInput,     setNameInput]     = useState(user?.username || playerName || '')
  const [codeInput,     setCodeInput]     = useState('')
  const [nameSet,       setNameSet]       = useState(!!(user?.username || (playerName && playerName !== 'GRACZ')))
  const [loadingCreate, setLoadingCreate] = useState(false)
  const [loadingJoin,   setLoadingJoin]   = useState(false)
  const [chatInput,     setChatInput]     = useState('')
  const [codeCopied,    setCodeCopied]    = useState(false)
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([])
  const [searchQ,       setSearchQ]       = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { SoundEngine.startBg('bgMusic', 0.25); return () => SoundEngine.stopBg(400) }, [])
  useEffect(() => { fetchConfig() }, [])
  useEffect(() => { if (user?.username) { setPlayerName(user.username); setNameInput(user.username); setNameSet(true) } }, [user])
  useEffect(() => { if (status === 'playing' && roomCode) { SoundEngine.stopBg(300); navigate('/multiplayer/room/' + roomCode) } }, [status, roomCode])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const searchPlayers = async (q: string) => {
    const query = supabase.from('profiles').select('id,username,avatar,xp,wins').eq('status','online').order('xp',{ascending:false}).limit(15)
    if (q.trim()) query.ilike('username', `%${q.trim()}%`)
    const { data } = await query
    setOnlinePlayers((data ?? []) as OnlinePlayer[])
  }
  useEffect(() => { searchPlayers(''); const iv = setInterval(() => searchPlayers(searchQ), 15000); return () => clearInterval(iv) }, [])
  useEffect(() => { const t = setTimeout(() => searchPlayers(searchQ), 350); return () => clearTimeout(t) }, [searchQ])

  const handleCreate = async () => {
    if (loadingCreate) return
    if (!user) { navigate('/login?next=/multiplayer'); return }
    setLoadingCreate(true)
    try { await createRoom() } finally { setLoadingCreate(false) }
  }

  const handleJoin = async () => {
    if (!nameSet || codeInput.trim().length < 4 || loadingJoin) return
    setLoadingJoin(true)
    try { await joinRoom(codeInput.trim()) } finally { setLoadingJoin(false) }
  }

  const handleLeave = async () => { await leaveRoom(); navigate('/') }
  const handleSendChat = () => { const t = chatInput.trim(); if (!t) return; sendChatMessage(t); setChatInput('') }
  const handleCopyCode = () => { if (!roomCode) return; navigator.clipboard.writeText(roomCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1800) }

  // ── IN LOBBY / WAITING ROOM ────────────────────────────────────────────────
  const inLobby = status === 'waiting' || status === 'lobby'
  if (inLobby && roomCode) {
    const isHost   = role === 'host'
    const canStart = isHost && status === 'lobby' && guestReady
    const myName   = playerName
    const theirName   = opponentName ?? (status === 'waiting' ? '…' : 'GOŚĆ')
    const theirAvatar = opponentAvatar

    return (
      <div style={G.bg}>
        <div style={G.grid} />
        <style>{CSS}</style>

        <div className="mpgrid" style={{ position:'relative', zIndex:1, width:'100%', maxWidth:920, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>

          {/* ─── LEFT: Room info + settings ───────────────────────────────── */}
          <div style={G.card(true)}>
            <div style={{ marginBottom:16 }}>
              <div style={G.logo}>THE FLOOR</div>
              <div style={G.sub}>🌐 POCZEKALNIA</div>
            </div>

            {/* Code */}
            <div style={{ textAlign:'center', padding:'16px 0', background:'rgba(212,175,55,0.04)', borderRadius:12, border:'1px solid rgba(212,175,55,0.12)', marginBottom:14 }}>
              <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.6rem', letterSpacing:3, marginBottom:2 }}>KOD POKOJU</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'3.2rem', letterSpacing:12, color:'#D4AF37', textShadow:'0 0 30px rgba(212,175,55,0.35)', lineHeight:1.15 }}>{roomCode}</div>
              <button onClick={handleCopyCode} style={{ marginTop:6, background:'rgba(212,175,55,0.08)', border:'1px solid rgba(212,175,55,0.2)', borderRadius:6, color: codeCopied ? '#4ade80' : 'rgba(212,175,55,0.7)', fontSize:'0.7rem', padding:'3px 12px', cursor:'pointer', fontFamily:"'Montserrat',sans-serif", transition:'color 0.2s' }}>
                {codeCopied ? '✓ Skopiowano!' : '📋 Kopiuj'}
              </button>
            </div>

            {/* Players */}
            <div style={{ display:'flex', gap:10, marginBottom:14 }}>
              {[{ name: isHost ? myName : theirName, avatar: isHost ? (user?.avatar ?? '🎮') : theirAvatar, label: 'HOST', color:'#FFD700' },
                { name: isHost ? theirName : myName,  avatar: isHost ? theirAvatar : (user?.avatar ?? '🎮'), label: 'GOŚĆ',  color:'#C0C0C0' }].map((p, i) => (
                <div key={i} style={{ flex:1, padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:10, border:`1px solid rgba(255,255,255,0.06)`, textAlign:'center' }}>
                  <div style={{ fontSize:'1.5rem', marginBottom:4 }}>{p.avatar || '🎮'}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.85rem', letterSpacing:3, color: p.color, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize:'0.58rem', color:'rgba(255,255,255,0.25)', letterSpacing:2 }}>{p.label}</div>
                </div>
              ))}
            </div>

            {/* Waiting indicator or START button */}
            {status === 'waiting' && (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'rgba(255,255,255,0.03)', borderRadius:8, marginBottom:14 }}>
                <div style={{ display:'flex', gap:4 }}>{[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'#D4AF37', animation:`wp 1.2s ease-in-out ${i*0.2}s infinite` }} />)}</div>
                <span style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.35)', letterSpacing:1 }}>Oczekiwanie na gracza…</span>
              </div>
            )}

            {status === 'lobby' && !isHost && (
              <div style={{ padding:'10px 14px', background:'rgba(99,102,241,0.08)', border:'1px solid rgba(99,102,241,0.2)', borderRadius:8, marginBottom:14, fontSize:'0.78rem', color:'rgba(255,255,255,0.45)', textAlign:'center' }}>
                ⏳ Czekaj na start od hosta…
              </div>
            )}

            {canStart && (
              <div style={{ marginBottom:14 }}>
                <button onClick={startGame} style={{ ...btn(true, '#4ade80'), fontSize:'1.15rem' }}>
                  ▶ ROZPOCZNIJ GRĘ
                </button>
                <div style={{ textAlign:'center', fontSize:'0.65rem', color:'rgba(255,255,255,0.2)', marginTop:6, letterSpacing:1 }}>
                  Obaj gracze są gotowi!
                </div>
              </div>
            )}

            {/* Settings (host edits, guest views) */}
            <div style={{ marginBottom:14 }}>
              <div style={{ ...G.label, marginBottom:10 }}>⚙️ USTAWIENIA GRY</div>
              {isHost ? (
                <>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ ...G.label, fontSize:'0.58rem' }}>CZAS ODPOWIEDZI</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {[15,30,45,60].map(t => <SettingBtn key={t} label={`${t}s`} active={gameSettings.duelTime===t} onClick={() => updateGameSettings({duelTime:t})} />)}
                    </div>
                  </div>
                  <div>
                    <div style={{ ...G.label, fontSize:'0.58rem' }}>KATEGORII NA PLANSZY</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {[6,9,12,16].map(n => <SettingBtn key={n} label={`${n}`} active={gameSettings.categoriesCount===n} onClick={() => updateGameSettings({categoriesCount:n})} />)}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ padding:'10px 12px', background:'rgba(255,255,255,0.03)', borderRadius:8, fontSize:'0.78rem', color:'rgba(255,255,255,0.4)' }}>
                  <div style={{ marginBottom:3 }}>⏱ Czas: <span style={{ color:'#D4AF37' }}>{gameSettings.duelTime}s</span></div>
                  <div>📦 Kategorie: <span style={{ color:'#D4AF37' }}>{gameSettings.categoriesCount}</span></div>
                </div>
              )}
            </div>

            <button onClick={handleLeave} style={btn(true,'rgba(255,80,80,0.8)')}>✕ WYJDŹ Z POKOJU</button>
          </div>

          {/* ─── RIGHT: Live chat ──────────────────────────────────────────── */}
          <div style={G.card()}>
            <div style={{ ...G.label, marginBottom:10 }}>💬 CZAT</div>

            <div style={{ height:280, overflowY:'auto', marginBottom:10, display:'flex', flexDirection:'column', gap:5 }}>
              {chatMessages.length === 0 && (
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.15)', gap:6, fontSize:'0.8rem' }}>
                  <span style={{ fontSize:'1.6rem' }}>💬</span>
                  <span>Napisz coś do przeciwnika…</span>
                </div>
              )}
              {chatMessages.map((m, i) => {
                const isMe = m.from === playerName
                return (
                  <div key={i} style={{ animation:'fadeInUp 0.2s ease', display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start', flexShrink:0 }}>
                    <div style={{ fontSize:'0.57rem', color:'rgba(255,255,255,0.22)', marginBottom:2, padding:'0 4px', letterSpacing:1 }}>{m.from}</div>
                    <div style={{ padding:'6px 11px', borderRadius: isMe ? '10px 10px 2px 10px' : '10px 10px 10px 2px', background: isMe ? 'rgba(212,175,55,0.13)' : 'rgba(255,255,255,0.06)', border:`1px solid ${isMe ? 'rgba(212,175,55,0.22)' : 'rgba(255,255,255,0.08)'}`, color: isMe ? '#e8d080' : 'rgba(255,255,255,0.75)', fontSize:'0.84rem', maxWidth:'85%', wordBreak:'break-word' }}>
                      {m.text}
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>

            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input style={{ ...G.inp, flex:1, padding:'8px 11px' }} value={chatInput} maxLength={200} placeholder="Wiadomość…"
                onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key==='Enter' && handleSendChat()} />
              <button onClick={handleSendChat} disabled={!chatInput.trim()} style={{ padding:'8px 13px', borderRadius:8, cursor: chatInput.trim() ? 'pointer' : 'not-allowed', background: chatInput.trim() ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)', border:`1px solid ${chatInput.trim() ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.08)'}`, color: chatInput.trim() ? '#D4AF37' : 'rgba(255,255,255,0.2)', fontSize:'1rem' }}>➤</button>
            </div>

            {/* Mechanics info */}
            <div style={{ padding:'12px 14px', background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.12)', borderRadius:10 }}>
              <div style={{ fontSize:'0.68rem', color:'rgba(255,255,255,0.4)', lineHeight:1.7, fontFamily:"'Montserrat',sans-serif" }}>
                <strong style={{ color:'rgba(99,102,241,0.8)', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, fontSize:'0.78rem' }}>JAK DZIAŁA GRA</strong><br />
                🎯 Host wybiera pole na planszy • Losowanie kto odpowiada pierwszy<br />
                ⏱ Twój timer liczy się tylko gdy <em>ty</em> odpowiadasz<br />
                ✓ Poprawna odpowiedź = tura przechodzi do przeciwnika<br />
                ⏱ PAS = nowe pytanie, kara {gameSettings.duelTime}s → -{(useConfigStore.getState().config.PASS_PENALTY || 5)}s<br />
                🏆 Timer = 0 → przegrywasz pole
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN LOBBY ─────────────────────────────────────────────────────────────
  return (
    <div style={G.bg}>
      <div style={G.grid} />
      <style>{CSS}</style>

      <div className="mpgrid" style={{ position:'relative', zIndex:1, width:'100%', maxWidth:900, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, alignItems:'start' }}>

        {/* LEFT — Create / Join */}
        <div style={G.card(true)}>
          <div style={{ marginBottom:16 }}>
            <div style={G.logo}>THE FLOOR</div>
            <div style={G.sub}>🌐 MULTIPLAYER ONLINE</div>
          </div>

          {/* Auth user strip */}
          {user ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'rgba(212,175,55,0.06)', border:'1px solid rgba(212,175,55,0.14)', borderRadius:10, marginBottom:14 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(212,175,55,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1rem', overflow:'hidden', flexShrink:0 }}>
                {user.avatar_url ? <img src={user.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" /> : user.avatar}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.9rem', letterSpacing:3, color:'#D4AF37' }}>{user.username}</div>
                <div style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.28)' }}>{user.wins}W · {user.losses}L · {user.xp}XP</div>
              </div>
              <button onClick={() => navigate('/profile')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.78rem' }}>⚙️</button>
            </div>
          ) : (
            <div style={{ padding:'10px 12px', background:'rgba(99,102,241,0.07)', border:'1px solid rgba(99,102,241,0.18)', borderRadius:9, marginBottom:14 }}>
              <div style={{ fontSize:'0.74rem', color:'rgba(255,255,255,0.45)', marginBottom:8 }}>
                🔑 Zaloguj się, aby tworzyć pokoje i zdobywać XP
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => navigate('/login?next=/multiplayer')} style={{ flex:1, padding:'7px 0', borderRadius:7, background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', color:'rgba(99,102,241,0.9)', fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.85rem', letterSpacing:2, cursor:'pointer' }}>ZALOGUJ</button>
                <button onClick={() => navigate('/login?register=1&next=/multiplayer')} style={{ flex:1, padding:'7px 0', borderRadius:7, background:'rgba(212,175,55,0.1)', border:'1px solid rgba(212,175,55,0.25)', color:'rgba(212,175,55,0.8)', fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.85rem', letterSpacing:2, cursor:'pointer' }}>ZAREJESTRUJ</button>
              </div>
            </div>
          )}

          {error && <div style={G.err}>⚠️ {error}</div>}

          {/* Create room — requires auth */}
          <button onClick={handleCreate} disabled={loadingCreate} style={{ ...btn(!loadingCreate), marginBottom:12 }}>
            {loadingCreate ? '⏳ TWORZENIE POKOJU…' : user ? '🏠 UTWÓRZ POKÓJ' : '🔑 ZALOGUJ SIĘ BY GRAĆ'}
          </button>

          <div style={{ display:'flex', alignItems:'center', gap:10, margin:'10px 0', color:'rgba(255,255,255,0.18)', fontSize:'0.66rem', letterSpacing:2 }}>
            <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }} />LUB WPISZ KOD<div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Join by code — guest can join without auth */}
          {!nameSet ? (
            <>
              <div style={G.label}>TWÓJ NICK (grasz jako gość)</div>
              <input style={{ ...G.inp, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3, fontSize:'1.1rem', marginBottom:10 }}
                value={nameInput} maxLength={16} placeholder="WPISZ NICK…"
                onChange={e => setNameInput(e.target.value.toUpperCase())} onKeyDown={e => e.key==='Enter' && setNameSet(true)} />
            </>
          ) : !user && (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, padding:'6px 10px', background:'rgba(255,255,255,0.03)', borderRadius:7 }}>
              <span style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.3)', letterSpacing:2 }}>GRASZ JAKO</span>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.9rem', letterSpacing:3, color:'#D4AF37' }}>{playerName}</span>
                <button onClick={() => { setNameSet(false); setPlayerName('GRACZ') }} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer' }}>✏️</button>
              </div>
            </div>
          )}

          <label style={G.label}>KOD POKOJU</label>
          <input style={{ ...G.inp, textAlign:'center', fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.55rem', letterSpacing:10, marginBottom:10 }}
            value={codeInput} maxLength={4} placeholder="XXXX"
            onChange={e => setCodeInput(e.target.value.toUpperCase())} onKeyDown={e => e.key==='Enter' && handleJoin()} />
          <button onClick={handleJoin} disabled={loadingJoin || codeInput.trim().length < 4} style={btn(!loadingJoin && codeInput.trim().length===4,'#818cf8')}>
            {loadingJoin ? '⏳ DOŁĄCZANIE…' : '🚪 DOŁĄCZ DO POKOJU'}
          </button>

          <div style={{ borderTop:'1px solid rgba(255,255,255,0.05)', marginTop:16, paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button onClick={() => navigate('/')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.7rem', letterSpacing:2, fontFamily:"'Montserrat',sans-serif" }}>← MENU</button>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => navigate('/ranking')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.7rem', fontFamily:"'Montserrat',sans-serif" }}>🏆 Ranking</button>
              {user
                ? <button onClick={() => navigate('/profile')} style={{ background:'none', border:'none', color:'rgba(212,175,55,0.6)', cursor:'pointer', fontSize:'0.7rem', fontFamily:"'Montserrat',sans-serif" }}>👤 Profil</button>
                : <button onClick={() => navigate('/login')} style={{ background:'none', border:'none', color:'rgba(99,102,241,0.7)', cursor:'pointer', fontSize:'0.7rem', fontFamily:"'Montserrat',sans-serif" }}>🔑 Zaloguj</button>
              }
            </div>
          </div>
        </div>

        {/* RIGHT — Online players */}
        <div style={G.card()}>
          <div style={{ ...G.label, marginBottom:10 }}>🔍 GRACZE ONLINE</div>
          <input style={{ ...G.inp, marginBottom:12 }} value={searchQ} placeholder="Szukaj po nicku…" onChange={e => setSearchQ(e.target.value)} />

          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:16 }}>
            {onlinePlayers.length===0 && (
              <div style={{ padding:'26px 0', textAlign:'center', color:'rgba(255,255,255,0.18)', fontSize:'0.8rem' }}>
                <div style={{ fontSize:'1.6rem', marginBottom:6 }}>🌙</div>Brak graczy online
              </div>
            )}
            {onlinePlayers.map(p => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'rgba(255,255,255,0.03)', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width:34, height:34, borderRadius:'50%', background:'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.15rem', flexShrink:0, position:'relative' }}>
                  {p.avatar}
                  <div style={{ position:'absolute', bottom:0, right:0, width:7, height:7, borderRadius:'50%', background:'#4ade80', border:'1.5px solid #080808', animation:'pulse 2s ease-in-out infinite' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.88rem', letterSpacing:2, color:'#D4AF37', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.username}</div>
                  <div style={{ fontSize:'0.6rem', color:'rgba(255,255,255,0.22)' }}>{p.wins} wygranych · {p.xp} XP</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding:'12px 14px', background:'rgba(99,102,241,0.05)', border:'1px solid rgba(99,102,241,0.12)', borderRadius:10 }}>
            <div style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.35)', lineHeight:1.7 }}>
              <strong style={{ color:'rgba(99,102,241,0.8)', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, fontSize:'0.78rem' }}>ZASADY</strong><br />
              1. Zaloguj się i utwórz pokój<br />
              2. Podaj 4-literowy kod znajomemu<br />
              3. Obaj widzicie pokój z czatem<br />
              4. Host klika <strong style={{ color:'#4ade80' }}>ROZPOCZNIJ</strong> gdy jesteście gotowi<br />
              5. Gra 1v1 na planszy kategorii!
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
