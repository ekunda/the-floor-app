export interface GameConfig {
  // Board
  GRID_COLS: number
  GRID_ROWS: number
  TILE_SIZE: number
  // Gameplay
  DUEL_TIME: number
  PASS_PENALTY: number
  FEEDBACK_MS: number
  WIN_CLOSE_MS: number
  TOAST_MS: number
  // New options
  RANDOM_TILES: number       // 0 = sequential, 1 = random category placement
  SHOW_STATS: number         // 0 = hidden by default, 1 = shown by default
  SOUND_VOLUME: number       // 0–100 master volume
  BOARD_SHAPE: number        // 0 = rectangle, 1 = wide (6x2), 2 = tall (3x4), 3 = square (4x4)
}

export interface PlayerSettings {
  name: string
  color: string
}

export interface Category {
  id: string
  name: string
  emoji: string
  created_at: string
}

export interface Question {
  id: string
  category_id: string
  image_path: string | null
  answer: string
  created_at: string
}

export type TileOwner = 'gold' | 'silver'

export interface Tile {
  x: number
  y: number
  categoryId: string
  categoryName: string
  owner: TileOwner
}

export interface DuelState {
  tileIdx: number
  categoryId: string
  categoryName: string
  emoji: string
  questions: Question[]
  usedIds: Set<string>
  timer1: number
  timer2: number
  active: 1 | 2
  paused: boolean
  started: boolean
  currentQuestion: Question | null
}

export interface GameStats {
  goldTiles: number
  silverTiles: number
  totalTiles: number
  goldPct: number
  silverPct: number
}
