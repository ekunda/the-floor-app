// src/pages/Room.tsx — naprawiony
// Kluczowe zmiany:
//   - Usunięto "auto-join" z Room (to jest zadanie Lobby)
//   - Rola (host/gość) jest określana tylko z danych DB, nie z lokalnej logiki
//   - Polling co 2s jako niezawodny fallback
//   - Unikalny kanał Realtime zapobiega cache'owaniu

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

interface RoomData {
  id: string; code: string
  host_id: string; guest_id: string | null
  status: string
  config: { rounds: number; duel_time: number; board_shape: number }
}

interface PlayerInfo {
  id: string; username: string; avatar: string; xp: number; wins: number
}

export default function Room() {
  const { code }    = useParams<{ code: string }>()
  const navigate    = useNavigate()
  const { profile } = useAuthStore()

  const [room, setRoom]         = useState<RoomData | null>(null)
  const [host, setHost]         = useState<PlayerInfo | null>(null)
  const [guest, setGuest]       = useState<PlayerInfo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError]       = useState('')
  const [copied, setCopied]     = useState(false)

  const [messages, setMessages]   = useState<{ from: string; text: string; ts: number }[]>([])
  const [chatInput, setChatInput] = useState('')
  const chatRef    = useRef<HTMLDivElement>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const roomIdRef  = useRef<string>('')   // stable ref, nie zmienia się
  const roomRef    = useRef<RoomData | null>(null)

  useEffect(() => {
    if (!profile) { navigate('/login'); return }
    load()
    return () => cleanup()
  }, [])

  // ── Cleanup ──────────────────────────────────────────────────
  const cleanup = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }

  // ── Załaduj pokój i zweryfikuj dostęp ────────────────────────
  const load = async () => {
    if (!profile) return

    const { data, error: err } = await supabase
      .from('game_rooms')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (err || !data) {
      setError('Pokój nie istnieje lub wygasł.')
      setLoading(false)
      return
    }

    const r = data as RoomData

    // Sprawdź czy użytkownik ma dostęp do pokoju
    if (r.host_id !== profile.id && r.guest_id !== profile.id) {
      // Nie jesteś ani hostem ani gościem — odmów dostępu
      // (dołączanie powinno nastąpić przez Lobby, nie bezpośrednio przez URL)
      setError('Nie masz dostępu do tego pokoju. Wejdź przez Lobby.')
      setLoading(false)
      return
    }

    roomIdRef.current = r.id
    applyRoom(r)
    setLoading(false)

    // Subskrybuj Realtime
    subscribeRealtime(r.id)

    // Polling co 2s jako fallback
    pollRef.current = setInterval(() => pollRoom(r.id), 2000)
  }

  // ── Aplikuj nowy stan pokoju ──────────────────────────────────
  const applyRoom = (r: RoomData) => {
    const prev = roomRef.current
    roomRef.current = r
    setRoom(r)

    // Odśwież graczy tylko gdy zmienił się guest_id
    if (!prev || prev.guest_id !== r.guest_id) {
      loadPlayers(r)
    }

    // Gra startuje — przejdź do MultiplayerGame
    if (r.status === 'playing') {
      cleanup()
      navigate(`/mp-game/${r.id}`)
    }
  }

  // ── Polling: sprawdź aktualizacje DB ────────────────────────
  const pollRoom = async (roomId: string) => {
    const { data } = await supabase
      .from('game_rooms').select('*').eq('id', roomId).maybeSingle()
    if (!data) return

    const r = data as RoomData
    const prev = roomRef.current

    // Aktualizuj tylko jeśli coś się zmieniło
    if (
      r.guest_id !== prev?.guest_id ||
      r.status   !== prev?.status   ||
      JSON.stringify(r.config) !== JSON.stringify(prev?.config)
    ) {
      applyRoom(r)
    }
  }

  // ── Realtime: nasłuchuj UPDATE na game_rooms ─────────────────
  const subscribeRealtime = (roomId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    // Unikalny klucz kanału — zapobiega cache'owaniu przez Supabase SDK
    const channelKey = `room_${roomId}_${Date.now()}`

    const ch = supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_rooms' },
        (payload) => {
          const updated = payload.new as RoomData
          if (updated.id !== roomId) return  // filtruj w JS bo Supabase free tier nie obsługuje filtrów
          applyRoom(updated)
        }
      )
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        setMessages(prev => [...prev, payload])
        setTimeout(() => chatRef.current?.scrollTo(0, 99999), 80)
      })
      .subscribe((status, err) => {
        if (err) console.warn('[Room] Realtime błąd:', err)
      })

    channelRef.current = ch
  }

  // ── Załaduj profile graczy ───────────────────────────────────
  const loadPlayers = async (r: RoomData) => {
    const { data: h } = await supabase
      .from('profiles').select('id,username,avatar,xp,wins').eq('id', r.host_id).single()
    if (h) setHost(h as PlayerInfo)

    if (r.guest_id) {
      const { data: g } = await supabase
        .from('profiles').select('id,username,avatar,xp,wins').eq('id', r.guest_id).single()
      if (g) setGuest(g as PlayerInfo)
    } else {
      setGuest(null)
    }
  }

  // ── Czat ─────────────────────────────────────────────────────
  const sendChat = () => {
    if (!chatInput.trim() || !channelRef.current || !profile) return
    const msg = {
      from: `${profile.avatar} ${profile.username}`,
      text: chatInput.trim(),
      ts: Date.now()
    }
    channelRef.current.send({ type: 'broadcast', event: 'chat', payload: msg })
    setMessages(prev => [...prev, msg])
    setChatInput('')
    setTimeout(() => chatRef.current?.scrollTo(0, 99999), 80)
  }

  // ── Start gry (tylko host) ───────────────────────────────────
  const startGame = async () => {
    if (!room || !guest || starting || !profile) return
    if (profile.id !== room.host_id) return  // dodatkowe zabezpieczenie

    setStarting(true)
    const { error: e } = await supabase
      .from('game_rooms')
      .update({ status: 'playing' })
      .eq('id', room.id)

    if (e) {
      setStarting(false)
      setError('Błąd startu gry: ' + e.message)
      return
    }

    // Host nawiguje od razu
    cleanup()
    navigate(`/mp-game/${room.id}`)
  }

  // ── Opuść pokój ──────────────────────────────────────────────
  const leaveRoom = async () => {
    cleanup()
    if (room && profile) {
      if (profile.id === room.host_id) {
        await supabase.from('game_rooms')
          .update({ status: 'cancelled' }).eq('id', room.id)
      } else {
        await supabase.from('game_rooms')
          .update({ guest_id: null }).eq('id', room.id)
      }
    }
    navigate('/lobby')
  }

  // ── Aktualizacja konfigu ─────────────────────────────────────
  const updateConfig = async (key: string, value: number) => {
    if (!room) return
    const newConfig = { ...room.config, [key]: value }
    await supabase.from('game_rooms')
      .update({ config: newConfig }).eq('id', room.id)
    const updated = { ...room, config: newConfig as any }
    roomRef.current = updated
    setRoom(updated)
  }

  const copyCode = () => {
    navigator.clipboard.writeText(room?.code ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!profile) return null

  // Rola gracza — oparta wyłącznie na danych z DB
  const isHost   = !!room && profile.id === room.host_id
  const canStart = isHost && !!guest && room?.status === 'waiting' && !starting

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: '20px 24px',
  }

  // ── LOADING ──────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ fontSize: '2rem' }}>⏳</div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', letterSpacing: 2 }}>Łączenie z pokojem...</div>
    </div>
  )

  // ── ERROR ────────────────────────────────────────────────────
  if (error) return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ fontSize: '2.5rem' }}>⚠️</div>
      <div style={{ color: '#f87171', fontSize: '0.88rem', textAlign: 'center', maxWidth: 320 }}>{error}</div>
      <button onClick={() => navigate('/lobby')} style={{ padding: '10px 22px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '0.82rem', fontFamily: "'Montserrat', sans-serif" }}>
        ← Wróć do lobby
      </button>
    </div>
  )

  // ── MAIN UI ──────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif" }}>
      <style>{`
        select { color: #fff !important; }
        select option { background: #1a1a1a; color: #fff; }
        input { color: #fff; }
        input:focus { border-color: rgba(212,175,55,0.5) !important; outline: none; }
        .btn { cursor: pointer; transition: all 0.2s; }
        .btn:hover:not(:disabled) { transform: translateY(-1px); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        @keyframes blink { 0%,80%,100%{opacity:0.2;transform:scale(0.8)} 40%{opacity:1;transform:scale(1)} }
      `}</style>

      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0a0a0a' }}>
        <button onClick={leaveRoom} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '0.82rem', letterSpacing: 1, fontFamily: "'Montserrat', sans-serif" }}>
          ← Opuść
        </button>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 5, color: '#D4AF37' }}>
          POKÓJ #{room?.code}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)' }}>
          {isHost ? '👑 HOST' : '🎮 GOŚĆ'}
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: 'clamp(14px, 4vw, 28px)', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Kod pokoju — tylko HOST */}
        {isHost && (
          <div style={{ ...card, textAlign: 'center', borderColor: 'rgba(212,175,55,0.2)' }}>
            <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
              KOD POKOJU — WYŚLIJ ZNAJOMEMU
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(2rem, 8vw, 3.5rem)', letterSpacing: 18, color: '#D4AF37', marginBottom: 10 }}>
              {room?.code}
            </div>
            <button className="btn" onClick={copyCode} style={{ padding: '7px 20px', borderRadius: 8, border: '1px solid rgba(212,175,55,0.3)', background: 'transparent', color: copied ? '#4ade80' : '#D4AF37', fontSize: '0.75rem', cursor: 'pointer', fontFamily: "'Montserrat', sans-serif" }}>
              {copied ? '✅ Skopiowano!' : '📋 Kopiuj kod'}
            </button>
          </div>
        )}

        {/* Info dla gościa */}
        {!isHost && (
          <div style={{ ...card, textAlign: 'center', borderColor: 'rgba(74,222,128,0.15)' }}>
            <div style={{ fontSize: '0.72rem', color: 'rgba(74,222,128,0.6)', letterSpacing: 2, marginBottom: 4 }}>✅ DOŁĄCZYŁEŚ DO POKOJU</div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)' }}>Czekaj aż host rozpocznie grę</div>
          </div>
        )}

        {/* Gracze */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
          {/* Host */}
          <div style={{ ...card, textAlign: 'center', borderColor: 'rgba(212,175,55,0.2)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>{host?.avatar ?? '?'}</div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{host?.username ?? '...'}</div>
            <div style={{ fontSize: '0.68rem', color: '#D4AF37', letterSpacing: 1, marginTop: 3 }}>👑 HOST</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>🏆 {host?.wins ?? 0} W · {host?.xp ?? 0} XP</div>
          </div>

          <div style={{ textAlign: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.6rem', color: 'rgba(255,255,255,0.2)', letterSpacing: 4 }}>VS</div>

          {/* Gość */}
          <div style={{ ...card, textAlign: 'center', borderColor: guest ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.06)' }}>
            {guest ? (
              <>
                <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>{guest.avatar}</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{guest.username}</div>
                <div style={{ fontSize: '0.68rem', color: '#4ade80', letterSpacing: 1, marginTop: 3 }}>🎮 GOŚĆ ✓</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>🏆 {guest.wins} W · {guest.xp} XP</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '2rem', opacity: 0.2, marginBottom: 8 }}>❓</div>
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', marginBottom: 10 }}>Czekam na gracza...</div>
                <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', animation: `blink 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Config — tylko HOST */}
        {isHost && (
          <div style={card}>
            <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>⚙️ USTAWIENIA GRY</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem', letterSpacing: 1, marginBottom: 6 }}>LICZBA RUND</label>
                <select value={room?.config.rounds ?? 5} onChange={e => updateConfig('rounds', Number(e.target.value))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 12px', fontSize: '0.88rem', width: '100%', outline: 'none' }}>
                  {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} rund</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.35)', fontSize: '0.68rem', letterSpacing: 1, marginBottom: 6 }}>CZAS NA DUEL</label>
                <select value={room?.config.duel_time ?? 45} onChange={e => updateConfig('duel_time', Number(e.target.value))}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '9px 12px', fontSize: '0.88rem', width: '100%', outline: 'none' }}>
                  {[30, 45, 60, 90].map(n => <option key={n} value={n}>{n} sek</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Czat */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>💬 CZAT</div>
          <div ref={chatRef} style={{ height: 130, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
            {messages.length === 0 && (
              <div style={{ color: 'rgba(255,255,255,0.15)', fontSize: '0.76rem', textAlign: 'center', marginTop: 28 }}>
                Napisz wiadomość...
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ fontSize: '0.82rem' }}>
                <span style={{ color: '#D4AF37', fontWeight: 600 }}>{m.from}: </span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{m.text}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Wpisz wiadomość..."
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', fontFamily: "'Montserrat', sans-serif" }} />
            <button className="btn" onClick={sendChat}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'rgba(212,175,55,0.18)', color: '#D4AF37', cursor: 'pointer', fontSize: '1.1rem' }}>→</button>
          </div>
        </div>

        {/* Przycisk start (tylko HOST) */}
        {isHost && (
          <button className="btn" onClick={startGame} disabled={!canStart}
            style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: canStart ? 'linear-gradient(135deg, #D4AF37, #A0832A)' : 'rgba(255,255,255,0.05)', color: canStart ? '#000' : 'rgba(255,255,255,0.2)', fontWeight: 800, fontSize: '1rem', letterSpacing: 3, fontFamily: "'Montserrat', sans-serif" }}>
            {!guest ? '⏳ Czekam na gracza...' : starting ? '🚀 Startowanie...' : '🚀 ROZPOCZNIJ GRĘ'}
          </button>
        )}

        {!isHost && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem', padding: '10px 0' }}>
            ⏳ Czekam aż host rozpocznie grę...
          </div>
        )}

      </div>
    </div>
  )
}
