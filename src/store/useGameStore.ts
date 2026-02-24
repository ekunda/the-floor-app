import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { clearGameState, loadGameState, saveGameState } from '../lib/persistence'
import { Category, DuelState, GameStats, Question, SpeechLang, Tile, TileOwner } from '../types'
import { BOARD_PRESETS, useConfigStore } from './useConfigStore'

export const CATEGORY_EMOJI: Record<string, string> = {
  zwierzęta: '🐶', jedzenie: '🍕', filmy: '🎬', sport: '⚽', muzyka: '🎵',
  geografia: '🌍', 'miasta polski': '🏙', zawody: '💼', marki: '🏷', owoce: '🍎',
  warzywa: '🥕', napoje: '🥤', pojazdy: '🚗', ubrania: '👕',
  'przybory szkolne': '✏', 'kraje europy': '🌐', 'bohaterowie bajek': '🧸', narzędzia: '🔧',
}

export function getCatEmoji(name: string, customEmoji?: string): string {
  if (customEmoji && customEmoji !== '🎯') return customEmoji
  const lc = name.toLowerCase()
  for (const [key, emoji] of Object.entries(CATEGORY_EMOJI)) {
    if (lc.includes(key)) return emoji
  }
  return '🎯'
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function computeStats(tiles: Tile[]): GameStats {
  const gold   = tiles.filter(t => t.owner === 'gold').length
  const silver = tiles.filter(t => t.owner === 'silver').length
  const total  = tiles.length
  return {
    goldTiles: gold, silverTiles: silver, totalTiles: total,
    goldPct:   total > 0 ? Math.round((gold   / total) * 100) : 0,
    silverPct: total > 0 ? Math.round((silver / total) * 100) : 0,
  }
}

interface GameStore {
  categories: (Category & { questions: Question[] })[]
  tiles: Tile[]
  cursor: number
  duel: DuelState | null
  blockInput: boolean
  toastText: string
  toastTimer: ReturnType<typeof setTimeout> | null
  showStats: boolean

  loadCategories: () => Promise<void>
  restoreSession: () => Promise<boolean>
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
  toggleStats: () => void
  tick: () => void
  nextQuestion: () => Question | null
  endDuelWithWinner: (winnerNum: 1 | 2) => void
  endDuelDraw: () => void
}


// Normalize questions loaded from Supabase — ensures synonyms is always string[]
function normalizeQuestions(cats: any[]): (Category & { questions: Question[] })[] {
  return cats.map(cat => ({
    ...cat,
    lang: cat.lang ?? 'pl-PL',
    questions: (cat.questions ?? []).map((q: any) => ({
      ...q,
      synonyms: Array.isArray(q.synonyms) ? q.synonyms : [],
    })),
  }))
}

export const useGameStore = create<GameStore>((set, get) => ({
  categories: [],
  tiles: [],
  cursor: 5,
  duel: null,
  blockInput: false,
  toastText: '',
  toastTimer: null,
  showStats: true,

  loadCategories: async () => {
    const { data: cats } = await supabase
      .from('categories').select('id, name, emoji, lang, created_at, questions(id, category_id, image_path, answer, synonyms, created_at)').order('created_at')
    const full = normalizeQuestions(cats ?? [])
    set({ categories: full })

    const cfg = useConfigStore.getState().config
    set({ showStats: cfg.SHOW_STATS === 1 })

    get().newGame()
  },

  restoreSession: async () => {
    const saved = loadGameState()
    if (!saved) return false

    // Load fresh categories & config from Supabase
    const [{ data: cats }] = await Promise.all([
      supabase.from('categories').select('id, name, emoji, lang, created_at, questions(id, category_id, image_path, answer, synonyms, created_at)').order('created_at'),
      useConfigStore.getState().fetch(),
    ])
    const categories = normalizeQuestions(cats ?? [])
    set({ categories })

    // Restore board state (tile owners preserved from save)
    set({ tiles: saved.tiles, cursor: saved.cursor, showStats: saved.showStats })

    // Restore duel if one was open
    if (saved.duel) {
      const sd = saved.duel
      const cat = categories.find(c => c.id === sd.categoryId)
      const questions = cat?.questions ?? []

      const currentQuestion = sd.currentQuestionId
        ? (questions.find(q => q.id === sd.currentQuestionId) ?? questions[0] ?? null)
        : null

      const restoredDuel: DuelState = {
        tileIdx: sd.tileIdx,
        categoryId: sd.categoryId,
        categoryName: sd.categoryName,
        emoji: sd.emoji,
        lang: cat?.lang ?? 'pl-PL',
        questions,
        usedIds: new Set(sd.usedIds),
        timer1: sd.timer1,
        timer2: sd.timer2,
        active: sd.active,
        paused: true,   // always restore as paused — player resumes deliberately
        started: sd.started,
        currentQuestion: sd.started ? currentQuestion : null,
      }

      set({ duel: restoredDuel })
    }

    return true
  },

  newGame: () => {
    const { categories } = get()
    const cfg = useConfigStore.getState().config
    const { tileCategories } = useConfigStore.getState()

    const preset = BOARD_PRESETS[cfg.BOARD_SHAPE] ?? BOARD_PRESETS[0]
    const cols = preset.cols
    const rows = preset.rows
    const total = cols * rows

    let catList: (Category & { questions: Question[] } | undefined)[]

    const hasTileMap = tileCategories.length >= total &&
                       tileCategories.some(id => id !== '')

    if (hasTileMap && cfg.RANDOM_TILES !== 1) {
      catList = tileCategories.slice(0, total).map(catId =>
        catId ? categories.find(c => c.id === catId) : undefined
      )
    } else if (cfg.RANDOM_TILES === 1 && categories.length > 0) {
      const pool = shuffle(categories)
      catList = Array.from({ length: total }, (_, i) => pool[i % pool.length])
    } else {
      catList = Array.from({ length: total }, (_, i) =>
        categories[i % Math.max(categories.length, 1)]
      )
    }

    const tiles: Tile[] = catList.map((cat, i) => {
      const x = i % cols
      const y = Math.floor(i / cols)
      const owner: TileOwner = x < cols / 2 ? 'gold' : 'silver'
      return { x, y, categoryId: cat?.id ?? '', categoryName: cat?.name ?? 'Kategoria', owner }
    })

    const wasEmpty = get().tiles.length === 0
    set({ tiles, cursor: Math.floor(total / 2) - 1, duel: null })
    if (!wasEmpty) get().showToast('🎮 Nowa gra!')

    // Clear saved state when explicitly starting a new game
    clearGameState()
  },

  setCursor: idx => set({ cursor: idx }),

  moveCursor: dir => {
    const { cursor } = get()
    const cfg = useConfigStore.getState().config
    const preset = BOARD_PRESETS[cfg.BOARD_SHAPE] ?? BOARD_PRESETS[0]
    const { cols, rows } = preset
    const total = cols * rows
    let next = cursor
    if (dir === 'up')    next = cursor - cols
    if (dir === 'down')  next = cursor + cols
    if (dir === 'left')  next = cursor - 1
    if (dir === 'right') next = cursor + 1
    if (next >= 0 && next < total) set({ cursor: next })
  },

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
        tileIdx: cursor, categoryId: tile.categoryId,
        categoryName: tile.categoryName,
        emoji: getCatEmoji(tile.categoryName, cat?.emoji),
        lang: cat?.lang ?? 'pl-PL',
        questions, usedIds: new Set(),
        timer1: cfg.DUEL_TIME, timer2: cfg.DUEL_TIME,
        active: 1, paused: false, started: false, currentQuestion: null,
      },
    })
  },

  startFight: () => {
    const { duel } = get()
    if (!duel || duel.started) return
    set({ duel: { ...duel, started: true, active: 1, paused: true } })
  },

  tick: () => {
    const { duel } = get()
    if (!duel?.started || duel.paused) return
    const key = duel.active === 1 ? 'timer1' : 'timer2'
    const newVal = Math.max(0, duel[key] - 1)
    const updated: DuelState = { ...duel, [key]: newVal }
    set({ duel: updated })
    if (newVal <= 0) set({ duel: { ...updated, paused: true } })
  },

  markCorrect: playerNum => {
    const { duel, blockInput } = get()
    if (!duel?.started || blockInput) return
    if (duel.active !== playerNum) return
    set({ blockInput: true })
    const cfg = useConfigStore.getState().config
    setTimeout(() => {
      const { duel } = get()
      if (!duel) return
      const next = (playerNum === 1 ? 2 : 1) as 1 | 2
      const q = get().nextQuestion()
      set({ blockInput: false, duel: { ...duel, active: next, currentQuestion: q } })
    }, cfg.FEEDBACK_MS)
  },

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

  togglePause: () => {
    const { duel } = get()
    if (!duel?.started) return
    const wasPaused = duel.paused
    set({ duel: { ...duel, paused: !wasPaused } })
    get().showToast(wasPaused ? '▶ Wznowiono' : '⏸ Pauza')
  },

  closeDuel: () => set({ duel: null, blockInput: false }),

  showToast: text => {
    const { toastTimer } = get()
    if (toastTimer) clearTimeout(toastTimer)
    const cfg = useConfigStore.getState().config
    const t = setTimeout(() => set({ toastText: '' }), cfg.TOAST_MS)
    set({ toastText: text, toastTimer: t })
  },

  toggleStats: () => set(s => ({ showStats: !s.showStats })),

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

  endDuelWithWinner: winnerNum => {
    const { tiles, duel } = get()
    if (!duel) return
    const owner: TileOwner = winnerNum === 1 ? 'gold' : 'silver'
    const newTiles = tiles.map((t, i) => (i === duel.tileIdx ? { ...t, owner } : t))
    set({ tiles: newTiles, duel: { ...duel, paused: true } })
  },

  endDuelDraw: () => {
    const { duel } = get()
    if (!duel) return
    set({ duel: { ...duel, paused: true } })
  },
}))

// ── Auto-save subscriber ─────────────────────────────────────────────────────
// Debounced 400ms — avoids too many writes during rapid state changes (e.g. tick).
let saveTimer: ReturnType<typeof setTimeout> | null = null

useGameStore.subscribe(state => {
  if (state.tiles.length === 0) return  // game not started yet, nothing to save

  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveGameState(state.tiles, state.cursor, state.showStats, state.duel)
  }, 400)
})
