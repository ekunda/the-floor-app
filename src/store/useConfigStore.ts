import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { GameConfig, PlayerSettings } from '../types'

export const DEFAULTS: GameConfig = {
  GRID_COLS: 4,
  GRID_ROWS: 3,
  TILE_SIZE: 230,
  DUEL_TIME: 45,
  PASS_PENALTY: 2,
  FEEDBACK_MS: 1000,
  WIN_CLOSE_MS: 3000,
  TOAST_MS: 1600,
  RANDOM_TILES: 0,
  SHOW_STATS: 1,
  SOUND_VOLUME: 80,
  BOARD_SHAPE: 0,
}

export const BOARD_PRESETS: Record<number, { cols: number; rows: number; label: string }> = {
  0: { cols: 4, rows: 3, label: 'Prostokąt (4×3)' },
  1: { cols: 6, rows: 2, label: 'Szeroka (6×2)' },
  2: { cols: 3, rows: 4, label: 'Wysoka (3×4)' },
  3: { cols: 4, rows: 4, label: 'Kwadrat (4×4)' },
  4: { cols: 5, rows: 3, label: 'Duża (5×3)' },
  5: { cols: 6, rows: 4, label: 'Bardzo duża (6×4)' },
}

const DEFAULT_PLAYERS: [PlayerSettings, PlayerSettings] = [
  { name: 'ZŁOTY',   color: '#D4AF37' },
  { name: 'SREBRNY', color: '#C0C0C0' },
]

const TILE_CATEGORIES_KEY = 'TILE_CATEGORIES'

interface ConfigStore {
  config: GameConfig
  players: [PlayerSettings, PlayerSettings]
  /** Custom tile→category map. Empty string = use default/random logic. */
  tileCategories: string[]
  loading: boolean
  fetch: () => Promise<void>
  update: (key: keyof GameConfig, value: number) => Promise<void>
  updatePlayer: (idx: 0 | 1, field: keyof PlayerSettings, value: string) => void
  setTileCategory: (tileIdx: number, categoryId: string, totalTiles: number) => Promise<void>
  resetTileCategories: () => Promise<void>
  resetAll: () => Promise<void>
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULTS,
  players: DEFAULT_PLAYERS,
  tileCategories: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const { data } = await supabase.from('config').select('*')
      if (data && data.length > 0) {
        const merged = { ...DEFAULTS }
        let tileCats: string[] = []

        data.forEach(({ key, value }: { key: string; value: string }) => {
          if (key === TILE_CATEGORIES_KEY) {
            try { tileCats = JSON.parse(value) } catch {}
          } else if (key in merged) {
            ;(merged as Record<string, number>)[key] = Number(value)
          }
        })

        set({ config: merged, tileCategories: tileCats })
      }

      // Load player names from localStorage
      try {
        const saved = localStorage.getItem('thefloor_players')
        if (saved) set({ players: JSON.parse(saved) })
      } catch {}
    } catch (e) {
      console.warn('[Config] fallback to defaults', e)
    }
    set({ loading: false })
  },

  update: async (key, value) => {
    await supabase.from('config').upsert({ key, value: String(value) })
    set(s => ({ config: { ...s.config, [key]: value } }))
  },

  updatePlayer: (idx, field, value) => {
    const players = [...get().players] as [PlayerSettings, PlayerSettings]
    players[idx] = { ...players[idx], [field]: value }
    set({ players })
    try { localStorage.setItem('thefloor_players', JSON.stringify(players)) } catch {}
  },

  setTileCategory: async (tileIdx, categoryId, totalTiles) => {
    const current = [...get().tileCategories]
    // Ensure array is long enough
    while (current.length < totalTiles) current.push('')
    current[tileIdx] = categoryId
    set({ tileCategories: current })
    await supabase.from('config').upsert({
      key: TILE_CATEGORIES_KEY,
      value: JSON.stringify(current),
    })
  },

  resetTileCategories: async () => {
    set({ tileCategories: [] })
    await supabase.from('config').delete().eq('key', TILE_CATEGORIES_KEY)
  },

  resetAll: async () => {
    await supabase.from('config').delete().neq('key', '__never__')
    const rows = Object.entries(DEFAULTS).map(([key, value]) => ({ key, value: String(value) }))
    await supabase.from('config').upsert(rows)
    try { localStorage.removeItem('thefloor_players') } catch {}
    set({ config: DEFAULTS, players: DEFAULT_PLAYERS, tileCategories: [] })
  },
}))
