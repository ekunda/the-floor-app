// ─────────────────────────────────────────────────────────────────────────────
// Board.tsx — Canvas z kafelkami gry
//
// NAPRAWA NIEWIDOCZNYCH KATEGORII:
// Oryginał używał config.GRID_COLS / config.GRID_ROWS do rozmiarowania canvasu.
// newGame() używa BOARD_PRESETS[cfg.BOARD_SHAPE].cols/rows do tworzenia kafelków.
//
// Problem: te dwie wartości NIE SĄ SYNCHRONIZOWANE.
// Gdy BOARD_SHAPE=1 (6×2), tiles mają x=0..5, ale canvas ma szerokość 4*S
// (config.GRID_COLS=4 z defaults) → kafelki x=4,5 rysowane poza canvasem → NIEWIDOCZNE.
// Kliknięcia działały bo click-mapping używał innej logiki.
//
// Naprawa: Board używa BOARD_PRESETS[config.BOARD_SHAPE] zamiast config.GRID_COLS/GRID_ROWS
// → identyczna logika jak newGame() → kafelki zawsze pasują do canvasu.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef } from 'react'
import { BOARD_PRESETS, useConfigStore } from '../store/useConfigStore'
import { getCatEmoji, useGameStore } from '../store/useGameStore'

const PLAYERS = {
  gold:   { color: '#1a1200', border: '#FFD700', glow: 'rgba(255,215,0,0.15)'    },
  silver: { color: '#0e0e0e', border: '#C0C0C0', glow: 'rgba(192,192,192,0.10)' },
}

const emojiCache = new Map<string, HTMLCanvasElement>()

function getEmojiCanvas(emoji: string, size: number): HTMLCanvasElement {
  const key = `${emoji}_${size}`
  if (emojiCache.has(key)) return emojiCache.get(key)!
  const oc = document.createElement('canvas')
  oc.width  = size
  oc.height = size
  const cx  = oc.getContext('2d')!
  cx.font          = `${Math.round(size * 0.78)}px serif`
  cx.textAlign     = 'center'
  cx.textBaseline  = 'middle'
  cx.fillText(emoji, size / 2, size / 2 + size * 0.04)
  emojiCache.set(key, oc)
  return oc
}

