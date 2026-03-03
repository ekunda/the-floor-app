// src/pages/Matchmaking.tsx
// Niezawodny matchmaking: Realtime + polling jako fallback

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/useAuthStore'

type MatchState = 'idle' | 'searching' | 'found' | 'error'

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function Matchmaking() {
  const navigate = useNavigate()
  const { profile } = useAuthStore()

  const [state, setState]           = useState<MatchState>('idle')
  const [searchSec, setSearchSec]   = useState(0)
  const [opponentName, setOppName]  = useState('')
  const [opponentAvatar, setOppAvatar] = useState('')
  const [errorMsg, setErrorMsg]     = useState('')

  const matchedRef    = useRef(false)
  const inQueueRef    = useRef(false)
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef    = useRef<any>(null)

  useEffect(() => {
    return () => { stopAll() }
  }, [])

  // ── Pełne zatrzymanie / cleanup ──────────────────────────────
  const stopAll = async () => {
    if (timerRef.current)  clearInterval(timerRef.current)
    if (pollRef.current)   clearInterval(pollRef.current)
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (inQueueRef.current && profile) {
      await supabase.from('matchmaking_queue').delete().eq('player_id', profile.id)
      inQueueRef.current = false
    }
  }

  // ── Pokaż ekran "znaleziono" i przejdź do gry ────────────────
  const onMatchFound = async (roomId: string, opponentId: string) => {
    if (matchedRef.current) return
    matchedRef.current = true

    // Pokaż dane przeciwnika
    const { data: opp } = await supabase
      .from('profiles').select('username, avatar').eq('id', opponentId).single()
    if (opp) { setOppName(opp.username); setOppAvatar(opp.avatar) }

    setState('found')
    if (timerRef.current)  clearInterval(timerRef.current)
    if (pollRef.current)   clearInterval(pollRef.current)
    if (channelRef.current) { await supabase.removeChannel(channelRef.current); channelRef.current = null }

    setTimeout(() => navigate(`/mp-game/${roomId}`), 2200)
  }

  // ── Start szukania ───────────────────────────────────────────
  const startSearch = async () => {
    if (!profile) return
    matchedRef.current = false
    setErrorMsg('')
    setState('searching')
    setSearchSec(0)

    timerRef.current = setInterval(() => setSearchSec(s => s + 1), 1000)

    // Wyczyść ewentualny stary wpis
    await supabase.from('matchmaking_queue').delete().eq('player_id', profile.id)

    // Sprawdź czy ktoś już czeka
    const { data: existing } = await supabase
      .from('matchmaking_queue')
      .select('player_id')
      .neq('player_id', profile.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (existing && !matchedRef.current) {
      // Ktoś czeka — JA jestem gościem.
      // Wejdź do kolejki, a następnie czekaj aż host stworzy pokój i nas w nim umieści.
      await joinQueueAsGuest(profile.id, existing.player_id)
      return
    }

    // Nikt nie czeka — wejdź do kolejki jako potencjalny HOST
    const { error: insertErr } = await supabase.from('matchmaking_queue').insert({
      player_id: profile.id,
      elo: profile.xp ?? 0,
    })
    if (insertErr) {
      setState('error')
      setErrorMsg('Nie udało się dołączyć do kolejki. Sprawdź połączenie.')
      return
    }
    inQueueRef.current = true

    // Nasłuchuj nowych wpisów w kolejce (Realtime)
    const ch = supabase
      .channel(`mm_host_${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matchmaking_queue' },
        async (payload) => {
          const newEntry = payload.new as { player_id: string }
          if (newEntry.player_id === profile.id) return
          if (matchedRef.current) return
          await hostCreateRoom(profile.id, newEntry.player_id)
        }
      )
      .subscribe()
    channelRef.current = ch

    // Polling jako fallback (co 3s) — szuka nowych graczy w kolejce
    pollRef.current = setInterval(async () => {
      if (matchedRef.current) return
      const { data: found } = await supabase
        .from('matchmaking_queue')
        .select('player_id')
        .neq('player_id', profile.id)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (found && !matchedRef.current) {
        await hostCreateRoom(profile.id, found.player_id)
      }
    }, 3000)
  }

  // Gość — wchodzi do kolejki i czeka na pokój stworzony przez hosta
  const joinQueueAsGuest = async (myId: string, hostId: string) => {
    await supabase.from('matchmaking_queue').insert({ player_id: myId, elo: profile?.xp ?? 0 })
    inQueueRef.current = true

    // Polling co 2s — szuka pokoju gdzie guest_id = mój ID
    pollRef.current = setInterval(async () => {
      if (matchedRef.current) return
      const { data: room } = await supabase
        .from('game_rooms')
        .select('id, host_id, guest_id')
        .eq('guest_id', myId)
        .eq('status', 'playing')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (room && !matchedRef.current) {
        inQueueRef.current = false
        await onMatchFound(room.id, room.host_id)
      }
    }, 2000)
  }

  // Host — tworzy pokój, wpisuje obu graczy
  const hostCreateRoom = async (hostId: string, guestId: string) => {
    if (matchedRef.current) return
    matchedRef.current = true // zabezpieczenie race condition

    // Usuń obu z kolejki
    await supabase.from('matchmaking_queue').delete().in('player_id', [hostId, guestId])
    inQueueRef.current = false

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
      .select('id, host_id, guest_id')
      .single()

    if (roomErr || !room) {
      matchedRef.current = false
      setState('error')
      setErrorMsg('Błąd tworzenia gry. Spróbuj ponownie.')
      return
    }

    await onMatchFound(room.id, guestId)
  }

  // ── Anuluj szukanie ──────────────────────────────────────────
  const handleCancel = async () => {
    await stopAll()
    matchedRef.current = false
    setState('idle')
    setSearchSec(0)
  }

  if (!profile) return null

  const dots = '.'.repeat((searchSec % 3) + 1)
  const fmt  = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pulse-ring { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.15);opacity:1} }
        @keyframes slide-in   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin        { to { transform: rotate(360deg); } }
        .pulse-ring { animation: pulse-ring 1.5s ease-in-out infinite; }
        .slide-in   { animation: slide-in 0.4s ease; }
        .spin       { display: inline-block; animation: spin 1.2s linear infinite; }
        .btn { cursor:pointer; transition:all 0.2s; border:none; font-family:'Montserrat',sans-serif; }
        .btn:hover  { transform:translateY(-2px); opacity:0.9; }
      `}</style>

      {/* Topbar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'#0a0a0a' }}>
        <button onClick={() => { handleCancel(); navigate('/lobby') }}
          style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'1.1rem' }}>←</button>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1rem', letterSpacing:5, color:'#D4AF37' }}>MATCHMAKING</span>
      </div>

      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ width:'100%', maxWidth:480, textAlign:'center' }}>

          {/* IDLE */}
          {state === 'idle' && (
            <div className="slide-in">
              <div style={{ fontSize:'4rem', marginBottom:16 }}>⚔️</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'2rem', letterSpacing:8, color:'#D4AF37', marginBottom:8 }}>SZUKAJ PRZECIWNIKA</div>
              <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.83rem', marginBottom:32, lineHeight:1.7 }}>
                System automatycznie dobierze Ci przeciwnika.<br/>Gra planszowa 1vs1 w czasie rzeczywistym.
              </div>
              <div style={{ background:'rgba(212,175,55,0.06)', border:'1px solid rgba(212,175,55,0.2)', borderRadius:16, padding:'20px 24px', marginBottom:28, display:'inline-flex', alignItems:'center', gap:16 }}>
                <div style={{ fontSize:'2.5rem' }}>{profile.avatar}</div>
                <div style={{ textAlign:'left' }}>
                  <div style={{ fontWeight:800, fontSize:'1.05rem' }}>{profile.username}</div>
                  <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.78rem' }}>{profile.xp} XP • {profile.wins}W / {profile.losses}L</div>
                </div>
              </div>
              <button className="btn" onClick={startSearch} style={{ width:'100%', padding:'16px', borderRadius:12, background:'linear-gradient(135deg,#D4AF37,#A0832A)', color:'#000', fontWeight:800, fontSize:'1rem', letterSpacing:3 }}>
                🔍 SZUKAJ GRY
              </button>
              <div style={{ marginTop:14 }}>
                <button onClick={() => navigate('/lobby')} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:'0.78rem' }}>
                  Lub zagraj prywatnie z kodem →
                </button>
              </div>
            </div>
          )}

          {/* SEARCHING */}
          {state === 'searching' && (
            <div className="slide-in">
              <div style={{ position:'relative', width:160, height:160, margin:'0 auto 32px' }}>
                {[1, 0.7, 0.4].map((o, i) => (
                  <div key={i} className="pulse-ring" style={{ position:'absolute', inset:i*20, borderRadius:'50%', border:`2px solid rgba(212,175,55,${o})`, animationDelay:`${i*0.3}s` }} />
                ))}
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.5rem' }}>{profile.avatar}</div>
              </div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.6rem', letterSpacing:6, color:'#D4AF37', marginBottom:8 }}>SZUKAM{dots}</div>
              <div style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.85rem', marginBottom:4 }}>Czas: {fmt(searchSec)}</div>
              <div style={{ color:'rgba(255,255,255,0.2)', fontSize:'0.75rem', marginBottom:32 }}>Realtime + polling co 3 sekundy</div>
              <button className="btn" onClick={handleCancel} style={{ padding:'11px 28px', borderRadius:10, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'rgba(255,255,255,0.5)', fontWeight:600, fontSize:'0.82rem' }}>
                ✕ Anuluj
              </button>
            </div>
          )}

          {/* FOUND */}
          {state === 'found' && (
            <div className="slide-in">
              <div style={{ fontSize:'1.5rem', color:'#4ade80', letterSpacing:2, marginBottom:24, fontWeight:800 }}>✅ ZNALEZIONO PRZECIWNIKA!</div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:24, marginBottom:32 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'3rem', marginBottom:8 }}>{profile.avatar}</div>
                  <div style={{ fontWeight:700 }}>{profile.username}</div>
                  <div style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.35)' }}>{profile.xp} XP</div>
                </div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'2.5rem', color:'rgba(255,255,255,0.2)', letterSpacing:4 }}>VS</div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:'3rem', marginBottom:8 }}>{opponentAvatar || '🎮'}</div>
                  <div style={{ fontWeight:700, color:'#D4AF37' }}>{opponentName || '...'}</div>
                </div>
              </div>
              <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.83rem' }}>Przygotowuję grę <span className="spin">⚙️</span></div>
              <div style={{ color:'rgba(255,255,255,0.2)', fontSize:'0.75rem', marginTop:8 }}>Za chwilę nastąpi przekierowanie...</div>
            </div>
          )}

          {/* ERROR */}
          {state === 'error' && (
            <div className="slide-in">
              <div style={{ fontSize:'3rem', marginBottom:16 }}>⚠️</div>
              <div style={{ color:'#f87171', marginBottom:20, fontSize:'0.88rem' }}>{errorMsg}</div>
              <button className="btn" onClick={() => setState('idle')} style={{ padding:'11px 24px', borderRadius:10, background:'rgba(239,68,68,0.15)', color:'#f87171', fontWeight:600 }}>
                Spróbuj ponownie
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
