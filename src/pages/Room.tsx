// src/pages/Room.tsx
// Poczekalnia pokoju — synchronizacja Supabase Realtime

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

interface RoomData {
  id: string
  code: string
  host_id: string
  guest_id: string | null
  status: string
  config: {
    rounds: number
    duel_time: number
    board_shape: number
  }
}

interface PlayerInfo {
  id: string
  username: string
  avatar: string
  xp: number
  wins: number
}

export default function Room() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { profile } = useAuthStore()

  const [room, setRoom] = useState<RoomData | null>(null)
  const [host, setHost] = useState<PlayerInfo | null>(null)
  const [guest, setGuest] = useState<PlayerInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  // Chat
  const [messages, setMessages] = useState<{ from: string; text: string; ts: number }[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatRef = useRef<HTMLDivElement>(null)

  const channelRef = useRef<any>(null)

  useEffect(() => {
    if (!profile) { navigate('/login'); return }
    loadRoom()
    return () => { channelRef.current?.unsubscribe() }
  }, [])

  const loadRoom = async () => {
    const { data, error: err } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('code', code)
      .single()

    if (err || !data) { setError('Pokój nie istnieje.'); setLoading(false); return }

    // Verify user is participant
    if (data.host_id !== profile!.id && data.guest_id !== profile!.id && data.status === 'waiting') {
      // Try to join as guest if room is open
      if (!data.guest_id) {
        await supabase.from('game_rooms').update({ guest_id: profile!.id }).eq('id', data.id)
        data.guest_id = profile!.id
      }
    }

    setRoom(data as RoomData)
    await fetchPlayers(data as RoomData)
    subscribeToRoom(data.id)
    setLoading(false)
  }

  const fetchPlayers = async (r: RoomData) => {
    const { data: hostData } = await supabase.from('profiles').select('id,username,avatar,xp,wins').eq('id', r.host_id).single()
    if (hostData) setHost(hostData as PlayerInfo)

    if (r.guest_id) {
      const { data: guestData } = await supabase.from('profiles').select('id,username,avatar,xp,wins').eq('id', r.guest_id).single()
      if (guestData) setGuest(guestData as PlayerInfo)
    }
  }

  const subscribeToRoom = (roomId: string) => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`,
      }, async (payload) => {
        const updated = payload.new as RoomData
        setRoom(updated)
        await fetchPlayers(updated)

        // If game started, redirect to multiplayer game
        if (updated.status === 'playing') {
          navigate(`/mp-game/${roomId}`)
        }
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        setMessages(prev => [...prev, payload])
        setTimeout(() => chatRef.current?.scrollTo(0, 9999), 100)
      })
      .subscribe()

    channelRef.current = channel
  }

  const sendChat = async () => {
    if (!chatInput.trim() || !channelRef.current || !profile) return
    const msg = { from: `${profile.avatar} ${profile.username}`, text: chatInput.trim(), ts: Date.now() }
    channelRef.current.send({ type: 'broadcast', event: 'chat', payload: msg })
    setMessages(prev => [...prev, msg])
    setChatInput('')
    setTimeout(() => chatRef.current?.scrollTo(0, 9999), 100)
  }

  const startGame = async () => {
    if (!room || !guest) return
    setStarting(true)
    await supabase
      .from('game_rooms')
      .update({ status: 'playing' })
      .eq('id', room.id)
    // Realtime update will trigger navigation for both players
  }

  const leaveRoom = async () => {
    if (!room || !profile) return
    if (profile.id === room.host_id) {
      await supabase.from('game_rooms').update({ status: 'cancelled' }).eq('id', room.id)
    } else {
      await supabase.from('game_rooms').update({ guest_id: null }).eq('id', room.id)
    }
    navigate('/lobby')
  }

  if (!profile) return null

  const isHost = profile.id === room?.host_id
  const canStart = isHost && !!guest && room?.status === 'waiting'

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: '20px 24px',
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontFamily: "'Montserrat', sans-serif" }}>
      ⏳ Łączenie z pokojem...
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontFamily: "'Montserrat', sans-serif', gap: 16" }}>
      <div style={{ fontSize: '2rem' }}>⚠️</div>
      <div>{error}</div>
      <button onClick={() => navigate('/lobby')} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>← Wróć do lobby</button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        input:focus { border-color: rgba(212,175,55,0.5) !important; }
        .btn { cursor:pointer; transition:all 0.2s; }
        .btn:hover:not(:disabled) { transform:translateY(-1px); }
        .btn:disabled { opacity:0.4; cursor:not-allowed; }
      `}</style>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0a0a0a',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1rem' }}>← Opuść</button>
        </div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 5, color: '#D4AF37' }}>
          POKÓJ #{room?.code}
        </div>
        <div style={{ width: 80 }} />
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 'clamp(16px, 4vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Code share */}
        {isHost && (
          <div style={{ ...card, textAlign: 'center', borderColor: 'rgba(212,175,55,0.2)' }}>
            <div style={{ fontSize: '0.7rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>KOD POKOJU — WYŚLIJ ZNAJOMEMU</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '3rem', letterSpacing: 20, color: '#D4AF37' }}>{room?.code}</div>
            <button className="btn" onClick={() => navigator.clipboard.writeText(room?.code ?? '')} style={{
              marginTop: 8, padding: '6px 16px', borderRadius: 8,
              border: '1px solid rgba(212,175,55,0.3)', background: 'transparent',
              color: '#D4AF37', fontSize: '0.75rem', cursor: 'pointer',
            }}>📋 Kopiuj kod</button>
          </div>
        )}

        {/* Players */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
          {/* Host */}
          <div style={{ ...card, textAlign: 'center', borderColor: 'rgba(212,175,55,0.2)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>{host?.avatar ?? '?'}</div>
            <div style={{ fontWeight: 700 }}>{host?.username ?? '...'}</div>
            <div style={{ fontSize: '0.7rem', color: '#D4AF37', letterSpacing: 1, marginTop: 2 }}>HOST</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>🏆 {host?.wins ?? 0} W</div>
          </div>

          {/* VS */}
          <div style={{ textAlign: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.8rem', color: 'rgba(255,255,255,0.3)', letterSpacing: 4 }}>VS</div>

          {/* Guest */}
          <div style={{ ...card, textAlign: 'center', borderColor: guest ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)' }}>
            {guest ? (
              <>
                <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>{guest.avatar}</div>
                <div style={{ fontWeight: 700 }}>{guest.username}</div>
                <div style={{ fontSize: '0.7rem', color: '#4ade80', letterSpacing: 1, marginTop: 2 }}>GOŚĆ ✓</div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>🏆 {guest.wins} W</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '2rem', marginBottom: 6, opacity: 0.3 }}>❓</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem' }}>Czekam na gracza...</div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 10 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', animation: `pulse ${0.8 + i*0.2}s infinite` }} />)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Game config (host only) */}
        {isHost && (
          <div style={card}>
            <div style={{ fontSize: '0.7rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>USTAWIENIA GRY</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', letterSpacing: 1, marginBottom: 6 }}>LICZBA RUND</label>
                <select
                  value={room?.config.rounds ?? 5}
                  onChange={async e => {
                    const rounds = Number(e.target.value)
                    await supabase.from('game_rooms').update({ config: { ...room!.config, rounds } }).eq('id', room!.id)
                    setRoom(r => r ? { ...r, config: { ...r.config, rounds } } : r)
                  }}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: '0.88rem', width: '100%', outline: 'none' }}
                >
                  {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} rund</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', letterSpacing: 1, marginBottom: 6 }}>CZAS NA DUEL</label>
                <select
                  value={room?.config.duel_time ?? 45}
                  onChange={async e => {
                    const duel_time = Number(e.target.value)
                    await supabase.from('game_rooms').update({ config: { ...room!.config, duel_time } }).eq('id', room!.id)
                    setRoom(r => r ? { ...r, config: { ...r.config, duel_time } } : r)
                  }}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: '0.88rem', width: '100%', outline: 'none' }}
                >
                  {[30, 45, 60, 90].map(n => <option key={n} value={n}>{n} sek</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Chat */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column', height: 200 }}>
          <div style={{ fontSize: '0.7rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>CZAT</div>
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10, paddingRight: 4 }}>
            {messages.length === 0 && <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.78rem', textAlign: 'center', marginTop: 20 }}>Napisz wiadomość...</div>}
            {messages.map((m, i) => (
              <div key={i} style={{ fontSize: '0.82rem' }}>
                <span style={{ color: '#D4AF37', fontWeight: 600 }}>{m.from}: </span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{m.text}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Wpisz wiadomość..."
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: '0.82rem', outline: 'none' }}
            />
            <button className="btn" onClick={sendChat} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'rgba(212,175,55,0.2)', color: '#D4AF37', cursor: 'pointer' }}>→</button>
          </div>
        </div>

        {/* Start button */}
        <button
          className="btn"
          onClick={startGame}
          disabled={!canStart || starting}
          style={{
            width: '100%', padding: '16px', borderRadius: 12, border: 'none',
            background: canStart ? 'linear-gradient(135deg, #D4AF37, #A0832A)' : 'rgba(255,255,255,0.05)',
            color: canStart ? '#000' : 'rgba(255,255,255,0.2)',
            fontWeight: 800, fontSize: '1rem', letterSpacing: 3,
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          {!isHost ? '⏳ Czekam na hosta...' :
           !guest ? '⏳ Czekam na gracza...' :
           starting ? '🚀 Startowanie...' : '🚀 ROZPOCZNIJ GRĘ'}
        </button>
      </div>
    </div>
  )
}
