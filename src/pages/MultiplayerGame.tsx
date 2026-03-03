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
const COLORS = {
  gold:   { bg: '#1a1200', border: '#FFD700', glow: 'rgba(255,215,0,0.15)',   text: '#FFD700' },
  silver: { bg: '#0e0e0e', border: '#C0C0C0', glow: 'rgba(192,192,192,0.10)', text: '#C0C0C0' },
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

// ── Player panel in duel ──────────────────────────────────────────────────────
function PlayerPanel({
  name, timer, active, color, borderSide, isYou,
  onCorrect,
}: {
  name: string; timer: number; active: boolean; color: string;
  borderSide: 'left' | 'right'; isYou: boolean;
  onCorrect: () => void;
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
      {active && isYou && (
        <button
          onClick={onCorrect}
          style={{
            padding: '10px 20px',
            background: `${color}22`,
            border: `1px solid ${color}66`,
            borderRadius: 8,
            color,
            fontFamily:"'Bebas Neue',sans-serif",
            fontSize:'1rem', letterSpacing:3,
            cursor:'pointer',
          }}
        >
          ✓ POPRAWNIE
        </button>
      )}
    </div>
  )
}

// ── Winner overlay ────────────────────────────────────────────────────────────
function WinnerOverlay({
  winner, hostName, guestName, hostScore, guestScore,
  onClose,
}: {
  winner: 'host'|'guest'|'draw'
  hostName: string; guestName: string
  hostScore: number; guestScore: number
  onClose: () => void
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
        <div style={{ display:'flex', gap:20, justifyContent:'center', marginBottom:24 }}>
          <div style={{ color:'#FFD700', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3 }}>{hostName}: {hostScore}</div>
          <div style={{ color:'rgba(255,255,255,0.3)' }}>|</div>
          <div style={{ color:'#C0C0C0', fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3 }}>{guestName}: {guestScore}</div>
        </div>
        <button onClick={onClose} style={{
          padding:'10px 28px', background:`${color}22`, border:`1px solid ${color}55`,
          borderRadius:8, color, fontFamily:"'Bebas Neue',sans-serif", fontSize:'0.9rem', letterSpacing:3, cursor:'pointer',
        }}>
          POWRÓT DO PLANSZY
        </button>
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
    role, status, playerName, opponentName,
    tiles, cursor, gridCols, gridRows, categories,
    duel, currentQuestion, blockInput, feedback,
    winner, countdown, toastText, hostScore, guestScore,
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

  const duelRef      = useRef(duel)
  const blockRef     = useRef(blockInput)
  const countdownRef = useRef(countdown)
  const iAmActiveRef = useRef(iAmActive)
  const matchedQRef  = useRef<string|null>(null)
  const passedQRef   = useRef<string|null>(null)
  const currAnswerRef   = useRef('')
  const currSynonymsRef = useRef<string[]>([])

  duelRef.current      = duel
  blockRef.current     = blockInput
  countdownRef.current = countdown
  iAmActiveRef.current = iAmActive

  // Reset match guard when question changes
  useEffect(() => {
    currAnswerRef.current   = currentQuestion?.answer ?? ''
    currSynonymsRef.current = Array.isArray(currentQuestion?.synonyms) ? currentQuestion!.synonyms : []
    matchedQRef.current     = null
    passedQRef.current      = null
  }, [currentQuestion?.id])

  // Validate room access
  useEffect(() => {
    if (status === 'idle') navigate('/multiplayer')
    if (status === 'finished') navigate('/multiplayer')
  }, [status, navigate])

  // Music: board music unless duel active
  useEffect(() => {
    SoundEngine.startBg('bgMusic', 0.25)
    return () => SoundEngine.stopBg(300)
  }, [])

  useEffect(() => {
    if (duel?.started && !winner) {
      SoundEngine.stopBg(200)
      setTimeout(() => SoundEngine.startBg('duelMusic', volumeFactor(0.22)), 250)
    } else if (!duel) {
      SoundEngine.stopBg(300)
      setTimeout(() => SoundEngine.startBg('bgMusic', volumeFactor(0.25)), 350)
    }
  }, [!!duel?.started])

  // Winner sound
  useEffect(() => {
    if (winner) SoundEngine.play('applause', volumeFactor(0.8))
  }, [winner])

  // Keyboard controls
  useEffect(() => {
    if (duel) return
    const handler = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      if (!isHost) return
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
  }, [duel, isHost, moveCursor, startChallenge])

  // Duel keyboard controls
  useEffect(() => {
    if (!duel) return
    const handler = (e: KeyboardEvent) => {
      if (['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      if (!duel.started) {
        if (e.key === 'Enter' && isHost) { e.preventDefault(); startFight() }
        if (e.key === 'Escape') { e.preventDefault(); setExitConfirm(true); return }
        return
      }
      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault()
          if (iAmActive) markCorrect()
          break
        case 'p': case 'P':
          e.preventDefault()
          if (iAmActive) pass()
          break
        case 'm': case 'M':
          if (speechSupported) setSpeechEnabled(s => !s)
          break
        case 'Escape':
          e.preventDefault()
          setExitConfirm(true)
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [duel, iAmActive, isHost, markCorrect, pass, startFight, speechSupported])

  // Auto-close winner after WIN_CLOSE_MS
  useEffect(() => {
    if (!winner) return
    const t = setTimeout(() => closeDuel(), config.WIN_CLOSE_MS)
    return () => clearTimeout(t)
  }, [winner, config.WIN_CLOSE_MS, closeDuel])

  // Speech recognition
  const tryVoiceMatch = useCallback((transcript: string, strict: boolean) => {
    const d = duelRef.current
    if (!d?.started || blockRef.current || countdownRef.current || !iAmActiveRef.current) return
    const qId = d.questionId ?? null

    if (isPassCommand(transcript)) {
      if (passedQRef.current === qId) return
      passedQRef.current = qId
      pass()
      return
    }
    if (matchedQRef.current === qId) return
    const answer   = currAnswerRef.current
    const synonyms = currSynonymsRef.current
    if (!answer) return
    if (isAnswerMatch(transcript, answer, synonyms, strict)) {
      matchedQRef.current = qId
      markCorrect()
    }
  }, [pass, markCorrect])

  const handleInterim = useCallback((t: string) => tryVoiceMatch(t, true),  [tryVoiceMatch])
  const handleFinal   = useCallback((t: string) => tryVoiceMatch(t, false), [tryVoiceMatch])

  const speechActive = speechEnabled && !!duel?.started && !exitConfirm

  const { listening, error: speechError } = useSpeechRecognition({
    onFinal:   handleFinal,
    onInterim: handleInterim,
    active:    speechActive,
    lang:      duel?.lang === 'both' ? ['pl-PL','en-US'] : (duel?.lang ?? 'pl-PL'),
  })

  // Restart speech if it silently stopped
  const [speechRetryKey, setSpeechRetryKey] = useState(0)
  useEffect(() => {
    if (!speechActive || listening) return
    const t = setTimeout(() => setSpeechRetryKey(k => k + 1), 3000)
    return () => clearTimeout(t)
  }, [speechActive, listening, speechRetryKey])

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
      <main style={{ flex:1, overflow:'hidden', padding:'16px 20px', position:'relative' }}>
        {tiles.length > 0 ? (
          <MPBoard
            tiles={tiles}
            cursor={cursor}
            categories={categories}
            gridCols={gridCols}
            gridRows={gridRows}
            onCursorClick={isHost && !duel ? (idx) => {
              useMultiplayerStore.setState({ cursor: idx })
              useMultiplayerStore.getState()._broadcastEvent({ type: 'cursor_move', idx })
            } : undefined}
          />
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'rgba(255,255,255,0.3)', fontSize:'0.9rem' }}>
            Ładowanie planszy…
          </div>
        )}

        {/* Hint for host */}
        {!duel && isHost && (
          <div style={{ position:'absolute', bottom:24, left:0, right:0, textAlign:'center', color:'rgba(255,255,255,0.2)', fontSize:'0.72rem', letterSpacing:2 }}>
            ↑↓←→ NAWIGUJ · ENTER ROZPOCZNIJ WALKĘ
          </div>
        )}
        {!duel && isGuest && (
          <div style={{ position:'absolute', bottom:24, left:0, right:0, textAlign:'center', color:'rgba(255,255,255,0.2)', fontSize:'0.72rem', letterSpacing:2 }}>
            OCZEKIWANIE NA RUCH PRZECIWNIKA…
          </div>
        )}
      </main>

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
              /* Pre-fight screen */
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, padding:32 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', letterSpacing:4, color:'rgba(255,255,255,0.4)' }}>
                  {isHost ? 'NACIŚNIJ ENTER ABY ROZPOCZĄĆ' : 'OCZEKIWANIE NA HOSTA…'}
                </div>
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
                {isHost && (
                  <button onClick={startFight} style={{
                    padding:'14px 40px', background:'rgba(212,175,55,0.15)', border:'1px solid rgba(212,175,55,0.4)',
                    borderRadius:10, color:'#D4AF37', fontFamily:"'Bebas Neue',sans-serif", fontSize:'1.2rem', letterSpacing:5, cursor:'pointer',
                  }}>
                    ▶ ROZPOCZNIJ WALKĘ
                  </button>
                )}
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
                  onCorrect={markCorrect}
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

                  {/* Question image */}
                  {imageUrl && (
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

                  {/* Controls hint */}
                  <div style={{ display:'flex', alignItems:'center', gap:8, color:'rgba(255,255,255,0.2)', fontSize:'0.68rem', letterSpacing:1, flexWrap:'wrap' as const, justifyContent:'center' }}>
                    {iAmActive && <><span><kbd style={{ display:'inline-block', padding:'1px 6px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:4, fontFamily:'monospace', fontSize:'0.85em' }}>SPACJA</kbd> / klawisz ✓ poprawnie</span><span>·</span><span><kbd style={{ display:'inline-block', padding:'1px 6px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:4, fontFamily:'monospace', fontSize:'0.85em' }}>P</kbd> pas</span><span>·</span></>}
                    {speechSupported && <><span style={{ color: speechEnabled ? 'rgba(129,140,248,0.6)' : undefined }}><kbd style={{ display:'inline-block', padding:'1px 6px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:4, fontFamily:'monospace', fontSize:'0.85em' }}>M</kbd> mikrofon {speechEnabled?'wł.':'wył.'}</span><span>·</span></>}
                    <span><kbd style={{ display:'inline-block', padding:'1px 6px', background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:4, fontFamily:'monospace', fontSize:'0.85em' }}>ESC</kbd> zakończ</span>
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
                  onCorrect={() => {}}
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

            {/* Winner overlay */}
            {winner && (
              <WinnerOverlay
                winner={winner}
                hostName={hostName}
                guestName={guestName}
                hostScore={hostScore}
                guestScore={guestScore}
                onClose={closeDuel}
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

      <style>{`
        @keyframes countPop { from{transform:scale(1.4);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes winnerReveal { from{transform:scale(0.8) translateY(20px);opacity:0} to{transform:scale(1) translateY(0);opacity:1} }
        @keyframes micPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }
      `}</style>
    </div>
  )
}
