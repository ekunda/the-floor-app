// ─────────────────────────────────────────────────────────────────────────────
// useGameStore.ts — Stan gry
//
// Zmiany:
//   - DuelState.passCount: licznik pasów per-duel (dla MAX_PASSES)
//   - pass() inkrementuje passCount
//   - startChallenge() inicjalizuje passCount: 0
//   - restoreSession() przywraca passCount
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { getCached, setCached, supabase } from '../lib/supabase'
import { clearGameState, loadGameState, saveGameState } from '../lib/persistence'
import { Category, DuelState, GameStats, Question, Tile, TileOwner } from '../types'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeQuestions(cats: any[]): (Category & { questions: Question[] })[] {
  return cats.map(cat => ({
    ...cat,
    lang: cat.lang ?? 'pl-PL',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    questions: (cat.questions ?? []).map((q: any) => ({
      ...q,
      synonyms: Array.isArray(q.synonyms) ? q.synonyms : [],
    })),
  }))
}

interface GameStore {
  categories: (Category & { questions: Question[] })[]
  tiles:      Tile[]
  cursor:     number
  duel:       DuelState | null
  blockInput: boolean
  toastText:  string
  toastTimer: ReturnType<typeof setTimeout> | null
  showStats:  boolean

  loadCategories:    () => Promise<void>
  restoreSession:    () => Promise<boolean>
  newGame:           () => void
  setCursor:         (idx: number) => void
  moveCursor:        (dir: 'up' | 'down' | 'left' | 'right') => void
  startChallenge:    () => void
  startFight:        () => void
  markCorrect:       (playerNum: 1 | 2) => void
  pass:              () => void
  togglePause:       () => void
  closeDuel:         () => void
  showToast:         (text: string) => void
  toggleStats:       () => void
  tick:              () => void
  nextQuestion:      () => Question | null
  endDuelWithWinner: (winnerNum: 1 | 2) => void
  endDuelDraw:       () => void
}

// ═════════════════════════════════════════════════════════════════════════════
// ANTI-DOUBLE-PASS — module-level locks (synchroniczne, poza React state)
// ═════════════════════════════════════════════════════════════════════════════
let _passLock    = false
let _correctLock = false
let _lastPassedQuestionId: string | null = null
let _lastPassTime = 0
const PASS_DEBOUNCE_MS = 700

