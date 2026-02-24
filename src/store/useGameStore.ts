import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { Category, DuelState, Question, Tile, TileOwner } from '../types'
import { useConfigStore } from './useConfigStore'

export const CATEGORY_EMOJI: Record<string, string> = {
  zwierzęta: '🐶',
  jedzenie: '🍕',
  filmy: '🎬',
  sport: '⚽',
  muzyka: '🎵',
  geografia: '🌍',
  'miasta polski': '🏙',
  zawody: '💼',
  marki: '🏷',
  owoce: '🍎',
  warzywa: '🥕',
  napoje: '🥤',
  pojazdy: '🚗',
  ubrania: '👕',
  'przybory szkolne': '✏',
  'kraje europy': '🌐',
  'bohaterowie bajek': '🧸',
  narzędzia: '🔧',
}

export function getCatEmoji(name: string, customEmoji?: string): string {
  if (customEmoji && customEmoji !== '🎯') return customEmoji
  const lc = name.toLowerCase()
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (lc.includes(key)) return emoji
  }
  return '🎯'
}

interface GameStore {
  categories: (Category & { questions: Question[] })[]
  tiles: Tile[]
  cursor: number
  duel: DuelState | null
  blockInput: boolean
  toastText: string
  toastTimer: ReturnType<typeof setTimeout> | null

  loadCategories: () => Promise<void>
  newGame: () => void
  setCursor: (idx: number) => void
  moveCursor: (dir: 'up' | 'down' | 'left' | 'right') => void
  startChallenge: () => void
  startFight: () => void
  markCorrect: (playerNum: 1 | 2) => void
  pass: () => void
  togglePause: () => void
  closeDuel: () => void
  showToast: (text: string) => void
  tick: () => void
  nextQuestion: () => Question | null
  endDuelWithWinner: (winnerNum: 1 | 2) => void
  endDuelDraw: () => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  categories: [],
  tiles: [],
  cursor: 5,
  duel: null,
  blockInput: false,
  toastText: '',
  toastTimer: null,

  /* ── Load categories + questions from Supabase ── */
  loadCategories: async () => {
    const { data: cats } = await supabase
      .from('categories')
      .select('*, questions(*)')
      .order('created_at')
    const full = (cats ?? []) as (Category & { questions: Question[] })[]
    set({ categories: full })
    get().newGame()
  },

  /* ── New game ── */
  newGame: () => {
    const { categories } = get()
    const cfg = useConfigStore.getState().config
    const total = cfg.GRID_COLS * cfg.GRID_ROWS

    const tiles: Tile[] = []
    for (let i = 0; i < total; i++) {
      const x = i % cfg.GRID_COLS
      const y = Math.floor(i / cfg.GRID_COLS)
      const cat = categories[i % Math.max(categories.length, 1)]
      const owner: TileOwner = x < cfg.GRID_COLS / 2 ? 'gold' : 'silver'
      tiles.push({
        x,
        y,
        categoryId: cat?.id ?? '',
        categoryName: cat?.name ?? `Kategoria ${i + 1}`,
        owner,
      })
    }

    set({ tiles, cursor: Math.floor(total / 2) - 1, duel: null })
    get().showToast('🎮 Nowa gra!')
  },

  /* ── Cursor ── */
  setCursor: idx => set({ cursor: idx }),

  moveCursor: dir => {
    const { cursor } = get()
    const { GRID_COLS, GRID_ROWS } = useConfigStore.getState().config
    const total = GRID_COLS * GRID_ROWS
    let next = cursor
    if (dir === 'up') next = cursor - GRID_COLS
    if (dir === 'down') next = cursor + GRID_COLS
    if (dir === 'left') next = cursor - 1
    if (dir === 'right') next = cursor + 1
    if (next >= 0 && next < total) set({ cursor: next })
  },

  /* ── Start challenge ── */
  startChallenge: () => {
    const { tiles, cursor, categories, duel } = get()
    if (duel) return
    const tile = tiles[cursor]
    if (!tile) return

    const cat = categories.find(c => c.id === tile.categoryId)
    const questions = cat?.questions ?? []

    if (questions.length === 0) {
      get().showToast('❌ Brak pytań w tej kategorii')
      return
    }

    const cfg = useConfigStore.getState().config

    set({
      duel: {
        tileIdx: cursor,
        categoryId: tile.categoryId,
        categoryName: tile.categoryName,
        emoji: getCatEmoji(tile.categoryName, cat?.emoji),
        questions,
        usedIds: new Set(),
        timer1: cfg.DUEL_TIME,
        timer2: cfg.DUEL_TIME,
        active: 1,
        paused: false,
        started: false,
        currentQuestion: null,
      },
    })
  },

