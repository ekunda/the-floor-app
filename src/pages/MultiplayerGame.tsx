/**
 * MultiplayerGame — online 1v1 game page
 *
 * Identical visual structure to singleplayer:
 *  - Canvas board (same Board component look)
 *  - Full-screen duel overlay (same DuelModal look)
 *  - Speech recognition ON by default
 *  - Timer alternates between active player (same mechanic as local)
 *
 * Sync: Supabase Realtime broadcast via useMultiplayerStore
 *  - Host = gold (player 1), Guest = silver (player 2)
 *  - Host drives the board: cursor, challenge start, timer
 *  - Both players participate in the duel
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { isAnswerMatch, isPassCommand, isSpeechRecognitionSupported, useSpeechRecognition } from '../lib/useSpeechRecognition'
import { supabase } from '../lib/supabase'
import { useConfigStore } from '../store/useConfigStore'
import { useMultiplayerStore, FeedbackType } from '../store/useMultiplayerStore'
import { Tile, Category, Question, TileOwner } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────
const COLORS: Record<TileOwner, { bg: string; border: string; glow: string; text: string }> = {
  gold:    { bg: '#1a1200', border: '#FFD700', glow: 'rgba(255,215,0,0.15)',   text: '#FFD700' },
  silver:  { bg: '#0e0e0e', border: '#C0C0C0', glow: 'rgba(192,192,192,0.10)', text: '#C0C0C0' },
  neutral: { bg: '#0d0d0d', border: '#444444', glow: 'rgba(100,100,100,0.08)', text: '#888888' },
}

// ── Tiny canvas board (self-contained, reads from props) ──────────────────────
function MPBoard({
  tiles, cursor, categories, gridCols, gridRows,
  onCursorClick,
}: {
  tiles: Tile[]
  cursor: number
  categories: (Category & { questions: Question[] })[]
  gridCols: number
  gridRows: number
  onCursorClick?: (idx: number) => void
}) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pulseRef     = useRef(0)
  const rafRef       = useRef(0)
  const sizeRef      = useRef(120)

  const computeSize = useCallback(() => {
    if (!containerRef.current) return 120
    const rect = containerRef.current.getBoundingClientRect()
    const availW = rect.width  > 0 ? rect.width  : window.innerWidth  - 40
    const availH = rect.height > 0 ? rect.height : window.innerHeight - 220
    return Math.max(70, Math.min(Math.floor(availW / gridCols), Math.floor(availH / gridRows), 240))
  }, [gridCols, gridRows])

  useEffect(() => {
    const resize = () => {
      const s = computeSize()
      sizeRef.current = s
      const c = canvasRef.current
      if (!c) return
      c.width  = gridCols * s
      c.height = gridRows * s
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', resize)
    return () => { ro.disconnect(); window.removeEventListener('resize', resize) }
  }, [gridCols, gridRows, computeSize])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const draw = () => {
      const S = sizeRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const tile of tiles) {
        const px = tile.x * S
        const py = tile.y * S
        const p  = COLORS[tile.owner]

        ctx.fillStyle = p.bg
        ctx.fillRect(px, py, S, S)

        const rad = ctx.createRadialGradient(px+S/2, py+S/2, 0, px+S/2, py+S/2, S*0.7)
        rad.addColorStop(0, p.glow)
        rad.addColorStop(1, 'transparent')
        ctx.fillStyle = rad
        ctx.fillRect(px, py, S, S)

        const gr = ctx.createLinearGradient(px, py, px+S, py+S)
        gr.addColorStop(0, 'rgba(255,255,255,0.03)')
        gr.addColorStop(1, 'rgba(0,0,0,0.3)')
        ctx.fillStyle = gr
        ctx.fillRect(px, py, S, S)

        ctx.strokeStyle = p.border
        ctx.lineWidth = 2
        ctx.strokeRect(px+1.5, py+1.5, S-3, S-3)
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.lineWidth = 1
        ctx.strokeRect(px, py, S, S)

        const cat  = categories.find(c => c.id === tile.categoryId)
        const emoji = cat?.emoji && cat.emoji !== '🎯' ? cat.emoji : '🎯'
        const eSz  = Math.round(S * 0.38)
        ctx.font = `${Math.round(eSz * 0.78)}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(emoji, px + S/2, py + S/2 - S*0.08)

        const fsz = Math.max(9, Math.round(S * 0.095))
        ctx.font = `600 ${fsz}px Montserrat,sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.82)'
        const words = tile.categoryName.split(' ')
        const lines: string[] = []
        let cur = ''
        for (const w of words) {
          const t = cur ? `${cur} ${w}` : w
          if (ctx.measureText(t).width > S-14 && cur) { lines.push(cur); cur = w }
          else cur = t
        }
        if (cur) lines.push(cur)
        const lh = fsz + 2
        const sy = py + S*0.74 - ((lines.length-1)*lh)/2
        lines.forEach((l, i) => ctx.fillText(l, px+S/2, sy+i*lh))
      }

      // Cursor
      pulseRef.current = (pulseRef.current + 1) % 120
      const alpha = 0.5 + 0.45 * Math.sin(pulseRef.current * 0.0524)
      const cx = (cursor % gridCols) * S
      const cy = Math.floor(cursor / gridCols) * S
      ctx.shadowColor = `rgba(80,255,80,${(alpha*0.6).toFixed(2)})`
      ctx.shadowBlur = 12
      ctx.strokeStyle = `rgba(80,255,80,${alpha.toFixed(2)})`
      ctx.lineWidth = 3
      ctx.setLineDash([10, 5])
      ctx.strokeRect(cx+3, cy+3, S-6, S-6)
      ctx.setLineDash([])
      ctx.shadowBlur = 0
      ctx.shadowColor = 'transparent'

      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tiles, cursor, categories, gridCols, gridRows])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current
    if (!c || !onCursorClick) return
    const rect = c.getBoundingClientRect()
    const S = sizeRef.current
    const scaleX = c.width / rect.width
    const scaleY = c.height / rect.height
    const cx = Math.floor(((e.clientX - rect.left) * scaleX) / S)
    const cy = Math.floor(((e.clientY - rect.top)  * scaleY) / S)
    const idx = cy * gridCols + cx
    if (idx >= 0 && idx < gridCols * gridRows) onCursorClick(idx)
  }, [gridCols, gridRows, onCursorClick])

  return (
    <div ref={containerRef} style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          display: 'block',
          border: '3px solid rgba(212,175,55,0.5)',
          borderRadius: 12,
          boxShadow: '0 0 40px rgba(212,175,55,0.25), 0 0 80px rgba(212,175,55,0.08)',
          cursor: onCursorClick ? 'pointer' : 'default',
          maxWidth: '100%', maxHeight: '100%',
        }}
      />
    </div>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ tiles, hostName, guestName }: { tiles: Tile[]; hostName: string; guestName: string }) {
  const gold   = tiles.filter(t => t.owner === 'gold').length
  const silver = tiles.filter(t => t.owner === 'silver').length
  const total  = tiles.length || 1
  const gPct   = Math.round((gold / total) * 100)
  const sPct   = Math.round((silver / total) * 100)
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'0 4px', flexShrink:0 }}>
      <span style={{ color:'#FFD700', fontSize:'0.75rem', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2 }}>{hostName} {gPct}%</span>
      <div style={{ flex:1, height:6, borderRadius:3, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${gPct}%`, background:'linear-gradient(90deg,#FFD700,#f59e0b)', borderRadius:3, transition:'width 0.4s' }} />
      </div>
      <div style={{ flex:1, height:6, borderRadius:3, background:'rgba(255,255,255,0.08)', overflow:'hidden', direction:'rtl' as const }}>
        <div style={{ height:'100%', width:`${sPct}%`, background:'linear-gradient(90deg,#C0C0C0,#9ca3af)', borderRadius:3, transition:'width 0.4s' }} />
      </div>
      <span style={{ color:'#C0C0C0', fontSize:'0.75rem', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2 }}>{sPct}% {guestName}</span>
    </div>
  )
}

// ── Player panel in duel (read-only — no buttons) ───────────────────────────
function PlayerPanel({
  name, timer, active, color, borderSide, isYou,
}: {
  name: string; timer: number; active: boolean; color: string;
  borderSide: 'left' | 'right'; isYou: boolean;
}) {
  const timerColor = timer <= 5 ? '#ef4444' : timer <= 15 ? '#facc15' : '#ffffff'
  const timerGlow  = timer <= 5
    ? '0 0 30px rgba(239,68,68,0.7)'
    : timer <= 15 ? '0 0 20px rgba(250,204,21,0.5)' : 'none'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 'clamp(8px,2vh,20px)', padding: 'clamp(16px,3vh,40px) 12px',
      borderLeft:  borderSide==='left'  ? '1px solid rgba(255,255,255,0.08)' : 'none',
      borderRight: borderSide==='right' ? '1px solid rgba(255,255,255,0.08)' : 'none',
      background: active ? `${color}14` : 'transparent',
      opacity: active ? 1 : 0.4, transition: 'all 0.4s ease',
      minWidth: 'clamp(90px,15vw,160px)', position: 'relative',
    }}>
      <div style={{ width:8, height:8, borderRadius:'50%', background: active ? color : 'rgba(255,255,255,0.1)', boxShadow: active ? `0 0 10px ${color}` : 'none' }} />
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(0.9rem,2vw,1.3rem)', letterSpacing:4, color, textAlign:'center' }}>
        {name}
        {isYou && <span style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.6em', display:'block', letterSpacing:2 }}>TY</span>}
      </div>
      <div style={{
        fontFamily:"'Bebas Neue',sans-serif",
        fontSize: 'clamp(3rem,8vw,5.5rem)', lineHeight:1,
        color: timerColor,
        textShadow: timerGlow,
        transition: 'color 0.3s, text-shadow 0.3s',
      }}>
        {timer}
      </div>
    </div>
  )
}

// ── Winner overlay ────────────────────────────────────────────────────────────
function WinnerOverlay({
  winner, hostName, guestName, hostScore, guestScore,
}: {
  winner: 'host'|'guest'|'draw'
  hostName: string; guestName: string
  hostScore: number; guestScore: number
}) {
  const name = winner === 'draw' ? 'REMIS!' : winner === 'host' ? hostName : guestName
  const color = winner === 'host' ? '#FFD700' : winner === 'guest' ? '#C0C0C0' : '#a78bfa'
  return (
    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.75)', borderRadius:14, zIndex:20 }}>
      <div style={{
        textAlign:'center', padding:'40px 60px',
        background:'rgba(10,10,10,0.95)', borderRadius:16,
        border:`1px solid ${color}66`,
        boxShadow:`0 0 60px ${color}33`,
        animation:'winnerReveal 0.5s ease-out',
      }}>
        <div style={{ fontSize:'3rem', marginBottom:8 }}>{winner==='draw' ? '🤝' : '🏆'}</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'2.5rem', letterSpacing:6, color }}>{name}</div>
        <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.75rem', letterSpacing:2, margin:'8px 0 20px' }}>
          {winner==='draw' ? 'Pole zostaje niezmienione' : 'Zdobywa pole!'}
        </div>
        <div style={{ display:'flex', gap:20, justifyContent:'center' }}>
          <div style={{ color:'#FFD700', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3 }}>{hostName}: {hostScore}</div>
          <div style={{ color:'rgba(255,255,255,0.3)' }}>|</div>
          <div style={{ color:'#C0C0C0', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3 }}>{guestName}: {guestScore}</div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MultiplayerGame() {
  const navigate = useNavigate()
  const { code }  = useParams<{ code: string }>()
  const { config } = useConfigStore()

  const {
    role, status, playerName, opponentName, opponentAvatar,
    tiles, cursor, gridCols, gridRows, categories,
    duel, currentQuestion, feedback,
    winner, countdown, toastText, hostScore, guestScore, gameResult,
    currentPicker,
    moveCursor, startChallenge, startFight, markCorrect, pass, closeDuel, leaveRoom,
    showToast, showFeedback,
  } = useMultiplayerStore()

  const [speechEnabled, setSpeechEnabled] = useState(true) // ON by default
  const [exitConfirm,   setExitConfirm]   = useState(false) // confirm dialog
  const speechSupported = isSpeechRecognitionSupported()

  const hostName  = role === 'host' ? playerName : (opponentName ?? 'HOST')
  const guestName = role === 'guest' ? playerName : (opponentName ?? 'GOŚĆ')

  const isHost  = role === 'host'
  const isGuest = role === 'guest'
  const myTimer  = isHost ? duel?.timerHost ?? 0 : duel?.timerGuest ?? 0
  const oppTimer = isHost ? duel?.timerGuest ?? 0 : duel?.timerHost ?? 0
  const iAmActive = duel ? (isHost ? duel.active === 'host' : duel.active === 'guest') : false

  const isMyPick = role === currentPicker  // can I move cursor / pick tiles?

  // All refs kept fresh for use in speech callbacks (avoids stale closure)
  const duelRef         = useRef(duel)
  const countdownRef    = useRef(countdown)
  const iAmActiveRef    = useRef(iAmActive)
  const matchedQRef     = useRef<string|null>(null)   // guard: already sent correct for this qId
  const passedQRef      = useRef<string|null>(null)   // guard: already sent pass for this qId
  const pasDebounceRef  = useRef<ReturnType<typeof setTimeout>|null>(null)  // interim pass debounce
  const currAnswerRef   = useRef('')
  const currSynonymsRef = useRef<string[]>([])

  duelRef.current      = duel
  countdownRef.current = countdown
  iAmActiveRef.current = iAmActive

  // Reset guards when question changes (new qId = fresh guards)
  useEffect(() => {
    currAnswerRef.current   = currentQuestion?.answer ?? ''
    currSynonymsRef.current = Array.isArray(currentQuestion?.synonyms) ? currentQuestion!.synonyms : []
    matchedQRef.current     = null
    passedQRef.current      = null
    if (pasDebounceRef.current) { clearTimeout(pasDebounceRef.current); pasDebounceRef.current = null }
  }, [currentQuestion?.id])

  // Validate room access — 'finished' is handled by GameOverScreen, not auto-navigate
  useEffect(() => {
    if (status === 'idle' || status === 'lobby' || status === 'waiting') navigate('/multiplayer')
  }, [status, navigate])

  // Init SoundEngine volumes from config on mount
  useEffect(() => {
    SoundEngine.init(config.MUSIC_VOLUME, config.SFX_VOLUME)
    SoundEngine.startBg('bgMusic', 0.25)
    return () => SoundEngine.stopBg(300)
  }, [])

  // Music: board music <-> duel music
  useEffect(() => {
    if (duel?.started && !winner) {
      SoundEngine.stopBg(200)
      setTimeout(() => SoundEngine.startBg('duelMusic', 0.22), 250)
    } else if (!duel) {
      SoundEngine.stopBg(300)
      setTimeout(() => SoundEngine.startBg('bgMusic', 0.25), 350)
    }
  }, [!!duel?.started])

  // Countdown beeps — dedup guard prevents double-play
  const lastBeepRef = useRef<string | null>(null)
  useEffect(() => {
    if (!countdown || countdown === lastBeepRef.current) return
    lastBeepRef.current = countdown
    if (countdown === '3')          SoundEngine.timerBeep(3)
    else if (countdown === '2')     SoundEngine.timerBeep(2)
    else if (countdown === '1')     SoundEngine.timerBeep(1)
    else if (countdown === 'START!') SoundEngine.play('countdown', 0.85)
    return () => { if (!countdown) lastBeepRef.current = null }
  }, [countdown])

  // SFX on feedback (correct / pass / timeout)
  useEffect(() => {
    if (!feedback.text) return
    if (feedback.type === 'correct' || feedback.type === 'voice') {
      SoundEngine.play('correct', 0.9)
    } else if (feedback.type === 'pass' || feedback.type === 'timeout') {
      SoundEngine.play('buzzer', 0.7)
    }
  }, [feedback.text])

  // Winner sound
  useEffect(() => {
    if (winner) SoundEngine.play('applause', 0.8)
  }, [winner])

  // Keyboard: board navigation (host only, no duel) + ESC to exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      SoundEngine.unlockAudio()
      if (e.key === 'Escape') { e.preventDefault(); setExitConfirm(true); return }
      if (duel) return  // during duel: no manual controls (voice-only)
      // Only the current picker can navigate / start challenge (store validates too)
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); moveCursor('up');    break
        case 'ArrowDown':  e.preventDefault(); moveCursor('down');  break
        case 'ArrowLeft':  e.preventDefault(); moveCursor('left');  break
        case 'ArrowRight': e.preventDefault(); moveCursor('right'); break
        case 'Enter':      e.preventDefault(); startChallenge();    break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [duel, moveCursor, startChallenge])

  // Auto-start fight when duel opens (no manual "ROZPOCZNIJ WALKĘ" needed)
  useEffect(() => {
    if (!duel || duel.started || !isHost) return
    const t = setTimeout(() => { SoundEngine.unlockAudio(); startFight() }, 600)
    return () => clearTimeout(t)
  }, [duel, isHost, startFight])

  // Auto-close winner after WIN_CLOSE_MS — HOST only (guest receives duel_close broadcast)
  useEffect(() => {
    if (!winner || !isHost) return
    const t = setTimeout(() => closeDuel(), config.WIN_CLOSE_MS)
    return () => clearTimeout(t)
  }, [winner, isHost, config.WIN_CLOSE_MS, closeDuel])

  // ── Speech recognition ─────────────────────────────────────────────────────
  // Voice only acts when: duel started, NOT blocked, NOT countdown, IS your turn
  const tryVoiceMatch = useCallback((transcript: string, strict: boolean) => {
    const d = duelRef.current
    // Hard guards using refs (always fresh)
    if (!d?.started) return
    if (d.paused)             return   // action already in flight / countdown
    if (countdownRef.current) return   // countdown playing
    if (!iAmActiveRef.current) return  // not your turn

    const qId      = d.questionId ?? null
    const answer   = currAnswerRef.current
    const synonyms = currSynonymsRef.current

    // Pass command — z debounce jak w singleplayer (The Floor: "PASS" → natychmiastowa reakcja)
    if (isPassCommand(transcript)) {
      if (passedQRef.current === qId) {
        // Już pas dla tego pytania — anuluj pending debounce i wyjdź
        if (pasDebounceRef.current) { clearTimeout(pasDebounceRef.current); pasDebounceRef.current = null }
        return
      }
      if (!strict) {
        // Final — natychmiast
        if (pasDebounceRef.current) { clearTimeout(pasDebounceRef.current); pasDebounceRef.current = null }
        passedQRef.current = qId
        pass()
      } else {
        // Interim — debounce 180ms (jak w useDuelLogic)
        if (pasDebounceRef.current) return
        pasDebounceRef.current = setTimeout(() => {
          pasDebounceRef.current = null
          const cur = duelRef.current
          if (!cur?.started || cur.paused) return
          const curQId = cur.questionId ?? null
          if (passedQRef.current === curQId) return
          passedQRef.current = curQId
          pass()
        }, 180)
      }
      return
    }

    // Transcript rozwinął się poza komendę pas → anuluj debounce
    if (pasDebounceRef.current) { clearTimeout(pasDebounceRef.current); pasDebounceRef.current = null }

    // Answer match
    if (!answer || matchedQRef.current === qId) return
    if (isAnswerMatch(transcript, answer, synonyms, strict)) {
      matchedQRef.current = qId  // guard before calling (prevents double-fire)
      markCorrect()
    }
  }, [pass, markCorrect])

  const handleInterim = useCallback((t: string) => tryVoiceMatch(t, true),  [tryVoiceMatch])
  const handleFinal   = useCallback((t: string) => tryVoiceMatch(t, false), [tryVoiceMatch])

  // Speech is active only when duel is running AND it's your turn AND no modal
  const speechActive = speechEnabled && !!duel?.started && !duel?.paused && !exitConfirm

  // Watchdog: jeśli recognition cicho umrze (Chrome bug ~co 60s),
  // inkrementacja restartKey wymusza restart przez hook's useEffect dep.
  const [restartKey, setRestartKey] = useState(0)

  const { listening, error: speechError } = useSpeechRecognition({
    onFinal:    handleFinal,
    onInterim:  handleInterim,
    active:     speechActive,
    lang:       duel?.lang === 'both' ? ['pl-PL','en-US'] : (duel?.lang ?? 'pl-PL'),
    restartKey,
  })

  useEffect(() => {
    if (!speechActive || listening) return
    const t = setTimeout(() => setRestartKey(k => k + 1), 2500)
    return () => clearTimeout(t)
  }, [speechActive, listening, restartKey])

  const handleClose = () => {
    closeDuel()
    setExitConfirm(false)
  }

  const handleLeave = async () => {
    await leaveRoom()
    navigate('/')
  }

  const handleExitRequest = () => setExitConfirm(true)
  const handleExitConfirm = async () => { await handleLeave() }
  const handleExitCancel  = () => setExitConfirm(false)

  const volumeFactor = (base: number) => base * (config.SOUND_VOLUME / 100)

  // Image URL
  const imageUrl = currentQuestion?.image_path
    ? supabase.storage.from('question-images').getPublicUrl(currentQuestion.image_path).data.publicUrl
    : ''

  const feedbackBg = (type: FeedbackType) => {
    if (!feedback.text) return 'rgba(255,255,255,0.04)'
    if (type === 'correct' || type === 'voice') return 'rgba(34,197,94,0.15)'
    if (type === 'pass') return 'rgba(251,146,60,0.15)'
    return 'rgba(248,113,113,0.12)'
  }
  const feedbackBorder = (type: FeedbackType) => {
    if (!feedback.text) return 'rgba(255,255,255,0.07)'
    if (type === 'correct' || type === 'voice') return 'rgba(34,197,94,0.4)'
    if (type === 'pass') return 'rgba(251,146,60,0.4)'
    return 'rgba(248,113,113,0.35)'
  }

  if (status === 'idle' || status === 'creating' || status === 'joining' || status === 'waiting') {
    return (
      <div style={{ minHeight:'100vh', background:'#0a0a0a', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontFamily:"'Montserrat',sans-serif" }}>
        Ładowanie…
      </div>
    )
  }

  return (
    <div style={{
      width:'100vw', height:'100vh', background:'#0a0a0a',
      display:'flex', flexDirection:'column', overflow:'hidden',
      fontFamily:"'Montserrat',sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <header style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 20px', flexShrink:0,
        borderBottom:'1px solid rgba(255,255,255,0.06)',
        background:'rgba(255,255,255,0.02)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.3rem', letterSpacing:5, color:'#D4AF37' }}>
            THE FLOOR
          </span>
          <span style={{ color:'rgba(255,255,255,0.2)', fontSize:'0.7rem', letterSpacing:2 }}>MULTIPLAYER</span>
          <span style={{ padding:'2px 8px', background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', borderRadius:4, color:'rgba(99,102,241,0.9)', fontSize:'0.65rem', letterSpacing:1 }}>
            {role?.toUpperCase()}
          </span>
        </div>

        <div style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.35)', letterSpacing:1 }}>
          Kod: <span style={{ color:'#D4AF37', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3, fontSize:'1rem' }}>{code}</span>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#4ade80', boxShadow:'0 0 6px rgba(74,222,128,0.6)', display:'inline-block' }} />
            <span style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.7rem' }}>ONLINE</span>
          </div>
          <button onClick={handleExitRequest} style={{
            background:'none', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6,
            color:'rgba(255,255,255,0.35)', cursor:'pointer', fontSize:'0.72rem', padding:'4px 10px',
          }}>
            OPUŚĆ
          </button>
        </div>
      </header>

      {/* ── Stats bar ── */}
      {tiles.length > 0 && (
        <div style={{ padding:'6px 20px', flexShrink:0, borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
          <StatsBar tiles={tiles} hostName={hostName} guestName={guestName} />
        </div>
      )}

      {/* ── Board ── */}
      <main style={{ flex:1, overflow:'hidden', padding:'12px 20px 4px', position:'relative' }}>
        {tiles.length > 0 ? (
          <MPBoard
            tiles={tiles}
            cursor={cursor}
            categories={categories}
            gridCols={gridCols}
            gridRows={gridRows}
            onCursorClick={isMyPick && !duel ? (idx) => {
              useMultiplayerStore.setState({ cursor: idx })
              useMultiplayerStore.getState()._broadcastEvent({ type: 'cursor_move', idx })
            } : undefined}
          />
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'rgba(255,255,255,0.3)', fontSize:'0.9rem' }}>
            Ładowanie planszy…
          </div>
        )}
      </main>

      {/* ── Board hint (below board, not overlapping it) ── */}
      {!duel && (
        <div style={{ textAlign:'center', padding:'6px 0 10px', flexShrink:0, color:'rgba(255,255,255,0.18)', fontSize:'0.7rem', letterSpacing:2 }}>
          {isMyPick ? '↑↓←→ NAWIGUJ · ENTER ROZPOCZNIJ WALKĘ' : 'OCZEKIWANIE NA RUCH PRZECIWNIKA…'}
        </div>
      )}

      {/* ── Toast ── */}
      {toastText && (
        <div style={{
          position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
          background:'rgba(10,10,10,0.95)', border:'1px solid rgba(255,255,255,0.12)',
          borderRadius:10, padding:'10px 20px', color:'rgba(255,255,255,0.9)',
          fontSize:'0.85rem', letterSpacing:1, zIndex:100, whiteSpace:'nowrap',
        }}>
          {toastText}
        </div>
      )}

      {/* ─────────── DUEL OVERLAY ─────────── */}
      {duel && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'stretch', background:'rgba(0,0,0,0.92)', backdropFilter:'blur(10px)', padding:'10px' }}>
          <div style={{
            position:'relative', background:'linear-gradient(160deg,#111 0%,#0a0a0a 100%)',
            border:'1px solid rgba(212,175,55,0.35)', borderRadius:14,
            boxShadow:'0 0 80px rgba(212,175,55,0.15)',
            width:'100%', display:'flex', flexDirection:'column', overflow:'hidden',
          }}>

            {/* Duel header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'12px 48px', borderBottom:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', flexShrink:0, position:'relative' }}>
              <span style={{ fontSize:'1.4rem' }}>{duel.emoji}</span>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.5rem', letterSpacing:6, color:'#D4AF37' }}>{duel.categoryName}</span>

              {/* Mic button */}
              {duel.started && speechSupported && (
                <button onClick={() => setSpeechEnabled(s => !s)} style={{ position:'absolute', right:52, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:6 }}>
                  <span style={{
                    display:'inline-block', width:10, height:10, borderRadius:'50%',
                    background: speechEnabled ? (listening ? '#4ade80' : '#a78bfa') : 'rgba(255,255,255,0.2)',
                    boxShadow: speechEnabled && listening ? '0 0 8px #4ade80' : 'none',
                    animation: speechEnabled && listening ? 'micPulse 1.2s ease-in-out infinite' : 'none',
                  }} />
                </button>
              )}

              <button onClick={handleExitRequest} style={{ position:'absolute', top:12, right:16, background:'none', border:'none', color:'rgba(255,255,255,0.3)', fontSize:'1.2rem', cursor:'pointer' }}>✕</button>
            </div>

            {/* Duel body */}
            {!duel.started ? (
              /* Pre-fight: auto-starts via useEffect, show brief VS screen */
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, padding:32 }}>
                <div style={{ display:'flex', gap:20, alignItems:'center' }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1rem', letterSpacing:4, color:'#FFD700', marginBottom:4 }}>{hostName}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'3rem', color:'#fff' }}>{duel.timerHost}s</div>
                  </div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'2rem', color:'rgba(255,255,255,0.2)' }}>VS</div>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1rem', letterSpacing:4, color:'#C0C0C0', marginBottom:4 }}>{guestName}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'3rem', color:'#fff' }}>{duel.timerGuest}s</div>
                  </div>
                </div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1rem', letterSpacing:4, color:'rgba(255,255,255,0.3)' }}>PRZYGOTUJ SIĘ…</div>
              </div>
            ) : (
              /* Fight screen */
              <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                {/* My panel (left) */}
                <PlayerPanel
                  name={isHost ? hostName : guestName}
                  timer={myTimer}
                  active={iAmActive}
                  color={isHost ? '#FFD700' : '#C0C0C0'}
                  borderSide="right"
                  isYou
                />

                {/* Center: question + feedback */}
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'clamp(10px,2vh,20px)', padding:'clamp(10px,2vw,30px)', minWidth:0 }}>

                  {/* Feedback */}
                  <div style={{
                    width:'100%', maxWidth:480, textAlign:'center', padding:'clamp(8px,2vh,14px) 20px',
                    background: feedbackBg(feedback.type),
                    border: `1px solid ${feedbackBorder(feedback.type)}`,
                    borderRadius:10, minHeight:50, display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:"'Bebas Neue',sans-serif", fontSize:'clamp(0.85rem,2vw,1.2rem)', letterSpacing:3,
                    color: feedback.type==='correct'||feedback.type==='voice' ? '#4ade80' : feedback.type==='pass' ? '#fb923c' : 'rgba(255,255,255,0.6)',
                    transition:'all 0.2s',
                  }}>
                    {feedback.text || (iAmActive ? '🎤 TWOJA KOLEJ' : '⏳ KOLEJ PRZECIWNIKA')}
                  </div>

                  {/* Question image — hidden during countdown (revealed after START!) */}
                  {imageUrl && !countdown && (
                    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', minHeight:0, width:'100%' }}>
                      <img
                        src={imageUrl}
                        alt="Pytanie"
                        style={{
                          maxWidth:'100%', maxHeight:'100%',
                          objectFit:'contain', borderRadius:10,
                          boxShadow:'0 4px 24px rgba(0,0,0,0.7)',
                          border:'1px solid rgba(255,255,255,0.07)',
                        }}
                        onError={e => { (e.target as HTMLImageElement).style.display='none' }}
                      />
                    </div>
                  )}

                  {/* Controls hint — voice-only, no manual buttons */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, color:'rgba(255,255,255,0.2)', fontSize:'0.68rem', letterSpacing:1, flexWrap:'wrap' as const, justifyContent:'center' }}>
                    {speechSupported && (
                      <span style={{ color: speechEnabled ? 'rgba(129,140,248,0.6)' : undefined }}>
                        🎤 Rozpoznawanie mowy {speechEnabled ? 'wł.' : 'wył.'}
                      </span>
                    )}
                    <span>·</span>
                    <span><kbd style={{ display:'inline-block', padding:'1px 6px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:4, fontFamily:'monospace', fontSize:'0.85em' }}>ESC</kbd> opuść</span>
                  </div>

                  {speechError && (
                    <div style={{ padding:'4px 12px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:6, color:'#f87171', fontSize:'0.72rem' }}>
                      ⚠️ {speechError}
                    </div>
                  )}
                </div>

                {/* Opponent panel (right) */}
                <PlayerPanel
                  name={isHost ? guestName : hostName}
                  timer={oppTimer}
                  active={!iAmActive}
                  color={isHost ? '#C0C0C0' : '#FFD700'}
                  borderSide="left"
                  isYou={false}
                />
              </div>
            )}

            {/* Countdown overlay */}
            {countdown && (
              <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.92)', borderRadius:14, zIndex:10 }}>
                <div style={{
                  fontFamily:"'Bebas Neue',sans-serif",
                  fontSize: countdown==='START!' ? '6rem' : '10rem', lineHeight:1,
                  color: countdown==='START!' ? '#4ade80' : countdown==='1' ? '#f97316' : '#FFD700',
                  textShadow:'0 0 100px currentColor, 0 0 40px currentColor',
                  userSelect:'none' as const, animation:'countPop 0.3s ease-out',
                }}>{countdown}</div>
              </div>
            )}

            {/* Winner overlay — auto-closes via host closeDuel timer */}
            {winner && (
              <WinnerOverlay
                winner={winner}
                hostName={hostName}
                guestName={guestName}
                hostScore={hostScore}
                guestScore={guestScore}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Exit confirmation ── */}
      {exitConfirm && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.85)', backdropFilter:'blur(8px)' }}>
          <div style={{ background:'linear-gradient(160deg,#111,#0a0a0a)', border:'1px solid rgba(239,68,68,0.35)', borderRadius:16, padding:'32px 40px', textAlign:'center', maxWidth:320, boxShadow:'0 0 60px rgba(239,68,68,0.1)' }}>
            <div style={{ fontSize:'2rem', marginBottom:8 }}>🚪</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.5rem', letterSpacing:4, color:'#ef4444', marginBottom:8 }}>OPUŚCIĆ GRĘ?</div>
            <div style={{ fontSize:'0.78rem', color:'rgba(255,255,255,0.35)', marginBottom:24, lineHeight:1.6 }}>Twój przeciwnik zostanie powiadomiony o wyjściu. Tej akcji nie można cofnąć.</div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={handleExitCancel} style={{ flex:1, padding:'11px 0', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.6)', fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.9rem', letterSpacing:3, cursor:'pointer' }}>
                ZOSTAŃ
              </button>
              <button onClick={handleExitConfirm} style={{ flex:1, padding:'11px 0', borderRadius:8, background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.4)', color:'#ef4444', fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.9rem', letterSpacing:3, cursor:'pointer' }}>
                WYJDŹ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Game Over Screen ── */}
      {status === 'finished' && gameResult && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.92)', backdropFilter:'blur(12px)' }}>
          <div style={{
            background:'linear-gradient(160deg,#111 0%,#0a0a0a 100%)',
            border:'1px solid rgba(212,175,55,0.3)', borderRadius:18,
            padding:'36px 44px', textAlign:'center', maxWidth:460, width:'calc(100% - 40px)',
            boxShadow:'0 0 80px rgba(212,175,55,0.1)',
            animation:'winnerReveal 0.4s ease-out',
          }}>
            {/* Trophy / result icon */}
            <div style={{ fontSize:'2.8rem', marginBottom:6 }}>
              {gameResult.isForfeit ? '🏃' : gameResult.winnerRole === 'draw' ? '🤝' : '🏆'}
            </div>

            {/* Result title */}
            {(() => {
              const iWon = (gameResult.winnerRole === 'host' && isHost) || (gameResult.winnerRole === 'guest' && isGuest)
              const isDraw = gameResult.winnerRole === 'draw'
              const color  = isDraw ? '#a78bfa' : iWon ? '#4ade80' : '#ef4444'
              const label  = gameResult.isForfeit
                ? (iWon ? 'WYGRAŁEŚ (WALKOWER)' : 'PRZEGRANA')
                : isDraw ? 'REMIS' : iWon ? 'ZWYCIĘSTWO!' : 'PORAŻKA'
              return (
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'2.2rem', letterSpacing:6, color, marginBottom:4 }}>
                  {label}
                </div>
              )
            })()}

            <div style={{ color:'rgba(255,255,255,0.25)', fontSize:'0.65rem', letterSpacing:3, marginBottom:24 }}>
              KONIEC GRY
            </div>

            {/* Scores table */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:24 }}>
              {[
                { name: hostName,  tiles: gameResult.hostTiles,  color:'#FFD700', label:'HOST'  },
                { name: guestName, tiles: gameResult.guestTiles, color:'#C0C0C0', label:'GOŚĆ'  },
              ].map(p => (
                <div key={p.label} style={{ padding:'14px 10px', background:'rgba(255,255,255,0.03)', border:`1px solid ${p.color}22`, borderRadius:12 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.72rem', letterSpacing:3, color: p.color, marginBottom:4 }}>{p.name}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'2rem', color:'#fff', lineHeight:1 }}>{p.tiles}</div>
                  <div style={{ fontSize:'0.62rem', color:'rgba(255,255,255,0.25)', letterSpacing:1, marginTop:2 }}>pól</div>
                </div>
              ))}
            </div>

            {/* XP delta */}
            <div style={{
              padding:'12px 20px', borderRadius:10, marginBottom:24,
              background: gameResult.myXpDelta >= 0 ? 'rgba(74,222,128,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${gameResult.myXpDelta >= 0 ? 'rgba(74,222,128,0.25)' : 'rgba(239,68,68,0.25)'}`,
              display:'flex', alignItems:'center', justifyContent:'center', gap:10,
            }}>
              <span style={{ fontSize:'1.2rem' }}>{gameResult.myXpDelta >= 0 ? '⭐' : '💔'}</span>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.68rem', letterSpacing:3, color:'rgba(255,255,255,0.3)', marginBottom:2 }}>PUNKTY DOŚWIADCZENIA</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.6rem', letterSpacing:2, color: gameResult.myXpDelta >= 0 ? '#4ade80' : '#ef4444' }}>
                  {gameResult.myXpDelta >= 0 ? '+' : ''}{gameResult.myXpDelta} XP
                </div>
              </div>
            </div>

            <button
              onClick={async () => { await leaveRoom(); navigate('/multiplayer') }}
              style={{
                width:'100%', padding:'13px 0',
                background:'rgba(212,175,55,0.12)', border:'1px solid rgba(212,175,55,0.35)',
                borderRadius:10, color:'#D4AF37',
                fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.1rem', letterSpacing:5,
                cursor:'pointer', transition:'all 0.2s',
              }}
            >
              POWRÓT DO LOBBY
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes countPop { from{transform:scale(1.4);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes winnerReveal { from{transform:scale(0.8) translateY(20px);opacity:0} to{transform:scale(1) translateY(0);opacity:1} }
        @keyframes micPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
      `}</style>
    </div>
  )
}
