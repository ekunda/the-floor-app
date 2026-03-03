// src/pages/Matchmaking.tsx
// Automatyczny matchmaking — system dobiera graczy z kolejki

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

type State = 'idle' | 'searching' | 'found' | 'error'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Matchmaking() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()
  const [state, setState] = useState<State>('idle')
  const [searchSec, setSearchSec] = useState(0)
  const [opponentName, setOpponentName] = useState('')
  const [opponentAvatar, setOpponentAvatar] = useState('')
  const [error, setError] = useState('')
  const channelRef = useRef<any>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inQueueRef = useRef(false)
  const matchedRef = useRef(false)

  useEffect(() => {
    if (!profile) navigate('/login')
    return () => cancelSearch()
  }, [])

  const startSearch = async () => {
    if (!profile) return
    setState('searching')
    setSearchSec(0)
    matchedRef.current = false

    // Timer odliczający czas szukania
    searchTimerRef.current = setInterval(() => setSearchSec(s => s + 1), 1000)

    // Wyczyść ewentualnie stary wpis w kolejce
    await supabase.from('matchmaking_queue').delete().eq('player_id', profile.id)

    // Sprawdź czy ktoś już czeka w kolejce (nie ja)
    const { data: waiting } = await supabase
      .from('matchmaking_queue')
      .select('player_id')
      .neq('player_id', profile.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .single()

    if (waiting && !matchedRef.current) {
      // Znaleziono czekającego gracza — ja jestem "gościem"
      await createMatch(waiting.player_id, profile.id)
      return
    }

    // Nie ma nikogo — wejdź do kolejki i czekaj
    await supabase.from('matchmaking_queue').insert({
      player_id: profile.id,
      elo: profile.xp,
    })
    inQueueRef.current = true

    // Subskrybuj zmiany kolejki — kiedy ktoś wejdzie, będę hostem
    const channel = supabase
      .channel(`matchmaking:${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'matchmaking_queue',
      }, async (payload) => {
        const newPlayer = payload.new as { player_id: string }
        if (newPlayer.player_id === profile.id) return  // to ja
        if (matchedRef.current) return
        // Ktoś wszedł do kolejki — ja byłem pierwszy, więc jestem hostem
        await createMatch(profile.id, newPlayer.player_id)
      })
      .subscribe()

    channelRef.current = channel
  }

  const createMatch = async (hostId: string, guestId: string) => {
    if (matchedRef.current) return
    matchedRef.current = true

    // Pobierz profil przeciwnika dla UI
    const opponentId = hostId === profile!.id ? guestId : hostId
    const { data: opp } = await supabase
      .from('profiles')
      .select('username, avatar')
      .eq('id', opponentId)
      .single()

    if (opp) {
      setOpponentName(opp.username)
      setOpponentAvatar(opp.avatar)
    }
    setState('found')

    if (searchTimerRef.current) clearInterval(searchTimerRef.current)

    // Usuń obu z kolejki
    await supabase.from('matchmaking_queue').delete().in('player_id', [hostId, guestId])
    inQueueRef.current = false

    // Tylko HOST tworzy pokój
    if (hostId === profile!.id) {
      const code = generateCode()
      const { data: room, error: roomErr } = await supabase
        .from('game_rooms')
        .insert({
          host_id: hostId,
          guest_id: guestId,
          code,
          status: 'playing',
          config: { rounds: 5, duel_time: 45, board_shape: 0 },
        })
        .select()
        .single()

      if (roomErr || !room) {
        setState('error')
        setError('Błąd tworzenia gry. Spróbuj ponownie.')
        return
      }

      // Broadcast ID pokoju przez dedykowany kanał dla obu graczy
      const matchChannel = supabase.channel(`match:${hostId}:${guestId}`)
      await matchChannel.subscribe()
      await matchChannel.send({
        type: 'broadcast',
        event: 'match_ready',
        payload: { room_id: room.id },
      })

      // Czekaj chwilę i przejdź do gry
      setTimeout(() => navigate(`/mp-game/${room.id}`), 2000)
    } else {
      // GUEST czeka na sygnał od hosta
      const matchChannel = supabase
        .channel(`match:${hostId}:${guestId}`)
        .on('broadcast', { event: 'match_ready' }, ({ payload }) => {
          setTimeout(() => navigate(`/mp-game/${payload.room_id}`), 2000)
        })
        .subscribe()

      channelRef.current = matchChannel
    }
  }

  const cancelSearch = async () => {
    if (inQueueRef.current && profile) {
      await supabase.from('matchmaking_queue').delete().eq('player_id', profile.id)
      inQueueRef.current = false
    }
    if (channelRef.current) channelRef.current.unsubscribe()
    if (timerRef.current) clearInterval(timerRef.current)
    if (searchTimerRef.current) clearInterval(searchTimerRef.current)
  }

  const handleCancel = async () => {
    await cancelSearch()
    setState('idle')
    setSearchSec(0)
  }

  if (!profile) return null

  const dots = '.'.repeat((searchSec % 3) + 1)
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{
      minHeight: '100vh', background: '#080808', color: '#fff',
      fontFamily: "'Montserrat', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-ring { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.15);opacity:1} }
        @keyframes slide-in { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .spin { animation: spin 1.2s linear infinite; }
        .pulse-ring { animation: pulse-ring 1.5s ease-in-out infinite; }
        .slide-in { animation: slide-in 0.4s ease; }
        .btn { cursor:pointer; transition:all 0.2s; }
        .btn:hover { transform:translateY(-2px); opacity:0.9; }
      `}</style>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0a0a0a',
      }}>
        <button onClick={() => { handleCancel(); navigate('/lobby') }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '1rem' }}>←</button>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 5, color: '#D4AF37' }}>MATCHMAKING</span>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>

          {/* ── IDLE ── */}
          {state === 'idle' && (
            <div className="slide-in">
              <div style={{ fontSize: '4rem', marginBottom: 16 }}>⚔️</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', letterSpacing: 8, color: '#D4AF37', marginBottom: 8 }}>SZUKAJ PRZECIWNIKA</div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.83rem', marginBottom: 32, lineHeight: 1.7 }}>
                System automatycznie dobierze Ci przeciwnika.<br />
                Gra planszowa 1vs1 — pełna plansza w czasie rzeczywistym.
              </div>

              {/* Player card */}
              <div style={{
                background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)',
                borderRadius: 16, padding: '20px 24px', marginBottom: 28, display: 'inline-flex',
                alignItems: 'center', gap: 16,
              }}>
                <div style={{ fontSize: '2.5rem' }}>{profile.avatar}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{profile.username}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem' }}>{profile.xp} XP • {profile.wins}W / {profile.losses}L</div>
                </div>
              </div>

              <div>
                <button className="btn" onClick={startSearch} style={{
                  width: '100%', padding: '16px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #D4AF37, #A0832A)',
                  color: '#000', fontWeight: 800, fontSize: '1rem', letterSpacing: 3,
                  fontFamily: "'Montserrat', sans-serif",
                }}>🔍 SZUKAJ GRY</button>
              </div>

              <div style={{ marginTop: 16 }}>
                <button onClick={() => navigate('/lobby')} style={{
                  background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
                  cursor: 'pointer', fontSize: '0.78rem',
                }}>Lub dołącz kodem → /lobby</button>
              </div>
            </div>
          )}

          {/* ── SEARCHING ── */}
          {state === 'searching' && (
            <div className="slide-in">
              {/* Animated radar */}
              <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto 32px' }}>
                {[1, 0.7, 0.4].map((opacity, i) => (
                  <div key={i} className="pulse-ring" style={{
                    position: 'absolute', inset: i * 20,
                    borderRadius: '50%', border: `2px solid rgba(212,175,55,${opacity})`,
                    animationDelay: `${i * 0.3}s`,
                  }} />
                ))}
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.5rem',
                }}>{profile.avatar}</div>
              </div>

              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.6rem', letterSpacing: 6, color: '#D4AF37', marginBottom: 8 }}>
                SZUKAM{dots}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', marginBottom: 4 }}>
                Czas oczekiwania: {formatTime(searchSec)}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', marginBottom: 32 }}>
                Łączę graczy online w czasie rzeczywistym
              </div>

              <button className="btn" onClick={handleCancel} style={{
                padding: '11px 28px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent', color: 'rgba(255,255,255,0.5)',
                fontWeight: 600, fontSize: '0.82rem', letterSpacing: 1,
                fontFamily: "'Montserrat', sans-serif",
              }}>✕ Anuluj</button>
            </div>
          )}

          {/* ── FOUND ── */}
          {state === 'found' && (
            <div className="slide-in">
              <div style={{ fontSize: '1.5rem', color: '#4ade80', letterSpacing: 2, marginBottom: 24, fontWeight: 800 }}>
                ✅ ZNALEZIONO PRZECIWNIKA!
              </div>

              {/* Players vs */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 32 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 8 }}>{profile.avatar}</div>
                  <div style={{ fontWeight: 700 }}>{profile.username}</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)' }}>{profile.xp} XP</div>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.5rem', color: 'rgba(255,255,255,0.2)', letterSpacing: 4 }}>VS</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 8 }}>{opponentAvatar || '?'}</div>
                  <div style={{ fontWeight: 700, color: '#D4AF37' }}>{opponentName || '...'}</div>
                </div>
              </div>

              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.83rem', marginBottom: 16 }}>
                Przygotowuję grę<span className="spin" style={{ display: 'inline-block', marginLeft: 8 }}>⚙️</span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>Zaraz nastąpi przekierowanie...</div>
            </div>
          )}

          {/* ── ERROR ── */}
          {state === 'error' && (
            <div className="slide-in">
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠️</div>
              <div style={{ color: '#f87171', marginBottom: 20 }}>{error}</div>
              <button className="btn" onClick={() => setState('idle')} style={{
                padding: '11px 24px', borderRadius: 10, border: 'none',
                background: 'rgba(239,68,68,0.15)', color: '#f87171',
                cursor: 'pointer', fontWeight: 600,
              }}>Spróbuj ponownie</button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