export default function Board() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pulseRef     = useRef(0)
  const rafRef       = useRef(0)
  const tileSizeRef  = useRef(120)

  const tiles      = useGameStore(s => s.tiles)
  const cursor     = useGameStore(s => s.cursor)
  const categories = useGameStore(s => s.categories)
  const setCursor  = useGameStore(s => s.setCursor)
  const { config } = useConfigStore()

  // ── NAPRAWA: używaj BOARD_PRESETS — identycznie jak newGame() ──────────────
  // config.GRID_COLS/GRID_ROWS to stare pola, niesynchronizowane z BOARD_SHAPE.
  // BOARD_PRESETS[BOARD_SHAPE].cols/rows to jedyne źródło prawdy.
  const boardPreset = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
  const COLS = boardPreset.cols
  const ROWS = boardPreset.rows

  /* ── Compute tile size to fill the container ── */
  const computeTileSize = useCallback(() => {
    if (!containerRef.current) return 120
    const rect   = containerRef.current.getBoundingClientRect()
    const availW = rect.width  > 0 ? rect.width  : window.innerWidth  - 40
    const availH = rect.height > 0 ? rect.height : window.innerHeight - 220
    const byWidth  = Math.floor(availW / COLS)
    const byHeight = Math.floor(availH / ROWS)
    return Math.max(80, Math.min(byWidth, byHeight, 260))
  }, [COLS, ROWS])

  /* ── Resize canvas when board shape or container changes ── */
  useEffect(() => {
    const resize = () => {
      const s = computeTileSize()
      tileSizeRef.current = s
      const c = canvasRef.current
      if (!c) return
      c.width  = COLS * s
      c.height = ROWS * s
    }

    resize()

    const ro = new ResizeObserver(resize)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', resize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [COLS, ROWS, computeTileSize])

  /* ── Click to set cursor ── */
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect   = canvas.getBoundingClientRect()
      const S      = tileSizeRef.current
      const scaleX = canvas.width  / rect.width
      const scaleY = canvas.height / rect.height
      const cx     = Math.floor(((e.clientX - rect.left) * scaleX) / S)
      const cy     = Math.floor(((e.clientY - rect.top)  * scaleY) / S)
      const idx    = cy * COLS + cx
      if (idx >= 0 && idx < COLS * ROWS) setCursor(idx)
    },
    [COLS, ROWS, setCursor],
  )

  /* ── Draw loop (RAF) ── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const draw = () => {
      const S = tileSizeRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const tile of tiles) {
        const px = tile.x * S
        const py = tile.y * S
        const p  = PLAYERS[tile.owner]

        // Tło kafelka
        ctx.fillStyle = p.color
        ctx.fillRect(px, py, S, S)

        // Radial glow
        const radial = ctx.createRadialGradient(px + S / 2, py + S / 2, 0, px + S / 2, py + S / 2, S * 0.7)
        radial.addColorStop(0, p.glow)
        radial.addColorStop(1, 'transparent')
        ctx.fillStyle = radial
        ctx.fillRect(px, py, S, S)

        // Gradient overlay
        const grad = ctx.createLinearGradient(px, py, px + S, py + S)
        grad.addColorStop(0, 'rgba(255,255,255,0.03)')
        grad.addColorStop(1, 'rgba(0,0,0,0.3)')
        ctx.fillStyle = grad
        ctx.fillRect(px, py, S, S)

        // Ramka właściciela
        ctx.strokeStyle = p.border
        ctx.lineWidth   = 2
        ctx.strokeRect(px + 1.5, py + 1.5, S - 3, S - 3)

        // Linia siatki
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.lineWidth   = 1
        ctx.strokeRect(px, py, S, S)

        // Emoji kategorii
        const cat        = categories.find(c => c.id === tile.categoryId)
        const emoji      = getCatEmoji(tile.categoryName, cat?.emoji)
        const EMOJI_SIZE = Math.round(S * 0.38)
        const oc         = getEmojiCanvas(emoji, EMOJI_SIZE)
        ctx.drawImage(oc, px + S / 2 - EMOJI_SIZE / 2, py + S / 2 - EMOJI_SIZE / 2 - S * 0.08)

        // Nazwa kategorii (zawijanie linii)
        const fontSize = Math.max(9, Math.round(S * 0.095))
        ctx.font           = `600 ${fontSize}px Montserrat,sans-serif`
        ctx.textAlign      = 'center'
        ctx.textBaseline   = 'middle'
        ctx.fillStyle      = 'rgba(255,255,255,0.82)'

        const words: string[] = tile.categoryName.split(' ')
        const lines:  string[] = []
        let current = ''
        for (const word of words) {
          const test = current ? `${current} ${word}` : word
          if (ctx.measureText(test).width > S - 14 && current) {
            lines.push(current)
            current = word
          } else {
            current = test
          }
        }
        if (current) lines.push(current)

        const lineH  = fontSize + 2
        const startY = py + S * 0.74 - ((lines.length - 1) * lineH) / 2
        lines.forEach((line, i) => ctx.fillText(line, px + S / 2, startY + i * lineH))
      }

      // Pulsujący kursor
      pulseRef.current = (pulseRef.current + 1) % 120
      const alpha = 0.5 + 0.45 * Math.sin(pulseRef.current * 0.0524)
      const cx    = (cursor % COLS) * S
      const cy    = Math.floor(cursor / COLS) * S

      ctx.shadowColor  = `rgba(80,255,80,${(alpha * 0.6).toFixed(2)})`
      ctx.shadowBlur   = 12
      ctx.strokeStyle  = `rgba(80,255,80,${alpha.toFixed(2)})`
      ctx.lineWidth    = 3
      ctx.setLineDash([10, 5])
      ctx.strokeRect(cx + 3, cy + 3, S - 6, S - 6)
      ctx.setLineDash([])
      ctx.shadowBlur   = 0
      ctx.shadowColor  = 'transparent'

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tiles, cursor, categories, COLS])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          display: 'block',
          border: '3px solid rgba(212,175,55,0.5)',
          borderRadius: 12,
          boxShadow: '0 0 40px rgba(212,175,55,0.25), 0 0 80px rgba(212,175,55,0.08), inset 0 0 0 1px rgba(255,255,255,0.04)',
          cursor: 'pointer',
          maxWidth:  '100%',
          maxHeight: '100%',
        }}
      />
    </div>
  )
}