  /* ── Start fight (after countdown) ── */
  startFight: () => {
    const { duel } = get()
    if (!duel || duel.started) return
    set({ duel: { ...duel, started: true, active: 1, paused: true } })
  },

  /* ── Timer tick (called every second by DuelModal interval) ── */
  tick: () => {
    const { duel } = get()
    if (!duel?.started || duel.paused) return

    const key = duel.active === 1 ? 'timer1' : 'timer2'
    const newVal = Math.max(0, duel[key] - 1)
    const updated: DuelState = { ...duel, [key]: newVal }
    set({ duel: updated })

    // Timeout — pause and let DuelModal handle the winner logic via useEffect
    if (newVal <= 0) {
      set({ duel: { ...updated, paused: true } })
    }
  },

  /* ── Correct answer ── */
  markCorrect: (playerNum) => {
    const { duel, blockInput } = get()
    if (!duel?.started || blockInput) return
    if (duel.active !== playerNum) {
      get().showToast(`⛔ Teraz kolej ${playerNum === 1 ? 'SREBRNEGO' : 'ZŁOTEGO'}`)
      return
    }

    set({ blockInput: true })
    const cfg = useConfigStore.getState().config

    setTimeout(() => {
      const { duel } = get()
      if (!duel) return
      const next = (playerNum === 1 ? 2 : 1) as 1 | 2
      const q = get().nextQuestion()
      set({
        blockInput: false,
        duel: { ...duel, active: next, currentQuestion: q },
      })
    }, cfg.FEEDBACK_MS)
  },

  /* ── Pass ── */
  pass: () => {
    const { duel, blockInput } = get()
    if (!duel?.started || blockInput) return

    set({ blockInput: true })
    const cfg = useConfigStore.getState().config
    const key = duel.active === 1 ? 'timer1' : 'timer2'
    const newVal = Math.max(0, duel[key] - cfg.PASS_PENALTY)
    set({ duel: { ...duel, [key]: newVal } })

    setTimeout(() => {
      set({ blockInput: false })
      const { duel } = get()
      if (!duel) return
      const q = get().nextQuestion()
      set({ duel: { ...duel, currentQuestion: q } })
    }, cfg.FEEDBACK_MS)
  },

  /* ── Pause toggle ── */
  togglePause: () => {
    const { duel } = get()
    if (!duel?.started) return
    const wasPaused = duel.paused
    set({ duel: { ...duel, paused: !wasPaused } })
    get().showToast(wasPaused ? '▶ Wznowiono' : '⏸ Pauza')
  },

  /* ── Close duel ── */
  closeDuel: () => {
    set({ duel: null, blockInput: false })
  },

  /* ── Toast ── */
  showToast: text => {
    const { toastTimer } = get()
    if (toastTimer) clearTimeout(toastTimer)
    const cfg = useConfigStore.getState().config
    const t = setTimeout(() => set({ toastText: '' }), cfg.TOAST_MS)
    set({ toastText: text, toastTimer: t })
  },

  /* ── Internal: pick next unused question ── */
  nextQuestion: () => {
    const { duel } = get()
    if (!duel) return null
    const { questions, usedIds } = duel
    if (usedIds.size >= questions.length) usedIds.clear()
    let q: Question | undefined
    let attempts = 0
    do {
      q = questions[Math.floor(Math.random() * questions.length)]
      attempts++
    } while (usedIds.has(q?.id ?? '') && attempts < questions.length * 3)
    if (q) usedIds.add(q.id)
    return q ?? null
  },

  /* ── Internal: set tile owner after win ── */
  endDuelWithWinner: (winnerNum) => {
    const { tiles, duel } = get()
    if (!duel) return
    const owner: TileOwner = winnerNum === 1 ? 'gold' : 'silver'
    const newTiles = tiles.map((t, i) => (i === duel.tileIdx ? { ...t, owner } : t))
    set({ tiles: newTiles, duel: { ...duel, paused: true } })
  },

  /* ── Internal: draw — tile stays unchanged ── */
  endDuelDraw: () => {
    const { duel } = get()
    if (!duel) return
    set({ duel: { ...duel, paused: true } })
  },
}))