function resetPassLocks() {
  _passLock             = false
  _lastPassedQuestionId = null
  _lastPassTime         = 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_KEY_CATS = 'categories_all'
const CACHE_TTL_CATS = 10 * 60 * 1000

const queryCats = () =>
  supabase
    .from('categories')
    .select('id, name, emoji, lang, created_at, questions(id, category_id, image_path, answer, synonyms, created_at)')
    .order('created_at')

export const useGameStore = create<GameStore>((set, get) => ({
  categories: [],
  tiles:      [],
  cursor:     5,
  duel:       null,
  blockInput: false,
  toastText:  '',
  toastTimer: null,
  showStats:  true,

  loadCategories: async () => {
    const cached = getCached<unknown[]>(CACHE_KEY_CATS, CACHE_TTL_CATS)
    if (cached) {
      const full = normalizeQuestions(cached)
      set({ categories: full, showStats: useConfigStore.getState().config.SHOW_STATS === 1 })
      get().newGame()
    }
    const { data: cats } = await queryCats()
    if (cats) {
      setCached(CACHE_KEY_CATS, cats, CACHE_TTL_CATS)
      const full = normalizeQuestions(cats)
      set({ categories: full, showStats: useConfigStore.getState().config.SHOW_STATS === 1 })
      get().newGame()
    }
  },

  restoreSession: async () => {
    const saved = loadGameState()
    if (!saved) return false
    const [{ data: cats }] = await Promise.all([queryCats(), useConfigStore.getState().fetch()])
    const categories = normalizeQuestions(cats ?? [])
    if (cats) setCached(CACHE_KEY_CATS, cats, CACHE_TTL_CATS)
    set({ categories, tiles: saved.tiles, cursor: saved.cursor, showStats: saved.showStats })

    if (saved.duel) {
      const sd  = saved.duel
      const cat = categories.find(c => c.id === sd.categoryId)
      const questions = cat?.questions ?? []
      set({
        duel: {
          tileIdx:         sd.tileIdx,
          categoryId:      sd.categoryId,
          categoryName:    sd.categoryName,
          emoji:           sd.emoji,
          lang:            cat?.lang ?? 'pl-PL',
          questions,
          usedIds:         new Set(sd.usedIds),
          timer1:          sd.timer1,
          timer2:          sd.timer2,
          active:          sd.active,
          paused:          true,
          started:         sd.started,
          passCount:       (sd as { passCount?: number }).passCount ?? 0,
          currentQuestion: sd.started
            ? (sd.currentQuestionId ? (questions.find(q => q.id === sd.currentQuestionId) ?? null) : null)
            : null,
        },
      })
    }
    return true
  },

  newGame: () => {
    const { categories } = get()
    const cfg            = useConfigStore.getState().config
    const { tileCategories } = useConfigStore.getState()
    const preset = BOARD_PRESETS[cfg.BOARD_SHAPE] ?? BOARD_PRESETS[0]
    const { cols, rows } = preset
    const total  = cols * rows

    let catList: ((Category & { questions: Question[] }) | undefined)[]
    const hasTileMap = tileCategories.length >= total && tileCategories.some(id => id !== '')

    if (hasTileMap && cfg.RANDOM_TILES !== 1) {
      catList = tileCategories.slice(0, total).map(catId => catId ? categories.find(c => c.id === catId) : undefined)
    } else if (cfg.RANDOM_TILES === 1 && categories.length > 0) {
      const pool = shuffle(categories)
      catList = Array.from({ length: total }, (_, i) => pool[i % pool.length])
    } else {
      catList = Array.from({ length: total }, (_, i) => categories[i % Math.max(categories.length, 1)])
    }

    const tiles: Tile[] = catList.map((cat, i) => {
      const x = i % cols
      const y = Math.floor(i / cols)
      return { x, y, categoryId: cat?.id ?? '', categoryName: cat?.name ?? 'Kategoria', owner: (x < cols / 2 ? 'gold' : 'silver') as TileOwner }
    })

    const wasEmpty = get().tiles.length === 0
    set({ tiles, cursor: Math.floor(total / 2) - 1, duel: null })
    if (!wasEmpty) get().showToast('🎮 Nowa gra!')
    resetPassLocks(); _correctLock = false
    clearGameState()
  },

  setCursor: idx => set({ cursor: idx }),

  moveCursor: dir => {
    const { cursor } = get()
    const preset = BOARD_PRESETS[useConfigStore.getState().config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
    const { cols } = preset
    const total    = cols * preset.rows
    let next       = cursor
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
    const cat       = categories.find(c => c.id === tile.categoryId)
    const questions = cat?.questions ?? []
    if (questions.length === 0) { get().showToast('❌ Brak pytań w tej kategorii'); return }
    const cfg = useConfigStore.getState().config
    set({
      duel: {
        tileIdx: cursor, categoryId: tile.categoryId, categoryName: tile.categoryName,
        emoji: getCatEmoji(tile.categoryName, cat?.emoji), lang: cat?.lang ?? 'pl-PL',
        questions, usedIds: new Set(),
        timer1: cfg.DUEL_TIME, timer2: cfg.DUEL_TIME,
        active: 1, paused: false, started: false, currentQuestion: null,
        passCount: 0,
      },
    })
    resetPassLocks(); _correctLock = false
  },

  startFight: () => {
    const { duel } = get()
    if (!duel || duel.started) return
    set({ duel: { ...duel, started: true, active: 1, paused: true } })
  },

  tick: () => {
    const { duel } = get()
    if (!duel?.started || duel.paused) return
    const key    = duel.active === 1 ? 'timer1' : 'timer2'
    const newVal = Math.max(0, duel[key] - 1)
    const updated = { ...duel, [key]: newVal }
    set({ duel: updated })
    if (newVal <= 0) set({ duel: { ...updated, paused: true } })
  },

  markCorrect: (playerNum) => {
    if (_correctLock) return
    const { duel, blockInput } = get()
    if (!duel?.started || blockInput) return
    if (duel.active !== playerNum) return
    _correctLock = true
    set({ blockInput: true })
    const cfg = useConfigStore.getState().config
    setTimeout(() => {
      _correctLock = false
      const { duel: d } = get()
      if (!d) return
      const q = get().nextQuestion()
      _lastPassedQuestionId = null
      set({ blockInput: false, duel: { ...d, active: (playerNum === 1 ? 2 : 1) as 1 | 2, currentQuestion: q } })
    }, cfg.FEEDBACK_MS)
  },

  // ── pass — 4-warstwowy system + passCount tracking ────────────────────────
  pass: () => {
    if (_passLock) return
    const { duel, blockInput } = get()
    if (!duel?.started || blockInput) return
    const currentQId = duel.currentQuestion?.id ?? 'no-question'
    const now        = Date.now()
    if (_lastPassedQuestionId === currentQId) return
    if (now - _lastPassTime < PASS_DEBOUNCE_MS) return

    _passLock             = true
    _lastPassedQuestionId = currentQId
    _lastPassTime         = now
    set({ blockInput: true })

    const cfg    = useConfigStore.getState().config
    const key    = duel.active === 1 ? 'timer1' : 'timer2'
    const newVal = Math.max(0, duel[key] - cfg.PASS_PENALTY)
    // Inkrementuj passCount
    set({ duel: { ...duel, [key]: newVal, passCount: (duel.passCount ?? 0) + 1 } })

    setTimeout(() => {
      _passLock = false
      set({ blockInput: false })
      const { duel: d } = get()
      if (!d) return
      const q = get().nextQuestion()
      _lastPassedQuestionId = null
      set({ duel: { ...d, currentQuestion: q } })
    }, cfg.FEEDBACK_MS)
  },

  togglePause: () => {
    const { duel } = get()
    if (!duel?.started) return
    set({ duel: { ...duel, paused: !duel.paused } })
    get().showToast(duel.paused ? '▶ Wznowiono' : '⏸ Pauza')
  },

  closeDuel: () => {
    resetPassLocks(); _correctLock = false
    set({ duel: null, blockInput: false })
  },

  showToast: (text) => {
    const { toastTimer } = get()
    if (toastTimer) clearTimeout(toastTimer)
    const cfg = useConfigStore.getState().config
    set({ toastText: text, toastTimer: setTimeout(() => set({ toastText: '' }), cfg.TOAST_MS) })
  },

  toggleStats: () => set(s => ({ showStats: !s.showStats })),

  nextQuestion: () => {
    const { duel } = get()
    if (!duel) return null
    const { questions, usedIds } = duel
    if (usedIds.size >= questions.length) usedIds.clear()
    let q: Question | undefined, attempts = 0
    do { q = questions[Math.floor(Math.random() * questions.length)]; attempts++ }
    while (usedIds.has(q?.id ?? '') && attempts < questions.length * 3)
    if (q) usedIds.add(q.id)
    return q ?? null
  },

  endDuelWithWinner: (winnerNum) => {
    const { tiles, duel } = get()
    if (!duel) return
    set({ tiles: tiles.map((t, i) => i === duel.tileIdx ? { ...t, owner: (winnerNum === 1 ? 'gold' : 'silver') as TileOwner } : t), duel: { ...duel, paused: true } })
  },

  endDuelDraw: () => {
    const { duel } = get()
    if (!duel) return
    set({ duel: { ...duel, paused: true } })
  },
}))

// ── Auto-save (debounced 400ms) ───────────────────────────────────────────────
let _saveTimer: ReturnType<typeof setTimeout> | null = null
useGameStore.subscribe(state => {
  if (state.tiles.length === 0) return
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    saveGameState(state.tiles, state.cursor, state.showStats, state.duel)
  }, 400)
})
